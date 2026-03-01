/**
 * Java AST Analyzer — iterative DFS traversal with Map-based dispatch.
 *
 * Processes tree-sitter Java ASTs and extracts the following artefacts:
 *  - Package declarations and import dependencies
 *  - Type declarations: class, interface, enum, record, annotation type
 *  - Member declarations: methods (with call-graph), constructors, fields
 *  - Relationships: inherits, implements, member_of, imports, calls
 *
 * Architecture:
 *  - Handler registry: Map<string, Handler> populated once per instance.
 *  - Tree walk: fully iterative (explicit stack), never recursive.
 *  - Modifiers: parsed into Set<string> for O(1) lookups via `has()`.
 *  - Child iteration: single `childrenWithType` generator replaces ad-hoc helpers.
 *  - Call scanning: iterative stack instead of recursive descent.
 *  - Entity construction: `javaEntity` factory avoids repeated boilerplate.
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import { log } from "../logging/index.js";
import type { ASTNode, EntityRelationship, ParsedEntity } from "../types/parser.js";
import { CircuitBreakerError, checkCircuitBreakers, getNodeLocation } from "./base-parser-utils.js";

/** Maximum nesting depth before the circuit breaker trips. */
const MAX_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
/** Wall-clock timeout (ms) for the entire analysis pass. */
const TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

/**
 * Work-item pushed onto the iterative DFS stack.
 * Each frame carries a snapshot of the enclosing type stack so that
 * popping from the DFS stack automatically "restores" the scope.
 */
interface StackFrame {
  node: ASTNode;
  containerStack: string[];
}

/**
 * Signature for every node-type handler registered in the dispatch map.
 * All arguments are passed positionally to avoid allocating option objects.
 */
type NodeHandler = (
  nd: ASTNode,
  fp: string,
  pkg: { value: string },
  cs: string[],
  ent: ParsedEntity[],
  rel: EntityRelationship[],
  depth: { value: number },
  t0: number,
) => void;

// ---------------------------------------------------------------------------
// Free-standing helpers (pure functions, not on the class)
// ---------------------------------------------------------------------------

/**
 * Generator that yields every named child whose `type` matches `wanted`.
 * Replaces both `forEachNamedChildOfType` and `findFirstNamedChildOfType`
 * from the previous implementation with a single iterable primitive.
 */
function* childrenWithType(parent: ASTNode, wanted: string): Generator<ASTNode> {
  const kids = parent.namedChildren;
  for (let k = 0; k < kids.length; k++) {
    if (kids[k]!.type === wanted) yield kids[k]!;
  }
}

/** First named child whose type belongs to `accepted`, or undefined. */
function firstChildIn(parent: ASTNode, accepted: Set<string>): ASTNode | undefined {
  const kids = parent.namedChildren;
  for (let k = 0; k < kids.length; k++) {
    if (accepted.has(kids[k]!.type)) return kids[k]!;
  }
  return undefined;
}

/**
 * Parse modifier keywords attached to a declaration into a Set<string>.
 * Annotations are explicitly excluded — they are collected separately
 * by `collectAnnotations` when needed.
 */
function parseModifiers(node: ASTNode): Set<string> {
  const modNode = node.childForFieldName("modifiers");
  if (!modNode) return new Set();
  const s = new Set<string>();
  for (let i = 0; i < modNode.childCount; i++) {
    const ch = modNode.child(i);
    if (ch && ch.type !== "annotation" && ch.type !== "marker_annotation") s.add(ch.text);
  }
  return s;
}

/** Collect the textual representation of every annotation from the modifiers node. */
function collectAnnotations(node: ASTNode): string[] {
  const modNode = node.childForFieldName("modifiers");
  if (!modNode) return [];
  const out: string[] = [];
  for (const kid of modNode.namedChildren) {
    if (kid.type === "annotation" || kid.type === "marker_annotation") out.push(kid.text);
  }
  return out;
}

/** Build relationship metadata — always includes the `line` slot. */
function edgeMeta(extra: Record<string, unknown>, line?: number): EntityRelationship["metadata"] {
  return { line: line ?? undefined, ...extra };
}

