/**
 * Go Native Parser
 *
 * Uses Go's built-in `go/parser` and `go/ast` packages via subprocess.
 * Philosophy: Go developers always have Go installed.
 *
 * Architecture:
 * - Uses pre-compiled go-ast-cli binary if available
 * - Falls back to `go run` with embedded Go script for parsing
 * - Returns JSON with entities, relationships, and errors
 * - Falls back to regex-based extraction if Go is not available
 *
 * No native modules required - uses subprocess.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { LineOffsetMap } from "./base-parser-utils.js";
import { type RegexExtractionRule, runRegexExtractors } from "./regex-entity-extractor.js";

// Get the directory of this module to find the CLI script/binary
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GO_CLI_SCRIPT_PATH = join(__dirname, "go-ast-cli.go");
const GO_CLI_BINARY_PATH = join(__dirname, "go-ast-cli");

// =============================================================================
// GO AST EXTRACTION SCRIPT
// =============================================================================

const GO_PARSER_SCRIPT = `package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"strings"
)

type Location struct {
	Start Position \`json:"start"\`
	End   Position \`json:"end"\`
}

type Position struct {
	Line   int \`json:"line"\`
	Column int \`json:"column"\`
	Index  int \`json:"index"\`
}

type Entity struct {
	Name       string            \`json:"name"\`
	Type       string            \`json:"type"\`
	FilePath   string            \`json:"filePath"\`
	Location   Location          \`json:"location"\`
	Modifiers  []string          \`json:"modifiers,omitempty"\`
	Parameters []Parameter       \`json:"parameters,omitempty"\`
	ReturnType string            \`json:"returnType,omitempty"\`
	Children   []Entity          \`json:"children,omitempty"\`
	Metadata   map[string]string \`json:"metadata,omitempty"\`
}

type Parameter struct {
	Name string \`json:"name"\`
	Type string \`json:"type,omitempty"\`
}

type Relationship struct {
	From     string            \`json:"from"\`
	To       string            \`json:"to"\`
	Type     string            \`json:"type"\`
	Metadata map[string]string \`json:"metadata,omitempty"\`
}

type Result struct {
	Entities      []Entity       \`json:"entities"\`
	Relationships []Relationship \`json:"relationships,omitempty"\`
	Errors        []Error        \`json:"errors"\`
}

type Error struct {
	Message  string \`json:"message"\`
	Location *Position \`json:"location,omitempty"\`
}

func getLocation(fset *token.FileSet, pos, end token.Pos) Location {
	start := fset.Position(pos)
	endPos := fset.Position(end)
	return Location{
		Start: Position{Line: start.Line, Column: start.Column, Index: start.Offset},
		End:   Position{Line: endPos.Line, Column: endPos.Column, Index: endPos.Offset},
	}
}

func typeToString(expr ast.Expr) string {
	if expr == nil {
		return ""
	}
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return "*" + typeToString(t.X)
	case *ast.ArrayType:
		return "[]" + typeToString(t.Elt)
	case *ast.MapType:
		return "map[" + typeToString(t.Key) + "]" + typeToString(t.Value)
	case *ast.SelectorExpr:
		return typeToString(t.X) + "." + t.Sel.Name
	case *ast.InterfaceType:
		return "interface{}"
	case *ast.FuncType:
		return "func(...)"
	case *ast.ChanType:
		return "chan " + typeToString(t.Value)
	case *ast.StructType:
		return "struct{...}"
	case *ast.Ellipsis:
		return "..." + typeToString(t.Elt)
	default:
		return "unknown"
	}
}

func extractParams(fset *token.FileSet, fields *ast.FieldList) []Parameter {
	if fields == nil {
		return nil
	}
	var params []Parameter
	for _, field := range fields.List {
		typeName := typeToString(field.Type)
		if len(field.Names) == 0 {
			params = append(params, Parameter{Type: typeName})
		} else {
			for _, name := range field.Names {
				params = append(params, Parameter{Name: name.Name, Type: typeName})
			}
		}
	}
	return params
}

func extractReturnType(results *ast.FieldList) string {
	if results == nil || len(results.List) == 0 {
		return ""
	}
	var types []string
	for _, field := range results.List {
		types = append(types, typeToString(field.Type))
	}
	if len(types) == 1 {
		return types[0]
	}
	return "(" + strings.Join(types, ", ") + ")"
}

func main() {
	source, err := io.ReadAll(os.Stdin)
	if err != nil {
		result := Result{Errors: []Error{{Message: err.Error()}}}
		json.NewEncoder(os.Stdout).Encode(result)
		return
	}

	filePath := "input.go"
	if len(os.Args) > 1 {
		filePath = os.Args[1]
	}

	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, filePath, source, parser.ParseComments)
	if err != nil {
		result := Result{Errors: []Error{{Message: err.Error()}}}
		json.NewEncoder(os.Stdout).Encode(result)
		return
	}

	var entities []Entity

	// Package
	if f.Name != nil {
		entities = append(entities, Entity{
			Name:     f.Name.Name,
			Type:     "module",
			FilePath: filePath,
			Location: getLocation(fset, f.Name.Pos(), f.Name.End()),
		})
	}

	// Imports
	for _, imp := range f.Imports {
		path := strings.Trim(imp.Path.Value, "\\"")
		name := path
		if imp.Name != nil {
			name = imp.Name.Name
		}
		entities = append(entities, Entity{
			Name:     name,
			Type:     "import",
			FilePath: filePath,
			Location: getLocation(fset, imp.Pos(), imp.End()),
			Metadata: map[string]string{"source": path},
		})
	}

	// Declarations
	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			modifiers := []string{}
			name := d.Name.Name
			if d.Recv != nil {
				// Method
				modifiers = append(modifiers, "method")
				if len(d.Recv.List) > 0 {
					recvType := typeToString(d.Recv.List[0].Type)
					name = recvType + "." + name
				}
			}
			if ast.IsExported(d.Name.Name) {
				modifiers = append(modifiers, "exported")
			}

			entities = append(entities, Entity{
				Name:       name,
				Type:       "function",
				FilePath:   filePath,
				Location:   getLocation(fset, d.Pos(), d.End()),
				Modifiers:  modifiers,
				Parameters: extractParams(fset, d.Type.Params),
				ReturnType: extractReturnType(d.Type.Results),
			})

		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					entityType := "type"
					modifiers := []string{}
					if ast.IsExported(s.Name.Name) {
						modifiers = append(modifiers, "exported")
					}

					switch s.Type.(type) {
					case *ast.StructType:
						entityType = "class"
					case *ast.InterfaceType:
						entityType = "interface"
					}

					entity := Entity{
						Name:      s.Name.Name,
						Type:      entityType,
						FilePath:  filePath,
						Location:  getLocation(fset, s.Pos(), s.End()),
						Modifiers: modifiers,
					}

					// Extract struct fields or interface methods
					if st, ok := s.Type.(*ast.StructType); ok && st.Fields != nil {
						for _, field := range st.Fields.List {
							fieldType := typeToString(field.Type)
							for _, name := range field.Names {
								entity.Children = append(entity.Children, Entity{
									Name:     name.Name,
									Type:     "field",
									FilePath: filePath,
									Location: getLocation(fset, field.Pos(), field.End()),
									Metadata: map[string]string{"fieldType": fieldType},
								})
							}
						}
					}

					if it, ok := s.Type.(*ast.InterfaceType); ok && it.Methods != nil {
						for _, method := range it.Methods.List {
							for _, name := range method.Names {
								entity.Children = append(entity.Children, Entity{
									Name:     name.Name,
									Type:     "method",
									FilePath: filePath,
									Location: getLocation(fset, method.Pos(), method.End()),
								})
							}
						}
					}

					entities = append(entities, entity)

				case *ast.ValueSpec:
					entityType := "variable"
					if d.Tok == token.CONST {
						entityType = "constant"
					}
					for _, name := range s.Names {
						modifiers := []string{}
						if ast.IsExported(name.Name) {
							modifiers = append(modifiers, "exported")
						}
						entities = append(entities, Entity{
							Name:      name.Name,
							Type:      entityType,
							FilePath:  filePath,
							Location:  getLocation(fset, s.Pos(), s.End()),
							Modifiers: modifiers,
						})
					}
				}
			}
		}
	}

	// Extract relationships: calls and field access references from function bodies
	var relationships []Relationship
	for _, decl := range f.Decls {
		funcDecl, ok := decl.(*ast.FuncDecl)
		if !ok || funcDecl.Body == nil {
			continue
		}
		funcName := funcDecl.Name.Name
		if funcDecl.Recv != nil && len(funcDecl.Recv.List) > 0 {
			recvType := typeToString(funcDecl.Recv.List[0].Type)
			funcName = recvType + "." + funcName
		}
		ast.Inspect(funcDecl.Body, func(n ast.Node) bool {
			switch expr := n.(type) {
			case *ast.CallExpr:
				// Extract call target
				switch fn := expr.Fun.(type) {
				case *ast.Ident:
					relationships = append(relationships, Relationship{
						From: funcName, To: fn.Name, Type: "calls",
					})
				case *ast.SelectorExpr:
					target := ""
					if ident, ok := fn.X.(*ast.Ident); ok {
						target = ident.Name
					}
					fullTarget := fn.Sel.Name
					if target != "" {
						fullTarget = target + "." + fn.Sel.Name
					}
					relationships = append(relationships, Relationship{
						From: funcName, To: fullTarget, Type: "calls",
					})
				}
				return true
			case *ast.SelectorExpr:
				// Field access (non-call) — check parent is NOT a CallExpr.Fun
				// Since ast.Inspect doesn't give parent, we emit all and deduplicate
				// by checking if this SelectorExpr position matches any call target.
				// Simpler: just emit references for all selectors; call dedup happens in graph.
				if ident, ok := expr.X.(*ast.Ident); ok {
					relationships = append(relationships, Relationship{
						From: funcName,
						To:   ident.Name + "." + expr.Sel.Name,
						Type: "references",
						Metadata: map[string]string{"referenceKind": "field_access"},
					})
				}
				return true
			}
			return true
		})
	}

	result := Result{Entities: entities, Relationships: relationships}
	json.NewEncoder(os.Stdout).Encode(result)
}
`;

// =============================================================================
// GO PARSER CLASS
// =============================================================================

interface GoParseResult {
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
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

export class GoNativeParser {
  private goPath: string = "go";
  private goAvailable: boolean | null = null;
  private scriptPath: string | null = null;
  private cliScriptAvailable: boolean = false;
  private cliBinaryAvailable: boolean = false;
  private useCliScript: boolean = true;
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
   * Initialize the parser and check if Go is available
   */
  async initialize(): Promise<void> {
    log.d("GOPARSER", "check_avail");

    // Check for external CLI script or binary
    this.cliScriptAvailable = existsSync(GO_CLI_SCRIPT_PATH);
    const binaryPath = process.platform === "win32" ? GO_CLI_BINARY_PATH + ".exe" : GO_CLI_BINARY_PATH;
    this.cliBinaryAvailable = existsSync(binaryPath);

    if (this.cliScriptAvailable) {
      log.d("GOPARSER", "cli_script", { path: GO_CLI_SCRIPT_PATH });
    }
    if (this.cliBinaryAvailable) {
      log.d("GOPARSER", "cli_binary", { path: binaryPath });
    }

    try {
      const available = await this.checkGo();
      if (available) {
        this.goAvailable = true;

        // Auto-build binary if source exists but binary is missing or outdated
        if (this.cliScriptAvailable && !this.cliBinaryAvailable) {
          await this.buildCliBinary(binaryPath);
        } else if (this.cliScriptAvailable && this.cliBinaryAvailable) {
          // Rebuild if source is newer than binary
          await this.rebuildIfOutdated(binaryPath);
        }

        // If CLI script is not available and no binary, use inline script
        if (!this.cliScriptAvailable && !this.cliBinaryAvailable) {
          await this.ensureScriptExists();
        }
        const mode = this.cliBinaryAvailable
          ? "CLI binary"
          : this.cliScriptAvailable && this.useCliScript
            ? "CLI script (go run)"
            : "inline script (go run)";
        log.i("GOPARSER", "init_done", { mode });
        return;
      }
    } catch {
      // Go not available
    }

    this.goAvailable = false;
    log.w("GOPARSER", "no_go");
  }

  /**
   * Build go-ast-cli binary from source.
   * Works on all platforms: Windows (.exe), macOS, Linux.
   */
  private buildCliBinary(binaryPath: string): Promise<void> {
    return new Promise((resolve) => {
      log.i("GOPARSER", "building_binary", { output: binaryPath });
      const proc = execFile(
        this.goPath,
        ["build", "-o", binaryPath, GO_CLI_SCRIPT_PATH],
        { windowsHide: true, timeout: 30_000 },
        (error) => {
          if (error) {
            log.w("GOPARSER", "build_failed", { error: error.message });
            // Not fatal — will fall back to `go run`
            resolve();
            return;
          }
          this.cliBinaryAvailable = true;
          log.i("GOPARSER", "build_ok", { path: binaryPath });
          resolve();
        },
      );
      proc.on("error", () => resolve());
    });
  }

  /**
   * Rebuild binary if the .go source is newer than the existing binary.
   */
  private async rebuildIfOutdated(binaryPath: string): Promise<void> {
    try {
      const srcStat = statSync(GO_CLI_SCRIPT_PATH);
      const binStat = statSync(binaryPath);
      if (srcStat.mtimeMs > binStat.mtimeMs) {
        log.i("GOPARSER", "rebuild_outdated");
        await this.buildCliBinary(binaryPath);
      }
    } catch {
      // stat failed — skip rebuild
    }
  }

  /**
   * Check if Go is available
   */
  private checkGo(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.goPath, ["version"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      proc.on("error", () => resolve(false));
      proc.on("close", (code) => resolve(code === 0));
    });
  }

  /**
   * Ensure the Go script exists in temp directory
   */
  private async ensureScriptExists(): Promise<void> {
    const tempDir = join(tmpdir(), "ultracode-parsers");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    this.scriptPath = join(tempDir, "go-parser.go");
    writeFileSync(this.scriptPath, GO_PARSER_SCRIPT);
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".go");
  }

  /**
   * Parse a Go file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      let result: GoParseResult;

      if (this.goAvailable) {
        // Try different parsing modes in order of preference
        if (this.cliBinaryAvailable) {
          result = await this.parseWithCliBinary(filePath, content);
        } else if (this.cliScriptAvailable && this.useCliScript) {
          result = await this.parseWithCliScript(filePath, content);
        } else if (this.scriptPath) {
          result = await this.parseWithGo(filePath, content);
        } else {
          result = this.parseWithRegex(filePath, content);
        }
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
        language: "go" as SupportedLanguage,
        entities: result.entities,
        ...(result.relationships.length > 0 && { relationships: result.relationships }),
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
        language: "go" as SupportedLanguage,
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
   * Parse using pre-compiled CLI binary (fastest - supports relationships)
   */
  private parseWithCliBinary(filePath: string, content: string): Promise<GoParseResult> {
    return new Promise((resolve, reject) => {
      const binaryPath = process.platform === "win32" ? GO_CLI_BINARY_PATH + ".exe" : GO_CLI_BINARY_PATH;
      const proc = spawn(binaryPath, ["--stdin", filePath], {
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
        if (code !== 0 && !stdout) {
          reject(new Error(`Go CLI binary failed: ${stderr}`));
          return;
        }

        try {
          const raw = JSON.parse(stdout);
          if (!raw.relationships) {
            raw.relationships = [];
          }
          const result = this.mapGoResultToParseResult(raw, filePath);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Go CLI binary output: ${e}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Parse using external CLI script with go run (supports relationships)
   */
  private parseWithCliScript(filePath: string, content: string): Promise<GoParseResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.goPath, ["run", GO_CLI_SCRIPT_PATH, "--stdin", filePath], {
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
        if (code !== 0 && !stdout) {
          reject(new Error(`Go CLI script failed: ${stderr}`));
          return;
        }

        try {
          const raw = JSON.parse(stdout);
          if (!raw.relationships) {
            raw.relationships = [];
          }
          const result = this.mapGoResultToParseResult(raw, filePath);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Go CLI script output: ${e}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Parse using inline Go script (fallback - no relationships)
   */
  private parseWithGo(filePath: string, content: string): Promise<GoParseResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.goPath, ["run", this.scriptPath!, filePath], {
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
        if (code !== 0 && !stdout) {
          reject(new Error(`Go parser failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          // Ensure relationships array exists
          if (!result.relationships) {
            result.relationships = [];
          }
          // Ensure entity IDs for inline script
          for (const entity of result.entities) {
            if (!entity.id) {
              entity.id = `${filePath}:${entity.type}:${entity.name}`;
            }
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Go output: ${e}`));
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
  private parseWithRegex(filePath: string, content: string): GoParseResult {
    const rules: RegexExtractionRule[] = [
      // Package
      {
        regex: /^\s*package\s+(\w+)/gm,
        mapper: (m, fp, getLocation) => {
          const name = m[1];
          if (!name) return null;
          return {
            id: `${fp}:module:${name}`,
            name,
            type: "module",
            filePath: fp,
            location: getLocation(m.index),
          };
        },
      },
      // Single-line imports: import "fmt" or import alias "path"
      {
        regex: /import\s+(?:(\w+)\s+)?"([^"]+)"/gm,
        mapper: (m, fp, getLocation) => {
          const alias = m[1];
          const source = m[2];
          if (!source) return null;
          const importName = alias || basename(source) || source;
          return {
            id: `${fp}:import:${importName}`,
            name: importName,
            type: "import",
            filePath: fp,
            location: getLocation(m.index),
            importData: {
              source,
              specifiers: [{ local: importName }],
            },
          };
        },
      },
      // Functions
      {
        regex: /^func\s+(?:\(\s*\w+\s+\*?(\w+)\s*\)\s+)?(\w+)\s*\(/gm,
        mapper: (m, fp, getLocation) => {
          const receiver = m[1];
          const name = m[2];
          if (!name) return null;
          const modifiers: string[] = [];
          if (receiver) modifiers.push("method");
          const firstChar = name.charAt(0);
          if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

          const funcFullName = receiver ? `${receiver}.${name}` : name;
          return {
            id: `${fp}:function:${funcFullName}`,
            name: funcFullName,
            type: "function",
            filePath: fp,
            location: getLocation(m.index),
            ...(modifiers.length > 0 && { modifiers }),
          };
        },
      },
      // Types (struct, interface)
      {
        regex: /^type\s+(\w+)\s+(struct|interface)\s*\{/gm,
        mapper: (m, fp, getLocation) => {
          const name = m[1];
          const kind = m[2];
          if (!name || !kind) return null;
          const modifiers: string[] = [];
          const firstChar = name.charAt(0);
          if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

          const typeKind = kind === "struct" ? "class" : "interface";
          return {
            id: `${fp}:${typeKind}:${name}`,
            name,
            type: typeKind,
            filePath: fp,
            location: getLocation(m.index),
            ...(modifiers.length > 0 && { modifiers }),
          };
        },
      },
      // Constants and variables
      {
        regex: /^(?:const|var)\s+(\w+)\s+/gm,
        mapper: (m, fp, getLocation) => {
          const name = m[1];
          if (!name) return null;
          const isConst = m[0].startsWith("const");
          const modifiers: string[] = [];
          const firstChar = name.charAt(0);
          if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

          const valType = isConst ? "constant" : "variable";
          return {
            id: `${fp}:${valType}:${name}`,
            name,
            type: valType,
            filePath: fp,
            location: getLocation(m.index),
            ...(modifiers.length > 0 && { modifiers }),
          };
        },
      },
    ];

    const entities = runRegexExtractors(content, filePath, rules);

    // Import blocks — nested regex loop, handled separately
    const importBlockRe = /import\s*\(\s*([\s\S]*?)\s*\)/gm;
    const lineMap = new LineOffsetMap(content);
    let match: RegExpExecArray | null;
    while ((match = importBlockRe.exec(content))) {
      const block = match[1];
      if (!block) continue;
      const lineRe = /(?:(\w+)\s+)?"([^"]+)"/g;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRe.exec(block))) {
        const alias = lineMatch[1];
        const source = lineMatch[2];
        if (!source) continue;
        const importName = alias || basename(source) || source;
        entities.push({
          id: `${filePath}:import:${importName}`,
          name: importName,
          type: "import",
          filePath,
          location: lineMap.getEntityLocation(match.index),
          importData: {
            source,
            specifiers: [{ local: importName }],
          },
        });
      }
    }

    return { entities, relationships: [], errors: [] };
  }

  /**
   * Map raw Go CLI JSON output to proper ParseResult format.
   * Adds dummy locations for calls/controlFlow items and ensures entity IDs.
   */
  private mapGoResultToParseResult(raw: GoParseResult, filePath: string): GoParseResult {
    const dummyLocation = {
      start: { line: 0, column: 0, index: 0 },
      end: { line: 0, column: 0, index: 0 },
    };

    const mapEntity = (entity: ParsedEntity): ParsedEntity => {
      // Ensure entity ID
      if (!entity.id) {
        entity.id = `${filePath}:${entity.type}:${entity.name}`;
      }

      // Map calls from Go CLI format (CallInfo) to ParsedEntity.calls format
      // The raw JSON from Go CLI has calls/controlFlow in a slightly different format
      const entityAny = entity as unknown as Record<string, unknown>;
      const rawCalls = entityAny["calls"] as
        | Array<{
            name: string;
            target?: string;
            argumentCount: number;
            line?: number;
            isDefer?: boolean;
            isGo?: boolean;
            isBuiltin?: boolean;
          }>
        | undefined;

      if (rawCalls && rawCalls.length > 0) {
        entity.calls = rawCalls.map((c) => ({
          name: c.name,
          ...(c.target && { target: c.target }),
          location: dummyLocation,
          argumentCount: c.argumentCount,
          ...(c.isGo && { isAwait: true }),
        }));
      }

      // Map controlFlow from Go CLI format to ParsedEntity.controlFlow format
      const rawCF = entityAny["controlFlow"] as
        | {
            branches?: Array<{ type: string; condition?: string; line?: number }>;
            loops?: Array<{ type: string; line?: number }>;
            exceptions?: Array<{ type: string; line?: number }>;
            returns?: Array<{ hasValue: boolean; line?: number }>;
            awaits?: Array<{ type: string; line?: number }>;
          }
        | undefined;

      if (rawCF) {
        const hasCF =
          (rawCF.branches && rawCF.branches.length > 0) ||
          (rawCF.loops && rawCF.loops.length > 0) ||
          (rawCF.exceptions && rawCF.exceptions.length > 0) ||
          (rawCF.returns && rawCF.returns.length > 0) ||
          (rawCF.awaits && rawCF.awaits.length > 0);

        if (hasCF) {
          entity.controlFlow = {
            branches: (rawCF.branches || []).map((b) => ({
              type: b.type as "if" | "else" | "else-if" | "switch" | "case" | "default" | "ternary",
              ...(b.condition && { condition: b.condition }),
              location: dummyLocation,
            })),
            loops: (rawCF.loops || []).map((l) => ({
              type: l.type as "for" | "for-of" | "for-in" | "while" | "do-while",
              location: dummyLocation,
            })),
            exceptions: (rawCF.exceptions || []).map((e) => ({
              type: e.type as "try" | "catch" | "finally" | "throw",
              location: dummyLocation,
            })),
            returns: (rawCF.returns || []).map((r) => ({
              hasValue: r.hasValue,
              location: dummyLocation,
            })),
            awaits: (rawCF.awaits || []).map((a) => ({
              expression: a.type,
              location: dummyLocation,
            })),
          };
        }
      }

      // Recursively map children
      if (entity.children && entity.children.length > 0) {
        entity.children = entity.children.map(mapEntity);
      }

      return entity;
    };

    raw.entities = raw.entities.map(mapEntity);
    return raw;
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
    // Clean up temp script
    if (this.scriptPath && existsSync(this.scriptPath)) {
      try {
        unlinkSync(this.scriptPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
