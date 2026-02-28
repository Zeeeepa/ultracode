/**
 * Unified Parser
 *
 * Routes parsing requests to appropriate language-specific parsers.
 * Uses TypeScript Compiler API for JS/TS, subprocess for Python/Java/etc.
 *
 * Philosophy: Developers working with code in language X always have
 * the runtime/compiler for X installed. No need for tree-sitter.
 *
 * LAZY LOADING: Only initializes parsers that are needed for the project.
 * Detects project type from files (package.json, Cargo.toml, etc.)
 */

import { basename, extname, join } from "node:path";
import { log } from "../logging/index.js";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { existsSync } from "../utils/file-ops.js";
import type { BaseParser, ParserStats } from "./base-parser.js";

// =============================================================================
// LAZY IMPORTS - Only import when needed
// =============================================================================

type TypeScriptParserType = typeof import("./typescript-parser.js").TypeScriptParser;
type PythonParserType = typeof import("./python-native-parser.js").PythonNativeParser;
type JavaParserType = typeof import("./java-native-parser.js").JavaNativeParser;
type KotlinParserType = typeof import("./kotlin-native-parser.js").KotlinNativeParser;
type GoParserType = typeof import("./go-native-parser.js").GoNativeParser;
type RustParserType = typeof import("./rust-native-parser.js").RustNativeParser;
type CppParserType = typeof import("./cpp-native-parser.js").CppNativeParser;
type BashParserType = typeof import("./bash-native-parser.js").BashNativeParser;
type PowerShellParserType = typeof import("./powershell-native-parser.js").PowerShellNativeParser;
type JsonParserType = typeof import("./json-parser.js").JsonParser;
type ZigParserType = typeof import("./zig-native-parser.js").ZigNativeParser;
type HelmParserType = typeof import("./helm-parser.js").HelmParser;

// =============================================================================
// LANGUAGE DETECTION
// =============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  // TypeScript/JavaScript (handled by TypeScriptParser)
  ".ts": "typescript",
  ".tsx": "tsx",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // Python (will use subprocess)
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",

  // Java (will use JavaParser JAR)
  ".java": "java",

  // Kotlin (will use kotlin-compiler-embeddable)
  ".kt": "kotlin",
  ".kts": "kotlin",

  // Other languages (future implementation)
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".swift": "swift",
  ".zig": "zig",
  ".zon": "zig",
  ".css": "css",
  ".html": "html",
  ".xml": "xml",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".bat": "batch",
  ".cmd": "batch",
  ".json": "json",
  ".tpl": "helm",
};

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

const PYTHON_EXTENSIONS = new Set([".py", ".pyi", ".pyw"]);
const JAVA_EXTENSIONS = new Set([".java"]);
const KOTLIN_EXTENSIONS = new Set([".kt", ".kts"]);
const GO_EXTENSIONS = new Set([".go"]);
const RUST_EXTENSIONS = new Set([".rs"]);
const CPP_EXTENSIONS = new Set([".c", ".h", ".cpp", ".hpp", ".cc", ".hh", ".cxx", ".hxx", ".c++", ".h++"]);
const BASH_EXTENSIONS = new Set([".sh", ".bash", ".zsh"]);
const POWERSHELL_EXTENSIONS = new Set([".ps1", ".psm1", ".psd1"]);
const JSON_EXTENSIONS = new Set([".json"]);
const ZIG_EXTENSIONS = new Set([".zig", ".zon"]);
const HELM_EXTENSIONS = new Set([".tpl"]);

// =============================================================================
// PROJECT TYPE DETECTION
// =============================================================================

export type ProjectType =
  | "typescript" // package.json, tsconfig.json
  | "python" // pyproject.toml, requirements.txt, setup.py
  | "java" // pom.xml, build.gradle
  | "kotlin" // build.gradle.kts, *.kt files
  | "go" // go.mod
  | "rust" // Cargo.toml
  | "cpp" // CMakeLists.txt, Makefile
  | "dotnet" // *.csproj, *.sln
  | "zig" // build.zig
  | "helm" // Chart.yaml
  | "mixed" // Multiple languages detected
  | "unknown";

