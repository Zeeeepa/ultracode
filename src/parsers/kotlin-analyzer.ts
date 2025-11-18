/**
 * Kotlin Language Analyzer
 *
 * Analyzer for Kotlin language supporting:
 * - Packages and imports
 * - Classes (regular, abstract, data, sealed, inner, nested)
 * - Interfaces and objects (singletons)
 * - Functions (top-level, extension, inline, suspend)
 * - Properties and fields
 * - Lambda expressions and higher-order functions
 * - Generic type parameters
 * - Coroutines (suspend functions)
 * - Companion objects
 *
 * Relationships:
 * - Class inheritance (extends)
 * - Interface implementation
 * - Method calls and property access
 * - Package organization
 * - Extension function relationships
 * - Companion object relationships
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { checkCircuitBreakers, getNodeLocation } from "./base-parser-utils.js";

const MAX_RECURSION_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const PARSE_TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

export class KotlinAnalyzer {
  private recursionDepth = 0;
  private parseStartTime = 0;
  private currentPackage = "";
  private currentClass: string | null = null;

  /**
   * Ensure a module entity exists for the current package
   */
  private ensurePackageEntity(filePath: string, entities: ParsedEntity[]): string {
    const pkg = this.currentPackage || "(default)";
    const moduleId = `${filePath}:package:${pkg}`;

    const exists = entities.some((e) => e.id === moduleId);
    if (!exists) {
      entities.push({
        id: moduleId,
        name: pkg,
        type: "module",
        filePath,
        location: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 0, index: 0 },
        },
        modifiers: [],
        metadata: { packageName: pkg },
      });
    }

    return moduleId;
  }

  /**
   * Parse Kotlin source code
   */
  async analyze(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): Promise<void> {
    this.parseStartTime = Date.now();
    this.recursionDepth = 0;
    this.currentPackage = "";
    this.currentClass = null;

    await this.traverseNode(node, filePath, entities, relationships);
  }

  private async traverseNode(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    checkCircuitBreakers(this.recursionDepth, this.parseStartTime, MAX_RECURSION_DEPTH, PARSE_TIMEOUT_MS);
    this.recursionDepth++;

    try {
      const nodeType = node.type;

      switch (nodeType) {
        case "package_header":
          await this.handlePackage(node, filePath, entities);
          break;

        case "import_header":
        case "import_list":
          await this.handleImport(node, filePath, entities, relationships);
          break;

        case "class_declaration":
          await this.handleClass(node, filePath, entities, relationships, parentId);
          break;

        case "object_declaration":
          await this.handleObject(node, filePath, entities, relationships, parentId);
          break;

        case "function_declaration":
          await this.handleFunction(node, filePath, entities, relationships, parentId);
          break;

        case "property_declaration":
          await this.handleProperty(node, filePath, entities, relationships, parentId);
          break;

        default:
          // Traverse children
          for (const child of node.children || []) {
            await this.traverseNode(child, filePath, entities, relationships, parentId);
          }
          break;
      }
    } finally {
      this.recursionDepth--;
    }
  }

  private async handlePackage(node: TreeSitterNode, filePath: string, entities: ParsedEntity[]): Promise<void> {
    // package com.example.app
    const identifierNode = node.children?.find((c) => c.type === "identifier" || c.type === "package_name");
    if (identifierNode) {
      this.currentPackage = identifierNode.text || "";
      this.ensurePackageEntity(filePath, entities);
    }
  }

  private async handleClass(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier" || c.type === "simple_identifier");
    const className = nameNode?.text || "AnonymousClass";

    const modifiers: string[] = [];
    const metadata: Record<string, any> = {};

    // Extract modifiers
    for (const child of node.children || []) {
      if (child.type === "modifiers") {
        for (const mod of child.children || []) {
          if (mod.text) modifiers.push(mod.text);
        }
      }
    }

    // Check for data class, sealed class, enum class, interface
    if (modifiers.includes("data")) metadata.isDataClass = true;
    if (modifiers.includes("sealed")) metadata.isSealedClass = true;
    if (modifiers.includes("inner")) metadata.isInnerClass = true;
    if (modifiers.includes("enum")) metadata.isEnumClass = true;

    // Check if this is an interface (via parent modifiers or keywords)
    const isInterface =
      node.parent?.children?.some((c) => c.text === "interface") || node.children?.some((c) => c.text === "interface");
    if (isInterface) {
      metadata.isInterface = true;
    }

    const fullName = this.currentClass ? `${this.currentClass}.${className}` : className;
    const classId = `${filePath}:class:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: classId,
      name: className,
      type: "class",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to package
    this.ensurePackageEntity(filePath, entities);
    relationships.push({
      from: className,
      to: this.currentPackage || "(default)",
      type: "member_of",
    });

    // Parent class relationship (for nested classes)
    if (parentId) {
      relationships.push({
        from: className,
        to: parentId,
        type: "member_of",
      });
    }

    // Parse inheritance
    const delegationSpecifiers = node.children?.find((c) => c.type === "delegation_specifiers");
    if (delegationSpecifiers) {
      for (const spec of delegationSpecifiers.children || []) {
        if (spec.type === "delegation_specifier") {
          const typeNode = spec.children?.find((c) => c.type === "user_type" || c.type === "type_identifier");
          if (typeNode) {
            const superType = typeNode.text;
            if (superType) {
              relationships.push({
                from: className,
                to: superType,
                type: "inherits",
                metadata: { superType },
              });
            }
          }
        }
      }
    }

    // Parse primary constructor parameters
    const primaryConstructor = node.children?.find((c) => c.type === "primary_constructor");
    if (primaryConstructor) {
      await this.handlePrimaryConstructor(primaryConstructor, filePath, entities, relationships, className);
    }

    // Parse class body
    const prevClass = this.currentClass;
    this.currentClass = fullName;

    const classBody = node.children?.find((c) => c.type === "class_body");
    if (classBody) {
      for (const child of classBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, className);
      }
    }

    this.currentClass = prevClass;
  }

  private async handleObject(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier" || c.type === "simple_identifier");
    const objectName = nameNode?.text || "AnonymousObject";

    const modifiers: string[] = ["object"];
    const metadata: Record<string, any> = { isSingleton: true };

    // Check for companion object
    const isCompanion = node.children?.some((c) => c.text === "companion");
    if (isCompanion) {
      modifiers.push("companion");
      metadata.isCompanionObject = true;
    }

    const fullName = this.currentClass ? `${this.currentClass}.${objectName}` : objectName;
    const objectId = `${filePath}:object:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: objectId,
      name: objectName,
      type: "class",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to package
    this.ensurePackageEntity(filePath, entities);
    relationships.push({
      from: objectName,
      to: this.currentPackage || "(default)",
      type: "member_of",
    });

    if (parentId) {
      relationships.push({
        from: objectName,
        to: parentId,
        type: "member_of",
      });
    }

    // Parse object body
    const objectBody = node.children?.find((c) => c.type === "class_body");
    if (objectBody) {
      for (const child of objectBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, objectName);
      }
    }
  }

  private async handleFunction(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "simple_identifier");
    const funcName = nameNode?.text || "anonymous";

    const modifiers: string[] = [];
    const metadata: Record<string, any> = {};

    // Extract modifiers
    for (const child of node.children || []) {
      if (child.type === "modifiers") {
        for (const mod of child.children || []) {
          if (mod.text) {
            modifiers.push(mod.text);
            if (mod.text === "suspend") metadata.isSuspend = true;
            if (mod.text === "inline") metadata.isInline = true;
          }
        }
      }
    }

    // Check for extension function
    const receiverType = node.children?.find((c) => c.type === "receiver_type");
    if (receiverType) {
      metadata.isExtension = true;
      metadata.receiverType = receiverType.text;
    }

    const fullName = this.currentClass ? `${this.currentClass}.${funcName}` : funcName;
    const funcId = `${filePath}:function:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: funcId,
      name: funcName,
      type: "method",
      filePath,
      location,
      modifiers,
      metadata,
    });

    if (parentId) {
      relationships.push({
        from: funcName,
        to: parentId,
        type: "member_of",
      });
    } else {
      // Top-level function - link to package
      this.ensurePackageEntity(filePath, entities);
      relationships.push({
        from: funcName,
        to: this.currentPackage || "(default)",
        type: "member_of",
      });
    }
  }

  private async handleProperty(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children
      ?.find((c) => c.type === "variable_declaration")
      ?.children?.find((c) => c.type === "simple_identifier");
    const propName = nameNode?.text || "property";

    const modifiers: string[] = [];
    const metadata: Record<string, any> = {};

    // Extract modifiers
    for (const child of node.children || []) {
      if (child.type === "modifiers") {
        for (const mod of child.children || []) {
          if (mod.text) {
            modifiers.push(mod.text);
            if (mod.text === "const") metadata.isConst = true;
            if (mod.text === "lateinit") metadata.isLateinit = true;
          }
        }
      }
    }

    // Check for val/var
    const valOrVar = node.children?.find((c) => c.text === "val" || c.text === "var");
    if (valOrVar) {
      metadata.mutable = valOrVar.text === "var";
    }

    const fullName = this.currentClass ? `${this.currentClass}.${propName}` : propName;
    const propId = `${filePath}:property:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: propId,
      name: propName,
      type: "property",
      filePath,
      location,
      modifiers,
      metadata,
    });

    if (parentId) {
      relationships.push({
        from: propName,
        to: parentId,
        type: "member_of",
      });
    } else {
      // Top-level property
      this.ensurePackageEntity(filePath, entities);
      relationships.push({
        from: propName,
        to: this.currentPackage || "(default)",
        type: "member_of",
      });
    }
  }

  private async handlePrimaryConstructor(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    className: string,
  ): Promise<void> {
    // class MyClass(val id: Int, var name: String)
    const params = node.children?.filter((c) => c.type === "class_parameter" || c.type === "function_value_parameter");

    for (const param of params || []) {
      const nameNode = param.children?.find((c) => c.type === "simple_identifier");
      const paramName = nameNode?.text || "param";

      const modifiers: string[] = [];
      const metadata: Record<string, any> = { isPrimaryConstructorParameter: true };

      // Check if parameter is val or var (makes it a property)
      const isProperty = param.children?.some((c) => c.text === "val" || c.text === "var");
      if (isProperty) {
        const valOrVar = param.children?.find((c) => c.text === "val" || c.text === "var");
        metadata.mutable = valOrVar?.text === "var";
        metadata.isProperty = true;

        const location = getNodeLocation(param);

        const fullPropName = this.currentClass ? `${this.currentClass}.${paramName}` : paramName;
        const propId = `${filePath}:property:${fullPropName}`;

        // Create property entity for val/var parameters
        entities.push({
          id: propId,
          name: paramName,
          type: "property",
          filePath,
          location,
          modifiers,
          metadata,
        });

        relationships.push({
          from: paramName,
          to: className,
          type: "member_of",
        });
      }
    }
  }

  private async handleImport(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): Promise<void> {
    // import com.example.Foo
    // import com.example.*
    // import com.example.Bar as Baz

    this.ensurePackageEntity(filePath, entities);

    // Helper to collect identifiers from a single import statement
    const collectIdentifiers = (n: TreeSitterNode): string[] => {
      const ids: string[] = [];
      if (n.type === "identifier" || n.type === "type_identifier") {
        ids.push(n.text || "");
      }
      for (const child of n.children || []) {
        ids.push(...collectIdentifiers(child));
      }
      return ids;
    };

    // Process each import_header separately (import_list contains multiple imports)
    const importHeaders = node.children?.filter((c) => c.type === "import_header") || [];
    for (const importHeader of importHeaders) {
      const identifiers = collectIdentifiers(importHeader);

      if (identifiers.length > 0) {
        const importPath = identifiers.join(".");
        const importId = `${filePath}:import:${importPath}`;

        const location = getNodeLocation(importHeader);

        entities.push({
          id: importId,
          name: importPath,
          type: "import",
          filePath,
          location,
          modifiers: [],
          metadata: {
            importPath,
            isWildcard: importHeader.text?.includes("*"),
          },
        });

        // Create relationship from package to import
        relationships.push({
          from: this.currentPackage || "(default)",
          to: importPath,
          type: "imports",
          metadata: { importPath },
        });
      }
    }
  }
}
