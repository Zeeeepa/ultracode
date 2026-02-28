/**
 * Rust Language Analyzer
 *
 * Multi-layer analysis of Rust source code:
 *   Layer 1 - Entity extraction: structs, enums, traits, functions, modules,
 *             type aliases, constants, statics, macros
 *   Layer 2 - Relationship mapping: trait implementations, module hierarchy,
 *             supertrait inheritance, use-statement imports
 *   Layer 3 - Impl block analysis: inherent impls and trait impls with method extraction
 *   Layer 4 - Pattern recognition via external pattern-identifier module
 *
 * Architecture:
 *   - Iterative DFS with explicit stack instead of recursive tree walking
 *   - Map-based dispatch for top-level node types (configured in constructor)
 *   - RunState struct carries per-analysis mutable context
 *   - All extraction helpers are stateless functions outside the class
 *   - Set-based lookups for modifier/attribute matching
 */

import type { ASTNode, EntityRelationship, ImportDependency, ParsedEntity, PatternAnalysis } from "../types/parser.js";
import { getNodeLocation, hasChild } from "./base-parser-utils.js";

import {
  countNestedItems,
  extractAliasedType,
  extractAttributes,
  extractConstType,
  extractDerives,
  extractDiscriminant,
  extractFieldType,
  extractFunctionParameters,
  extractGenerics,
  extractLifetimes,
  extractMacroRules,
  extractReturnType,
  extractStaticType,
  extractSupertraits,
  extractTraitBounds,
  extractTypeBounds,
  extractUseTree,
  extractVisibility,
  getAttributeName,
  getNodeText,
  hasBody,
  hasModifier,
  isTupleStruct,
  resolveName,
} from "./rust/ast-helpers.js";

import { identifyPatterns } from "./rust/pattern-identifier.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-analysis mutable context, replaces class-level mutable fields. */
interface RunState {
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  imports: ImportDependency[];
  filePath: string;
  /** Track struct names seen to attach per-struct impl blocks */
  structNames: string[];
  t0: number;
}

type AnalyzerMetrics = {
  entitiesExtracted: number;
  relationshipsFound: number;
  patternsIdentified: number;
  parseTime: number;
};

/** Proc-macro attribute names recognised as defining proc macros (Set for O(1) lookup). */
const PROC_MACRO_ATTRS: ReadonlySet<string> = new Set(["proc_macro", "proc_macro_derive", "proc_macro_attribute"]);

// ---------------------------------------------------------------------------
// Iterative DFS - replaces recursive findNodes
// ---------------------------------------------------------------------------

/**
 * Find all descendant nodes matching `type` using an iterative DFS with
 * an explicit stack. Avoids call-stack overflow on deeply nested ASTs.
 */
function iterativeFindNodes(root: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = [];
  const stack: ASTNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === type) {
      results.push(node);
    }
    // Push children in reverse order so leftmost child is processed first
    for (let i = node.childCount - 1; i >= 0; i--) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Stateless entity-building helper
// ---------------------------------------------------------------------------

/** Build a ParsedEntity with all required fields for Rust */
function makeEntity(
  base: Pick<ParsedEntity, "name" | "type" | "location"> &
    Partial<Pick<ParsedEntity, "id" | "filePath" | "modifiers" | "metadata">>,
): ParsedEntity {
  return {
    name: base.name,
    type: base.type,
    location: base.location,
    id: base.id ?? undefined,
    path: undefined,
    signature: undefined,
    filePath: base.filePath ?? undefined,
    language: "rust",
    children: undefined,
    returnType: undefined,
    modifiers: base.modifiers,
    metadata: base.metadata,
  };
}

// ---------------------------------------------------------------------------
// Stateless extraction functions (one per node type)
// ---------------------------------------------------------------------------

