/**
 * Python Native Parser
 *
 * Uses Python's built-in `ast` module via subprocess for parsing.
 * Philosophy: Python developers always have Python installed.
 *
 * Architecture:
 * - Spawns `python -c "import ast; ..."` for parsing
 * - Returns JSON-serialized AST
 * - Falls back to regex-based extraction if Python is not available
 * - Optional Pyright integration for type diagnostics
 *
 * No native modules required - uses subprocess.
 */

import { spawn } from "node:child_process";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { enhanceWithPyrightTypes, findPyright } from "./pyright-integration.js";

// =============================================================================
// PYTHON AST EXTRACTION SCRIPT
// =============================================================================

const PYTHON_PARSER_SCRIPT = `
import ast
import json
import sys

def get_location(node):
    """Get location info from AST node."""
    return {
        "start": {
            "line": getattr(node, 'lineno', 1),
            "column": getattr(node, 'col_offset', 0),
            "index": 0
        },
        "end": {
            "line": getattr(node, 'end_lineno', node.lineno) if hasattr(node, 'end_lineno') else getattr(node, 'lineno', 1),
            "column": getattr(node, 'end_col_offset', 0) if hasattr(node, 'end_col_offset') else 0,
            "index": 0
        }
    }

def get_decorators(node):
    """Extract decorator info."""
    decorators = []
    for dec in getattr(node, 'decorator_list', []):
        if isinstance(dec, ast.Name):
            decorators.append({"name": dec.id})
        elif isinstance(dec, ast.Attribute):
            decorators.append({"name": dec.attr})
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                decorators.append({
                    "name": dec.func.id,
                    "arguments": [ast.unparse(arg) if hasattr(ast, 'unparse') else repr(arg) for arg in dec.args]
                })
            elif isinstance(dec.func, ast.Attribute):
                decorators.append({"name": dec.func.attr})
    return decorators if decorators else None

def get_parameters(node):
    """Extract function parameters."""
    params = []
    args = node.args

    # Regular args
    defaults_start = len(args.args) - len(args.defaults)
    for i, arg in enumerate(args.args):
        param = {"name": arg.arg}
        if arg.annotation:
            param["type"] = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else None
        if i >= defaults_start:
            default_idx = i - defaults_start
            if default_idx < len(args.defaults):
                param["defaultValue"] = ast.unparse(args.defaults[default_idx]) if hasattr(ast, 'unparse') else "..."
                param["optional"] = True
        params.append(param)

    # *args
    if args.vararg:
        params.append({"name": f"*{args.vararg.arg}"})

    # Keyword-only args
    kw_defaults_start = len(args.kwonlyargs) - len([d for d in args.kw_defaults if d is not None])
    for i, arg in enumerate(args.kwonlyargs):
        param = {"name": arg.arg}
        if arg.annotation:
            param["type"] = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else None
        if i < len(args.kw_defaults) and args.kw_defaults[i] is not None:
            param["defaultValue"] = ast.unparse(args.kw_defaults[i]) if hasattr(ast, 'unparse') else "..."
            param["optional"] = True
        params.append(param)

    # **kwargs
    if args.kwarg:
        params.append({"name": f"**{args.kwarg.arg}"})

    return params

def get_return_type(node):
    """Get function return type annotation."""
    if node.returns:
        return ast.unparse(node.returns) if hasattr(ast, 'unparse') else str(node.returns)
    return None

def is_magic_method(name):
    """Check if method is a magic/dunder method."""
    return name.startswith("__") and name.endswith("__") and len(name) > 4

def get_base_classes(node):
    """Extract base class names."""
    bases = []
    for base in node.bases:
        if isinstance(base, ast.Name):
            bases.append(base.id)
        elif isinstance(base, ast.Attribute):
            bases.append(ast.unparse(base) if hasattr(ast, 'unparse') else base.attr)
        elif isinstance(base, ast.Subscript):
            bases.append(ast.unparse(base) if hasattr(ast, 'unparse') else str(base))
    return bases

def extract_entities(tree, file_path):
    """Extract entities from AST."""
    entities = []

    for node in ast.walk(tree):
        # Functions
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            is_async = isinstance(node, ast.AsyncFunctionDef)
            is_magic = is_magic_method(node.name)

            entity_type = "async_function" if is_async else "function"
            if is_magic:
                entity_type = "magic_method"

            # Check for decorators that change the type
            decorators = get_decorators(node)
            modifiers = []
            if is_async:
                modifiers.append("async")

            if decorators:
                for dec in decorators:
                    name = dec.get("name", "")
                    if name == "staticmethod":
                        modifiers.append("static")
                    elif name == "classmethod":
                        modifiers.append("classmethod")
                    elif name == "property":
                        modifiers.append("property")
                        entity_type = "property"
                    elif name == "abstractmethod":
                        modifiers.append("abstract")

            entity = {
                "name": node.name,
                "type": entity_type,
                "filePath": file_path,
                "location": get_location(node),
                "modifiers": modifiers if modifiers else None,
                "parameters": get_parameters(node),
                "returnType": get_return_type(node),
                "decorators": decorators
            }

            entities.append(entity)

        # Classes
        elif isinstance(node, ast.ClassDef):
            base_classes = get_base_classes(node)
            decorators = get_decorators(node)

            # Check for special class types
            modifiers = []
            class_type = "class"

            if decorators:
                for dec in decorators:
                    name = dec.get("name", "")
                    if name == "dataclass":
                        modifiers.append("dataclass")
                        class_type = "dataclass"

            if "ABC" in base_classes or "Protocol" in base_classes:
                modifiers.append("abstract")
            if "Enum" in base_classes or "IntEnum" in base_classes:
                class_type = "enum"

            entity = {
                "name": node.name,
                "type": class_type,
                "filePath": file_path,
                "location": get_location(node),
                "modifiers": modifiers if modifiers else None,
                "decorators": decorators,
                "inheritance": {
                    "baseClasses": base_classes
                } if base_classes else None,
                "children": []
            }

            # Extract methods
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    is_async = isinstance(item, ast.AsyncFunctionDef)
                    is_magic = is_magic_method(item.name)

                    method_type = "method"
                    if is_magic:
                        method_type = "magic_method"
                    elif is_async:
                        method_type = "async_function"

                    method_decorators = get_decorators(item)
                    method_modifiers = []

                    if is_async:
                        method_modifiers.append("async")

                    if method_decorators:
                        for dec in method_decorators:
                            name = dec.get("name", "")
                            if name == "staticmethod":
                                method_modifiers.append("static")
                            elif name == "classmethod":
                                method_modifiers.append("classmethod")
                            elif name == "property":
                                method_modifiers.append("property")
                                method_type = "property"
                            elif name == "abstractmethod":
                                method_modifiers.append("abstract")

                    entity["children"].append({
                        "name": item.name,
                        "type": method_type,
                        "filePath": file_path,
                        "location": get_location(item),
                        "modifiers": method_modifiers if method_modifiers else None,
                        "parameters": get_parameters(item),
                        "returnType": get_return_type(item),
                        "decorators": method_decorators
                    })

            entities.append(entity)

        # Imports
        elif isinstance(node, ast.Import):
            for alias in node.names:
                entities.append({
                    "name": alias.name,
                    "type": "import",
                    "filePath": file_path,
                    "location": get_location(node),
                    "importData": {
                        "source": alias.name,
                        "specifiers": [{"local": alias.asname or alias.name}],
                        "isNamespace": True
                    }
                })

        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            specifiers = []
            for alias in node.names:
                specifiers.append({
                    "local": alias.asname or alias.name,
                    "imported": alias.name if alias.asname else None
                })

            entities.append({
                "name": module,
                "type": "import",
                "filePath": file_path,
                "location": get_location(node),
                "importData": {
                    "source": module,
                    "specifiers": specifiers,
                    "isRelative": node.level > 0,
                    "fromModule": module
                }
            })

        # Module-level assignments (constants/variables)
        elif isinstance(node, ast.Assign) and hasattr(node, 'lineno'):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    # Check if it's a constant (ALL_CAPS)
                    is_const = target.id.isupper()
                    entities.append({
                        "name": target.id,
                        "type": "constant" if is_const else "variable",
                        "filePath": file_path,
                        "location": get_location(node),
                        "modifiers": ["const"] if is_const else None
                    })

        # Annotated assignments
        elif isinstance(node, ast.AnnAssign) and hasattr(node, 'lineno') and node.target:
            if isinstance(node.target, ast.Name):
                is_const = node.target.id.isupper()
                entities.append({
                    "name": node.target.id,
                    "type": "constant" if is_const else "variable",
                    "filePath": file_path,
                    "location": get_location(node),
                    "modifiers": ["const"] if is_const else None
                })

    return entities

def main():
    content = sys.stdin.read()
    file_path = sys.argv[1] if len(sys.argv) > 1 else "<stdin>"

    try:
        tree = ast.parse(content)
        entities = extract_entities(tree, file_path)

        # Remove None values for cleaner output
        def clean(obj):
            if isinstance(obj, dict):
                return {k: clean(v) for k, v in obj.items() if v is not None}
            elif isinstance(obj, list):
                return [clean(item) for item in obj]
            return obj

        result = {
            "entities": clean(entities),
            "errors": []
        }
        print(json.dumps(result))

    except SyntaxError as e:
        result = {
            "entities": [],
            "errors": [{
                "message": str(e),
                "location": {"line": e.lineno or 1, "column": e.offset or 0}
            }]
        }
        print(json.dumps(result))
    except Exception as e:
        result = {
            "entities": [],
            "errors": [{"message": str(e)}]
        }
        print(json.dumps(result))

if __name__ == "__main__":
    main()
`;

