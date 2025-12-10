/**
 * SWC Direct Parser
 *
 * Zero-overhead transformation from SWC AST to ParsedEntity.
 * No JSON.stringify, no visitor pattern overhead - just direct field mapping.
 *
 * Performance: ~0.1ms per file (vs 2-3ms for TypeScript API)
 */

import type {
  ClassDeclaration,
  ClassMethod,
  ClassProperty,
  ExportDeclaration,
  ExportDefaultDeclaration,
  FunctionDeclaration,
  ImportDeclaration,
  Module,
  ModuleItem,
  TsEnumDeclaration,
  TsInterfaceDeclaration,
  TsModuleDeclaration,
  TsTypeAliasDeclaration,
  VariableDeclaration,
} from "@swc/core";
import type { ParsedEntity, ParseResult } from "../types/parser.js";

// Lazy load SWC
let swcModule: typeof import("@swc/core") | null = null;

async function getSwc() {
  if (!swcModule) {
    swcModule = await import("@swc/core");
  }
  return swcModule;
}

/**
 * Parse options for entity extraction
 */
export interface SwcDirectParseOptions {
  /** Include detailed parameter info */
  includeParameters?: boolean;
  /** Include decorators */
  includeDecorators?: boolean;
  /** Include imports/exports */
  includeImports?: boolean;
}

/**
 * SWC parser configuration
 * Benchmarks show:
 * - comments: false saves ~4%
 * - decorators: true needed for Angular/NestJS
 * - tsx: auto-detect from extension
 * - Parallel c=32 is optimal (1.75x speedup)
 */
export interface SwcParserConfig {
  /** Parse comments (default: false for speed, TS API can get them if needed) */
  comments?: boolean;
  /** Parse decorators (default: true, needed for Angular) */
  decorators?: boolean;
  /** Force TSX mode (default: auto-detect from extension) */
  forceTsx?: boolean;
}

const DEFAULT_OPTIONS: SwcDirectParseOptions = {
  includeParameters: true,
  includeDecorators: true,
  includeImports: true,
};

const DEFAULT_SWC_CONFIG: SwcParserConfig = {
  comments: false, // 4% faster, TS API can get comments if needed
  decorators: true, // Needed for Angular/NestJS
  forceTsx: false, // Auto-detect
};

/** Optimal concurrency based on benchmarks */
export const OPTIMAL_CONCURRENCY = 32;

/**
 * Direct SWC Parser - fastest possible parsing
 *
 * @param filePath - path for language detection
 * @param content - source code
 * @param contentHash - hash for caching
 * @param options - entity extraction options
 * @param swcConfig - SWC parser configuration
 */
export async function parseWithSwc(
  filePath: string,
  content: string,
  contentHash: string,
  options: SwcDirectParseOptions = DEFAULT_OPTIONS,
  swcConfig: SwcParserConfig = DEFAULT_SWC_CONFIG,
): Promise<ParseResult> {
  const startTime = performance.now();
  const swc = await getSwc();

  // Detect syntax from extension
  const ext = filePath.split(".").pop()?.toLowerCase() || "ts";
  const isTypescript = ["ts", "tsx", "mts", "cts"].includes(ext);
  const isJsx = swcConfig.forceTsx || ["tsx", "jsx"].includes(ext);

  // Parse with SWC - optimized settings
  const ast = await swc.parse(content, {
    syntax: isTypescript ? "typescript" : "ecmascript",
    tsx: isJsx && isTypescript,
    jsx: isJsx && !isTypescript,
    decorators: swcConfig.decorators ?? true,
    comments: swcConfig.comments ?? false,
  });

  // Direct transformation to our format
  const entities = transformModule(ast, filePath, options);

  return {
    filePath,
    language: detectLanguage(ext),
    entities,
    contentHash,
    timestamp: Date.now(),
    parseTimeMs: performance.now() - startTime,
  };
}

/**
 * Batch parse multiple files with optimal parallelism
 *
 * Benchmarks show c=32 is optimal for ~300 files (1.75x speedup)
 */