export interface ProjectInfo {
  type: ProjectType;
  primaryLanguages: Set<SupportedLanguage>;
  hasScripts: boolean; // bash/powershell scripts present
}

/**
 * Detect project type from workspace root
 */
export function detectProjectType(workspaceRoot: string): ProjectInfo {
  const result: ProjectInfo = {
    type: "unknown",
    primaryLanguages: new Set(),
    hasScripts: false,
  };

  // Check for project indicator files
  const checks: Array<{ file: string; type: ProjectType; langs: SupportedLanguage[] }> = [
    { file: "package.json", type: "typescript", langs: ["typescript", "javascript"] },
    { file: "tsconfig.json", type: "typescript", langs: ["typescript"] },
    { file: "pyproject.toml", type: "python", langs: ["python"] },
    { file: "requirements.txt", type: "python", langs: ["python"] },
    { file: "setup.py", type: "python", langs: ["python"] },
    { file: "pom.xml", type: "java", langs: ["java"] },
    { file: "build.gradle", type: "java", langs: ["java", "kotlin"] },
    { file: "build.gradle.kts", type: "kotlin", langs: ["kotlin", "java"] },
    { file: "go.mod", type: "go", langs: ["go"] },
    { file: "Cargo.toml", type: "rust", langs: ["rust"] },
    { file: "CMakeLists.txt", type: "cpp", langs: ["c", "cpp"] },
    { file: "Makefile", type: "cpp", langs: ["c", "cpp"] },
    { file: "build.zig", type: "zig", langs: ["zig"] },
    { file: "Chart.yaml", type: "helm", langs: ["helm" as SupportedLanguage] },
  ];

  const detectedTypes: ProjectType[] = [];

  for (const check of checks) {
    const filePath = join(workspaceRoot, check.file);
    if (existsSync(filePath)) {
      detectedTypes.push(check.type);
      for (const lang of check.langs) {
        result.primaryLanguages.add(lang);
      }
    }
  }

  // Check for scripts
  const scriptIndicators = [join(workspaceRoot, "scripts"), join(workspaceRoot, ".github")];
  for (const dir of scriptIndicators) {
    if (existsSync(dir)) {
      result.hasScripts = true;
      break;
    }
  }

  // Determine final type
  if (detectedTypes.length === 0) {
    result.type = "unknown";
  } else if (detectedTypes.length === 1) {
    result.type = detectedTypes[0]!;
  } else {
    result.type = "mixed";
  }

  return result;
}

// =============================================================================
// UNIFIED PARSER WITH LAZY LOADING
// =============================================================================

export class UnifiedParser implements BaseParser {
  // Lazy-loaded parsers (null until needed)
  private typescriptParser: InstanceType<TypeScriptParserType> | null = null;
  private pythonParser: InstanceType<PythonParserType> | null = null;
  private javaParser: InstanceType<JavaParserType> | null = null;
  private kotlinParser: InstanceType<KotlinParserType> | null = null;
  private goParser: InstanceType<GoParserType> | null = null;
  private rustParser: InstanceType<RustParserType> | null = null;
  private cppParser: InstanceType<CppParserType> | null = null;
  private bashParser: InstanceType<BashParserType> | null = null;
  private powershellParser: InstanceType<PowerShellParserType> | null = null;
  private jsonParser: InstanceType<JsonParserType> | null = null;
  private zigParser: InstanceType<ZigParserType> | null = null;
  private helmParser: InstanceType<HelmParserType> | null = null;

  // Track which parsers are initialized
  private initializedParsers = new Set<string>();
  private projectInfo: ProjectInfo | null = null;
  private _workspaceRoot: string | null = null;

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
   * Get the current workspace root path
   */
  get workspaceRoot(): string | null {
    return this._workspaceRoot;
  }