/** Qualified name: prepend enclosing container name when nested. */
function qualifiedName(simple: string, cs: string[]): string {
  const outer = cs.length > 0 ? cs[cs.length - 1] : null;
  return outer ? `${outer}.${simple}` : simple;
}

/**
 * Factory that stamps out a ParsedEntity with all the boilerplate
 * fields pre-filled. Language is always "java"; path, signature,
 * and children are always undefined for this analyzer.
 */
function javaEntity(
  fp: string,
  name: string,
  type: ParsedEntity["type"],
  loc: ParsedEntity["location"],
  id: string,
  extra?: Partial<Pick<ParsedEntity, "modifiers" | "returnType" | "metadata" | "parameters">>,
): ParsedEntity {
  return {
    name,
    type,
    location: loc,
    id,
    path: undefined,
    signature: undefined,
    filePath: fp,
    language: "java",
    children: undefined,
    returnType: extra?.returnType,
    modifiers: extra?.modifiers,
    parameters: extra?.parameters,
    metadata: extra?.metadata,
  };
}

/** Context object passed through Java parse tree expansion to reduce parameter count. */
interface JavaParseContext {
  fp: string;
  pkg: { value: string };
  ent: ParsedEntity[];
  rel: EntityRelationship[];
  depth: { value: number };
  t0: number;
}

/** Node types that can represent a package or import path. */
const ID_TYPES = new Set(["scoped_identifier", "identifier"]);

// ---------------------------------------------------------------------------
// Analyzer class
// ---------------------------------------------------------------------------

export class JavaAnalyzer {
  /** Dispatch map from tree-sitter node type to handler method. */
  private handlerMap: Map<string, NodeHandler>;

  constructor() {
    const m = new Map<string, NodeHandler>();
    m.set("package_declaration", this.onPackage.bind(this));
    m.set("import_declaration", this.onImport.bind(this));
    // Type declarations — all share one unified handler that pattern-matches
    for (const t of [
      "class_declaration",
      "interface_declaration",
      "enum_declaration",
      "record_declaration",
      "annotation_type_declaration",
    ]) {
      m.set(t, this.onTypeDecl.bind(this));
    }
    // Member declarations — another unified handler
    for (const t of ["method_declaration", "constructor_declaration", "field_declaration"]) {
      m.set(t, this.onMemberDecl.bind(this));
    }
    this.handlerMap = m;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Analyse a Java AST and produce entities + relationships.
   * Circuit-breaker errors are caught and logged as warnings;
   * unexpected errors are logged at error level.
   */
  async analyze(
    rootNode: ASTNode,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    try {
      this.walk(rootNode, filePath, entities, relationships);
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        log.w("JAVAANALYZER", "circuit_break", { file: filePath, err: err.message });
      } else {
        log.e("JAVAANALYZER", "analyze_err", { file: filePath, err: String(err) });
      }
    }
    return { entities, relationships };
  }

  // =========================================================================
  // Iterative DFS traversal
  // =========================================================================

  /**
   * Non-recursive depth-first walk over the entire AST.
   * Children are pushed in reverse order so the leftmost child
   * is processed first (standard pre-order DFS).
   */
  private walk(root: ASTNode, fp: string, ent: ParsedEntity[], rel: EntityRelationship[]): void {
    const pkg = { value: "" };
    const depth = { value: 0 };
    const t0 = Date.now();
    const stack: StackFrame[] = [{ node: root, containerStack: [] }];

    while (stack.length > 0) {
      const { node, containerStack } = stack.pop()!;
      depth.value++;
      checkCircuitBreakers(depth.value, t0, MAX_DEPTH, TIMEOUT_MS);

      const h = this.handlerMap.get(node.type);
      if (h) {
        // Handlers manage their own child expansion (e.g. type bodies).
        h(node, fp, pkg, containerStack, ent, rel, depth, t0);
        depth.value--;
        continue;
      }
      // No handler — push children for further exploration.
      for (let i = node.childCount - 1; i >= 0; i--) {
        const ch = node.child(i);
        if (ch) stack.push({ node: ch, containerStack });
      }
      depth.value--;
    }
  }

