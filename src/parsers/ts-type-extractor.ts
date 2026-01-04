/**
 * TypeScript Type Extractor
 *
 * Extracts type alias and enum declarations.
 */

import type ts from "typescript";
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

  entities.push({
    name: typeName,
    type: "type",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers: getModifiers(node),
    documentation: typeDoc,
    typeReferences: typeRefs,
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

  const enumEntity: ParsedEntity = {
    name: node.name.text,
    type: "enum",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers: getModifiers(node),
    documentation: enumDoc,
    children: [],
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