  /**
   * Initialize for a specific workspace - only loads needed parsers
   */
  async initializeForWorkspace(workspaceRoot: string): Promise<void> {
    this._workspaceRoot = workspaceRoot;
    this.projectInfo = detectProjectType(workspaceRoot);

    log.i("UNIPARSER", "proj_detect", {
      type: this.projectInfo.type,
      langs: [...this.projectInfo.primaryLanguages].join(",") || "none",
    });

    // Always load TypeScript parser (most common, needed for JS/TS/Angular)
    await this.ensureTypescriptParser();

    // Load parsers based on project type
    const initPromises: Promise<void>[] = [];

    for (const lang of this.projectInfo.primaryLanguages) {
      switch (lang) {
        case "python":
          initPromises.push(this.ensurePythonParser());
          break;
        case "java":
          initPromises.push(this.ensureJavaParser());
          break;
        case "kotlin":
          initPromises.push(this.ensureKotlinParser());
          break;
        case "go":
          initPromises.push(this.ensureGoParser());
          break;
        case "rust":
          initPromises.push(this.ensureRustParser());
          break;
        case "c":
        case "cpp":
          initPromises.push(this.ensureCppParser());
          break;
        case "zig":
          initPromises.push(this.ensureZigParser());
          break;
        case "helm" as SupportedLanguage:
          initPromises.push(this.ensureHelmParser());
          break;
      }
    }

    // Load bash/powershell if scripts are present
    if (this.projectInfo.hasScripts) {
      initPromises.push(this.ensureBashParser());
      initPromises.push(this.ensurePowershellParser());
    }

    await Promise.all(initPromises);

    log.i("UNIPARSER", "init_done", { parsers: [...this.initializedParsers].join(",") });
  }

  /**
   * Initialize all parsers (fallback for backward compatibility)
   */
  async initialize(): Promise<void> {
    log.i("UNIPARSER", "init_start");

    await Promise.all([this.ensureTypescriptParser(), this.ensureBashParser(), this.ensurePowershellParser()]);

    log.i("UNIPARSER", "init_done", { mode: "ts+scripts" });
  }

  // =============================================================================
  // LAZY PARSER INITIALIZATION
  // =============================================================================

  private async ensureTypescriptParser(): Promise<void> {
    if (this.typescriptParser) return;
    const { TypeScriptParser } = await import("./typescript-parser.js");
    this.typescriptParser = new TypeScriptParser();
    await this.typescriptParser.initialize();
    this.initializedParsers.add("typescript");
  }

  private async ensurePythonParser(): Promise<void> {
    if (this.pythonParser) return;
    const { PythonNativeParser } = await import("./python-native-parser.js");
    this.pythonParser = new PythonNativeParser();
    await this.pythonParser.initialize();
    this.initializedParsers.add("python");
  }

  private async ensureJavaParser(): Promise<void> {
    if (this.javaParser) return;
    const { JavaNativeParser } = await import("./java-native-parser.js");
    this.javaParser = new JavaNativeParser();
    await this.javaParser.initialize();
    this.initializedParsers.add("java");
  }

  private async ensureKotlinParser(): Promise<void> {
    if (this.kotlinParser) return;
    const { KotlinNativeParser } = await import("./kotlin-native-parser.js");
    this.kotlinParser = new KotlinNativeParser();
    await this.kotlinParser.initialize();
    this.initializedParsers.add("kotlin");
  }

  private async ensureGoParser(): Promise<void> {
    if (this.goParser) return;
    const { GoNativeParser } = await import("./go-native-parser.js");
    this.goParser = new GoNativeParser();
    await this.goParser.initialize();
    this.initializedParsers.add("go");
  }

  private async ensureRustParser(): Promise<void> {
    if (this.rustParser) return;
    const { RustNativeParser } = await import("./rust-native-parser.js");
    this.rustParser = new RustNativeParser();
    await this.rustParser.initialize();
    this.initializedParsers.add("rust");
  }

  private async ensureCppParser(): Promise<void> {
    if (this.cppParser) return;
    const { CppNativeParser } = await import("./cpp-native-parser.js");
    this.cppParser = new CppNativeParser();
    await this.cppParser.initialize();
    this.initializedParsers.add("cpp");
  }

