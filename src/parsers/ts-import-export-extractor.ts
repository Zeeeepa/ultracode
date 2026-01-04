/**
 * TypeScript Import/Export Extractor
 *
 * Extracts import and export declarations.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getLocation } from "./ts-ast-helpers.js";

export interface ImportExportExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
}

/**
 * Extract import declaration
 */
export function extractImportDeclaration(node: ts.ImportDeclaration, ctx: ImportExportExtractorContext): void {
  const { sourceFile, filePath, entities, relationships } = ctx;
  const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
  const source = moduleSpecifier.slice(1, -1); // Remove quotes

  const specifiers: Array<{
    local: string;
    imported?: string | undefined;
    alias?: string | undefined;
  }> = [];
  let isDefault = false;
  let isNamespace = false;

  if (node.importClause) {
    // Default import
    if (node.importClause.name) {
      isDefault = true;
      specifiers.push({ local: node.importClause.name.text });
    }

    // Named imports
    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        specifiers.push({
          local: element.name.text,
          imported: element.propertyName?.text,
          alias: element.propertyName ? element.name.text : undefined,
        });
      }
    }

    // Namespace import
    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
      isNamespace = true;
      specifiers.push({
        local: node.importClause.namedBindings.name.text,
      });
    }
  }

  const importEntityName = source;
  entities.push({
    name: importEntityName,
    type: "import",
    filePath,
    location: getLocation(sourceFile, node),
    importData: {
      source,
      specifiers,
      isDefault,
      isNamespace,
    },
  });

  // Create import relationships for each specifier
  const location = getLocation(sourceFile, node);
  for (const spec of specifiers) {
    const importedSymbol = spec.imported || spec.local;
    relationships.push({
      from: importEntityName,
      to: importedSymbol,
      type: "imports",
      sourceFile: filePath,
      targetFile: source,
      metadata: {
        line: location.start.line,
        isDefault,
        isNamespace,
        alias: spec.alias,
      },
    });
  }

  // Side-effect import (no specifiers)
  if (specifiers.length === 0) {
    relationships.push({
      from: filePath,
      to: source,
      type: "imports",
      sourceFile: filePath,
      targetFile: source,
      metadata: {
        line: location.start.line,
        isSideEffect: true,
      },
    });
  }
}

/**
 * Extract export declaration
 */
export function extractExportDeclaration(node: ts.ExportDeclaration, ctx: ImportExportExtractorContext): void {
  const { sourceFile, filePath, entities } = ctx;

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const element of node.exportClause.elements) {
      entities.push({
        name: element.name.text,
        type: "export",
        filePath,
        location: getLocation(sourceFile, element),
      });
    }
  }
}
