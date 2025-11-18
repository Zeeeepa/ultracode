/**
 * Swift Language Analyzer
 *
 * Analyzer for Swift language supporting:
 * - Modules and imports
 * - Classes, structs, enums
 * - Protocols (interfaces)
 * - Extensions
 * - Functions and methods
 * - Properties and computed properties
 * - Closures and higher-order functions
 * - Generic type parameters
 * - Async/await and actors
 *
 * Relationships:
 * - Class inheritance
 * - Protocol conformance
 * - Extension relationships
 * - Method calls and property access
 * - Module organization
 * - Generic type usage
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { checkCircuitBreakers, getNodeLocation } from "./base-parser-utils.js";

const MAX_RECURSION_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const PARSE_TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

export class SwiftAnalyzer {
  private recursionDepth = 0;
  private parseStartTime = 0;
  private currentModule = "";
  private currentType: string | null = null;

  /**
   * Ensure a module entity exists
   */
  private ensureModuleEntity(filePath: string, entities: ParsedEntity[]): string {
    const module = this.currentModule || "(default)";
    const moduleId = `${filePath}:module:${module}`;

    const exists = entities.some((e) => e.id === moduleId);
    if (!exists) {
      entities.push({
        id: moduleId,
        name: module,
        type: "module",
        filePath,
        location: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 0, index: 0 },
        },
        modifiers: [],
        metadata: { moduleName: module },
      });
    }

    return moduleId;
  }

  /**
   * Parse Swift source code
   */
  async analyze(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): Promise<void> {
    this.parseStartTime = Date.now();
    this.recursionDepth = 0;
    this.currentModule = filePath.split("/").slice(-2, -1)[0] || "Main";
    this.currentType = null;

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
        case "import_declaration":
          await this.handleImport(node, filePath, entities, relationships);
          break;

        case "class_declaration":
          await this.handleClass(node, filePath, entities, relationships, parentId);
          break;

        case "struct_declaration":
          await this.handleStruct(node, filePath, entities, relationships, parentId);
          break;

        case "enum_declaration":
          await this.handleEnum(node, filePath, entities, relationships, parentId);
          break;

        case "protocol_declaration":
          await this.handleProtocol(node, filePath, entities, relationships, parentId);
          break;

        case "extension_declaration":
          await this.handleExtension(node, filePath, entities, relationships, parentId);
          break;

        case "function_declaration":
          await this.handleFunction(node, filePath, entities, relationships, parentId);
          break;

        case "property_declaration":
          await this.handleProperty(node, filePath, entities, relationships, parentId);
          break;

        case "actor_declaration":
          await this.handleActor(node, filePath, entities, relationships, parentId);
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

  private async handleImport(
    _node: TreeSitterNode,
    _filePath: string,
    _entities: ParsedEntity[],
    _relationships: EntityRelationship[],
  ): Promise<void> {
    // import Foundation
    // Note: Import handling is simplified for now
    // TODO: Create import relationships when needed
  }

  private async handleClass(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier");
    const className = nameNode?.text || "AnonymousClass";

    const modifiers: string[] = [];
    const metadata: Record<string, any> = {};

    // Extract modifiers
    for (const child of node.children || []) {
      if (child.type === "modifiers" || child.type === "attribute") {
        if (child.text) modifiers.push(child.text);
      }
    }

    const fullName = this.currentType ? `${this.currentType}.${className}` : className;
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

    // Link to module
    const moduleId = this.ensureModuleEntity(filePath, entities);
    relationships.push({
      from: classId,
      to: moduleId,
      type: "member_of",
    });

    if (parentId) {
      relationships.push({
        from: classId,
        to: parentId,
        type: "member_of",
      });
    }

    // Parse inheritance and protocol conformance
    const inheritanceClause = node.children?.find((c) => c.type === "type_inheritance_clause");
    if (inheritanceClause) {
      for (const typeNode of inheritanceClause.children || []) {
        if (typeNode.type === "type_identifier" || typeNode.type === "user_type") {
          const superType = typeNode.text;
          if (superType) {
            relationships.push({
              from: classId,
              to: `${filePath}:class:${superType}`,
              type: "inherits",
              metadata: { superType },
            });
          }
        }
      }
    }

    // Parse class body
    const prevType = this.currentType;
    this.currentType = fullName;

    const classBody = node.children?.find((c) => c.type === "class_body");
    if (classBody) {
      for (const child of classBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, classId);
      }
    }

    this.currentType = prevType;
  }

  private async handleStruct(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier");
    const structName = nameNode?.text || "AnonymousStruct";

    const modifiers: string[] = ["struct"];
    const metadata: Record<string, any> = { isValueType: true };

    const fullName = this.currentType ? `${this.currentType}.${structName}` : structName;
    const structId = `${filePath}:struct:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: structId,
      name: structName,
      type: "class",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to module
    const moduleId = this.ensureModuleEntity(filePath, entities);
    relationships.push({
      from: structId,
      to: moduleId,
      type: "member_of",
    });

    if (parentId) {
      relationships.push({
        from: structId,
        to: parentId,
        type: "member_of",
      });
    }

    // Parse struct body
    const prevType = this.currentType;
    this.currentType = fullName;

    const structBody = node.children?.find((c) => c.type === "struct_body" || c.type === "class_body");
    if (structBody) {
      for (const child of structBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, structId);
      }
    }

    this.currentType = prevType;
  }

  private async handleEnum(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier");
    const enumName = nameNode?.text || "AnonymousEnum";

    const modifiers: string[] = ["enum"];
    const metadata: Record<string, any> = {};

    const fullName = this.currentType ? `${this.currentType}.${enumName}` : enumName;
    const enumId = `${filePath}:enum:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: enumId,
      name: enumName,
      type: "class",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to module
    const moduleId = this.ensureModuleEntity(filePath, entities);
    relationships.push({
      from: enumId,
      to: moduleId,
      type: "member_of",
    });

    if (parentId) {
      relationships.push({
        from: enumId,
        to: parentId,
        type: "member_of",
      });
    }

    // Parse enum body
    const enumBody = node.children?.find((c) => c.type === "enum_class_body" || c.type === "class_body");
    if (enumBody) {
      for (const child of enumBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, enumId);
      }
    }
  }

  private async handleProtocol(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    _parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier");
    const protocolName = nameNode?.text || "AnonymousProtocol";

    const modifiers: string[] = ["protocol"];
    const metadata: Record<string, any> = {};

    const fullName = this.currentType ? `${this.currentType}.${protocolName}` : protocolName;
    const protocolId = `${filePath}:protocol:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: protocolId,
      name: protocolName,
      type: "interface",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to module
    const moduleId = this.ensureModuleEntity(filePath, entities);
    relationships.push({
      from: protocolId,
      to: moduleId,
      type: "member_of",
    });

    // Parse protocol body
    const protocolBody = node.children?.find((c) => c.type === "protocol_body");
    if (protocolBody) {
      for (const child of protocolBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, protocolId);
      }
    }
  }

  private async handleExtension(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    _parentId?: string,
  ): Promise<void> {
    const typeNode = node.children?.find((c) => c.type === "type_identifier" || c.type === "simple_type");
    const extendedType = typeNode?.text || "Unknown";

    const extensionId = `${filePath}:extension:${extendedType}`;
    const metadata: Record<string, any> = { isExtension: true, extendedType };

    const location = getNodeLocation(node);

    entities.push({
      id: extensionId,
      name: `${extendedType}+Extension`,
      type: "class",
      filePath,
      location,
      modifiers: ["extension"],
      metadata,
    });

    // Link to extended type
    relationships.push({
      from: extensionId,
      to: `${filePath}:class:${extendedType}`,
      type: "inherits",
      metadata: { isExtension: true },
    });

    // Parse extension body
    const extensionBody = node.children?.find((c) => c.type === "class_body");
    if (extensionBody) {
      for (const child of extensionBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, extensionId);
      }
    }
  }

  private async handleActor(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    _parentId?: string,
  ): Promise<void> {
    const nameNode = node.children?.find((c) => c.type === "type_identifier");
    const actorName = nameNode?.text || "AnonymousActor";

    const modifiers: string[] = ["actor"];
    const metadata: Record<string, any> = { isActor: true, supportsAsync: true };

    const fullName = this.currentType ? `${this.currentType}.${actorName}` : actorName;
    const actorId = `${filePath}:actor:${fullName}`;

    const location = getNodeLocation(node);

    entities.push({
      id: actorId,
      name: actorName,
      type: "class",
      filePath,
      location,
      modifiers,
      metadata,
    });

    // Link to module
    const moduleId = this.ensureModuleEntity(filePath, entities);
    relationships.push({
      from: actorId,
      to: moduleId,
      type: "member_of",
    });

    // Parse actor body
    const actorBody = node.children?.find((c) => c.type === "class_body");
    if (actorBody) {
      for (const child of actorBody.children || []) {
        await this.traverseNode(child, filePath, entities, relationships, actorId);
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
      if (child.type === "modifiers" || child.type === "attribute") {
        if (child.text) {
          modifiers.push(child.text);
          if (child.text === "async") metadata.isAsync = true;
          if (child.text === "throws") metadata.throws = true;
        }
      }
    }

    const fullName = this.currentType ? `${this.currentType}.${funcName}` : funcName;
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
        from: funcId,
        to: parentId,
        type: "member_of",
      });
    } else {
      // Top-level function
      const moduleId = this.ensureModuleEntity(filePath, entities);
      relationships.push({
        from: funcId,
        to: moduleId,
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
      ?.find((c) => c.type === "pattern")
      ?.children?.find((c) => c.type === "simple_identifier");
    const propName = nameNode?.text || "property";

    const modifiers: string[] = [];
    const metadata: Record<string, any> = {};

    // Check for computed property
    const hasGetter = node.children?.some((c) => c.type === "getter_clause" || c.type === "computed_property");
    if (hasGetter) {
      metadata.isComputed = true;
    }

    // Check for let/var
    const isLet = node.children?.some((c) => c.text === "let");
    const isVar = node.children?.some((c) => c.text === "var");
    if (isLet) modifiers.push("let");
    if (isVar) modifiers.push("var");
    metadata.mutable = isVar;

    const fullName = this.currentType ? `${this.currentType}.${propName}` : propName;
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
        from: propId,
        to: parentId,
        type: "member_of",
      });
    } else {
      // Top-level property
      const moduleId = this.ensureModuleEntity(filePath, entities);
      relationships.push({
        from: propId,
        to: moduleId,
        type: "member_of",
      });
    }
  }
}
