/**
 * C Language Analyzer
 *
 * Parses C source files via tree-sitter AST and produces a flat list of
 * semantic entities (functions, composites, typedefs, macros, variables)
 * together with include-based relationships.
 *
 * Design choices:
 *   - Iterative DFS with an explicit stack instead of recursive walking.
 *   - Handler dispatch via Map<string, Handler> rather than a switch block.
 *   - Grouped handlers: processDefinition, processComposite, processPreprocessor.
 *   - Iterative helper `findDescendants` replaces the recursive allOfType.
 *   - Iterative name-drill chains instead of recursive drillToFunctionName /
 *     drillToDeclaratorName.
 *   - Wall-clock deadline passed as a parameter, not stored as instance state.
 *   - Direct `node.text` access everywhere, no wrapper method.
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import { log } from "../logging/index.js";
import type { ASTNode, EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getNodeLocation } from "./base-parser-utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// Handler context — every handler receives this bag of mutable collectors
// ---------------------------------------------------------------------------

interface HandlerContext {
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  deadline: number;
}

type NodeHandler = (node: ASTNode, ctx: HandlerContext) => void;

// ---------------------------------------------------------------------------
// Iterative AST helpers
// ---------------------------------------------------------------------------

/**
 * Collect every descendant whose `type` equals `target`.
 * Uses an iterative BFS-style stack to avoid call-stack limits.
 */
function findDescendants(root: ASTNode, target: string): ASTNode[] {
  const found: ASTNode[] = [];
  const pending: ASTNode[] = [root];
  while (pending.length > 0) {
    const cur = pending.pop()!;
    if (cur.type === target) found.push(cur);
    for (let i = cur.childCount - 1; i >= 0; i--) {
      const ch = cur.child(i);
      if (ch) pending.push(ch);
    }
  }
  return found;
}

/**
 * Return the first descendant (DFS order) whose type is in `targets`.
 */
function firstDescendantOfTypes(root: ASTNode, targets: ReadonlyArray<string>): ASTNode | null {
  const pending: ASTNode[] = [root];
  while (pending.length > 0) {
    const cur = pending.pop()!;
    if (targets.includes(cur.type)) return cur;
    for (let i = cur.childCount - 1; i >= 0; i--) {
      const ch = cur.child(i);
      if (ch) pending.push(ch);
    }
  }
  return null;
}

/**
 * Return the last descendant (DFS order) whose type is in `targets`.
 * Collects all matches and returns the final one.
 */
function lastDescendantOfTypes(root: ASTNode, targets: ReadonlyArray<string>): ASTNode | null {
  let last: ASTNode | null = null;
  const pending: ASTNode[] = [root];
  while (pending.length > 0) {
    const cur = pending.pop()!;
    if (targets.includes(cur.type)) last = cur;
    // Push children in reverse so that left subtree is visited first,
    // meaning the rightmost / last-in-document match wins at the end.
    for (let i = 0; i < cur.childCount; i++) {
      const ch = cur.child(i);
      if (ch) pending.push(ch);
    }
  }
  return last;
}

/**
 * First direct named child whose type is in `targets`.
 */
function firstNamedChildOfTypes(node: ASTNode, targets: ReadonlyArray<string>): ASTNode | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const ch = node.namedChild(i);
    if (ch && targets.includes(ch.type)) return ch;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Iterative declarator drill-down
// ---------------------------------------------------------------------------

/** Wrapper types through which tree-sitter nests the real declarator. */
const WRAPPER_TYPES = new Set(["pointer_declarator", "parenthesized_declarator", "abstract_pointer_declarator"]);

/**
 * Walk down declarator wrappers to reach the innermost function name.
 * Completely iterative — no recursion.
 */
function drillFunctionName(start: ASTNode): ASTNode | null {
  let cur: ASTNode | null = start;
  while (cur) {
    if (cur.type === "identifier") return cur;

    if (cur.type === "function_declarator") {
      const inner: ASTNode | null = cur.childForFieldName("declarator") ?? cur.child(0);
      if (inner) {
        cur = inner;
        continue;
      }
      return firstDescendantOfTypes(cur, ["identifier"]);
    }

    if (WRAPPER_TYPES.has(cur.type)) {
      const inner: ASTNode | null = cur.childForFieldName("declarator") ?? cur.child(0);
      if (inner) {
        cur = inner;
        continue;
      }
      break;
    }

    return firstDescendantOfTypes(cur, ["identifier"]);
  }
  return null;
}

