/**
 * TypeScript Type Extractor
 *
 * Extracts type alias and enum declarations.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getLocation, getModifiers } from "./ts-ast-helpers.js";
import { extractTypeReferences, type TypeReference } from "./ts-call-extractor.js";
import { extractDocumentation } from "./ts-doc-extractor.js";

export interface TypeExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
}

/**
 * Add type reference relationships
 */
function addTypeReferenceRelationships(
  entityName: string,
  typeRefs: TypeReference[] | undefined,
  filePath: string,
  relationships: EntityRelationship[],
): void {
  if (!typeRefs) return;
  for (const ref of typeRefs) {
    if (ref.kind === "extends" || ref.kind === "implements") continue;
    relationships.push({
      from: entityName,
      to: ref.name,
      type: "references",
      sourceFile: filePath,
      metadata: {
        line: ref.location.start.line,
        referenceKind: ref.kind,
      },
    });
  }
}

/**
 * Extract type alias declaration
 */
export function extractTypeAliasDeclaration(node: ts.TypeAliasDeclaration, ctx: TypeExtractorContext): void {
  const { sourceFile, filePath, entities, relationships } = ctx;
  const typeName = node.name.text;
  const typeDoc = extractDocumentation(node, sourceFile);
  const typeRefs = extractTypeReferences(node, sourceFile);

  // Measure conditional type nesting depth
  const conditionalTypeDepth = measureConditionalTypeDepth(node.type);

  entities.push({
    name: typeName,
    type: "type",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers: getModifiers(node),
    documentation: typeDoc,
    typeReferences: typeRefs,
    ...(conditionalTypeDepth > 0 && {
      metadata: { conditionalTypeDepth },
    }),
  });

  // Add type references relationships for type alias
  addTypeReferenceRelationships(typeName, typeRefs, filePath, relationships);
}

/**
 * Extract enum declaration
 */
export function extractEnumDeclaration(node: ts.EnumDeclaration, ctx: TypeExtractorContext): void {
  const { sourceFile, filePath, entities } = ctx;
  const enumDoc = extractDocumentation(node, sourceFile);
  const modifiers = getModifiers(node);

  // Detect const enum and string initializers
  const isConstEnum = modifiers.includes("const");
  let hasStringInit = false;
  for (const member of node.members) {
    if (member.initializer && ts.isStringLiteral(member.initializer)) {
      hasStringInit = true;
      break;
    }
  }

  const enumEntity: ParsedEntity = {
    name: node.name.text,
    type: "enum",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers,
    documentation: enumDoc,
    children: [],
    metadata: {
      isConstEnum,
      hasStringInit,
    },
  };

  for (const member of node.members) {
    enumEntity.children!.push({
      name: member.name.getText(sourceFile),
      type: "enum_variant",
      filePath,
      location: getLocation(sourceFile, member),
    });
  }

  entities.push(enumEntity);
}

/**
 * Extract namespace/module declaration
 */
export function extractNamespaceDeclaration(node: ts.ModuleDeclaration, ctx: TypeExtractorContext): void {
  const { sourceFile, filePath, entities } = ctx;
  const nameDoc = extractDocumentation(node, sourceFile);

  entities.push({
    name: node.name.getText(sourceFile),
    type: "namespace",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers: getModifiers(node),
    documentation: nameDoc,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Measure the maximum nesting depth of conditional types (A extends B ? C : D)
 */
function measureConditionalTypeDepth(typeNode: ts.TypeNode): number {
  let maxDepth = 0;

  function walk(node: ts.Node, depth: number): void {
    if (ts.isConditionalTypeNode(node)) {
      const newDepth = depth + 1;
      if (newDepth > maxDepth) maxDepth = newDepth;
      walk(node.trueType, newDepth);
      walk(node.falseType, newDepth);
      walk(node.checkType, depth);
      walk(node.extendsType, depth);
      return;
    }
    ts.forEachChild(node, (child) => walk(child, depth));
  }

  walk(typeNode, 0);
  return maxDepth;
}
