/**
 * SWC Fast Parser - Pass 1
 *
 * Uses @swc/core for ultra-fast structural parsing (~20x faster than TS API).
 * Extracts basic structure for:
 * - Complexity analysis (to prioritize detailed parsing)
 * - Dependency graph (imports/exports)
 * - Entity discovery (classes, functions, interfaces)
 *
 * Does NOT extract:
 * - Full type information
 * - Control flow details
 * - Call graphs
 * - JSDoc/documentation
 *
 * Performance: ~1-5ms per file vs 15-50ms with TS API
 */

import type { ModuleItem } from "@swc/core";
import type { ComplexityScore, ExportInfo, ImportInfo, QuickEntity, QuickParseResult } from "./types.js";

// Lazy load SWC
let swc: typeof import("@swc/core") | null = null;

async function getSwc() {
  if (!swc) {
    swc = await import("@swc/core");
  }
  return swc;
}

/**
 * SWC Parser Options
 */
export interface SwcParserOptions {
  /** Parse as TypeScript (default: auto-detect from extension) */
  typescript?: boolean;
  /** Parse JSX/TSX */
  jsx?: boolean;
  /** Include comments for doc extraction */
  comments?: boolean;
  /** Keep content in result for reuse in detailed pass */
  keepContent?: boolean;
}

/**
 * Fast parse using SWC
 */
export async function fastParse(
  filePath: string,
  content: string,
  options: SwcParserOptions = {},
): Promise<QuickParseResult> {
  const startTime = performance.now();
  const swcModule = await getSwc();

  // Detect syntax from extension
  const ext = filePath.split(".").pop()?.toLowerCase() || "ts";
  const isTypescript = options.typescript ?? ["ts", "tsx", "mts", "cts"].includes(ext);
  const isJsx = options.jsx ?? ["tsx", "jsx"].includes(ext);

  // Parse with SWC
  const ast = await swcModule.parse(content, {
    syntax: isTypescript ? "typescript" : "ecmascript",
    tsx: isJsx && isTypescript,
    jsx: isJsx && !isTypescript,
    decorators: true,
    comments: options.comments ?? false,
  });

  // Extract structure
  const entities: QuickEntity[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  let maxNesting = 0;
  let hasGenerics = false;
  let hasDecorators = false;

  // Walk AST
  for (const item of ast.body) {
    processModuleItem(item, entities, imports, exports, null, 0, (depth) => {
      maxNesting = Math.max(maxNesting, depth);
    });

    // Check for generics and decorators
    if (hasGenericsInItem(item)) hasGenerics = true;
    if (hasDecoratorsInItem(item)) hasDecorators = true;
  }

  const parseTimeMs = performance.now() - startTime;

  // Calculate complexity
  const complexity = calculateComplexity(entities, imports, content, maxNesting, hasGenerics, hasDecorators, isJsx);

  return {
    filePath,
    entities,
    complexity,
    imports,
    exports,
    parseTimeMs,
    needsDetailedPass: complexity.total >= 50, // Threshold for detailed analysis
    content: options.keepContent ? content : undefined,
  };
}

/**
 * Batch fast parse with concurrency control
 */
export async function fastParseBatch(
  files: Array<{ path: string; content: string }>,
  concurrency = 16,
  options: SwcParserOptions = {},
): Promise<QuickParseResult[]> {
  const results: QuickParseResult[] = [];

  // Process in chunks
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((f) =>
        fastParse(f.path, f.content, options).catch(
          (e) =>
            ({
              filePath: f.path,
              entities: [],
              complexity: {
                total: 0,
                typeCount: 0,
                functionCount: 0,
                maxNesting: 0,
                hasGenerics: false,
                hasDecorators: false,
                hasJsx: false,
                lines: 0,
              },
              imports: [],
              exports: [],
              parseTimeMs: 0,
              needsDetailedPass: false,
              content: options.keepContent ? f.content : undefined,
              error: e.message,
            }) as QuickParseResult & { error?: string },
        ),
      ),
    );
    results.push(...chunkResults);
  }

  return results;
}

// =============================================================================
// AST WALKING HELPERS
// =============================================================================