/**
 * Walk down declarator wrappers to reach the variable / field name.
 * Completely iterative — no recursion.
 */
function drillDeclaratorName(start: ASTNode): ASTNode | null {
  const LEAF = new Set(["identifier", "field_identifier"]);
  const DRILL = new Set(["pointer_declarator", "array_declarator", "parenthesized_declarator"]);

  let cur: ASTNode | null = start;
  while (cur) {
    if (LEAF.has(cur.type)) return cur;

    if (DRILL.has(cur.type)) {
      const inner: ASTNode | null = cur.childForFieldName("declarator") ?? cur.child(0);
      if (inner) {
        cur = inner;
        continue;
      }
      break;
    }

    return firstDescendantOfTypes(cur, ["identifier", "field_identifier"]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Predicate: does a declarator ultimately contain a function_declarator?
// ---------------------------------------------------------------------------

function isFunctionDeclarator(node: ASTNode): boolean {
  let cur: ASTNode | null = node;
  while (cur) {
    if (cur.type === "function_declarator") return true;
    cur = cur.childForFieldName("declarator") ?? null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Storage-class / qualifier extraction from AST children
// ---------------------------------------------------------------------------

const STORAGE_SPECIFIERS: ReadonlyMap<string, string> = new Map([
  ["storage_class_specifier", ""], // value comes from child text
  ["type_qualifier", ""],
]);

const KNOWN_MODIFIERS = new Set(["static", "inline", "extern", "volatile", "register", "_Thread_local"]);

/**
 * Scan immediate children for storage-class specifiers and type qualifiers
 * and return the recognised modifier tokens.
 */
function gatherModifiers(node: ASTNode): string[] {
  const mods: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const ch = node.child(i);
    if (!ch) continue;

    if (STORAGE_SPECIFIERS.has(ch.type)) {
      const kw = ch.text.trim();
      if (KNOWN_MODIFIERS.has(kw) && !mods.includes(kw)) mods.push(kw);
      continue;
    }

    // tree-sitter sometimes emits "static" / "inline" as bare keyword nodes
    if (KNOWN_MODIFIERS.has(ch.type) && !mods.includes(ch.type)) {
      mods.push(ch.type);
    }
  }
  return mods;
}

// ---------------------------------------------------------------------------
// Grouped handler: function definitions (with body)
// ---------------------------------------------------------------------------

function processDefinition(node: ASTNode, ctx: HandlerContext): void {
  const declNode = node.childForFieldName("declarator");
  if (!declNode) return;

  const nameNode = drillFunctionName(declNode);
  if (!nameNode) return;

  const mods = gatherModifiers(node);
  ctx.entities.push({
    name: nameNode.text,
    type: "function",
    location: getNodeLocation(node),
    modifiers: mods.length > 0 ? mods : undefined,
  } as ParsedEntity);
}

// ---------------------------------------------------------------------------
// Grouped handler: declarations (forward funcs, variables, constants)
// ---------------------------------------------------------------------------

function processDeclaration(node: ASTNode, ctx: HandlerContext): void {
  const mods = gatherModifiers(node);

  // Determine constness by looking for a `type_qualifier` child with "const"
  const isConst = mods.includes("volatile")
    ? false
    : findDescendants(node, "type_qualifier").some((q) => q.text.trim() === "const");

  // --- init_declarator children (e.g.  int x = 5;  or  void (*fp)(int) = &foo;) ---
  const initDecls = findDescendants(node, "init_declarator");
  if (initDecls.length > 0) {
    for (const id of initDecls) {
      const inner = id.childForFieldName("declarator") ?? id;
      if (isFunctionDeclarator(inner)) {
        const fn = drillFunctionName(inner);
        if (fn) {
          ctx.entities.push({
            name: fn.text,
            type: "function",
            location: getNodeLocation(node),
            modifiers: mods.length > 0 ? mods : undefined,
          } as ParsedEntity);
        }
      } else {
        const vn = drillDeclaratorName(inner);
        if (vn) {
          ctx.entities.push({
            name: vn.text,
            type: isConst ? "constant" : "variable",
            location: getNodeLocation(node),
            modifiers: mods.length > 0 ? mods : undefined,
          } as ParsedEntity);
        }
      }
    }
    return;
  }

  // --- Simple declaration without initializer (e.g.  extern int foo(void);) ---
  const declNode = node.childForFieldName("declarator");
  if (!declNode) return;

  if (isFunctionDeclarator(declNode)) {
    const fn = drillFunctionName(declNode);
    if (fn) {
      ctx.entities.push({
        name: fn.text,
        type: "function",
        location: getNodeLocation(node),
        modifiers: mods.length > 0 ? mods : undefined,
      } as ParsedEntity);
    }
  } else {
    const vn = drillDeclaratorName(declNode);
    if (vn) {
      ctx.entities.push({
        name: vn.text,
        type: isConst ? "constant" : "variable",
        location: getNodeLocation(node),
        modifiers: mods.length > 0 ? mods : undefined,
      } as ParsedEntity);
    }
  }
}

// ---------------------------------------------------------------------------
// Grouped handler: composite types (struct, union, enum)
// ---------------------------------------------------------------------------

function processComposite(node: ASTNode, ctx: HandlerContext): void {
  const kind = node.type; // "struct_specifier" | "union_specifier" | "enum_specifier"

  const nameNode = node.childForFieldName("name") ?? firstNamedChildOfTypes(node, ["type_identifier", "identifier"]);

  if (kind === "enum_specifier") {
    buildEnum(node, nameNode, ctx);
    return;
  }

  // struct or union — require a name
  if (!nameNode) return;

  const prefix = kind === "struct_specifier" ? "struct" : "union";
  const label = `${prefix} ${nameNode.text}`;

  // For structs, extract field declarations as children
  const children: ParsedEntity[] = [];
  if (kind === "struct_specifier") {
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const ch = body.child(i);
        if (ch && ch.type === "field_declaration") {
          const declChild = ch.childForFieldName("declarator");
          if (declChild) {
            const fn = drillDeclaratorName(declChild);
            if (fn) {
              children.push({
                name: fn.text,
                type: "property",
                location: getNodeLocation(ch),
              } as ParsedEntity);
            }
          }
        }
      }
    }
  }

  ctx.entities.push({
    name: label,
    type: "class",
    location: getNodeLocation(node),
    ...(children.length > 0 ? { children } : {}),
  } as ParsedEntity);
}

function buildEnum(node: ASTNode, nameNode: ASTNode | null, ctx: HandlerContext): void {
  const label = nameNode ? nameNode.text : "anonymous";
  const values: ParsedEntity[] = [];

  const body = node.childForFieldName("body");
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const ch = body.child(i);
      if (ch && ch.type === "enumerator") {
        const en = ch.childForFieldName("name") ?? ch;
        const val = en.text;
        if (val) {
          values.push({
            name: val,
            type: "constant",
            location: getNodeLocation(ch),
          } as ParsedEntity);
        }
      }
    }
  }

  ctx.entities.push({
    name: `enum ${label}`,
    type: "enum",
    location: getNodeLocation(node),
    ...(values.length > 0 ? { children: values } : {}),
  } as ParsedEntity);
}