export async function parseWithSwcBatch(
  files: Array<{ path: string; content: string; hash: string }>,
  options: SwcDirectParseOptions = DEFAULT_OPTIONS,
  concurrency = OPTIMAL_CONCURRENCY,
  swcConfig: SwcParserConfig = DEFAULT_SWC_CONFIG,
): Promise<ParseResult[]> {
  const results: ParseResult[] = [];

  // Process in parallel chunks (c=32 optimal per benchmarks)
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((f) =>
        parseWithSwc(f.path, f.content, f.hash, options, swcConfig).catch((e) => ({
          filePath: f.path,
          language: "typescript" as const,
          entities: [],
          contentHash: f.hash,
          timestamp: Date.now(),
          parseTimeMs: 0,
          error: e.message,
        })),
      ),
    );
    results.push(...chunkResults);
  }

  return results;
}

// =============================================================================
// DIRECT TRANSFORMATION - No visitors, no JSON, just field mapping
// =============================================================================

function transformModule(ast: Module, filePath: string, options: SwcDirectParseOptions): ParsedEntity[] {
  const entities: ParsedEntity[] = [];

  for (const item of ast.body) {
    transformModuleItem(item, entities, filePath, null, options);
  }

  return entities;
}

function transformModuleItem(
  item: ModuleItem,
  entities: ParsedEntity[],
  filePath: string,
  _parent: string | null,
  options: SwcDirectParseOptions,
): void {
  switch (item.type) {
    // Imports
    case "ImportDeclaration":
      if (options.includeImports) {
        transformImport(item, entities, filePath);
      }
      break;

    // Exports with declarations
    case "ExportDeclaration":
      transformExportDeclaration(item, entities, filePath, options);
      break;

    case "ExportDefaultDeclaration":
      transformExportDefault(item, entities, filePath, options);
      break;

    // Direct declarations (non-exported)
    case "ClassDeclaration":
      transformClass(item, entities, filePath, false, options);
      break;

    case "FunctionDeclaration":
      transformFunction(item, entities, filePath, false, options);
      break;

    case "VariableDeclaration":
      transformVariables(item, entities, filePath, false, options);
      break;

    case "TsInterfaceDeclaration":
      transformInterface(item, entities, filePath, false);
      break;

    case "TsTypeAliasDeclaration":
      transformTypeAlias(item, entities, filePath, false);
      break;

    case "TsEnumDeclaration":
      transformEnum(item, entities, filePath, false);
      break;

    case "TsModuleDeclaration":
      transformNamespace(item, entities, filePath, options);
      break;
  }
}

// =============================================================================
// TRANSFORM FUNCTIONS - Direct field mapping
// =============================================================================

function transformImport(item: ImportDeclaration, entities: ParsedEntity[], filePath: string): void {
  const specifiers = item.specifiers.map((s) => {
    if (s.type === "ImportDefaultSpecifier") {
      return { local: s.local.value, isDefault: true };
    } else if (s.type === "ImportSpecifier") {
      return {
        local: s.local.value,
        imported: s.imported?.value,
      };
    } else {
      // ImportNamespaceSpecifier
      return { local: s.local.value, isNamespace: true };
    }
  });

  entities.push({
    name: item.source.value,
    type: "import",
    filePath,
    location: spanToLocation(item.span),
    importData: {
      source: item.source.value,
      specifiers: specifiers.map((s) => ({
        local: s.local,
        imported: s.imported,
      })),
      isDefault: specifiers.some((s) => (s as any).isDefault),
      isNamespace: specifiers.some((s) => (s as any).isNamespace),
    },
    modifiers: item.typeOnly ? ["type"] : [],
  });
}

function transformExportDeclaration(
  item: ExportDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  options: SwcDirectParseOptions,
): void {
  const decl = item.declaration;

  switch (decl.type) {
    case "ClassDeclaration":
      transformClass(decl, entities, filePath, true, options);
      break;

    case "FunctionDeclaration":
      transformFunction(decl, entities, filePath, true, options);
      break;

    case "VariableDeclaration":
      transformVariables(decl, entities, filePath, true, options);
      break;

    case "TsInterfaceDeclaration":
      transformInterface(decl, entities, filePath, true);
      break;

    case "TsTypeAliasDeclaration":
      transformTypeAlias(decl, entities, filePath, true);
      break;

    case "TsEnumDeclaration":
      transformEnum(decl, entities, filePath, true);
      break;
  }
}

