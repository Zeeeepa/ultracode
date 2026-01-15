/**
 * OXC Fast Parser - Pass 1
 *
 * Uses oxc-parser for ultra-fast structural parsing (~2x faster than SWC).
 * OXC is a Rust-based parser that outputs ESTree-compatible AST.
 *
 * Extracts basic structure for:
 * - Complexity analysis (to prioritize detailed parsing)
 * - Dependency graph (imports/exports from module info)
 * - Entity discovery (classes, functions, interfaces)
 *
 * Benefits over SWC:
 * - ~2x faster sequential parsing (1.12ms vs 2.05ms per file)
 * - Smaller package size (2MB vs 37MB)
 * - Direct module info without AST traversal for imports/exports
 *
 * Performance: ~0.5-2ms per file
 */

import type { Statement } from "@oxc-project/types";
import type { EcmaScriptModule, parseSync as ParseSyncFn } from "oxc-parser";
import type { ComplexityScore, ExportInfo, ImportInfo, QuickEntity, QuickParseResult } from "./types.js";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

// OXC module type
interface OxcModule {
  parseSync: typeof ParseSyncFn;
}

/**
 * Extended Statement node with common properties from ESTree
 */
type ExtendedStatement = Statement & {
  type: string;
  id?: { name: string; value?: string };
  body?: {
    body?: ExtendedStatement[];
  };
  declaration?: ExtendedStatement;
  declarations?: Array<{
    id?: { name: string };
    init?: { type: string };
  }>;
  decorators?: unknown[];
  typeParameters?: {
    params?: unknown[];
  };
  start?: number;
  end?: number;
};

/**
 * Class node with body members
 */
type ClassNode = ExtendedStatement & {
  body?: {
    body?: Array<{
      type: string;
      key?: { name?: string; value?: string };
      decorators?: unknown[];
      start?: number;
      end?: number;
    }>;
  };
};

// Lazy load OXC
let oxc: OxcModule | null = null;

async function getOxc(): Promise<OxcModule> {
  if (!oxc) {
    try {
      oxc = (await import("oxc-parser")) as OxcModule;
    } catch {
      throw new Error("oxc-parser not installed. Run: npm install oxc-parser");
    }
  }
  return oxc;
}

/**
 * OXC Parser Options
 */
export interface OxcParserOptions {
  /** Parse as TypeScript (default: auto-detect from extension) */
  typescript?: boolean;
  /** Parse JSX/TSX */
  jsx?: boolean;
  /** Keep content in result for reuse in detailed pass */
  keepContent?: boolean;
}

/**
 * Fast parse using OXC
 */
export async function fastParse(
  filePath: string,
  content: string,
  options: OxcParserOptions = {},
): Promise<QuickParseResult> {
  const startTime = performance.now();
  const oxcModule = await getOxc();

  // Detect syntax from extension
  const ext = filePath.split(".").pop()?.toLowerCase() || "ts";
  const isJsx = options.jsx ?? ["tsx", "jsx"].includes(ext);

  // Parse with OXC - parseSync returns ParseResult class with getters
  const result = oxcModule.parseSync(filePath, content, {
    sourceType: "module",
  });

  // Check for parse errors
  if (result.errors && result.errors.length > 0) {
    return {
      filePath,
      entities: [],
      complexity: {
        total: 0,
        typeCount: 0,
        functionCount: 0,
        maxNesting: 0,
        hasGenerics: false,
        hasDecorators: false,
        hasJsx: isJsx,
        lines: content.split("\n").length,
      },
      imports: [],
      exports: [],
      parseTimeMs: performance.now() - startTime,
      needsDetailedPass: true,
      content: options.keepContent ? content : undefined,
      error: "Parse errors",
    } as QuickParseResult & { error?: string };
  }

  // Extract structure from ESTree AST
  const entities: QuickEntity[] = [];
  let maxNesting = 0;
  let hasGenerics = false;
  let hasDecorators = false;

  // Walk AST for entities
  for (const node of result.program.body) {
    processNode(node, entities, null, 0, (depth) => {
      maxNesting = Math.max(maxNesting, depth);
    });

    if (hasGenericsInNode(node)) hasGenerics = true;
    if (hasDecoratorsInNode(node)) hasDecorators = true;
  }

  // Extract imports/exports from module info (no AST traversal needed!)
  const imports = extractImports(result.module);
  const exports = extractExports(result.module, entities);

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
    needsDetailedPass: complexity.total >= 50,
    content: options.keepContent ? content : undefined,
  };
}

/**
 * Batch fast parse with concurrency control
 */
export async function fastParseBatch(
  files: Array<{ path: string; content: string }>,
  concurrency = 16,
  options: OxcParserOptions = {},
): Promise<QuickParseResult[]> {
  const results: QuickParseResult[] = [];

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
// IMPORT/EXPORT EXTRACTION (from OXC module info - no AST traversal)
// =============================================================================

function extractImports(module: EcmaScriptModule): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (const imp of module.staticImports) {
    const specifiers: string[] = [];
    for (const entry of imp.entries) {
      const localName = entry.localName.value;
      const importKind = entry.importName.kind;
      if (importKind === "NamespaceObject") {
        specifiers.push(`* as ${localName}`);
      } else {
        specifiers.push(localName);
      }
    }

    imports.push({
      source: imp.moduleRequest.value,
      specifiers,
      isTypeOnly: imp.entries.every((e: (typeof imp.entries)[number]) => e.isType),
      isDynamic: false,
    });
  }

  return imports;
}

