/**
 * Go Language Analyzer
 *
 * AST-driven extraction of Go structural entities: packages, imports,
 * functions, methods, structs, interfaces, type aliases, consts, vars,
 * plus relationship edges (imports, calls, member_of, embeds).
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import { log } from "../logging/index.js";
import type { ASTNode, EntityRelationship, ParsedEntity } from "../types/parser.js";
import { CircuitBreakerError, checkCircuitBreakers, getNodeLocation } from "./base-parser-utils.js";

const MAX_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const DEADLINE_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// Internal state per parse run
// ---------------------------------------------------------------------------

interface RunState {
  fp: string;
  pkg: string;
  entities: ParsedEntity[];
  rels: EntityRelationship[];
  t0: number;
  lvl: number;
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class GoAnalyzer {
  private handlers: Map<string, (n: ASTNode, s: RunState) => void>;

  constructor() {
    this.handlers = new Map<string, (n: ASTNode, s: RunState) => void>([
      ["source_file", (n, s) => this.descend(n, s)],
      ["package_clause", (n, s) => this.onPackage(n, s)],
      ["import_declaration", (n, s) => this.onImports(n, s)],
      ["function_declaration", (n, s) => this.onFunc(n, s)],
      ["method_declaration", (n, s) => this.onMethod(n, s)],
      ["type_declaration", (n, s) => this.onTypeDecl(n, s)],
      ["const_declaration", (n, s) => this.onConsts(n, s)],
      ["var_declaration", (n, s) => this.onVars(n, s)],
    ]);
  }

  async analyze(
    rootNode: ASTNode,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    const state: RunState = {
      fp: filePath,
      pkg: "",
      entities: [],
      rels: [],
      t0: Date.now(),
      lvl: 0,
    };

    try {
      this.visit(rootNode, state);
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        log.w("GOANALYZER", "circuit_break", { file: filePath, err: err.message });
      } else {
        log.e("GOANALYZER", "analyze_err", { file: filePath, err: String(err) });
      }
    }

    return { entities: state.entities, relationships: state.rels };
  }

  // -- traversal ------------------------------------------------------------

  private visit(node: ASTNode, s: RunState): void {
    s.lvl++;
    checkCircuitBreakers(s.lvl, s.t0, MAX_DEPTH, DEADLINE_MS);
    try {
      const h = this.handlers.get(node.type);
      if (h) h(node, s);
      else this.descend(node, s);
    } finally {
      s.lvl--;
    }
  }

  private descend(node: ASTNode, s: RunState): void {
    for (let i = 0, n = node.childCount; i < n; i++) {
      const ch = node.child(i);
      if (ch) this.visit(ch, s);
    }
  }

  // -- package --------------------------------------------------------------

  private onPackage(node: ASTNode, s: RunState): void {
    const name = this.extractPkgName(node);
    if (!name) return;
    s.pkg = name;
    s.entities.push({
      id: `${s.fp}:package:${name}`,
      name,
      type: "module",
      filePath: s.fp,
      location: getNodeLocation(node),
      metadata: { isPackage: true },
    });
  }

  private extractPkgName(node: ASTNode): string | null {
    const named = node.childForFieldName("name");
    if (named?.type === "identifier" && named.text) return named.text;

    for (let i = 0; i < node.namedChildCount; i++) {
      const c = node.namedChild(i);
      if (c?.type === "identifier" && c.text) return c.text;
    }

    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c?.type === "identifier" && c.text) return c.text;
    }

    const m = /\bpackage\s+([A-Za-z_]\w*)/.exec(node.text);
    return m?.[1] ?? null;
  }

  // -- imports --------------------------------------------------------------

  private onImports(node: ASTNode, s: RunState): void {
    const origin = `${s.fp}:package:${s.pkg || ""}`;
    const seen = new Set<string>();

    const specs = this.collect(node, "import_spec");
    if (specs.length > 0) {
      for (const sp of specs) {
        const p = this.stripQuotes(sp);
        if (!p || seen.has(p)) continue;
        seen.add(p);
        const aliasNode = sp.childForFieldName("alias") ?? sp.childForFieldName("name");
        s.rels.push({
          from: origin,
          to: p,
          type: "imports",
          metadata: { importType: "package", alias: aliasNode?.text },
        });
      }
    } else {
      const p = this.stripQuotes(node);
      if (p && !seen.has(p)) {
        seen.add(p);
        s.rels.push({ from: origin, to: p, type: "imports", metadata: { importType: "package" } });
      }
    }
  }

  // -- functions ------------------------------------------------------------

  private onFunc(node: ASTNode, s: RunState): void {
    const name = node.childForFieldName("name")?.text;
    if (!name) return;

    const eid = `${s.fp}:function:${name}`;
    const ent: ParsedEntity = {
      id: eid,
      name,
      type: "function",
      filePath: s.fp,
      location: getNodeLocation(node),
      metadata: { isPublic: isExported(name), package: s.pkg },
    };

    this.addParamsAndReturn(node, ent);
    s.entities.push(ent);

    const body = node.childForFieldName("body");
    if (body) this.collectCalls(body, eid, s);
  }

  // -- methods --------------------------------------------------------------

  private onMethod(node: ASTNode, s: RunState): void {
    const name = node.childForFieldName("name")?.text;
    const recv = node.childForFieldName("receiver");
    if (!name || !recv) return;

    const recvType = this.recvTypeName(recv);
    const mid = `${s.fp}:method:${recvType}:${name}`;

    const ent: ParsedEntity = {
      id: mid,
      name,
      type: "method",
      filePath: s.fp,
      location: getNodeLocation(node),
      metadata: { isPublic: isExported(name), receiver: recvType, package: s.pkg },
    };

    this.addParamsAndReturn(node, ent);
    s.entities.push(ent);

    if (recvType) {
      s.rels.push({
        from: mid,
        to: `${s.fp}:type:${recvType}`,
        type: "member_of",
        metadata: { memberType: "method" },
      });
    }

    const body = node.childForFieldName("body");
    if (body) this.collectCalls(body, mid, s);
  }

  private recvTypeName(recv: ASTNode): string {
    const param = recv.namedChild(0);
    if (!param) return "";
    const typeNode = param.childForFieldName("type");
    if (!typeNode) return "";
    if (typeNode.type === "pointer_type") {
      const inner = typeNode.namedChild(0);
      return inner?.text ?? "";
    }
    return typeNode.text ?? "";
  }

  // -- type declarations ----------------------------------------------------

  private onTypeDecl(node: ASTNode, s: RunState): void {
    const kids = node.namedChildren;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i]!.type === "type_spec") this.processTypeSpec(kids[i]!, s);
    }
  }

  private processTypeSpec(spec: ASTNode, s: RunState): void {
    const tName = spec.childForFieldName("name")?.text;
    const tBody = spec.childForFieldName("type");
    if (!tName || !tBody) return;

    const kind =
      tBody.type === "struct_type"
        ? "class"
        : tBody.type === "interface_type"
          ? "interface"
          : ("typedef" as ParsedEntity["type"]);

    const tid = `${s.fp}:type:${tName}`;
    s.entities.push({
      id: tid,
      name: tName,
      type: kind,
      filePath: s.fp,
      location: getNodeLocation(spec),
      metadata: { isPublic: isExported(tName), package: s.pkg, goType: tBody.type },
    });

    if (tBody.type === "struct_type") {
      this.structFields(tBody, tid, s);
      this.structEmbeds(tBody, tid, s);
    } else if (tBody.type === "interface_type") {
      this.ifaceMethods(tBody, tid, s);
    }
  }

  // -- struct fields & embeds -----------------------------------------------

  private structFields(body: ASTNode, structId: string, s: RunState): void {
    for (const list of body.namedChildren) {
      if (list.type !== "field_declaration_list") continue;
      for (const decl of list.namedChildren) {
        if (decl.type !== "field_declaration") continue;
        const fName = decl.childForFieldName("name")?.text;
        if (!fName) continue;
        const fType = decl.childForFieldName("type")?.text ?? "unknown";
        const fid = `${structId}:field:${fName}`;

        s.entities.push({
          id: fid,
          name: fName,
          type: "property",
          filePath: s.fp,
          location: getNodeLocation(decl),
          metadata: { isPublic: isExported(fName), fieldType: fType, parent: structId },
        });
        s.rels.push({ from: fid, to: structId, type: "member_of", metadata: { memberType: "field" } });
      }
    }
  }

  private structEmbeds(body: ASTNode, structId: string, s: RunState): void {
    for (const list of body.namedChildren) {
      if (list.type !== "field_declaration_list") continue;
      for (const decl of list.namedChildren) {
        if (decl.type !== "field_declaration") continue;
        if (decl.childForFieldName("name")) continue;
        const typeField = decl.childForFieldName("type");
        if (!typeField?.text) continue;
        s.rels.push({
          from: structId,
          to: `${s.fp}:type:${typeField.text}`,
          type: "embeds",
          metadata: { embeddingType: "struct" },
        });
      }
    }
  }

  // -- interface methods ----------------------------------------------------

  private ifaceMethods(body: ASTNode, ifaceId: string, s: RunState): void {
    for (const ms of body.namedChildren) {
      if (ms.type !== "method_spec") continue;
      const mName = ms.childForFieldName("name")?.text;
      if (!mName) continue;

      const mid = `${ifaceId}:method:${mName}`;
      const ent: ParsedEntity = {
        id: mid,
        name: mName,
        type: "method",
        filePath: s.fp,
        location: getNodeLocation(ms),
        metadata: { isAbstract: true, parent: ifaceId },
      };

      const params = ms.childForFieldName("parameters");
      if (params) (ent.metadata ??= {})["parameters"] = this.paramList(params);

      const ret = ms.childForFieldName("result");
      if (ret) (ent.metadata ??= {})["returnType"] = ret.text;

      s.entities.push(ent);
      s.rels.push({ from: mid, to: ifaceId, type: "member_of", metadata: { memberType: "method" } });
    }
  }

  // -- consts & vars --------------------------------------------------------

  private onConsts(node: ASTNode, s: RunState): void {
    for (const cs of node.namedChildren) {
      if (cs.type !== "const_spec") continue;
      const names = this.namesFromField(cs.childForFieldName("name"));
      if (names.length === 0) continue;
      const val = cs.childForFieldName("value")?.text;
      for (const cn of names) {
        s.entities.push({
          id: `${s.fp}:const:${cn}`,
          name: cn,
          type: "constant",
          filePath: s.fp,
          location: getNodeLocation(cs),
          metadata: { isPublic: isExported(cn), value: val, package: s.pkg },
        });
      }
    }
  }

  private onVars(node: ASTNode, s: RunState): void {
    const specs = this.collect(node, "var_spec");
    for (const vs of specs) {
      const names = this.varNames(vs);
      if (names.length === 0) continue;
      const tp = vs.childForFieldName("type")?.text;
      const init = vs.childForFieldName("value")?.text;
      for (const vn of names) {
        s.entities.push({
          id: `${s.fp}:var:${vn}`,
          name: vn,
          type: "variable",
          filePath: s.fp,
          location: getNodeLocation(vs),
          metadata: { isPublic: isExported(vn), variableType: tp, initialValue: init, package: s.pkg },
        });
      }
    }
  }

  private varNames(spec: ASTNode): string[] {
    const fromField = this.namesFromField(spec.childForFieldName("name"));
    if (fromField.length > 0) return fromField;

    for (let i = 0; i < spec.namedChildCount; i++) {
      const c = spec.namedChild(i);
      if (c?.type === "identifier_list") {
        const ids = c.namedChildren.filter((x) => x.type === "identifier").map((x) => x.text);
        if (ids.length > 0) return ids;
      }
    }

    const typeNode = spec.childForFieldName("type");
    const typeIds = new Set<string>();
    if (typeNode) for (const t of this.collect(typeNode, "identifier")) typeIds.add(t.text);

    return this.collect(spec, "identifier")
      .map((n) => n.text)
      .filter((t) => !typeIds.has(t));
  }

  // -- call scanning --------------------------------------------------------

  private collectCalls(node: ASTNode, callerId: string, s: RunState): void {
    // Iterative DFS to avoid deep recursion
    const stack: ASTNode[] = [node];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur.type === "call_expression") {
        const callee = cur.childForFieldName("function");
        if (callee?.text) {
          s.rels.push({
            from: callerId,
            to: `${s.fp}:function:${callee.text}`,
            type: "calls",
            metadata: { callType: "function" },
          });
        }
      }
      for (let i = cur.childCount - 1; i >= 0; i--) {
        const ch = cur.child(i);
        if (ch) stack.push(ch);
      }
    }
  }

  // -- helpers --------------------------------------------------------------

  private addParamsAndReturn(node: ASTNode, ent: ParsedEntity): void {
    const params = node.childForFieldName("parameters");
    if (params) (ent.metadata ??= {})["parameters"] = this.paramList(params);
    const result = node.childForFieldName("result");
    if (result) (ent.metadata ??= {})["returnType"] = result.text;
  }

  private paramList(params: ASTNode): string[] {
    const out: string[] = [];
    for (const pd of params.namedChildren) {
      if (pd.type !== "parameter_declaration") continue;
      const pn = pd.childForFieldName("name")?.text;
      const pt = pd.childForFieldName("type")?.text;
      out.push(pn && pt ? `${pn}: ${pt}` : (pt ?? ""));
    }
    return out;
  }

  private collect(root: ASTNode, type: string): ASTNode[] {
    const native = root as unknown as { descendantsOfType?: (t: string) => ASTNode[] | null };
    if (typeof native.descendantsOfType === "function") {
      try {
        return native.descendantsOfType(type) ?? [];
      } catch {
        /* fallthrough */
      }
    }
    const result: ASTNode[] = [];
    const q: ASTNode[] = [root];
    let head = 0;
    while (head < q.length) {
      const c = q[head++]!;
      if (c.type === type) result.push(c);
      for (let i = 0; i < c.namedChildCount; i++) {
        const ch = c.namedChild(i);
        if (ch) q.push(ch);
      }
    }
    return result;
  }

  private stripQuotes(node: ASTNode): string | null {
    const pathField = node.childForFieldName("path");
    const raw =
      pathField?.text ??
      node.namedChildren.find((c) => c.type === "interpreted_string_literal" || c.type === "raw_string_literal")?.text;
    if (!raw) return null;
    return raw.replace(/^[`'"]+|[`'"]+$/g, "");
  }

  private namesFromField(field: ASTNode | null): string[] {
    if (!field) return [];
    if (field.type === "identifier") return [field.text];
    if (field.type === "identifier_list") {
      return field.namedChildren.filter((c) => c.type === "identifier").map((c) => c.text);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isExported(name?: string): boolean {
  if (!name || name.length === 0) return false;
  const code = name.charCodeAt(0);
  return code >= 65 && code <= 90;
}