function transformExportDefault(
  item: ExportDefaultDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  _options: SwcDirectParseOptions,
): void {
  const decl = item.decl;

  if (decl.type === "ClassExpression" && decl.identifier) {
    entities.push({
      name: decl.identifier.value,
      type: "class",
      filePath,
      location: spanToLocation(item.span),
      modifiers: ["export", "default"],
    });
  } else if (decl.type === "FunctionExpression" && decl.identifier) {
    entities.push({
      name: decl.identifier.value,
      type: "function",
      filePath,
      location: spanToLocation(item.span),
      modifiers: ["export", "default"],
    });
  }
}

function transformClass(
  decl: ClassDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  exported: boolean,
  options: SwcDirectParseOptions,
): void {
  if (!decl.identifier) return;

  const className = decl.identifier.value;
  const children: ParsedEntity[] = [];
  const modifiers: string[] = exported ? ["export"] : [];

  // Decorators
  const decorators = options.includeDecorators ? extractDecorators(decl.decorators) : undefined;

  // Superclass
  let inheritance: ParsedEntity["inheritance"] | undefined;
  if (decl.superClass) {
    const superName = extractExpressionName(decl.superClass);
    if (superName) {
      inheritance = { baseClasses: [superName] };
    }
  }

  // Implements
  if (decl.implements && decl.implements.length > 0) {
    inheritance = inheritance || { baseClasses: [] };
    inheritance.interfaces = decl.implements.map((i) => extractTypeName(i.expression));
  }

  // Abstract
  if (decl.isAbstract) {
    modifiers.push("abstract");
  }

  // Class body
  for (const member of decl.body) {
    transformClassMember(member, children, filePath, className, options);
  }

  entities.push({
    name: className,
    type: "class",
    filePath,
    location: spanToLocation(decl.span),
    modifiers,
    children: children.length > 0 ? children : undefined,
    decorators,
    inheritance,
  });
}

function transformClassMember(
  member: ClassDeclaration["body"][0],
  entities: ParsedEntity[],
  filePath: string,
  className: string,
  options: SwcDirectParseOptions,
): void {
  if (member.type === "ClassMethod" || member.type === "PrivateMethod") {
    const m = member as ClassMethod;
    const name = extractKeyName(m.key);
    if (!name) return;

    const modifiers: string[] = [];
    if (m.isStatic) modifiers.push("static");
    if ((m as any).accessibility) modifiers.push((m as any).accessibility);
    if (m.isAbstract) modifiers.push("abstract");
    if (m.function.async) modifiers.push("async");

    const type: ParsedEntity["type"] = "method";
    if (m.kind === "getter") {
      modifiers.push("get");
    } else if (m.kind === "setter") {
      modifiers.push("set");
    }

    const decorators = options.includeDecorators ? extractDecorators((m as any).decorators) : undefined;

    const parameters = options.includeParameters ? extractParameters(m.function.params) : undefined;

    entities.push({
      name: `${className}.${name}`,
      type,
      filePath,
      location: spanToLocation(m.span),
      modifiers,
      decorators,
      parameters,
      returnType: extractTypeAnnotation(m.function.returnType),
    });
  } else if (member.type === "ClassProperty" || member.type === "PrivateProperty") {
    const p = member as ClassProperty;
    const name = extractKeyName(p.key);
    if (!name) return;

    const modifiers: string[] = [];
    if (p.isStatic) modifiers.push("static");
    if ((p as any).accessibility) modifiers.push((p as any).accessibility);
    if (p.readonly) modifiers.push("readonly");

    const decorators = options.includeDecorators ? extractDecorators((p as any).decorators) : undefined;

    entities.push({
      name: `${className}.${name}`,
      type: "property",
      filePath,
      location: spanToLocation(p.span),
      modifiers,
      decorators,
      returnType: extractTypeAnnotation(p.typeAnnotation),
    });
  } else if (member.type === "Constructor") {
    const parameters = options.includeParameters ? extractParameters(member.params) : undefined;

    entities.push({
      name: `${className}.constructor`,
      type: "method",
      filePath,
      location: spanToLocation(member.span),
      modifiers: [],
      parameters,
    });
  }
}