  private async ensureBashParser(): Promise<void> {
    if (this.bashParser) return;
    const { BashNativeParser } = await import("./bash-native-parser.js");
    this.bashParser = new BashNativeParser();
    await this.bashParser.initialize();
    this.initializedParsers.add("bash");
  }

  private async ensurePowershellParser(): Promise<void> {
    if (this.powershellParser) return;
    const { PowerShellNativeParser } = await import("./powershell-native-parser.js");
    this.powershellParser = new PowerShellNativeParser();
    await this.powershellParser.initialize();
    this.initializedParsers.add("powershell");
  }

  private async ensureJsonParser(): Promise<void> {
    if (this.jsonParser) return;
    const { JsonParser } = await import("./json-parser.js");
    this.jsonParser = new JsonParser();
    await this.jsonParser.initialize();
    this.initializedParsers.add("json");
  }

  private async ensureZigParser(): Promise<void> {
    if (this.zigParser) return;
    const { ZigNativeParser } = await import("./zig-native-parser.js");
    this.zigParser = new ZigNativeParser();
    await this.zigParser.initialize();
    this.initializedParsers.add("zig");
  }

  private async ensureHelmParser(): Promise<void> {
    if (this.helmParser) return;
    const { HelmParser } = await import("./helm-parser.js");
    this.helmParser = new HelmParser();
    await this.helmParser.initialize();
    this.initializedParsers.add("helm");
  }