function extractModules(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "mod_item");
  for (let i = 0; i < nodes.length; i++) {
    const modNode = nodes[i]!;
    const name = resolveName(modNode);
    if (!name) continue;

    const loc = getNodeLocation(modNode);
    const vis = extractVisibility(modNode);
    const inline = hasBody(modNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:module:${name}`,
        name,
        type: "module",
        filePath: state.filePath,
        location: loc,
        metadata: { visibility: vis, isInline: inline },
      }),
    );

    if (inline) {
      const body = modNode.childForFieldName("body");
      if (body) {
        const nested = countNestedItems(body);
        state.relationships.push({
          from: `${state.filePath}:module:${name}`,
          to: state.filePath,
          type: "contains",
          sourceFile: state.filePath,
          metadata: { line: loc.start.line, nestedItems: nested },
        });
      }
    }
  }
}

function collectStructFields(structNode: ASTNode, structName: string, state: RunState): ParsedEntity[] {
  const collected: ParsedEntity[] = [];
  const body = structNode.childForFieldName("body");
  if (!body) return collected;

  const fieldDecls = iterativeFindNodes(body, "field_declaration");
  for (let i = 0; i < fieldDecls.length; i++) {
    const fNode = fieldDecls[i]!;
    const nameNode = fNode.childForFieldName("name");
    if (!nameNode) continue;

    const fName = getNodeText(nameNode);
    const fLoc = getNodeLocation(fNode);
    const fVis = extractVisibility(fNode);
    const fType = extractFieldType(fNode);
    const fAttrs = extractAttributes(fNode);

    const entity = makeEntity({
      id: `${state.filePath}:struct:${structName}:field:${fName}`,
      name: fName,
      type: "field",
      filePath: state.filePath,
      location: fLoc,
      metadata: {
        structName,
        fieldType: fType,
        visibility: fVis,
        attributes: fAttrs,
        rustType: "field",
      },
    });

    collected.push(entity);
    state.entities.push(entity);
  }

  return collected;
}

function extractStructs(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "struct_item");
  for (let i = 0; i < nodes.length; i++) {
    const sNode = nodes[i]!;
    const name = resolveName(sNode);
    if (!name) continue;

    const loc = getNodeLocation(sNode);
    const vis = extractVisibility(sNode);
    const gens = extractGenerics(sNode);
    const lts = extractLifetimes(sNode);
    const derivs = extractDerives(sNode);
    const fields = collectStructFields(sNode, name, state);

    const tuple = isTupleStruct(sNode);
    const unit = fields.length === 0 && !tuple;

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:struct:${name}`,
        name,
        type: "struct",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          generics: gens,
          lifetimes: lts,
          derives: derivs,
          fieldCount: fields.length,
          isTuple: tuple,
          isUnit: unit,
          rustType: "struct",
        },
      }),
    );

    // Remember struct name for per-struct impl block pass
    state.structNames.push(name);

    // Per-struct impl blocks
    extractImplBlocksForType(root, name, state);
  }
}

function collectEnumVariants(enumNode: ASTNode, enumName: string, state: RunState): string[] {
  const names: string[] = [];
  const body = enumNode.childForFieldName("body");
  if (!body) return names;

  const variantDecls = iterativeFindNodes(body, "enum_variant");
  for (let i = 0; i < variantDecls.length; i++) {
    const vNode = variantDecls[i]!;
    const vName = resolveName(vNode);
    if (!vName) continue;

    const vLoc = getNodeLocation(vNode);
    const withFields = hasChild(vNode, "field_declaration_list");
    const withTuple = hasChild(vNode, "ordered_field_declaration_list");
    const disc = extractDiscriminant(vNode);

    names.push(vName);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:enum:${enumName}:variant:${vName}`,
        name: vName,
        type: "enum_variant",
        filePath: state.filePath,
        location: vLoc,
        metadata: {
          enumName,
          hasFields: withFields,
          hasTuple: withTuple,
          discriminant: disc,
          rustType: "enum_variant",
        },
      }),
    );
  }

  return names;
}

function extractEnums(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "enum_item");
  for (let i = 0; i < nodes.length; i++) {
    const eNode = nodes[i]!;
    const name = resolveName(eNode);
    if (!name) continue;

    const loc = getNodeLocation(eNode);
    const vis = extractVisibility(eNode);
    const gens = extractGenerics(eNode);
    const lts = extractLifetimes(eNode);
    const derivs = extractDerives(eNode);
    const variants = collectEnumVariants(eNode, name, state);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:enum:${name}`,
        name,
        type: "enum",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          generics: gens,
          lifetimes: lts,
          derives: derivs,
          variants,
          variantCount: variants.length,
          rustType: "enum",
        },
      }),
    );
  }
}