  // =========================================================================
  // Package & import handlers
  // =========================================================================

  /** Extract a package declaration and register a module entity. */
  private onPackage(nd: ASTNode, fp: string, pkg: { value: string }, _cs: string[], ent: ParsedEntity[]): void {
    const nameNode = firstChildIn(nd, ID_TYPES);
    if (!nameNode) return;
    const p = nameNode.text.replace(/\s+/g, "");
    pkg.value = p;
    ent.push(javaEntity(fp, p, "module", getNodeLocation(nd), `${fp}:package:${p}`, { metadata: { isPackage: true } }));
  }

  /** Extract an import declaration and create an "imports" relationship. */
  private onImport(
    nd: ASTNode,
    fp: string,
    pkg: { value: string },
    _cs: string[],
    ent: ParsedEntity[],
    rel: EntityRelationship[],
  ): void {
    const pathNode = firstChildIn(nd, ID_TYPES);
    if (!pathNode) return;
    const moduleId = this.ensurePkgEntity(fp, pkg.value, ent);
    rel.push({
      from: moduleId,
      to: pathNode.text,
      type: "imports",
      metadata: edgeMeta({
        isWildcard: nd.namedChildren.some((c) => c.type === "asterisk"),
        isStatic: nd.text.includes("static"),
      }),
    });
  }

  // =========================================================================
  // Unified type-declaration handler
  // =========================================================================

  /**
   * Handle all five type-level declarations through pattern matching on
   * `nd.type`. After registering the entity, expands the type body
   * with an updated container stack that includes the new type.
   */
  private onTypeDecl(
    nd: ASTNode,
    fp: string,
    pkg: { value: string },
    cs: string[],
    ent: ParsedEntity[],
    rel: EntityRelationship[],
    depth: { value: number },
    t0: number,
  ): void {
    const nameNode = nd.childForFieldName("name");
    if (!nameNode) return;
    const qn = qualifiedName(nameNode.text, cs);
    const mods = parseModifiers(nd);
    const modArr = [...mods];
    const nested = cs.length > 0;

    switch (nd.type) {
      case "class_declaration": {
        const id = `${fp}:class:${qn}`;
        ent.push(
          javaEntity(fp, qn, "class", getNodeLocation(nd), id, {
            modifiers: modArr,
            metadata: {
              isAbstract: mods.has("abstract"),
              isFinal: mods.has("final"),
              isStatic: mods.has("static"),
              isPublic: mods.has("public"),
              isPrivate: mods.has("private"),
              isProtected: mods.has("protected"),
              package: pkg.value,
              isInnerClass: nested,
            },
          }),
        );
        this.addSuperclass(nd, id, fp, rel);
        this.addInterfaces(nd, id, fp, rel);
        this.expandBody(nd, cs, qn, { fp, pkg, ent, rel, depth, t0 });
        break;
      }
      case "interface_declaration": {
        const id = `${fp}:interface:${qn}`;
        ent.push(
          javaEntity(fp, qn, "interface", getNodeLocation(nd), id, {
            modifiers: modArr,
            metadata: { isPublic: mods.has("public"), package: pkg.value },
          }),
        );
        this.addExtendedIfaces(nd, id, fp, rel);
        this.expandBody(nd, cs, qn, { fp, pkg, ent, rel, depth, t0 });
        break;
      }
      case "enum_declaration": {
        const id = `${fp}:enum:${qn}`;
        ent.push(
          javaEntity(fp, qn, "enum", getNodeLocation(nd), id, {
            modifiers: modArr,
            metadata: { isPublic: mods.has("public"), package: pkg.value },
          }),
        );
        this.extractEnumConsts(nd, id, fp, ent, rel);
        this.expandBody(nd, cs, qn, { fp, pkg, ent, rel, depth, t0 });
        break;
      }
      case "record_declaration": {
        const id = `${fp}:record:${qn}`;
        ent.push(
          javaEntity(fp, qn, "class", getNodeLocation(nd), id, {
            modifiers: modArr,
            metadata: {
              isRecord: true,
              isPublic: mods.has("public"),
              isFinal: true,
              package: pkg.value,
            },
          }),
        );
        this.extractRecordComps(nd, id, fp, ent, rel);
        this.expandBody(nd, cs, qn, { fp, pkg, ent, rel, depth, t0 });
        break;
      }
      case "annotation_type_declaration": {
        const id = `${fp}:annotation:${qn}`;
        ent.push(
          javaEntity(fp, `@${qn}`, "interface", getNodeLocation(nd), id, {
            modifiers: modArr,
            metadata: { isAnnotation: true, isPublic: mods.has("public"), package: pkg.value },
          }),
        );
        break;
      }
    }
  }

