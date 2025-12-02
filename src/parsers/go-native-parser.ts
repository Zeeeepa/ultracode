/**
 * Go Native Parser
 *
 * Uses Go's built-in `go/parser` and `go/ast` packages via subprocess.
 * Philosophy: Go developers always have Go installed.
 *
 * Architecture:
 * - Spawns `go run` with embedded Go script for parsing
 * - Returns JSON-serialized AST
 * - Falls back to regex-based extraction if Go is not available
 *
 * No native modules required - uses subprocess.
 */

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";

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

type Result struct {
	Entities []Entity \`json:"entities"\`
	Errors   []Error  \`json:"errors"\`
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

	result := Result{Entities: entities}
	json.NewEncoder(os.Stdout).Encode(result)
}
`;

// =============================================================================
// GO PARSER CLASS
// =============================================================================

interface GoParseResult {
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

export class GoNativeParser {
  private goPath: string = "go";
  private goAvailable: boolean | null = null;
  private scriptPath: string | null = null;
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
    console.error("[GoNativeParser] Checking Go availability...");

    try {
      const available = await this.checkGo();
      if (available) {
        this.goAvailable = true;
        await this.ensureScriptExists();
        console.error("[GoNativeParser] Initialized (using go run)");
        return;
      }
    } catch {
      // Go not available
    }

    this.goAvailable = false;
    console.error(
      "[GoNativeParser] Go not found, falling back to regex parser",
    );
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
    const tempDir = join(tmpdir(), "ultrascript-parsers");
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
  async parse(
    filePath: string,
    content: string,
    contentHash: string,
  ): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      let result: GoParseResult;

      if (this.goAvailable && this.scriptPath) {
        result = await this.parseWithGo(filePath, content);
      } else {
        result = this.parseWithRegex(filePath, content);
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs =
        this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "go" as SupportedLanguage,
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
   * Parse using Go subprocess
   */
  private parseWithGo(
    filePath: string,
    content: string,
  ): Promise<GoParseResult> {
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
  private parseWithRegex(
    filePath: string,
    content: string,
  ): GoParseResult {
    const entities: ParsedEntity[] = [];

    // Package
    const packageMatch = /^\s*package\s+(\w+)/m.exec(content);
    if (packageMatch && packageMatch[1]) {
      entities.push({
        name: packageMatch[1],
        type: "module",
        filePath,
        location: this.getLocationFromIndex(content, packageMatch.index),
      });
    }

    // Imports
    const importRe = /import\s+(?:(\w+)\s+)?"([^"]+)"/gm;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content))) {
      const alias = match[1];
      const source = match[2];
      if (!source) continue;
      entities.push({
        name: alias || source.split("/").pop() || source,
        type: "import",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        importData: {
          source,
          specifiers: [{ local: alias || source.split("/").pop() || source }],
        },
      });
    }

    // Import blocks
    const importBlockRe = /import\s*\(\s*([\s\S]*?)\s*\)/gm;
    while ((match = importBlockRe.exec(content))) {
      const block = match[1];
      if (!block) continue;
      const lineRe = /(?:(\w+)\s+)?"([^"]+)"/g;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRe.exec(block))) {
        const alias = lineMatch[1];
        const source = lineMatch[2];
        if (!source) continue;
        entities.push({
          name: alias || source.split("/").pop() || source,
          type: "import",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
          importData: {
            source,
            specifiers: [{ local: alias || source.split("/").pop() || source }],
          },
        });
      }
    }

    // Functions
    const funcRe = /^func\s+(?:\(\s*\w+\s+\*?(\w+)\s*\)\s+)?(\w+)\s*\(/gm;
    while ((match = funcRe.exec(content))) {
      const receiver = match[1];
      const name = match[2];
      if (!name) continue;
      const modifiers: string[] = [];
      if (receiver) modifiers.push("method");
      const firstChar = name.charAt(0);
      if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

      entities.push({
        name: receiver ? `${receiver}.${name}` : name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      });
    }

    // Types (struct, interface)
    const typeRe = /^type\s+(\w+)\s+(struct|interface)\s*\{/gm;
    while ((match = typeRe.exec(content))) {
      const name = match[1];
      const kind = match[2];
      if (!name || !kind) continue;
      const modifiers: string[] = [];
      const firstChar = name.charAt(0);
      if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

      entities.push({
        name,
        type: kind === "struct" ? "class" : "interface",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      });
    }

    // Constants
    const constRe = /^(?:const|var)\s+(\w+)\s+/gm;
    while ((match = constRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      const isConst = match[0].startsWith("const");
      const modifiers: string[] = [];
      const firstChar = name.charAt(0);
      if (firstChar && firstChar === firstChar.toUpperCase()) modifiers.push("exported");

      entities.push({
        name,
        type: isConst ? "constant" : "variable",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      });
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