function processModuleItem(
  item: ModuleItem,
  entities: QuickEntity[],
  imports: ImportInfo[],
  exports: ExportInfo[],
  parent: string | null,
  depth: number,
  onNesting: (depth: number) => void,
): void {
  onNesting(depth);

  switch (item.type) {
    // Imports
    case "ImportDeclaration": {
      const specifiers: string[] = [];
      for (const spec of item.specifiers) {
        if (spec.type === "ImportDefaultSpecifier") {
          specifiers.push(spec.local.value);
        } else if (spec.type === "ImportSpecifier") {
          specifiers.push(spec.local.value);
        } else if (spec.type === "ImportNamespaceSpecifier") {
          specifiers.push(`* as ${spec.local.value}`);
        }
      }
      imports.push({
        source: item.source.value,
        specifiers,
        isTypeOnly: item.typeOnly ?? false,
        isDynamic: false,
      });
      break;
    }

    // Exports
    case "ExportDeclaration": {
      const decl = item.declaration;
      if (decl.type === "ClassDeclaration" && decl.identifier) {
        entities.push(createEntity("class", decl.identifier.value, decl, parent, true));
        exports.push({ name: decl.identifier.value, isDefault: false, isTypeOnly: false });
        // Process class body
        processClassBody(decl, entities, decl.identifier.value, depth + 1, onNesting);
      } else if (decl.type === "FunctionDeclaration" && decl.identifier) {
        entities.push(createEntity("function", decl.identifier.value, decl, parent, true));
        exports.push({ name: decl.identifier.value, isDefault: false, isTypeOnly: false });
      } else if (decl.type === "TsInterfaceDeclaration") {
        entities.push(createEntity("interface", decl.id.value, decl, parent, true));
        exports.push({ name: decl.id.value, isDefault: false, isTypeOnly: true });
      } else if (decl.type === "TsTypeAliasDeclaration") {
        entities.push(createEntity("type", decl.id.value, decl, parent, true));
        exports.push({ name: decl.id.value, isDefault: false, isTypeOnly: true });
      } else if (decl.type === "TsEnumDeclaration") {
        entities.push(createEntity("enum", decl.id.value, decl, parent, true));
        exports.push({ name: decl.id.value, isDefault: false, isTypeOnly: false });
      } else if (decl.type === "VariableDeclaration") {
        for (const d of decl.declarations) {
          if (d.id.type === "Identifier") {
            entities.push(createEntity("variable", d.id.value, d, parent, true));
            exports.push({ name: d.id.value, isDefault: false, isTypeOnly: false });
          }
        }
      }
      break;
    }

    case "ExportDefaultDeclaration": {
      const decl = item.decl;
      if (decl.type === "ClassExpression" && decl.identifier) {
        entities.push(createEntity("class", decl.identifier.value, decl, parent, true));
        exports.push({ name: decl.identifier.value, isDefault: true, isTypeOnly: false });
      } else if (decl.type === "FunctionExpression" && decl.identifier) {
        entities.push(createEntity("function", decl.identifier.value, decl, parent, true));
        exports.push({ name: decl.identifier.value, isDefault: true, isTypeOnly: false });
      } else if ((decl as any).type === "Identifier") {
        exports.push({ name: (decl as any).value, isDefault: true, isTypeOnly: false });
      }
      break;
    }

    case "ExportNamedDeclaration": {
      for (const spec of item.specifiers) {
        if (spec.type === "ExportSpecifier") {
          const exported = spec.exported?.value ?? spec.orig.value;
          exports.push({
            name: exported,
            isDefault: false,
            isTypeOnly: item.typeOnly ?? false,
            source: item.source?.value,
          });
        }
      }
      break;
    }

    // Regular declarations
    case "ClassDeclaration": {
      if (item.identifier) {
        entities.push(createEntity("class", item.identifier.value, item, parent, false));
        processClassBody(item, entities, item.identifier.value, depth + 1, onNesting);
      }
      break;
    }

    case "FunctionDeclaration": {
      if (item.identifier) {
        entities.push(createEntity("function", item.identifier.value, item, parent, false));
      }
      break;
    }

    case "TsInterfaceDeclaration": {
      entities.push(createEntity("interface", item.id.value, item, parent, false));
      break;
    }

    case "TsTypeAliasDeclaration": {
      entities.push(createEntity("type", item.id.value, item, parent, false));
      break;
    }

    case "TsEnumDeclaration": {
      entities.push(createEntity("enum", item.id.value, item, parent, false));
      break;
    }

    case "TsModuleDeclaration": {
      if (item.id.type === "Identifier") {
        entities.push(createEntity("namespace", item.id.value, item, parent, false));
        // Process namespace body
        if (item.body && item.body.type === "TsModuleBlock") {
          for (const bodyItem of item.body.body) {
            processModuleItem(bodyItem, entities, imports, exports, item.id.value, depth + 1, onNesting);
          }
        }
      }
      break;
    }

    case "VariableDeclaration": {
      for (const decl of item.declarations) {
        if (decl.id.type === "Identifier") {
          // Check if it's an arrow function or function expression
          const init = decl.init;
          if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
            entities.push(createEntity("function", decl.id.value, decl, parent, false));
          } else {
            entities.push(createEntity("variable", decl.id.value, decl, parent, false));
          }
        }
      }
      break;
    }
  }
}