  // =========================================================================
  // Unified member-declaration handler
  // =========================================================================

  /**
   * Handle method, constructor, and field declarations.
   * Only processes nodes inside a type container (containerStack non-empty).
   */
  private onMemberDecl(
    nd: ASTNode,
    fp: string,
    _pkg: { value: string },
    cs: string[],
    ent: ParsedEntity[],
    rel: EntityRelationship[],
    depth: { value: number },
    t0: number,
  ): void {
    const enclosing = cs.length > 0 ? cs[cs.length - 1]! : null;
    if (!enclosing) return;
    const mods = parseModifiers(nd);
    const modArr = [...mods];

    switch (nd.type) {
      case "method_declaration": {
        const nameNode = nd.childForFieldName("name");
        if (!nameNode) return;
        const mn = nameNode.text;
        const mid = `${fp}:class:${enclosing}:method:${mn}`;

        const entity = javaEntity(fp, mn, "method", getNodeLocation(nd), mid, {
          modifiers: modArr,
          returnType: nd.childForFieldName("type")?.text,
          metadata: {
            isPublic: mods.has("public"),
            isPrivate: mods.has("private"),
            isProtected: mods.has("protected"),
            isStatic: mods.has("static"),
            isFinal: mods.has("final"),
            isAbstract: mods.has("abstract"),
            isSynchronized: mods.has("synchronized"),
            parent: enclosing,
          },
        });
        const p = nd.childForFieldName("parameters");
        if (p) entity.parameters = this.extractParams(p);
        const ann = collectAnnotations(nd);
        if (ann.length > 0) {
          entity.metadata ??= {};
          entity.metadata["annotations"] = ann;
        }
        ent.push(entity);
        rel.push({
          from: mid,
          to: `${fp}:class:${enclosing}`,
          type: "member_of",
          metadata: edgeMeta({ memberType: "method" }),
        });
        const body = nd.childForFieldName("body");
        if (body) this.scanCalls(body, mid, rel, depth, t0);
        break;
      }

      case "constructor_declaration": {
        const nameNode = nd.childForFieldName("name");
        const label = nameNode?.text ?? enclosing.split(".").pop()!;
        const cid = `${fp}:class:${enclosing}:constructor:${label}`;

        const entity = javaEntity(fp, label, "method", getNodeLocation(nd), cid, {
          modifiers: modArr,
          metadata: {
            isConstructor: true,
            isPublic: mods.has("public"),
            isPrivate: mods.has("private"),
            isProtected: mods.has("protected"),
            parent: enclosing,
          },
        });
        const p = nd.childForFieldName("parameters");
        if (p) entity.parameters = this.extractParams(p);
        ent.push(entity);
        rel.push({
          from: cid,
          to: `${fp}:class:${enclosing}`,
          type: "member_of",
          metadata: edgeMeta({ memberType: "constructor" }),
        });
        break;
      }

      case "field_declaration": {
        const fieldType = nd.childForFieldName("type")?.text;
        for (const decl of childrenWithType(nd, "variable_declarator")) {
          const fn = decl.childForFieldName("name");
          if (!fn) continue;
          const fid = `${fp}:class:${enclosing}:field:${fn.text}`;
          const isFinal = mods.has("final");
          ent.push(
            javaEntity(fp, fn.text, isFinal ? "constant" : "property", getNodeLocation(decl), fid, {
              modifiers: modArr,
              metadata: {
                fieldType,
                isPublic: mods.has("public"),
                isPrivate: mods.has("private"),
                isProtected: mods.has("protected"),
                isStatic: mods.has("static"),
                isFinal,
                isVolatile: mods.has("volatile"),
                isTransient: mods.has("transient"),
                initialValue: decl.childForFieldName("value")?.text,
                parent: enclosing,
              },
            }),
          );
          rel.push({
            from: fid,
            to: `${fp}:class:${enclosing}`,
            type: "member_of",
            metadata: edgeMeta({ memberType: "field" }),
          });
        }
        break;
      }
    }
  }

