/**
 * PowerShell Native Parser
 *
 * Uses PowerShell's built-in AST parser via subprocess.
 * Philosophy: PowerShell developers always have PowerShell installed.
 *
 * Architecture:
 * - Uses [System.Management.Automation.Language.Parser]::ParseInput()
 * - Falls back to regex-based extraction on non-Windows or if PS unavailable
 *
 * No native modules required - uses subprocess.
 */

import { execSync, spawn } from "node:child_process";
import { log } from "../logging/index.js";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface PowerShellError {
  message?: string;
  location?: {
    line: number;
    column: number;
  };
}

interface RawPowerShellEntity {
  name: string;
  type: string;
  line?: number;
  column?: number;
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  [key: string]: unknown;
}

// =============================================================================
// POWERSHELL AST SCRIPT
// =============================================================================

const POWERSHELL_PARSER_SCRIPT = `
param([string]$FilePath = "input.ps1")

$content = [Console]::In.ReadToEnd()
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)

$entities = @()

# Functions
$ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object {
    $func = $_
    $modifiers = @()
    if ($func.IsWorkflow) { $modifiers += "workflow" }
    if ($func.IsFilter) { $modifiers += "filter" }

    $params = @()
    if ($func.Parameters) {
        $func.Parameters | ForEach-Object {
            $params += @{
                name = $_.Name.VariablePath.UserPath
                type = if ($_.StaticType) { $_.StaticType.Name } else { $null }
            }
        }
    }
    if ($func.Body.ParamBlock) {
        $func.Body.ParamBlock.Parameters | ForEach-Object {
            $params += @{
                name = $_.Name.VariablePath.UserPath
                type = if ($_.StaticType) { $_.StaticType.Name } else { $null }
            }
        }
    }

    $entities += @{
        name = $func.Name
        type = "function"
        filePath = $FilePath
        location = @{
            start = @{ line = $func.Extent.StartLineNumber; column = $func.Extent.StartColumnNumber; index = $func.Extent.StartOffset }
            end = @{ line = $func.Extent.EndLineNumber; column = $func.Extent.EndColumnNumber; index = $func.Extent.EndOffset }
        }
        modifiers = if ($modifiers.Count -gt 0) { $modifiers } else { $null }
        parameters = if ($params.Count -gt 0) { $params } else { $null }
    }
}

# Classes (PS 5.0+)
$ast.FindAll({ $args[0] -is [System.Management.Automation.Language.TypeDefinitionAst] }, $true) | ForEach-Object {
    $typedef = $_
    $entityType = "class"
    if ($typedef.IsEnum) { $entityType = "enum" }
    if ($typedef.IsInterface) { $entityType = "interface" }

    $children = @()

    # Methods
    $typedef.Members | Where-Object { $_ -is [System.Management.Automation.Language.FunctionMemberAst] } | ForEach-Object {
        $method = $_
        $modifiers = @()
        if ($method.IsStatic) { $modifiers += "static" }
        if ($method.IsHidden) { $modifiers += "hidden" }

        $children += @{
            name = $method.Name
            type = "method"
            filePath = $FilePath
            location = @{
                start = @{ line = $method.Extent.StartLineNumber; column = $method.Extent.StartColumnNumber; index = $method.Extent.StartOffset }
                end = @{ line = $method.Extent.EndLineNumber; column = $method.Extent.EndColumnNumber; index = $method.Extent.EndOffset }
            }
            modifiers = if ($modifiers.Count -gt 0) { $modifiers } else { $null }
        }
    }

    # Properties
    $typedef.Members | Where-Object { $_ -is [System.Management.Automation.Language.PropertyMemberAst] } | ForEach-Object {
        $prop = $_
        $modifiers = @()
        if ($prop.IsStatic) { $modifiers += "static" }
        if ($prop.IsHidden) { $modifiers += "hidden" }

        $children += @{
            name = $prop.Name
            type = "property"
            filePath = $FilePath
            location = @{
                start = @{ line = $prop.Extent.StartLineNumber; column = $prop.Extent.StartColumnNumber; index = $prop.Extent.StartOffset }
                end = @{ line = $prop.Extent.EndLineNumber; column = $prop.Extent.EndColumnNumber; index = $prop.Extent.EndOffset }
            }
            modifiers = if ($modifiers.Count -gt 0) { $modifiers } else { $null }
        }
    }

    $entities += @{
        name = $typedef.Name
        type = $entityType
        filePath = $FilePath
        location = @{
            start = @{ line = $typedef.Extent.StartLineNumber; column = $typedef.Extent.StartColumnNumber; index = $typedef.Extent.StartOffset }
            end = @{ line = $typedef.Extent.EndLineNumber; column = $typedef.Extent.EndColumnNumber; index = $typedef.Extent.EndOffset }
        }
        children = if ($children.Count -gt 0) { $children } else { $null }
    }
}

# Using statements (imports)
$ast.FindAll({ $args[0] -is [System.Management.Automation.Language.UsingStatementAst] }, $true) | ForEach-Object {
    $using = $_
    $name = $using.Name.Value
    if (-not $name -and $using.ModuleSpecification) {
        $name = $using.ModuleSpecification.ModuleName
    }

    $entities += @{
        name = $name
        type = "import"
        filePath = $FilePath
        location = @{
            start = @{ line = $using.Extent.StartLineNumber; column = $using.Extent.StartColumnNumber; index = $using.Extent.StartOffset }
            end = @{ line = $using.Extent.EndLineNumber; column = $using.Extent.EndColumnNumber; index = $using.Extent.EndOffset }
        }
    }
}

# Build errors array
$parseErrors = @()
$errors | ForEach-Object {
    $parseErrors += @{
        message = $_.Message
        location = @{
            line = $_.Extent.StartLineNumber
            column = $_.Extent.StartColumnNumber
        }
    }
}

$result = @{
    entities = $entities
    errors = $parseErrors
}

$result | ConvertTo-Json -Depth 10 -Compress
`;