// ---------------------------------------------------------------------------
// Grouped handler: typedef
// ---------------------------------------------------------------------------

function processTypedef(node: ASTNode, ctx: HandlerContext): void {
  // Strategy 1: look for type_declarator descendants
  const typeDecls = findDescendants(node, "type_declarator");
  if (typeDecls.length > 0) {
    for (const td of typeDecls) {
      const nameNode =
        lastDescendantOfTypes(td, ["type_identifier", "identifier"]) ?? td.childForFieldName("declarator");
      if (!nameNode) continue;
      const n = nameNode.text;
      if (n) {
        ctx.entities.push({ name: n, type: "type", location: getNodeLocation(node) } as ParsedEntity);
      }
    }
    return;
  }

  // Strategy 2: last type_identifier anywhere inside the node
  const allTypeIds = findDescendants(node, "type_identifier");
  if (allTypeIds.length > 0) {
    const last = allTypeIds[allTypeIds.length - 1]!;
    const n = last.text;
    if (n) {
      ctx.entities.push({ name: n, type: "type", location: getNodeLocation(node) } as ParsedEntity);
    }
  }
}

// ---------------------------------------------------------------------------
// Grouped handler: preprocessor directives
// ---------------------------------------------------------------------------

function processPreprocessor(node: ASTNode, ctx: HandlerContext): void {
  switch (node.type) {
    case "preproc_def": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        ctx.entities.push({
          name: `#define ${nameNode.text}`,
          type: "constant",
          location: getNodeLocation(node),
        } as ParsedEntity);
      }
      break;
    }

    case "preproc_function_def": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        ctx.entities.push({
          name: `#define ${nameNode.text}()`,
          type: "function",
          location: getNodeLocation(node),
          modifiers: ["macro"],
        } as ParsedEntity);
      }
      break;
    }

    case "preproc_include": {
      const pathNode =
        node.childForFieldName("path") ?? firstNamedChildOfTypes(node, ["system_lib_string", "string_literal"]);
      if (!pathNode) break;

      const cleaned = pathNode.text.replace(/[<">]/g, "");
      ctx.relationships.push({
        from: ctx.filePath,
        to: cleaned,
        type: "imports",
        sourceFile: ctx.filePath,
        metadata: { line: node.startPosition.row + 1 },
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const HANDLER_MAP: ReadonlyMap<string, NodeHandler> = new Map<string, NodeHandler>([
  ["function_definition", processDefinition],
  ["declaration", processDeclaration],
  ["struct_specifier", processComposite],
  ["union_specifier", processComposite],
  ["enum_specifier", processComposite],
  ["type_definition", processTypedef],
  ["preproc_def", processPreprocessor],
  ["preproc_function_def", processPreprocessor],
  ["preproc_include", processPreprocessor],
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class CAnalyzer {
  /**
   * Analyse the tree-sitter AST of a C source file and return
   * extracted entities together with include-based relationships.
   */
  async analyze(
    rootNode: ASTNode,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    const deadline = Date.now() + TIMEOUT_MS;

    const ctx: HandlerContext = {
      filePath,
      entities: [],
      relationships: [],
      deadline,
    };

    try {
      walkIterative(rootNode, ctx);
    } catch (err) {
      log.e("CANALYZER", "analyze_err", { file: filePath, err: String(err) });
    }

    return { entities: ctx.entities, relationships: ctx.relationships };
  }
}

// ---------------------------------------------------------------------------
// Iterative DFS tree walk
// ---------------------------------------------------------------------------

interface StackFrame {
  node: ASTNode;
  depth: number;
}

/**
 * Visit every node in the AST using an explicit stack (DFS, pre-order).
 * Dispatches matching node types to grouped handlers via HANDLER_MAP.
 * Respects depth and wall-clock limits.
 */
function walkIterative(root: ASTNode, ctx: HandlerContext): void {
  const stack: StackFrame[] = [{ node: root, depth: 0 }];

  // Check the deadline every N iterations to avoid Date.now() overhead
  const CHECK_INTERVAL = 512;
  let iteration = 0;

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;

    if (depth > MAX_DEPTH) {
      throw new Error(`Maximum traversal depth exceeded at depth ${depth}`);
    }

    if ((++iteration & (CHECK_INTERVAL - 1)) === 0) {
      if (Date.now() > ctx.deadline) {
        throw new Error(`Parse timeout exceeded after ${TIMEOUT_MS}ms`);
      }
    }

    // Dispatch to the appropriate handler if one is registered
    const handler = HANDLER_MAP.get(node.type);
    if (handler) {
      handler(node, ctx);
    }

    // Push children in reverse order so that the leftmost child is
    // processed first (standard DFS pre-order).
    for (let i = node.childCount - 1; i >= 0; i--) {
      const ch = node.child(i);
      if (ch) stack.push({ node: ch, depth: depth + 1 });
    }
  }
}