function extractExports(module: EcmaScriptModule, entities: QuickEntity[]): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const exportedNames = new Set<string>();

  for (const exp of module.staticExports) {
    for (const entry of exp.entries) {
      const name = entry.exportName.name;
      if (name && !exportedNames.has(name)) {
        exportedNames.add(name);
        exports.push({
          name,
          isDefault: entry.exportName.kind === "Default",
          isTypeOnly: entry.isType,
          source: entry.moduleRequest?.value,
        });
      }
    }
  }

  // Mark exported entities
  for (const entity of entities) {
    if (exportedNames.has(entity.name)) {
      entity.exported = true;
    }
  }

  return exports;
}

// =============================================================================
// AST WALKING HELPERS (ESTree format from @oxc-project/types)
// =============================================================================

function processNode(
  node: Statement,
  entities: QuickEntity[],
  parent: string | null,
  depth: number,
  onNesting: (depth: number) => void,
): void {
  const n = node as ExtendedStatement;
  onNesting(depth);

  switch (n.type) {
    case "ClassDeclaration":
    case "ClassExpression": {
      const name = n.id?.name || "<anonymous>";
      entities.push(createEntity("class", name, n, parent, false));
      processClassBody(n, entities, name, depth + 1, onNesting);
      break;
    }

    case "FunctionDeclaration":
    case "FunctionExpression": {
      const name = n.id?.name;
      if (name) {
        entities.push(createEntity("function", name, n, parent, false));
      }
      break;
    }

    case "TSInterfaceDeclaration": {
      if (n.id?.name) {
        entities.push(createEntity("interface", n.id.name, n, parent, false));
      }
      break;
    }

    case "TSTypeAliasDeclaration": {
      if (n.id?.name) {
        entities.push(createEntity("type", n.id.name, n, parent, false));
      }
      break;
    }

    case "TSEnumDeclaration": {
      if (n.id?.name) {
        entities.push(createEntity("enum", n.id.name, n, parent, false));
      }
      break;
    }

    case "TSModuleDeclaration": {
      const name = n.id?.name || n.id?.value;
      if (name) {
        entities.push(createEntity("namespace", name, n, parent, false));
        if (n.body?.body) {
          for (const child of n.body.body) {
            processNode(child as Statement, entities, name, depth + 1, onNesting);
          }
        }
      }
      break;
    }

    case "VariableDeclaration": {
      for (const decl of n.declarations || []) {
        const name = decl.id?.name;
        if (name) {
          const init = decl.init;
          if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
            entities.push(createEntity("function", name, decl as unknown as ExtendedStatement, parent, false));
          } else {
            entities.push(createEntity("variable", name, decl as unknown as ExtendedStatement, parent, false));
          }
        }
      }
      break;
    }

    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration": {
      if (n.declaration) {
        processNode(n.declaration as Statement, entities, parent, depth, onNesting);
        // Mark as exported
        const lastEntity = entities[entities.length - 1];
        if (lastEntity) {
          lastEntity.exported = true;
        }
      }
      break;
    }
  }
}

function processClassBody(
  classNode: ClassNode,
  entities: QuickEntity[],
  className: string,
  depth: number,
  onNesting: (depth: number) => void,
): void {
  onNesting(depth);

  const body = classNode.body?.body || [];
  for (const member of body) {
    const m = member as unknown as {
      type: string;
      key?: { name?: string; value?: string };
      start?: number;
      end?: number;
      decorators?: unknown[];
    };
    if (m.type === "MethodDefinition" || m.type === "PropertyDefinition") {
      const name = m.key?.name || m.key?.value || "<computed>";
      const type = m.type === "MethodDefinition" ? "function" : "variable";
      entities.push({
        name: `${className}.${name}`,
        type,
        startLine: m.start || 0,
        endLine: m.end || 0,
        exported: false,
        decorated: (m.decorators?.length ?? 0) > 0,
        parent: className,
      });
    }
  }
}

function createEntity(
  type: QuickEntity["type"],
  name: string,
  node: ExtendedStatement,
  parent: string | null,
  exported: boolean,
): QuickEntity {
  return {
    name,
    type,
    startLine: node.start || 0,
    endLine: node.end || 0,
    exported,
    decorated: (node.decorators?.length ?? 0) > 0,
    ...(parent && { parent: parent }),
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

function hasGenericsInNode(node: Statement): boolean {
  const n = node as ExtendedStatement;
  if ((n.typeParameters?.params?.length ?? 0) > 0) return true;
  if ((n.declaration?.typeParameters?.params?.length ?? 0) > 0) return true;
  return false;
}

function hasDecoratorsInNode(node: Statement): boolean {
  const n = node as ExtendedStatement;
  if ((n.decorators?.length ?? 0) > 0) return true;
  if ((n.declaration?.decorators?.length ?? 0) > 0) return true;

  const body = n.declaration?.body?.body || n.body?.body || [];
  for (const member of body) {
    if ((member.decorators?.length ?? 0) > 0) return true;
  }

  return false;
}