// =============================================================================
// POWERSHELL PARSER CLASS
// =============================================================================

export interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

interface PowerShellParseResult {
  entities: ParsedEntity[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

export class PowerShellNativeParser {
  private psPath: string = "powershell";
  private psAvailable: boolean | null = null;
  private stats: ParserStats = {
    filesParsed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTimeMs: 0,
    totalParseTimeMs: 0,
    throughput: 0,
    cacheMemoryMB: 0,
    errorCount: 0,
  };

  /**
   * Initialize the parser and check if PowerShell is available
   */
  async initialize(): Promise<void> {
    log.d("PSPARSER", "check_avail");

    // Try pwsh (PowerShell Core) first, then powershell (Windows PowerShell)
    const commands = ["pwsh", "powershell"];

    for (const cmd of commands) {
      try {
        execSync(`${cmd} -Version`, { stdio: "ignore", windowsHide: true });
        this.psPath = cmd;
        this.psAvailable = true;
        log.i("PSPARSER", "init_done", { cmd });
        return;
      } catch {
        // Try next
      }
    }

    this.psAvailable = false;
    log.w("PSPARSER", "no_powershell");
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return ext.endsWith(".ps1") || ext.endsWith(".psm1") || ext.endsWith(".psd1");
  }

  /**
   * Parse a PowerShell file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      let result: PowerShellParseResult;

      if (this.psAvailable) {
        result = await this.parseWithPowerShell(filePath, content);
      } else {
        result = this.parseWithRegex(filePath, content);
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "powershell" as SupportedLanguage,
        entities: result.entities,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        ...(result.errors.length > 0 && { errors: result.errors }),
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: "powershell" as SupportedLanguage,
        entities: [],
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Parse using PowerShell subprocess
   */
  private parseWithPowerShell(filePath: string, content: string): Promise<PowerShellParseResult> {
    return new Promise((resolve) => {
      const args = ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_PARSER_SCRIPT, "-FilePath", filePath];

      const proc = spawn(this.psPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let _stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        _stderr += data.toString();
      });

      proc.stdin.write(content);
      proc.stdin.end();

      proc.on("close", (code) => {
        if (code !== 0 || !stdout) {
          // Fall back to regex
          resolve(this.parseWithRegex(filePath, content));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          // Normalize the result
          const entities = this.normalizeEntities(result.entities || [], filePath);
          const errors = (result.errors || []).map((e: PowerShellError) => ({
            message: e.message || String(e),
            location: e.location,
          }));
          resolve({ entities, errors });
        } catch {
          // Fall back to regex
          resolve(this.parseWithRegex(filePath, content));
        }
      });

      proc.on("error", () => {
        resolve(this.parseWithRegex(filePath, content));
      });
    });
  }

