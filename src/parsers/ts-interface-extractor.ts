/**
 * TypeScript Interface Extractor
 *
 * Extracts interface declarations with property and method signatures.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getLocation, getModifiers, getParameters } from "./ts-ast-helpers.js";
import { extractTypeReferences, type TypeReference } from "./ts-call-extractor.js";
import { extractDocumentation } from "./ts-doc-extractor.js";

export interface InterfaceExtractorContext {
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
 * Extract interface declaration
 */
export function extractInterfaceDeclaration(node: ts.InterfaceDeclaration, ctx: InterfaceExtractorContext): void {
  const { sourceFile, filePath, entities, relationships } = ctx;
  const interfaceName = node.name.text;
  const modifiers = getModifiers(node);
  const interfaceDoc = extractDocumentation(node, sourceFile);
  const interfaceTypeRefs = extractTypeReferences(node, sourceFile);

  const interfaceEntity: ParsedEntity = {
    name: interfaceName,
    type: "interface",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers,
    documentation: interfaceDoc,
    typeReferences: interfaceTypeRefs,
    children: [],
  };

  // Add type references relationships for interface
  addTypeReferenceRelationships(interfaceName, interfaceTypeRefs, filePath, relationships);

  // Extract interface members
  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const propDoc = extractDocumentation(member, sourceFile);
      const propTypeRefs = extractTypeReferences(member, sourceFile);
      interfaceEntity.children!.push({
        name: member.name.getText(sourceFile),
        type: "property",
        filePath,
        location: getLocation(sourceFile, member),
        modifiers: member.questionToken ? ["optional"] : [],
        documentation: propDoc,
        typeReferences: propTypeRefs,
      });
    } else if (ts.isMethodSignature(member) && member.name) {
      const methodDoc = extractDocumentation(member, sourceFile);
      const methodTypeRefs = extractTypeReferences(member, sourceFile);
      interfaceEntity.children!.push({
        name: member.name.getText(sourceFile),
        type: "method",
        filePath,
        location: getLocation(sourceFile, member),
        modifiers: member.questionToken ? ["optional"] : [],
        parameters: getParameters(member as any, sourceFile),
        returnType: member.type ? member.type.getText(sourceFile) : undefined,
        documentation: methodDoc,
        typeReferences: methodTypeRefs,
      });
    }
  }

  entities.push(interfaceEntity);
}