  // =========================================================================
  // Relationship helpers
  // =========================================================================

  /** Register an "inherits" (extends) relationship for a class superclass. */
  private addSuperclass(nd: ASTNode, classId: string, fp: string, rel: EntityRelationship[]): void {
    const sf = nd.childForFieldName("superclass");
    if (!sf) return;
    const first = sf.namedChildren.length > 0 ? sf.namedChildren[0]! : undefined;
    if (!first) return;
    rel.push({
      from: classId,
      to: `${fp}:class:${first.text}`,
      type: "inherits",
      metadata: edgeMeta({ inheritanceType: "extends" }),
    });
  }

  /** Register "implements" relationships for every interface a class lists. */
  private addInterfaces(nd: ASTNode, classId: string, fp: string, rel: EntityRelationship[]): void {
    const f = nd.childForFieldName("interfaces");
    if (!f) return;
    for (const i of childrenWithType(f, "type_identifier")) {
      rel.push({
        from: classId,
        to: `${fp}:interface:${i.text}`,
        type: "implements",
        metadata: edgeMeta({}),
      });
    }
  }

  /** Register "inherits" relationships for interfaces extending other interfaces. */
  private addExtendedIfaces(nd: ASTNode, ifaceId: string, fp: string, rel: EntityRelationship[]): void {
    const f = nd.childForFieldName("extends");
    if (!f) return;
    for (const e of childrenWithType(f, "type_identifier")) {
      rel.push({
        from: ifaceId,
        to: `${fp}:interface:${e.text}`,
        type: "inherits",
        metadata: edgeMeta({ inheritanceType: "extends" }),
      });
    }
  }

  // =========================================================================
  // Enum constant & record component extraction
  // =========================================================================

  /** Extract enum constants from the enum body and register them as entities. */
  private extractEnumConsts(
    enumNd: ASTNode,
    enumId: string,
    fp: string,
    ent: ParsedEntity[],
    rel: EntityRelationship[],
  ): void {
    const body = enumNd.childForFieldName("body");
    if (!body) return;
    for (const kid of childrenWithType(body, "enum_constant")) {
      const cn = kid.childForFieldName("name");
      if (!cn) continue;
      const cid = `${enumId}:constant:${cn.text}`;
      ent.push(
        javaEntity(fp, cn.text, "constant", getNodeLocation(kid), cid, {
          metadata: { parent: enumId, enumValue: true },
        }),
      );
      rel.push({
        from: cid,
        to: enumId,
        type: "member_of",
        metadata: edgeMeta({ memberType: "enum_constant" }),
      });
    }
  }

  /** Extract record components (the parameter list of a record declaration). */
  private extractRecordComps(
    recNd: ASTNode,
    recId: string,
    fp: string,
    ent: ParsedEntity[],
    rel: EntityRelationship[],
  ): void {
    const pf = recNd.childForFieldName("parameters");
    if (!pf) return;
    for (const comp of childrenWithType(pf, "record_component")) {
      const cn = comp.childForFieldName("name");
      if (!cn) continue;
      const ct = comp.childForFieldName("type");
      const cid = `${recId}:component:${cn.text}`;
      ent.push(
        javaEntity(fp, cn.text, "property", getNodeLocation(comp), cid, {
          metadata: { parent: recId, fieldType: ct?.text, isRecordComponent: true },
        }),
      );
      rel.push({
        from: cid,
        to: recId,
        type: "member_of",
        metadata: edgeMeta({ memberType: "record_component" }),
      });
    }
  }