function transformFunction(
  decl: FunctionDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  exported: boolean,
  options: SwcDirectParseOptions,
): void {
  if (!decl.identifier) return;

  const modifiers: string[] = exported ? ["export"] : [];
  if (decl.async) modifiers.push("async");
  if (decl.generator) modifiers.push("generator");

  const decorators = options.includeDecorators ? extractDecorators((decl as any).decorators) : undefined;

  const parameters = options.includeParameters ? extractParameters(decl.params) : undefined;

  entities.push({
    name: decl.identifier.value,
    type: decl.async ? "async_function" : decl.generator ? "generator" : "function",
    filePath,
    location: spanToLocation(decl.span),
    modifiers,
    decorators,
    parameters,
    returnType: extractTypeAnnotation(decl.returnType),
  });
}

function transformVariables(
  decl: VariableDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  exported: boolean,
  options: SwcDirectParseOptions,
): void {
  for (const d of decl.declarations) {
    if (d.id.type !== "Identifier") continue;

    const modifiers: string[] = exported ? ["export"] : [];
    if (decl.kind === "const") modifiers.push("const");

    // Check if it's an arrow function
    let type: ParsedEntity["type"] = decl.kind === "const" ? "constant" : "variable";
    let parameters: ParsedEntity["parameters"] | undefined;

    if (d.init?.type === "ArrowFunctionExpression" || d.init?.type === "FunctionExpression") {
      type = "function";
      if (options.includeParameters) {
        parameters = extractParameters((d.init as any).params);
      }
    }

    entities.push({
      name: d.id.value,
      type,
      filePath,
      location: spanToLocation(d.span),
      modifiers,
      parameters,
      returnType: extractTypeAnnotation((d.id as any).typeAnnotation),
    });
  }
}

function transformInterface(
  decl: TsInterfaceDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  exported: boolean,
): void {
  const modifiers: string[] = exported ? ["export"] : [];

  let inheritance: ParsedEntity["inheritance"] | undefined;
  if (decl.extends && decl.extends.length > 0) {
    inheritance = {
      baseClasses: decl.extends.map((e) => extractTypeName(e.expression)),
    };
  }

  entities.push({
    name: decl.id.value,
    type: "interface",
    filePath,
    location: spanToLocation(decl.span),
    modifiers,
    inheritance,
  });
}

function transformTypeAlias(
  decl: TsTypeAliasDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  exported: boolean,
): void {
  entities.push({
    name: decl.id.value,
    type: "type",
    filePath,
    location: spanToLocation(decl.span),
    modifiers: exported ? ["export"] : [],
  });
}

function transformEnum(decl: TsEnumDeclaration, entities: ParsedEntity[], filePath: string, exported: boolean): void {
  const modifiers: string[] = exported ? ["export"] : [];
  if (decl.isConst) modifiers.push("const");

  entities.push({
    name: decl.id.value,
    type: "enum",
    filePath,
    location: spanToLocation(decl.span),
    modifiers,
  });
}

function transformNamespace(
  decl: TsModuleDeclaration,
  entities: ParsedEntity[],
  filePath: string,
  options: SwcDirectParseOptions,
): void {
  if (decl.id.type !== "Identifier") return;

  const children: ParsedEntity[] = [];

  if (decl.body?.type === "TsModuleBlock") {
    for (const item of decl.body.body) {
      transformModuleItem(item, children, filePath, decl.id.value, options);
    }
  }

  entities.push({
    name: decl.id.value,
    type: "module",
    filePath,
    location: spanToLocation(decl.span),
    children: children.length > 0 ? children : undefined,
  });
}

// =============================================================================
// HELPER FUNCTIONS - Minimal overhead extraction
// =============================================================================

function spanToLocation(span: { start: number; end: number }) {
  // SWC uses byte offsets, convert to line:column would require the source
  // For now, use offsets directly (can be enhanced later)
  return {
    start: { line: 0, column: 0, index: span.start },
    end: { line: 0, column: 0, index: span.end },
  };
}

