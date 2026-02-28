/**
 * C++ Language Analyzer
 *
 * AST-driven extraction of C++ entities and relationships:
 * namespaces, classes/structs, methods, fields, enums, free functions,
 * templates, friend declarations, using directives, operator overloads,
 * single/multiple/virtual inheritance.
 *
 * Safety: recursion cap, wall-clock timeout, cumulative complexity scoring,
 * template nesting limit, memoisation for template entities.
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import { log } from "../logging/index.js";
import type { ASTNode, EntityRelationship, ParsedEntity } from "../types/parser.js";
import { CircuitBreakerError } from "../utils/circuit-breaker.js";
import { getNodeLocation } from "./base-parser-utils.js";
import {
  canonicalizeOperatorName,
  extractFieldName,
  extractFunctionName,
  extractMethodQualifiers,
  isAbstractClass,
  isFinalClass,
} from "./cpp-declarator-utils.js";
import { extractTemplateParameters, isComplexTemplate } from "./cpp-template-utils.js";

const REC_CAP = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const TIME_CAP = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;
const CMPLX_CAP = PARSER_CONSTANTS.COMPLEXITY_THRESHOLD;
const TPL_CAP = 10;

// ---------------------------------------------------------------------------
// Per-run mutable state
// ---------------------------------------------------------------------------

interface CppRunState {
  entities: ParsedEntity[];
  rels: EntityRelationship[];
  fp: string;
  depth: number;
  t0: number;
  tplNest: number;
  cmplx: { tpl: number; nested: number; inherit: number; ops: number; total: number };
  tplMemo: Map<string, ParsedEntity>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEntity(
  name: string,
  type: ParsedEntity["type"],
  loc: ParsedEntity["location"],
  mods?: string[],
  meta?: Record<string, unknown>,
): ParsedEntity {
  return {
    name,
    type,
    location: loc,
    id: undefined,
    path: undefined,
    signature: undefined,
    filePath: undefined,
    language: "cpp",
    children: undefined,
    returnType: undefined,
    modifiers: mods,
    metadata: meta,
  };
}

function relMeta(extra: Record<string, unknown>, line?: number): EntityRelationship["metadata"] {
  return { line: line ?? undefined, ...extra };
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class CppAnalyzer {
  private nodeMap: Map<string, (n: ASTNode, s: CppRunState, ns: string) => void>;

  constructor() {
    this.nodeMap = new Map([
      ["translation_unit", (n, s, ns) => this.walkKids(n, s, ns)],
      ["namespace_definition", (n, s, ns) => this.doNamespace(n, s, ns)],
      ["class_specifier", (n, s, ns) => this.doClassStruct(n, s, ns)],
      ["struct_specifier", (n, s, ns) => this.doClassStruct(n, s, ns)],
      ["function_definition", (n, s, ns) => this.doFreeFunc(n, s, ns, false)],
      ["template_declaration", (n, s, ns) => this.doTemplate(n, s, ns)],
      ["using_declaration", (n, s, ns) => this.doUsing(n, s, ns)],
      ["using_directive", (n, s, ns) => this.doUsing(n, s, ns)],
      ["alias_declaration", (n, s, ns) => this.doUsing(n, s, ns)],
      ["enum_specifier", (n, s, ns) => this.doEnum(n, s, ns)],
      ["declaration", (n, s, ns) => this.walkKids(n, s, ns)],
    ]);
  }

  async analyze(
    rootNode: ASTNode,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    const s: CppRunState = {
      entities: [],
      rels: [],
      fp: filePath,
      depth: 0,
      t0: Date.now(),
      tplNest: 0,
      cmplx: { tpl: 0, nested: 0, inherit: 0, ops: 0, total: 0 },
      tplMemo: new Map(),
    };

    try {
      this.step(rootNode, s, "");
      this.pruneRels(s.rels);
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        log.w("CPPANALYZER", "circuit_break", { file: filePath, err: err.message });
      } else {
        log.e("CPPANALYZER", "analyze_err", { file: filePath, err: String(err) });
      }
    }

    return { entities: s.entities, relationships: s.rels };
  }

  // -- traversal ------------------------------------------------------------

  private step(node: ASTNode, s: CppRunState, ns: string): void {
    s.depth++;
    this.guard(s);
    try {
      const handler = this.nodeMap.get(node.type);
      if (handler) {
        handler(node, s, ns);
      } else {
        const kids = node.children;
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i]!;
          if (k.type !== "comment" && k.type !== "preproc_include") this.step(k, s, ns);
        }
      }
    } finally {
      s.depth--;
    }
  }

  private walkKids(node: ASTNode, s: CppRunState, ns: string): void {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) this.step(kids[i]!, s, ns);
  }

  private guard(s: CppRunState): void {
    if (s.depth > REC_CAP) throw new CircuitBreakerError(`Depth ${s.depth} > ${REC_CAP}`);
    const dt = Date.now() - s.t0;
    if (dt > TIME_CAP) throw new CircuitBreakerError(`Elapsed ${dt}ms > ${TIME_CAP}ms`);

    s.cmplx.total = s.cmplx.tpl * 10 + s.cmplx.nested * 5 + s.cmplx.inherit * 3 + s.cmplx.ops * 2;
    if (s.cmplx.total > CMPLX_CAP) throw new CircuitBreakerError(`Complexity ${s.cmplx.total} > ${CMPLX_CAP}`);
    if (s.tplNest > TPL_CAP) throw new CircuitBreakerError(`Template depth ${s.tplNest} > ${TPL_CAP}`);
  }

  // -- namespace ------------------------------------------------------------

  private doNamespace(node: ASTNode, s: CppRunState, parentNs: string): void {
    const nameField = node.childForFieldName("name");
    const bodyField = node.childForFieldName("body");
    if (!nameField || !bodyField) return;

    const qn = parentNs ? `${parentNs}::${nameField.text}` : nameField.text;
    s.entities.push(mkEntity(qn, "module", getNodeLocation(node), ["namespace"]));

    const kids = bodyField.children;
    for (let i = 0; i < kids.length; i++) this.step(kids[i]!, s, qn);
  }

  // -- class / struct -------------------------------------------------------

  private doClassStruct(node: ASTNode, s: CppRunState, ns: string): void {
    const nameField = node.childForFieldName("name");
    if (!nameField) return;

    const qn = ns ? `${ns}::${nameField.text}` : nameField.text;
    if (ns.includes("::")) s.cmplx.nested++;

    const mods: string[] = [];
    if (node.type === "struct_specifier") mods.push("struct");
    if (isAbstractClass(node)) mods.push("abstract");
    if (isFinalClass(node)) mods.push("final");

    s.entities.push(mkEntity(qn, "class", getNodeLocation(node), mods));

    const baseClause = node.childForFieldName("base_class_clause");
    if (baseClause) this.doBases(baseClause, qn, s);

    const body = node.childForFieldName("body");
    if (body) this.doClassBody(body, qn, s);
  }

  private doClassBody(body: ASTNode, className: string, s: CppRunState): void {
    let access = "private";
    const kids = body.children;

    for (let i = 0; i < kids.length; i++) {
      const m = kids[i]!;
      switch (m.type) {
        case "access_specifier": {
          const f = m.firstChild;
          if (f) access = f.text.replace(":", "");
          break;
        }
        case "field_declaration":
          this.doField(m, className, s, access);
          break;
        case "friend_declaration":
          this.doFriend(m, className, s);
          break;
        case "using_declaration":
          this.doUsing(m, s, className);
          break;
        case "template_declaration":
          s.tplNest++;
          if (s.tplNest <= TPL_CAP) this.doTemplate(m, s, className);
          s.tplNest--;
          break;
        case "function_definition":
        case "function_declaration":
          this.doMethodDecl(m, className, s, access);
          break;
        case "declaration": {
          const dc = m.children;
          for (let j = 0; j < dc.length; j++) {
            const dd = dc[j]!;
            if (dd.type === "function_definition" || dd.type === "function_declaration") {
              this.doMethodDecl(dd, className, s, access);
            } else if (dd.type === "field_declaration") {
              this.doField(dd, className, s, access);
            }
          }
          break;
        }
      }
    }
  }

  // -- methods --------------------------------------------------------------

  private doMethodDecl(node: ASTNode, className: string, s: CppRunState, access: string): void {
    const declNode = node.childForFieldName("declarator");
    if (!declNode) return;

    let fname = extractFunctionName(declNode);
    if (!fname) return;

    fname = canonicalizeOperatorName(fname, node);
    const qn = `${className}::${fname}`;

    if (fname.startsWith("operator")) s.cmplx.ops++;

    const quals = extractMethodQualifiers(node);
    const mods: string[] = [];
    if (access !== "public") mods.push(access);
    if (quals.isStatic) mods.push("static");
    if (quals.isConst) mods.push("const");
    if (quals.isVirtual) mods.push("virtual");
    if (quals.isOverride) mods.push("override");
    if (quals.isFinal) mods.push("final");
    if (quals.isNoexcept) mods.push("noexcept");
    if (fname.startsWith("operator")) mods.push("operator");

    s.entities.push(mkEntity(qn, "method", getNodeLocation(node), mods));
    s.rels.push({ from: qn, to: className, type: "contains" });
  }

  // -- fields ---------------------------------------------------------------

  private doField(node: ASTNode, className: string, s: CppRunState, access: string): void {
    const declNode = node.childForFieldName("declarator");
    if (!declNode) return;

    const fname = extractFieldName(declNode);
    if (!fname) return;

    const qn = `${className}::${fname}`;
    const txt = node.text;
    const mods: string[] = [];
    if (access !== "public") mods.push(access);
    if (txt.includes("static")) mods.push("static");
    if (txt.includes("const")) mods.push("const");
    if (txt.includes("mutable")) mods.push("mutable");

    s.entities.push(mkEntity(qn, "property", getNodeLocation(node), mods));
    s.rels.push({ from: qn, to: className, type: "contains" });
  }

  // -- free functions -------------------------------------------------------

  private doFreeFunc(node: ASTNode, s: CppRunState, ns: string, isTpl: boolean): void {
    const declNode = node.childForFieldName("declarator");
    if (!declNode) return;

    let fname = extractFunctionName(declNode);
    if (!fname) return;

    fname = canonicalizeOperatorName(fname, node);
    const qn = ns ? `${ns}::${fname}` : fname;
    const txt = node.text;

    const mods: string[] = [];
    if (isTpl) mods.push("template");
    if (txt.includes("inline")) mods.push("inline");
    if (txt.includes("extern")) mods.push("extern");

    s.entities.push(mkEntity(qn, "function", getNodeLocation(node), mods));
    if (ns) s.rels.push({ from: qn, to: ns, type: "contains" });
  }

  // -- templates ------------------------------------------------------------

  private doTemplate(node: ASTNode, s: CppRunState, ns: string): void {
    s.tplNest++;
    s.cmplx.tpl++;

    if (s.tplNest > TPL_CAP) {
      log.w("CPPANALYZER", "tpl_too_deep", { depth: s.tplNest });
      s.tplNest--;
      return;
    }

    const paramsField = node.childForFieldName("parameters");
    const inner = node.children.find(
      (c) => c.type === "class_specifier" || c.type === "struct_specifier" || c.type === "function_definition",
    );

    if (!inner) {
      s.tplNest--;
      return;
    }

    const tplParams = extractTemplateParameters(paramsField);
    if (isComplexTemplate(tplParams, node.text)) {
      log.w("CPPANALYZER", "tpl_complex");
      s.tplNest--;
      return;
    }

    let declId = "";
    if (inner.type === "function_definition") {
      const d = inner.childForFieldName("declarator");
      declId = extractFunctionName(d) || "";
    } else {
      declId = inner.childForFieldName("name")?.text || "";
    }

    const cacheKey = `${ns}::${inner.type}::${declId}::${tplParams}`;
    if (s.tplMemo.has(cacheKey)) {
      const cached = s.tplMemo.get(cacheKey);
      if (cached) s.entities.push(cached);
      s.tplNest--;
      return;
    }

    if (inner.type === "class_specifier" || inner.type === "struct_specifier") {
      this.doClassStruct(inner, s, ns);
      const safeName = inner.childForFieldName("name")?.text || declId;
      const targetQn = ns ? `${ns}::${safeName}` : safeName;
      this.markTemplate(s, targetQn, tplParams, cacheKey);
    } else if (inner.type === "function_definition") {
      this.doFreeFunc(inner, s, ns, true);
      const targetQn = ns ? `${ns}::${declId}` : declId;
      this.markTemplate(s, targetQn, tplParams, cacheKey);
    }

    s.tplNest--;
  }

  private markTemplate(s: CppRunState, targetName: string, tplParams: string, cacheKey: string): void {
    let target: ParsedEntity | undefined;
    for (let i = s.entities.length - 1; i >= 0; i--) {
      if (s.entities[i]!.name === targetName) {
        target = s.entities[i];
        break;
      }
    }
    if (!target) return;

    const mods = (target.modifiers ??= []);
    if (!mods.includes("template")) mods.push("template");
    if (tplParams) {
      const tag = `template<${tplParams}>`;
      if (!mods.includes(tag)) mods.push(tag);
    }
    s.tplMemo.set(cacheKey, target);
  }

  // -- using ----------------------------------------------------------------

  private doUsing(node: ASTNode, s: CppRunState, ns: string): void {
    const target = node.children.find((c) => c.type === "qualified_identifier" || c.type === "identifier");
    if (target && ns) {
      s.rels.push({ from: ns, to: target.text, type: "references" });
    }
  }

  // -- enums ----------------------------------------------------------------

  private doEnum(node: ASTNode, s: CppRunState, ns: string): void {
    const nameField = node.childForFieldName("name");
    if (!nameField) return;

    const qn = ns ? `${ns}::${nameField.text}` : nameField.text;
    const txt = node.text;
    const mods: string[] = [];
    if (txt.includes("class") || txt.includes("struct")) mods.push("scoped");

    s.entities.push(mkEntity(qn, "enum", getNodeLocation(node), mods));

    const body = node.childForFieldName("body");
    if (!body) return;

    const kids = body.children;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      if (k.type !== "enumerator") continue;
      const valName = k.childForFieldName("name");
      if (!valName) continue;
      const valQn = `${qn}::${valName.text}`;
      s.entities.push(mkEntity(valQn, "constant", getNodeLocation(k), ["enum_value"]));
      s.rels.push({ from: valQn, to: qn, type: "contains" });
    }
  }

  // -- inheritance ----------------------------------------------------------

  private doBases(baseList: ASTNode, derived: string, s: CppRunState): void {
    let depthCounter = 0;
    const kids = baseList.children;

    for (let i = 0; i < kids.length; i++) {
      const spec = kids[i]!;
      if (spec.type !== "base_class_specifier" && spec.type !== "base_specifier") continue;

      depthCounter++;
      s.cmplx.inherit = Math.max(s.cmplx.inherit, depthCounter);

      const txt = spec.text;
      const isVirtual = txt.includes("virtual");
      let access = "private";
      if (txt.includes("public")) access = "public";
      else if (txt.includes("protected")) access = "protected";

      const baseId = spec.children.find((c) => c.type === "type_identifier" || c.type === "qualified_identifier");

      if (baseId) {
        s.rels.push({
          from: derived,
          to: baseId.text,
          type: "inherits",
          metadata: relMeta({ access, isVirtual }),
        });
      }
    }
  }

  // -- friend ---------------------------------------------------------------

  private doFriend(node: ASTNode, className: string, s: CppRunState): void {
    const target = node.children.find(
      (c) => c.type === "type_identifier" || c.type === "qualified_identifier" || c.type === "function_definition",
    );
    if (!target) return;

    const friendName =
      target.type === "function_definition" ? extractFunctionName(target.childForFieldName("declarator")) : target.text;

    if (friendName) {
      s.rels.push({
        from: className,
        to: friendName,
        type: "references",
        metadata: relMeta({ relation: "friend" }),
      });
    }
  }

  // -- post-processing ------------------------------------------------------

  private pruneRels(rels: EntityRelationship[]): void {
    let w = 0;
    for (let r = 0; r < rels.length; r++) {
      if (rels[r]!.from && rels[r]!.to) rels[w++] = rels[r]!;
    }
    rels.length = w;
  }
}