  /**
   * Normalize entities from PowerShell output
   */
  private normalizeEntities(rawEntities: RawPowerShellEntity[], filePath: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    for (const raw of rawEntities) {
      if (!raw || !raw.name) continue;

      const location = raw["location"] as
        | {
            start: { line: number; column: number; index: number };
            end: { line: number; column: number; index: number };
          }
        | undefined;

      const entity: ParsedEntity = {
        name: raw.name,
        type: (raw.type || "unknown") as ParsedEntity["type"],
        filePath,
        location: location || {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 1, index: 1 },
        },
      };

      const modifiers = raw["modifiers"] as string[] | undefined;
      if (modifiers && modifiers.length > 0) {
        entity.modifiers = modifiers;
      }

      if (raw.parameters && raw.parameters.length > 0) {
        entity.parameters = raw.parameters;
      }

      const children = raw["children"] as RawPowerShellEntity[] | undefined;
      if (children && children.length > 0) {
        entity.children = this.normalizeEntities(children, filePath);
      }

      entities.push(entity);
    }

    return entities;
  }

  /**
   * Regex-based parser for PowerShell
   */
  private parseWithRegex(filePath: string, content: string): PowerShellParseResult {
    const entities: ParsedEntity[] = [];
    let match: RegExpExecArray | null;

    // Using statements
    const usingRe = /^\s*using\s+(?:module|namespace|assembly)\s+["']?([^"'\s;]+)["']?/gim;
    while ((match = usingRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "import",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Functions
    const funcRe = /^\s*function\s+([A-Za-z][\w-]*)\s*(?:\([^)]*\))?\s*\{/gim;
    while ((match = funcRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Filters
    const filterRe = /^\s*filter\s+([A-Za-z][\w-]*)\s*\{/gim;
    while ((match = filterRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: ["filter"],
      });
    }

    // Workflows (legacy)
    const workflowRe = /^\s*workflow\s+([A-Za-z][\w-]*)\s*\{/gim;
    while ((match = workflowRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: ["workflow"],
      });
    }

    // Classes (PS 5.0+)
    const classRe = /^\s*class\s+(\w+)(?:\s*:\s*[\w,\s]+)?\s*\{/gim;
    while ((match = classRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "class",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Enums (PS 5.0+)
    const enumRe = /^\s*enum\s+(\w+)\s*\{/gim;
    while ((match = enumRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "enum",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Script-level variables (Set-Variable or $script: or $global:)
    const varRe = /\$(?:script|global):(\w+)\s*=/gm;
    while ((match = varRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      const scope = match[0].includes("global") ? "global" : "script";
      entities.push({
        name,
        type: "variable",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: [scope],
      });
    }

    return { entities, errors: [] };
  }

  /**
   * Get location from character index
   */
  private getLocationFromIndex(content: string, index: number): ParsedEntity["location"] {
    let line = 1;
    let column = 0;
    for (let i = 0; i < index; i++) {
      if (content[i] === "\n") {
        line++;
        column = 0;
      } else {
        column++;
      }
    }

    return {
      start: { line, column, index },
      end: { line, column: column + 1, index: index + 1 },
    };
  }

  /**
   * Parse with incremental support (just calls regular parse)
   */
  async parseIncremental(
    filePath: string,
    content: string,
    contentHash: string,
    _edits: unknown[],
  ): Promise<ParseResult> {
    return this.parse(filePath, content, contentHash);
  }

  /**
   * Get parser statistics
   */
  getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Clear any internal caches
   */
  clearCache(): void {
    // No cache to clear
  }
}