function processClassBody(
  classDecl: any,
  entities: QuickEntity[],
  className: string,
  depth: number,
  onNesting: (depth: number) => void,
): void {
  onNesting(depth);

  if (!classDecl.body) return;

  for (const member of classDecl.body) {
    if (member.type === "ClassMethod" || member.type === "ClassPrivateMethod") {
      const name = member.key?.type === "Identifier" ? member.key.value : "<computed>";
      entities.push({
        name: `${className}.${name}`,
        type: "function",
        startLine: member.span?.start ?? 0,
        endLine: member.span?.end ?? 0,
        exported: false,
        decorated: (member.decorators?.length ?? 0) > 0,
        parent: className,
      });
    } else if (member.type === "ClassProperty" || member.type === "ClassPrivateProperty") {
      const name = member.key?.type === "Identifier" ? member.key.value : "<computed>";
      entities.push({
        name: `${className}.${name}`,
        type: "variable",
        startLine: member.span?.start ?? 0,
        endLine: member.span?.end ?? 0,
        exported: false,
        decorated: (member.decorators?.length ?? 0) > 0,
        parent: className,
      });
    }
  }
}

function createEntity(
  type: QuickEntity["type"],
  name: string,
  node: any,
  parent: string | null,
  exported: boolean,
): QuickEntity {
  return {
    name,
    type,
    startLine: node.span?.start ?? 0,
    endLine: node.span?.end ?? 0,
    exported,
    decorated: (node.decorators?.length ?? 0) > 0,
    parent: parent ?? undefined,
  };
}

// =============================================================================
// COMPLEXITY ANALYSIS
// =============================================================================

function calculateComplexity(
  entities: QuickEntity[],
  _imports: ImportInfo[],
  content: string,
  maxNesting: number,
  hasGenerics: boolean,
  hasDecorators: boolean,
  hasJsx: boolean,
): ComplexityScore {
  const lines = content.split("\n").length;
  const typeCount = entities.filter((e) => ["class", "interface", "type", "enum"].includes(e.type)).length;
  const functionCount = entities.filter((e) => e.type === "function").length;

  // Calculate total complexity score (0-100)
  let total = 0;

  // Size factor (0-30 points)
  total += Math.min(30, Math.floor(lines / 50));

  // Entity count (0-20 points)
  total += Math.min(20, (typeCount + functionCount) * 2);

  // Nesting depth (0-15 points)
  total += Math.min(15, maxNesting * 3);

  // Generics add complexity (0-10 points)
  if (hasGenerics) total += 10;

  // Decorators need full type analysis (0-15 points)
  if (hasDecorators) total += 15;

  // JSX needs template handling (0-10 points)
  if (hasJsx) total += 10;

  return {
    total: Math.min(100, total),
    typeCount,
    functionCount,
    maxNesting,
    hasGenerics,
    hasDecorators,
    hasJsx,
    lines,
  };
}

/**
 * Check if item has generics (type parameters) - optimized without JSON.stringify
 */
function hasGenericsInItem(item: ModuleItem): boolean {
  const i = item as any;

  // Check direct typeParameters
  if (i.typeParameters?.params?.length > 0) return true;

  // Check class/interface body
  if (i.declaration) {
    const decl = i.declaration as any;
    if (decl.typeParams?.params?.length > 0) return true;
    if (decl.typeParameters?.params?.length > 0) return true;
  }

  // Check function declarations
  if (i.typeParams?.params?.length > 0) return true;

  return false;
}

/**
 * Check if item has decorators - optimized without JSON.stringify
 */
function hasDecoratorsInItem(item: ModuleItem): boolean {
  const i = item as any;

  // Direct decorators
  if (i.decorators && i.decorators.length > 0) return true;

  // Decorators on declaration
  if (i.declaration?.decorators?.length > 0) return true;

  // Check class body members (body can be array or object with body property)
  const body = i.declaration?.body;
  if (Array.isArray(body)) {
    for (const member of body) {
      if (member.decorators?.length > 0) return true;
    }
  }

  return false;
}