// =============================================================================
// PYTHON PARSER CLASS
// =============================================================================

interface PythonParseResult {
  entities: ParsedEntity[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

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

export class PythonNativeParser {
  private pythonPath: string = "python";
  private pythonAvailable: boolean | null = null;
  private pyrightAvailable: boolean | null = null;
  private usePyright: boolean = true; // Enable by default, can be disabled
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
   * Initialize the parser and check if Python is available
   */
  async initialize(): Promise<void> {
    console.error("[PythonNativeParser] Checking Python availability...");

    // Try different Python commands
    const pythonCommands = ["python3", "python", "py"];

    for (const cmd of pythonCommands) {
      try {
        const available = await this.checkPython(cmd);
        if (available) {
          this.pythonPath = cmd;
          this.pythonAvailable = true;
          console.error(
            `[PythonNativeParser] Initialized (using ${cmd})`,
          );
          break;
        }
      } catch {
        // Try next command
      }
    }

    if (!this.pythonAvailable) {
      this.pythonAvailable = false;
      console.error(
        "[PythonNativeParser] Python not found, falling back to regex parser",
      );
    }

    // Check for Pyright availability (optional enhancement)
    if (this.usePyright) {
      const pyrightPath = await findPyright();
      this.pyrightAvailable = pyrightPath !== null;
      if (this.pyrightAvailable) {
        console.error("[PythonNativeParser] Pyright available for type diagnostics");
      }
    }
  }

  /**
   * Enable or disable Pyright integration
   */
  setPyrightEnabled(enabled: boolean): void {
    this.usePyright = enabled;
  }

  /**
   * Check if Python command is available
   */
  private checkPython(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      proc.on("error", () => resolve(false));
      proc.on("close", (code) => resolve(code === 0));
    });
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return ext.endsWith(".py") || ext.endsWith(".pyi") || ext.endsWith(".pyw");
  }