function collectTraitMethods(traitNode: ASTNode, traitName: string, state: RunState): ParsedEntity[] {
  const result: ParsedEntity[] = [];
  const body = traitNode.childForFieldName("body");
  if (!body) return result;

  // Signature-only (abstract) methods
  const sigNodes = iterativeFindNodes(body, "function_signature_item");
  for (let i = 0; i < sigNodes.length; i++) {
    const sigNode = sigNodes[i]!;
    const nameNode = sigNode.childForFieldName("name");
    if (!nameNode) continue;

    const mName = getNodeText(nameNode);
    const mLoc = getNodeLocation(sigNode);
    const mParams = extractFunctionParameters(sigNode);
    const mRet = extractReturnType(sigNode);

    const method = makeEntity({
      id: `${state.filePath}:trait:${traitName}:method:${mName}`,
      name: mName,
      type: "method",
      filePath: state.filePath,
      location: mLoc,
      metadata: {
        traitName,
        parameters: mParams,
        returnType: mRet,
        isAbstract: true,
        hasDefaultImpl: false,
        rustType: "trait_method",
      },
    });

    result.push(method);
    state.entities.push(method);
  }

  // Default implementation methods
  const defNodes = iterativeFindNodes(body, "function_item");
  for (let i = 0; i < defNodes.length; i++) {
    const defNode = defNodes[i]!;
    const nameNode = defNode.childForFieldName("name");
    if (!nameNode) continue;

    const mName = getNodeText(nameNode);
    const mLoc = getNodeLocation(defNode);
    const mParams = extractFunctionParameters(defNode);
    const mRet = extractReturnType(defNode);

    const method = makeEntity({
      id: `${state.filePath}:trait:${traitName}:method:${mName}`,
      name: mName,
      type: "method",
      filePath: state.filePath,
      location: mLoc,
      metadata: {
        traitName,
        parameters: mParams,
        returnType: mRet,
        isAbstract: false,
        hasDefaultImpl: true,
        rustType: "trait_method",
      },
    });

    result.push(method);
    state.entities.push(method);
  }

  return result;
}

function collectAssociatedTypes(traitNode: ASTNode, traitName: string, state: RunState): ParsedEntity[] {
  const result: ParsedEntity[] = [];
  const body = traitNode.childForFieldName("body");
  if (!body) return result;

  const typeDecls = iterativeFindNodes(body, "associated_type");
  for (let i = 0; i < typeDecls.length; i++) {
    const tNode = typeDecls[i]!;
    const nameNode = tNode.childForFieldName("name");
    if (!nameNode) continue;

    const tName = getNodeText(nameNode);
    const tLoc = getNodeLocation(tNode);
    const tBounds = extractTypeBounds(tNode);

    const assocType = makeEntity({
      id: `${state.filePath}:trait:${traitName}:type:${tName}`,
      name: tName,
      type: "typedef",
      filePath: state.filePath,
      location: tLoc,
      metadata: {
        traitName,
        bounds: tBounds,
        rustType: "associated_type",
      },
    });

    result.push(assocType);
    state.entities.push(assocType);
  }

  return result;
}

function extractTraits(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "trait_item");
  for (let i = 0; i < nodes.length; i++) {
    const tNode = nodes[i]!;
    const name = resolveName(tNode);
    if (!name) continue;

    const loc = getNodeLocation(tNode);
    const vis = extractVisibility(tNode);
    const gens = extractGenerics(tNode);
    const bounds = extractTraitBounds(tNode);
    const supers = extractSupertraits(tNode);

    const methods = collectTraitMethods(tNode, name, state);
    const assocTypes = collectAssociatedTypes(tNode, name, state);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:trait:${name}`,
        name,
        type: "trait",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          generics: gens,
          bounds,
          supertraits: supers,
          methodCount: methods.length,
          associatedTypeCount: assocTypes.length,
          rustType: "trait",
        },
      }),
    );

    // Supertrait relationships
    for (let j = 0; j < supers.length; j++) {
      state.relationships.push({
        from: `${state.filePath}:trait:${name}`,
        to: `${state.filePath}:trait:${supers[j]}`,
        type: "inherits",
        sourceFile: state.filePath,
      });
    }
  }
}

function extractFunctions(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "function_item");
  for (let i = 0; i < nodes.length; i++) {
    const fnNode = nodes[i]!;
    const name = resolveName(fnNode);
    if (!name) continue;

    const loc = getNodeLocation(fnNode);
    const vis = extractVisibility(fnNode);
    const asyncFlag = hasModifier(fnNode, "async");
    const constFlag = hasModifier(fnNode, "const");
    const unsafeFlag = hasModifier(fnNode, "unsafe");
    const gens = extractGenerics(fnNode);
    const lts = extractLifetimes(fnNode);
    const params = extractFunctionParameters(fnNode);
    const retType = extractReturnType(fnNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:function:${name}`,
        name,
        type: "function",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          isAsync: asyncFlag,
          isConst: constFlag,
          isUnsafe: unsafeFlag,
          generics: gens,
          lifetimes: lts,
          parameters: params,
          returnType: retType,
          rustType: "function",
        },
      }),
    );
  }
}