  // =============================================================================
  // PARSING
  // =============================================================================

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext in EXTENSION_TO_LANGUAGE;
  }

  /**
   * Get language for file
   */
  getLanguage(filePath: string): SupportedLanguage {
    const ext = extname(filePath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] || "javascript";
  }

  /**
   * Parse a file using the appropriate parser
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    const ext = extname(filePath).toLowerCase();

    try {
      let result: ParseResult;

      // Route to appropriate parser based on extension
      if (TYPESCRIPT_EXTENSIONS.has(ext)) {
        await this.ensureTypescriptParser();
        result = await this.typescriptParser!.parse(filePath, content, contentHash);
      } else if (PYTHON_EXTENSIONS.has(ext)) {
        await this.ensurePythonParser();
        result = await this.pythonParser!.parse(filePath, content, contentHash);
      } else if (JAVA_EXTENSIONS.has(ext)) {
        log.d("UNIPARSER", "route_java", { file: filePath });
        await this.ensureJavaParser();
        result = await this.javaParser!.parse(filePath, content, contentHash);
        log.d("UNIPARSER", "java_done", { cnt: result.entities?.length || 0 });
      } else if (KOTLIN_EXTENSIONS.has(ext)) {
        log.d("UNIPARSER", "route_kotlin", { file: filePath });
        await this.ensureKotlinParser();
        result = await this.kotlinParser!.parse(filePath, content, contentHash);
        log.d("UNIPARSER", "kotlin_done", { cnt: result.entities?.length || 0 });
      } else if (GO_EXTENSIONS.has(ext)) {
        await this.ensureGoParser();
        result = await this.goParser!.parse(filePath, content, contentHash);
      } else if (RUST_EXTENSIONS.has(ext)) {
        await this.ensureRustParser();
        result = await this.rustParser!.parse(filePath, content, contentHash);
      } else if (CPP_EXTENSIONS.has(ext)) {
        await this.ensureCppParser();
        result = await this.cppParser!.parse(filePath, content, contentHash);
      } else if (BASH_EXTENSIONS.has(ext)) {
        await this.ensureBashParser();
        result = await this.bashParser!.parse(filePath, content, contentHash);
      } else if (POWERSHELL_EXTENSIONS.has(ext)) {
        await this.ensurePowershellParser();
        result = await this.powershellParser!.parse(filePath, content, contentHash);
      } else if (JSON_EXTENSIONS.has(ext)) {
        await this.ensureJsonParser();
        result = await this.jsonParser!.parse(filePath, content, contentHash);
      } else if (ZIG_EXTENSIONS.has(ext)) {
        await this.ensureZigParser();
        result = await this.zigParser!.parse(filePath, content, contentHash);
      } else if (HELM_EXTENSIONS.has(ext)) {
        await this.ensureHelmParser();
        result = await this.helmParser!.parse(filePath, content, contentHash);
      } else if ((ext === ".yaml" || ext === ".yml") && content.includes("{{")) {
        // YAML with Go template syntax — check if it's a Helm chart context
        await this.ensureHelmParser();
        if (this.helmParser!.isHelmContext(filePath)) {
          result = await this.helmParser!.parse(filePath, content, contentHash);
        } else {
          result = this.fallbackParse(filePath, content, contentHash, startTime);
        }
      } else if (
        (ext === ".yaml" || ext === ".yml") &&
        (basename(filePath) === "Chart.yaml" ||
          basename(filePath) === "values.yaml" ||
          /^values-[\w.-]+\.yaml$/.test(basename(filePath)))
      ) {
        // Chart.yaml or values.yaml without {{ — still parse for metadata
        await this.ensureHelmParser();
        if (this.helmParser!.isHelmContext(filePath)) {
          result = await this.helmParser!.parse(filePath, content, contentHash);
        } else {
          result = this.fallbackParse(filePath, content, contentHash, startTime);
        }
      } else {
        // For other languages, use regex-based fallback
        result = this.fallbackParse(filePath, content, contentHash, startTime);
      }

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += result.parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return result;
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: this.getLanguage(filePath),
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
   * Parse with incremental support
   * @param edits - AST edit operations (format depends on underlying parser)
   */
  async parseIncremental(
    filePath: string,
    content: string,
    contentHash: string,
    edits: unknown[],
  ): Promise<ParseResult> {
    const ext = extname(filePath).toLowerCase();

    if (TYPESCRIPT_EXTENSIONS.has(ext)) {
      await this.ensureTypescriptParser();
      return this.typescriptParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (PYTHON_EXTENSIONS.has(ext)) {
      await this.ensurePythonParser();
      return this.pythonParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (JAVA_EXTENSIONS.has(ext)) {
      await this.ensureJavaParser();
      return this.javaParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (KOTLIN_EXTENSIONS.has(ext)) {
      await this.ensureKotlinParser();
      return this.kotlinParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (GO_EXTENSIONS.has(ext)) {
      await this.ensureGoParser();
      return this.goParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (RUST_EXTENSIONS.has(ext)) {
      await this.ensureRustParser();
      return this.rustParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (CPP_EXTENSIONS.has(ext)) {
      await this.ensureCppParser();
      return this.cppParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (BASH_EXTENSIONS.has(ext)) {
      await this.ensureBashParser();
      return this.bashParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (POWERSHELL_EXTENSIONS.has(ext)) {
      await this.ensurePowershellParser();
      return this.powershellParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (ZIG_EXTENSIONS.has(ext)) {
      await this.ensureZigParser();
      return this.zigParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    if (HELM_EXTENSIONS.has(ext)) {
      await this.ensureHelmParser();
      return this.helmParser!.parseIncremental(filePath, content, contentHash, edits);
    }

    // For other languages, just do full parse
    return this.parse(filePath, content, contentHash);
  }

  /**
   * Fallback regex-based parser for unsupported languages
   */
  private fallbackParse(filePath: string, content: string, contentHash: string, startTime: number): ParseResult {
    const language = this.getLanguage(filePath);
    const entities: ParsedEntity[] = [];

    // Very basic regex extraction
    // Python
    if (language === "python") {
      // Classes
      const classRe = /^class\s+([A-Za-z_]\w*)\s*[:(]/gm;
      let match: RegExpExecArray | null;
      while ((match = classRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "class",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Functions/methods
      const funcRe = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
      while ((match = funcRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "function",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }
    }

    // Java
    if (language === "java") {
      // Classes
      const classRe = /(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+([A-Za-z_]\w*)/gm;
      let match: RegExpExecArray | null;
      while ((match = classRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "class",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Interfaces
      const ifaceRe = /(?:public|private|protected)?\s*interface\s+([A-Za-z_]\w*)/gm;
      while ((match = ifaceRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "interface",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }
    }

    // Go
    if (language === "go") {
      // Functions
      const funcRe = /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)\s*\(/gm;
      let match: RegExpExecArray | null;
      while ((match = funcRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "function",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Types (structs, interfaces)
      const typeRe = /^type\s+([A-Za-z_]\w*)\s+(struct|interface)/gm;
      while ((match = typeRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: match[2]! === "interface" ? "interface" : "class",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }
    }

    // Rust
    if (language === "rust") {
      // Functions
      const funcRe = /(?:pub\s+)?(?:async\s+)?fn\s+([a-z_]\w*)/gm;
      let match: RegExpExecArray | null;
      while ((match = funcRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "function",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Structs
      const structRe = /(?:pub\s+)?struct\s+([A-Za-z_]\w*)/gm;
      while ((match = structRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "struct",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Traits
      const traitRe = /(?:pub\s+)?trait\s+([A-Za-z_]\w*)/gm;
      while ((match = traitRe.exec(content))) {
        entities.push({
          name: match[1]!,
          type: "trait",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }

      // Impl blocks
      const implRe = /impl(?:<[^>]+>)?\s+(?:([A-Za-z_]\w*)\s+for\s+)?([A-Za-z_]\w*)/gm;
      while ((match = implRe.exec(content))) {
        entities.push({
          name: match[2]!,
          type: "impl_block",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }
    }

    const parseTimeMs = Date.now() - startTime;

    return {
      filePath,
      language,
      entities,
      contentHash,
      timestamp: Date.now(),
      parseTimeMs,
    };
  }

  /**
   * Get location from character index
   */
  private getLocationFromIndex(
    content: string,
    index: number,
  ): { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } } {
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
   * Get combined stats from all parsers
   */
  getStats(): ParserStats {
    const allStats: ParserStats[] = [];

    if (this.typescriptParser) allStats.push(this.typescriptParser.getStats());
    if (this.pythonParser) allStats.push(this.pythonParser.getStats());
    if (this.javaParser) allStats.push(this.javaParser.getStats());
    if (this.kotlinParser) allStats.push(this.kotlinParser.getStats());
    if (this.goParser) allStats.push(this.goParser.getStats());
    if (this.rustParser) allStats.push(this.rustParser.getStats());
    if (this.cppParser) allStats.push(this.cppParser.getStats());
    if (this.bashParser) allStats.push(this.bashParser.getStats());
    if (this.powershellParser) allStats.push(this.powershellParser.getStats());
    if (this.zigParser) allStats.push(this.zigParser.getStats());
    if (this.helmParser) allStats.push(this.helmParser.getStats());

    return {
      filesParsed: this.stats.filesParsed,
      cacheHits: allStats.reduce((sum, s) => sum + s.cacheHits, this.stats.cacheHits),
      cacheMisses: allStats.reduce((sum, s) => sum + s.cacheMisses, this.stats.cacheMisses),
      avgParseTimeMs: this.stats.avgParseTimeMs,
      totalParseTimeMs: this.stats.totalParseTimeMs,
      throughput: this.stats.throughput,
      cacheMemoryMB: allStats.reduce((sum, s) => sum + s.cacheMemoryMB, 0),
      errorCount: allStats.reduce((sum, s) => sum + s.errorCount, this.stats.errorCount),
    };
  }

  /**
   * Clear all parser caches
   */
  clearCache(): void {
    this.typescriptParser?.clearCache();
    this.pythonParser?.clearCache();
    this.javaParser?.clearCache();
    this.kotlinParser?.clearCache();
    this.goParser?.clearCache();
    this.rustParser?.clearCache();
    this.cppParser?.clearCache();
    this.bashParser?.clearCache();
    this.powershellParser?.clearCache();
    this.zigParser?.clearCache();
    this.helmParser?.clearCache();
  }

  /**
   * Get initialized parsers list
   */
  getInitializedParsers(): string[] {
    return [...this.initializedParsers];
  }

  /**
   * Get project info
   */
  getProjectInfo(): ProjectInfo | null {
    return this.projectInfo;
  }
}