  /**
   * Parse a Python file
   */
  async parse(
    filePath: string,
    content: string,
    contentHash: string,
  ): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      let result: PythonParseResult;

      if (this.pythonAvailable) {
        result = await this.parseWithPython(filePath, content);
      } else {
        result = this.parseWithRegex(filePath, content);
      }

      // Enhance with Pyright type information if available
      if (this.pyrightAvailable && this.usePyright && result.entities.length > 0) {
        try {
          await enhanceWithPyrightTypes(result.entities, filePath);
        } catch (pyrightError) {
          // Non-fatal: Pyright enhancement is optional
          console.error(`[PythonNativeParser] Pyright enhancement failed: ${pyrightError}`);
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs =
        this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "python" as SupportedLanguage,
        entities: result.entities,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: result.errors.length > 0 ? result.errors : undefined,
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: "python" as SupportedLanguage,
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
   * Parse using Python subprocess
   */
  private parseWithPython(
    filePath: string,
    content: string,
  ): Promise<PythonParseResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, ["-c", PYTHON_PARSER_SCRIPT, filePath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.stdin.write(content);
      proc.stdin.end();

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python parser failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Fallback regex-based parser
   */
  private parseWithRegex(
    filePath: string,
    content: string,
  ): PythonParseResult {
    const entities: ParsedEntity[] = [];

    // Classes
    const classRe = /^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:/gm;
    let match: RegExpExecArray | null;
    while ((match = classRe.exec(content))) {
      const className = match[1];
      if (!className) continue;
      entities.push({
        name: className,
        type: "class",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Functions
    const funcRe = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
    while ((match = funcRe.exec(content))) {
      const funcName = match[1];
      if (!funcName) continue;
      const isAsync = match[0].startsWith("async");
      const isMagic = funcName.startsWith("__") && funcName.endsWith("__");

      entities.push({
        name: funcName,
        type: isMagic
          ? "magic_method"
          : isAsync
            ? "async_function"
            : "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: isAsync ? ["async"] : undefined,
      });
    }

    // Imports
    const importRe = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)$/gm;
    while ((match = importRe.exec(content))) {
      const fromModule = match[1];
      const importsStr = match[2];
      if (!importsStr) continue;
      const imports = importsStr.split(",").map((s) => s.trim());

      if (fromModule) {
        entities.push({
          name: fromModule,
          type: "import",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
          importData: {
            source: fromModule,
            specifiers: imports.map((imp) => {
              const parts = imp.split(/\s+as\s+/);
              const imported = parts[0] || imp;
              return {
                local: parts[1] || imported,
                imported: parts.length > 1 ? imported : undefined,
              };
            }),
            isRelative: fromModule.startsWith("."),
          },
        });
      } else {
        for (const imp of imports) {
          const parts = imp.split(/\s+as\s+/);
          const importName = parts[0] || imp;
          entities.push({
            name: importName,
            type: "import",
            filePath,
            location: this.getLocationFromIndex(content, match.index),
            importData: {
              source: importName,
              specifiers: [{ local: parts[1] || importName }],
              isNamespace: true,
            },
          });
        }
      }
    }

    return { entities, errors: [] };
  }

  /**
   * Get location from character index
   */
  private getLocationFromIndex(
    content: string,
    index: number,
  ): ParsedEntity["location"] {
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
    _edits: any[],
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
    // No internal cache
  }
}