  // =========================================================================
  // Body expansion (iterative)
  // =========================================================================

  /**
   * After a type declaration has been registered, iterate over its body
   * children with an updated container stack. Uses an explicit stack
   * to avoid recursion: children are pushed in reverse order and popped
   * one-by-one, dispatching to the handler map or expanding further.
   */
  private expandBody(typeNd: ASTNode, outerCs: string[], qn: string, ctx: JavaParseContext): void {
    const body = typeNd.childForFieldName("body");
    if (!body) return;
    const innerCs = [...outerCs, qn];
    const pending: ASTNode[] = [];
    for (let i = body.childCount - 1; i >= 0; i--) {
      const ch = body.child(i);
      if (ch) pending.push(ch);
    }
    while (pending.length > 0) {
      const cur = pending.pop()!;
      ctx.depth.value++;
      checkCircuitBreakers(ctx.depth.value, ctx.t0, MAX_DEPTH, TIMEOUT_MS);
      const h = this.handlerMap.get(cur.type);
      if (h) {
        h(cur, ctx.fp, ctx.pkg, innerCs, ctx.ent, ctx.rel, ctx.depth, ctx.t0);
      } else {
        for (let j = cur.childCount - 1; j >= 0; j--) {
          const gc = cur.child(j);
          if (gc) pending.push(gc);
        }
      }
      ctx.depth.value--;
    }
  }

  // =========================================================================
  // Method-call scanning (iterative)
  // =========================================================================

  /**
   * Walk a method body looking for `method_invocation` nodes and record
   * "calls" relationships. Uses an explicit stack to stay iterative.
   */
  private scanCalls(
    body: ASTNode,
    callerId: string,
    rel: EntityRelationship[],
    depth: { value: number },
    t0: number,
  ): void {
    const stk: ASTNode[] = [body];
    while (stk.length > 0) {
      const cur = stk.pop()!;
      depth.value++;
      checkCircuitBreakers(depth.value, t0, MAX_DEPTH, TIMEOUT_MS);
      if (cur.type === "method_invocation") {
        const inv = cur.childForFieldName("name");
        if (inv) {
          rel.push({
            from: callerId,
            to: inv.text,
            type: "calls",
            metadata: edgeMeta({ callType: "method" }),
          });
        }
      }
      for (let j = cur.childCount - 1; j >= 0; j--) {
        const kid = cur.child(j);
        if (kid) stk.push(kid);
      }
      depth.value--;
    }
  }

  // =========================================================================
  // Parameter extraction
  // =========================================================================

  /**
   * Walk the formal parameter list of a method or constructor and
   * return structured parameter descriptors.
   */
  private extractParams(
    paramsNode: ASTNode,
  ): Array<{ name: string; type: string | undefined; defaultValue: string | undefined }> {
    const out: Array<{ name: string; type: string | undefined; defaultValue: string | undefined }> = [];
    for (const p of paramsNode.namedChildren) {
      if (p.type !== "formal_parameter" && p.type !== "spread_parameter") continue;
      const pn = p.childForFieldName("name");
      if (!pn) continue;
      out.push({
        name: pn.text,
        type: p.childForFieldName("type")?.text,
        defaultValue: undefined,
      });
    }
    return out;
  }

  // =========================================================================
  // Package entity guarantee
  // =========================================================================

  /**
   * Ensure a module entity exists for the current package.
   * If no package has been declared, the label "(default)" is used.
   * Returns the module ID so callers can reference it in relationships.
   */
  private ensurePkgEntity(fp: string, pkgName: string, ent: ParsedEntity[]): string {
    const label = pkgName || "(default)";
    const mid = `${fp}:package:${label}`;
    if (!ent.some((e) => e.id === mid)) {
      ent.push(
        javaEntity(
          fp,
          label,
          "module",
          { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: 0 } },
          mid,
          { metadata: { isPackage: true } },
        ),
      );
    }
    return mid;
  }
}