function extractKeyName(key: any): string | null {
  if (!key) return null;
  if (key.type === "Identifier") return key.value;
  if (key.type === "PrivateName") return `#${key.id.value}`;
  if (key.type === "StringLiteral") return key.value;
  return null;
}

function extractExpressionName(expr: any): string | null {
  if (!expr) return null;
  if (expr.type === "Identifier") return expr.value;
  if (expr.type === "MemberExpression") {
    const obj = extractExpressionName(expr.object);
    const prop = extractExpressionName(expr.property);
    return obj && prop ? `${obj}.${prop}` : null;
  }
  return null;
}

function extractTypeName(expr: any): string {
  if (!expr) return "unknown";
  if (expr.type === "Identifier") return expr.value;
  if (expr.type === "TsQualifiedName") {
    return `${extractTypeName(expr.left)}.${expr.right.value}`;
  }
  return "unknown";
}

function extractDecorators(decorators: any[] | undefined): ParsedEntity["decorators"] | undefined {
  if (!decorators || decorators.length === 0) return undefined;

  return decorators.map((d) => {
    const expr = d.expression;
    if (expr.type === "Identifier") {
      return { name: expr.value };
    } else if (expr.type === "CallExpression" && expr.callee.type === "Identifier") {
      return {
        name: expr.callee.value,
        arguments: expr.arguments?.map((a: any) => extractArgumentValue(a)),
      };
    }
    return { name: "unknown" };
  });
}

function extractArgumentValue(arg: any): string {
  if (arg.expression) arg = arg.expression;
  if (arg.type === "StringLiteral") return arg.value;
  if (arg.type === "NumericLiteral") return String(arg.value);
  if (arg.type === "BooleanLiteral") return String(arg.value);
  if (arg.type === "Identifier") return arg.value;
  return "<expr>";
}

function extractParameters(params: any[] | undefined): ParsedEntity["parameters"] | undefined {
  if (!params || params.length === 0) return undefined;

  return params.map((p) => {
    // Handle different param types
    let param = p;
    if (p.type === "TsParameterProperty") {
      param = p.param;
    }
    if (param.type === "Parameter") {
      param = param.pat;
    }

    if (param.type === "Identifier") {
      return {
        name: param.value,
        type: extractTypeAnnotation(param.typeAnnotation),
        optional: param.optional,
      };
    } else if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
      return {
        name: param.left.value,
        type: extractTypeAnnotation(param.left.typeAnnotation),
        optional: true,
        defaultValue: extractArgumentValue(param.right),
      };
    } else if (param.type === "RestElement" && param.argument.type === "Identifier") {
      return {
        name: `...${param.argument.value}`,
        type: extractTypeAnnotation(param.typeAnnotation),
      };
    }

    return { name: "<pattern>" };
  });
}

function extractTypeAnnotation(typeAnnotation: any): string | undefined {
  if (!typeAnnotation) return undefined;

  const ta = typeAnnotation.typeAnnotation || typeAnnotation;
  return formatType(ta);
}

function formatType(type: any): string {
  if (!type) return "any";

  switch (type.type) {
    case "TsKeywordType":
      return type.kind;
    case "TsTypeReference":
      return extractTypeName(type.typeName);
    case "TsArrayType":
      return `${formatType(type.elemType)}[]`;
    case "TsUnionType":
      return type.types.map(formatType).join(" | ");
    case "TsIntersectionType":
      return type.types.map(formatType).join(" & ");
    case "TsFunctionType":
      return "Function";
    case "TsTypeLiteral":
      return "object";
    case "TsLiteralType":
      if (type.literal.type === "StringLiteral") return `"${type.literal.value}"`;
      if (type.literal.type === "NumericLiteral") return String(type.literal.value);
      return "literal";
    default:
      return "unknown";
  }
}

function detectLanguage(ext: string): "typescript" | "javascript" | "tsx" | "jsx" {
  switch (ext) {
    case "tsx":
      return "tsx";
    case "jsx":
      return "jsx";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    default:
      return "typescript";
  }
}

// =============================================================================
// WARM UP - Pre-initialize SWC
// =============================================================================

export async function warmUpSwc(): Promise<void> {
  await parseWithSwc("warmup.ts", "const x = 1;", "warmup");
}