function extractTypeAliases(root: ASTNode, state: RunState): void {
  const nodes = iterativeFindNodes(root, "type_item");
  for (let i = 0; i < nodes.length; i++) {
    const tNode = nodes[i]!;
    const name = resolveName(tNode);
    if (!name) continue;

    const loc = getNodeLocation(tNode);
    const vis = extractVisibility(tNode);
    const gens = extractGenerics(tNode);
    const alias = extractAliasedType(tNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:type:${name}`,
        name,
        type: "typedef",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          generics: gens,
          aliasedType: alias,
          rustType: "type_alias",
        },
      }),
    );
  }
}

function extractConstants(root: ASTNode, state: RunState): void {
  const constDecls = iterativeFindNodes(root, "const_item");
  for (let i = 0; i < constDecls.length; i++) {
    const cNode = constDecls[i]!;
    const name = resolveName(cNode);
    if (!name) continue;

    const loc = getNodeLocation(cNode);
    const vis = extractVisibility(cNode);
    const cType = extractConstType(cNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:const:${name}`,
        name,
        type: "constant",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          constType: cType,
          isConst: true,
          rustType: "const",
        },
      }),
    );
  }

  const staticDecls = iterativeFindNodes(root, "static_item");
  for (let i = 0; i < staticDecls.length; i++) {
    const sNode = staticDecls[i]!;
    const name = resolveName(sNode);
    if (!name) continue;

    const loc = getNodeLocation(sNode);
    const vis = extractVisibility(sNode);
    const sType = extractStaticType(sNode);
    const mut = hasModifier(sNode, "mut");

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:static:${name}`,
        name,
        type: "variable",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          staticType: sType,
          isMutable: mut,
          isStatic: true,
          rustType: "static",
        },
      }),
    );
  }
}

function extractMacros(root: ASTNode, state: RunState): void {
  const macroDefs = iterativeFindNodes(root, "macro_definition");
  for (let i = 0; i < macroDefs.length; i++) {
    const mNode = macroDefs[i]!;
    const name = resolveName(mNode);
    if (!name) continue;

    const loc = getNodeLocation(mNode);
    const vis = extractVisibility(mNode);
    const rules = extractMacroRules(mNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:macro:${name}`,
        name,
        type: "macro",
        filePath: state.filePath,
        location: loc,
        metadata: {
          visibility: vis,
          macroType: "macro_rules",
          ruleCount: rules.length,
          rustType: "macro",
        },
      }),
    );
  }

  const allAttrs = iterativeFindNodes(root, "attribute_item");
  for (let i = 0; i < allAttrs.length; i++) {
    const attr = allAttrs[i]!;
    const attrName = getAttributeName(attr);
    if (!PROC_MACRO_ATTRS.has(attrName)) continue;

    const parentNode = attr.parent;
    if (!parentNode) continue;

    const nameNode = parentNode.childForFieldName("name");
    if (!nameNode) continue;

    const pmName = getNodeText(nameNode);
    const pmLoc = getNodeLocation(parentNode);

    state.entities.push(
      makeEntity({
        id: `${state.filePath}:proc_macro:${pmName}`,
        name: pmName,
        type: "function",
        filePath: state.filePath,
        location: pmLoc,
        metadata: {
          macroType: attrName,
          isProcMacro: true,
          rustType: "proc_macro",
        },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Impl block extraction (stateless)
// ---------------------------------------------------------------------------

function extractImplBlocksForType(root: ASTNode, typeName: string, state: RunState): void {
  const implDecls = iterativeFindNodes(root, "impl_item");
  for (let i = 0; i < implDecls.length; i++) {
    const implNode = implDecls[i]!;
    const typeField = implNode.childForFieldName("type");
    if (!typeField) continue;

    const implTypeName = getNodeText(typeField);
    if (!implTypeName.includes(typeName)) continue;

    const traitField = implNode.childForFieldName("trait");
    if (traitField) {
      const traitText = getNodeText(traitField);

      state.relationships.push({
        from: `${state.filePath}:struct:${typeName}`,
        to: `${state.filePath}:trait:${traitText}`,
        type: "implements",
        sourceFile: state.filePath,
      });

      const body = implNode.childForFieldName("body");
      if (body) {
        const fnItems = iterativeFindNodes(body, "function_item");
        for (let j = 0; j < fnItems.length; j++) {
          const fn = fnItems[j]!;
          const fnNameNode = fn.childForFieldName("name");
          if (!fnNameNode) continue;

          const methodName = getNodeText(fnNameNode);
          state.entities.push(
            makeEntity({
              id: `${state.filePath}:impl:${typeName}:${traitText}:${methodName}`,
              name: methodName,
              type: "method",
              filePath: state.filePath,
              location: getNodeLocation(fn),
              metadata: {
                implType: typeName,
                traitName: traitText,
                isTraitImpl: true,
                rustType: "impl_method",
              },
            }),
          );
        }
      }
    } else {
      const body = implNode.childForFieldName("body");
      if (body) {
        const fnItems = iterativeFindNodes(body, "function_item");
        for (let j = 0; j < fnItems.length; j++) {
          const fn = fnItems[j]!;
          const fnNameNode = fn.childForFieldName("name");
          if (!fnNameNode) continue;

          const methodName = getNodeText(fnNameNode);
          const fnVis = extractVisibility(fn);

          state.entities.push(
            makeEntity({
              id: `${state.filePath}:impl:${typeName}:${methodName}`,
              name: methodName,
              type: "method",
              filePath: state.filePath,
              location: getNodeLocation(fn),
              metadata: {
                implType: typeName,
                visibility: fnVis,
                isInherent: true,
                rustType: "impl_method",
              },
            }),
          );
        }
      }
    }
  }
}

function extractImplBlocksGlobal(root: ASTNode, state: RunState): void {
  const implDecls = iterativeFindNodes(root, "impl_item");
  for (let i = 0; i < implDecls.length; i++) {
    const implNode = implDecls[i]!;
    const typeField = implNode.childForFieldName("type");
    const traitField = implNode.childForFieldName("trait");
    const typeName = typeField ? getNodeText(typeField) : undefined;
    const traitName = traitField ? getNodeText(traitField) : undefined;

    if (typeName && traitName) {
      state.relationships.push({
        from: `${state.filePath}:struct:${typeName}`,
        to: `${state.filePath}:trait:${traitName}`,
        type: "implements",
        sourceFile: state.filePath,
      });
    }

    const body = implNode.childForFieldName("body");
    if (!body) continue;

    const fnItems = iterativeFindNodes(body, "function_item");
    for (let j = 0; j < fnItems.length; j++) {
      const fn = fnItems[j]!;
      const fnNameNode = fn.childForFieldName("name");
      if (!fnNameNode) continue;

      const methodName = getNodeText(fnNameNode);
      const fnLoc = getNodeLocation(fn);

      state.entities.push(
        makeEntity({
          id: `${state.filePath}:impl:${typeName || "unknown"}:${traitName || "inherent"}:${methodName}`,
          name: methodName,
          type: "method",
          filePath: state.filePath,
          location: fnLoc,
          metadata: {
            implType: typeName || "",
            traitName,
            isTraitImpl: Boolean(traitName),
            isInherent: !traitName,
            rustType: "impl_method",
          },
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Use/import extraction (stateless)
// ---------------------------------------------------------------------------

function extractUseStatements(root: ASTNode, state: RunState): void {
  const useDecls = iterativeFindNodes(root, "use_declaration");
  for (let i = 0; i < useDecls.length; i++) {
    const useNode = useDecls[i]!;
    const vis = extractVisibility(useNode);
    const paths = extractUseTree(useNode);
    const lineNum = useNode.startPosition.row + 1;

    for (let j = 0; j < paths.length; j++) {
      const fullPath = paths[j]!;
      const wildcard = fullPath.endsWith("::*");
      const trimmed = wildcard ? fullPath.slice(0, -3) : fullPath;
      const segments = trimmed.split("::").filter(Boolean);

      let targetMod: string;
      let symName: string;

      if (wildcard) {
        targetMod = trimmed;
        symName = "*";
      } else if (segments.length > 1) {
        symName = segments[segments.length - 1] || "*";
        targetMod = segments.slice(0, -1).join("::");
      } else {
        targetMod = "";
        symName = segments[0] || "*";
      }

      const kind: ImportDependency["importType"] =
        fullPath.startsWith("self::") || fullPath.startsWith("super::") ? "relative" : "absolute";

      state.imports.push({
        sourceFile: state.filePath,
        targetModule: targetMod || trimmed,
        importType: kind,
        symbols: [{ name: symName }],
        line: lineNum,
        isUsed: false,
        usageLocations: [],
        type: "use",
        metadata: { visibility: vis },
      });
    }
  }

  const externDecls = iterativeFindNodes(root, "extern_crate_declaration");
  for (let i = 0; i < externDecls.length; i++) {
    const extNode = externDecls[i]!;
    const nameNode = extNode.childForFieldName("name");
    if (!nameNode) continue;

    const crateName = getNodeText(nameNode);
    const lineNum = extNode.startPosition.row + 1;

    state.imports.push({
      sourceFile: state.filePath,
      targetModule: crateName,
      importType: "absolute",
      symbols: [{ name: crateName }],
      line: lineNum,
      isUsed: false,
      usageLocations: [],
      type: "extern_crate",
      metadata: { isExternCrate: true },
    });
  }
}

// ---------------------------------------------------------------------------
// Dispatch table type
// ---------------------------------------------------------------------------

type ExtractionPhase = (root: ASTNode, state: RunState) => void;

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class RustAnalyzer {
  private metrics: AnalyzerMetrics = {
    entitiesExtracted: 0,
    relationshipsFound: 0,
    patternsIdentified: 0,
    parseTime: 0,
  };

  /** Ordered extraction phases, dispatched via Map in analyze(). */
  private readonly phases: Map<string, ExtractionPhase>;

  constructor() {
    // Map-based dispatch: each phase keyed by a readable label.
    // Insertion order defines execution order (Map preserves it).
    this.phases = new Map<string, ExtractionPhase>([
      ["modules", extractModules],
      ["structs", extractStructs],
      ["enums", extractEnums],
      ["traits", extractTraits],
      ["functions", extractFunctions],
      ["type_aliases", extractTypeAliases],
      ["constants", extractConstants],
      ["macros", extractMacros],
      ["impl_blocks_global", extractImplBlocksGlobal],
      ["use_statements", extractUseStatements],
    ]);
  }

  /**
   * Main entry point for Rust analysis
   */
  public async analyze(
    node: ASTNode,
    filePath: string,
  ): Promise<{
    entities: ParsedEntity[];
    relationships: EntityRelationship[];
    imports: ImportDependency[];
    patterns: PatternAnalysis;
    metrics: AnalyzerMetrics;
  }> {
    const state: RunState = {
      entities: [],
      relationships: [],
      imports: [],
      filePath,
      structNames: [],
      t0: Date.now(),
    };

    // Execute all extraction phases via map-based dispatch
    for (const phase of this.phases.values()) {
      phase(node, state);
    }

    // Layer 4: Pattern identification
    const patterns = identifyPatterns(node, state.entities);

    // Compute metrics
    const elapsed = Date.now() - state.t0;
    this.metrics = {
      entitiesExtracted: state.entities.length,
      relationshipsFound: state.relationships.length,
      patternsIdentified:
        patterns.designPatterns.length +
        patterns.exceptionHandling.length +
        patterns.contextManagers.length +
        patterns.pythonIdioms.length +
        patterns.circularDependencies.length +
        (patterns.otherPatterns?.length ?? 0),
      parseTime: Math.max(1, elapsed),
    };

    return {
      entities: state.entities,
      relationships: state.relationships,
      imports: state.imports,
      patterns,
      metrics: this.metrics,
    };
  }
}

// Export default instance
export default new RustAnalyzer();
