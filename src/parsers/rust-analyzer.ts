/**
 * TASK-20251005185121: Rust Analyzer Module
 *
 * Comprehensive Rust code analysis following the python-analyzer.ts pattern.
 * Implements multi-layer analysis architecture:
 * Layer 1: Basic entity extraction (structs, functions, traits)
 * Layer 2: Advanced Rust features (ownership, lifetimes, macros)
 * Layer 3: Relationship mapping (trait implementations, module hierarchy)
 * Layer 4: Pattern recognition (design patterns, Rust idioms)
 *
 * Architecture References:
 * - Python Analyzer Pattern: src/parsers/python-analyzer.ts
 * - Enhanced Parser Types: src/types/parser.ts
 * - ADR-002: C# and Rust Language Support
 *
 * @task_id TASK-20251005185121
 * @adr_ref ADR-002
 * @created 2025-10-05
 */

// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import type { ASTNode, EntityRelationship, ImportDependency, ParsedEntity, PatternAnalysis } from "../types/parser.js";
import { getNodeLocation, hasChild } from "./base-parser-utils.js";

// Import from extracted modules
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
  findNodes,
  getAttributeName,
  getNodeText,
  hasBody,
  hasModifier,
  isTupleStruct,
  resolveName,
} from "./rust/ast-helpers.js";

import { identifyPatterns } from "./rust/pattern-identifier.js";

// =============================================================================
// 3. RUST ENTITY EXTRACTION (Layer 1)
// =============================================================================

export class RustAnalyzer {
  private metrics: AnalyzerMetrics = {
    entitiesExtracted: 0,
    relationshipsFound: 0,
    patternsIdentified: 0,
    parseTime: 0,
  };

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
    const startTime = Date.now();
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    const imports: ImportDependency[] = [];

    // Extract all entity types
    this.extractModules(node, entities, relationships, filePath);
    this.extractStructs(node, entities, relationships, filePath);
    this.extractEnums(node, entities, relationships, filePath);
    this.extractTraits(node, entities, relationships, filePath);
    this.extractFunctions(node, entities, filePath);
    this.extractTypeAliases(node, entities, filePath);
    this.extractConstants(node, entities, filePath);
    this.extractMacros(node, entities, filePath);
    // Handle impl blocks even if no struct node was encountered
    this.extractImplBlocksGlobal(node, entities, relationships, filePath);

    // Extract imports/use statements
    this.extractUseStatements(node, imports, filePath);

    // Identify patterns (Layer 4)
    const patterns = identifyPatterns(node, entities);

    // Update metrics
    this.metrics.entitiesExtracted = entities.length;
    this.metrics.relationshipsFound = relationships.length;
    this.metrics.patternsIdentified =
      patterns.designPatterns.length +
      patterns.exceptionHandling.length +
      patterns.contextManagers.length +
      patterns.pythonIdioms.length +
      patterns.circularDependencies.length +
      (patterns.otherPatterns?.length || 0);
    this.metrics.parseTime = Math.max(1, Date.now() - startTime);

    return { entities, relationships, imports, patterns, metrics: this.metrics };
  }

  /**
   * Extract module declarations
   */
  private extractModules(
    node: ASTNode,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const moduleNodes = findNodes(node, "mod_item");

    for (const modNode of moduleNodes) {
      const name = resolveName(modNode);
      if (!name) continue;
      const location = getNodeLocation(modNode);
      const visibility = extractVisibility(modNode);
      const isInline = hasBody(modNode);

      entities.push({
        id: `${filePath}:module:${name}`,
        name,
        type: "module",
        filePath,
        location,
        metadata: {
          visibility,
          isInline,
        },
      });

      // If module has a body, extract nested items
      if (isInline) {
        const body = modNode.childForFieldName("body");
        if (body) {
          const nestedCount = countNestedItems(body);
          relationships.push({
            from: `${filePath}:module:${name}`,
            to: filePath,
            type: "contains",
            sourceFile: filePath,
            metadata: { line: location.start.line, nestedItems: nestedCount },
          });
        }
      }
    }
  }

  /**
   * Extract struct declarations
   */
  private extractStructs(
    node: ASTNode,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const structNodes = findNodes(node, "struct_item");

    for (const structNode of structNodes) {
      const name = resolveName(structNode);
      if (!name) continue;
      const location = getNodeLocation(structNode);
      const visibility = extractVisibility(structNode);
      const generics = extractGenerics(structNode);
      const lifetimes = extractLifetimes(structNode);
      const derives = extractDerives(structNode);
      const fields = this.extractStructFields(structNode, name, entities, filePath);

      // Determine struct type
      const isTuple = isTupleStruct(structNode);
      const isUnit = fields.length === 0 && !isTuple;

      entities.push({
        id: `${filePath}:struct:${name}`,
        name,
        type: "struct",
        filePath,
        location,
        metadata: {
          visibility,
          generics,
          lifetimes,
          derives,
          fieldCount: fields.length,
          isTuple,
          isUnit,
          rustType: "struct",
        },
      });

      // Extract trait implementations for this struct
      this.extractImplBlocks(node, name, entities, relationships, filePath);
    }
  }

  /**
   * Extract enum declarations
   */
  private extractEnums(
    node: ASTNode,
    entities: ParsedEntity[],
    _relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const enumNodes = findNodes(node, "enum_item");

    for (const enumNode of enumNodes) {
      const name = resolveName(enumNode);
      if (!name) continue;
      const location = getNodeLocation(enumNode);
      const visibility = extractVisibility(enumNode);
      const generics = extractGenerics(enumNode);
      const lifetimes = extractLifetimes(enumNode);
      const derives = extractDerives(enumNode);
      const variants = this.extractEnumVariants(enumNode, name, entities, filePath);

      entities.push({
        id: `${filePath}:enum:${name}`,
        name,
        type: "enum",
        filePath,
        location,
        metadata: {
          visibility,
          generics,
          lifetimes,
          derives,
          variants,
          variantCount: variants.length,
          rustType: "enum",
        },
      });
    }
  }

  /**
   * Extract trait declarations
   */
  private extractTraits(
    node: ASTNode,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const traitNodes = findNodes(node, "trait_item");

    for (const traitNode of traitNodes) {
      const name = resolveName(traitNode);
      if (!name) continue;
      const location = getNodeLocation(traitNode);
      const visibility = extractVisibility(traitNode);
      const generics = extractGenerics(traitNode);
      const bounds = extractTraitBounds(traitNode);
      const supertraits = extractSupertraits(traitNode);

      // Extract trait methods
      const methods = this.extractTraitMethods(traitNode, name, entities, filePath);
      const associatedTypes = this.extractAssociatedTypes(traitNode, name, entities, filePath);

      entities.push({
        id: `${filePath}:trait:${name}`,
        name,
        type: "trait",
        filePath,
        location,
        metadata: {
          visibility,
          generics,
          bounds,
          supertraits,
          methodCount: methods.length,
          associatedTypeCount: associatedTypes.length,
          rustType: "trait",
        },
      });

      // Create relationships for supertraits
      for (const supertrait of supertraits) {
        relationships.push({
          from: `${filePath}:trait:${name}`,
          to: `${filePath}:trait:${supertrait}`,
          type: "inherits",
          sourceFile: filePath,
        });
      }
    }
  }

  /**
   * Extract function declarations
   */
  private extractFunctions(node: ASTNode, entities: ParsedEntity[], filePath: string): void {
    const functionNodes = findNodes(node, "function_item");

    for (const fnNode of functionNodes) {
      const name = resolveName(fnNode);
      if (!name) continue;
      const location = getNodeLocation(fnNode);
      const visibility = extractVisibility(fnNode);
      const isAsync = hasModifier(fnNode, "async");
      const isConst = hasModifier(fnNode, "const");
      const isUnsafe = hasModifier(fnNode, "unsafe");
      const generics = extractGenerics(fnNode);
      const lifetimes = extractLifetimes(fnNode);
      const parameters = extractFunctionParameters(fnNode);
      const returnType = extractReturnType(fnNode);

      entities.push({
        id: `${filePath}:function:${name}`,
        name,
        type: "function",
        filePath,
        location,
        metadata: {
          visibility,
          isAsync,
          isConst,
          isUnsafe,
          generics,
          lifetimes,
          parameters,
          returnType,
          rustType: "function",
        },
      });
    }
  }

  /**
   * Extract type aliases
   */
  private extractTypeAliases(node: ASTNode, entities: ParsedEntity[], filePath: string): void {
    const typeNodes = findNodes(node, "type_item");

    for (const typeNode of typeNodes) {
      const name = resolveName(typeNode);
      if (!name) continue;
      const location = getNodeLocation(typeNode);
      const visibility = extractVisibility(typeNode);
      const generics = extractGenerics(typeNode);
      const aliasedType = extractAliasedType(typeNode);

      entities.push({
        id: `${filePath}:type:${name}`,
        name,
        type: "typedef",
        filePath,
        location,
        metadata: {
          visibility,
          generics,
          aliasedType,
          rustType: "type_alias",
        },
      });
    }
  }

  /**
   * Extract constants
   */
  private extractConstants(node: ASTNode, entities: ParsedEntity[], filePath: string): void {
    // Extract const items
    const constNodes = findNodes(node, "const_item");
    for (const constNode of constNodes) {
      const name = resolveName(constNode);
      if (!name) continue;
      const location = getNodeLocation(constNode);
      const visibility = extractVisibility(constNode);
      const constType = extractConstType(constNode);

      entities.push({
        id: `${filePath}:const:${name}`,
        name,
        type: "constant",
        filePath,
        location,
        metadata: {
          visibility,
          constType,
          isConst: true,
          rustType: "const",
        },
      });
    }

    // Extract static items
    const staticNodes = findNodes(node, "static_item");
    for (const staticNode of staticNodes) {
      const name = resolveName(staticNode);
      if (!name) continue;
      const location = getNodeLocation(staticNode);
      const visibility = extractVisibility(staticNode);
      const staticType = extractStaticType(staticNode);
      const isMutable = hasModifier(staticNode, "mut");

      entities.push({
        id: `${filePath}:static:${name}`,
        name,
        type: "variable", // Map static to variable for compatibility
        filePath,
        location,
        metadata: {
          visibility,
          staticType,
          isMutable,
          isStatic: true,
          rustType: "static",
        },
      });
    }
  }

  /**
   * Extract macro definitions
   */
  private extractMacros(node: ASTNode, entities: ParsedEntity[], filePath: string): void {
    // Extract macro_rules! definitions
    const macroRulesNodes = findNodes(node, "macro_definition");
    for (const macroNode of macroRulesNodes) {
      const name = resolveName(macroNode);
      if (!name) continue;
      const location = getNodeLocation(macroNode);
      const visibility = extractVisibility(macroNode);
      const rules = extractMacroRules(macroNode);

      entities.push({
        id: `${filePath}:macro:${name}`,
        name,
        type: "macro",
        filePath,
        location,
        metadata: {
          visibility,
          macroType: "macro_rules",
          ruleCount: rules.length,
          rustType: "macro",
        },
      });
    }

    // Extract proc macros (attribute, derive, function-like)
    const procMacroNodes = findNodes(node, "attribute_item").filter((attr) => {
      const name = getAttributeName(attr);
      return name === "proc_macro" || name === "proc_macro_derive" || name === "proc_macro_attribute";
    });

    for (const procMacro of procMacroNodes) {
      const parent = procMacro.parent;
      if (!parent) continue;

      const nameNode = parent.childForFieldName("name");
      if (!nameNode) continue;

      const name = getNodeText(nameNode);
      const location = getNodeLocation(parent);
      const macroType = getAttributeName(procMacro);

      entities.push({
        id: `${filePath}:proc_macro:${name}`,
        name,
        type: "macro",
        filePath,
        location,
        metadata: {
          macroType,
          isProcMacro: true,
          rustType: "proc_macro",
        },
      });
    }
  }

  /**
   * Extract struct fields
   */
  private extractStructFields(
    structNode: ASTNode,
    structName: string,
    entities: ParsedEntity[],
    filePath: string,
  ): ParsedEntity[] {
    const fields: ParsedEntity[] = [];
    const body = structNode.childForFieldName("body");

    if (body) {
      const fieldNodes = findNodes(body, "field_declaration");
      for (const fieldNode of fieldNodes) {
        const nameNode = fieldNode.childForFieldName("name");
        if (!nameNode) continue;

        const name = getNodeText(nameNode);
        const location = getNodeLocation(fieldNode);
        const visibility = extractVisibility(fieldNode);
        const fieldType = extractFieldType(fieldNode);
        const attributes = extractAttributes(fieldNode);

        const field: ParsedEntity = {
          id: `${filePath}:struct:${structName}:field:${name}`,
          name,
          type: "field",
          filePath,
          location,
          metadata: {
            structName,
            fieldType,
            visibility,
            attributes,
            rustType: "field",
          },
        };

        fields.push(field);
        entities.push(field);
      }
    }

    return fields;
  }

  /**
   * Extract enum variants
   */
  private extractEnumVariants(
    enumNode: ASTNode,
    enumName: string,
    entities: ParsedEntity[],
    filePath: string,
  ): string[] {
    const variants: string[] = [];
    const body = enumNode.childForFieldName("body");

    if (body) {
      const variantNodes = findNodes(body, "enum_variant");
      for (const variantNode of variantNodes) {
        const name = resolveName(variantNode);
        if (!name) continue;
        const location = getNodeLocation(variantNode);

        // Check variant type
        const hasFields = hasChild(variantNode, "field_declaration_list");
        const hasTuple = hasChild(variantNode, "ordered_field_declaration_list");
        const discriminant = extractDiscriminant(variantNode);

        variants.push(name);

        entities.push({
          id: `${filePath}:enum:${enumName}:variant:${name}`,
          name,
          type: "enum_variant",
          filePath,
          location,
          metadata: {
            enumName,
            hasFields,
            hasTuple,
            discriminant,
            rustType: "enum_variant",
          },
        });
      }
    }

    return variants;
  }

  /**
   * Extract trait methods
   */
  private extractTraitMethods(
    traitNode: ASTNode,
    traitName: string,
    entities: ParsedEntity[],
    filePath: string,
  ): ParsedEntity[] {
    const methods: ParsedEntity[] = [];
    const body = traitNode.childForFieldName("body");

    if (body) {
      const methodNodes = findNodes(body, "function_signature_item");
      const defaultMethodNodes = findNodes(body, "function_item");

      // Abstract methods (signatures only)
      for (const methodNode of methodNodes) {
        const nameNode = methodNode.childForFieldName("name");
        if (!nameNode) continue;

        const name = getNodeText(nameNode);
        const location = getNodeLocation(methodNode);
        const parameters = extractFunctionParameters(methodNode);
        const returnType = extractReturnType(methodNode);

        const method: ParsedEntity = {
          id: `${filePath}:trait:${traitName}:method:${name}`,
          name,
          type: "method",
          filePath,
          location,
          metadata: {
            traitName,
            parameters,
            returnType,
            isAbstract: true,
            hasDefaultImpl: false,
            rustType: "trait_method",
          },
        };

        methods.push(method);
        entities.push(method);
      }

      // Default implementations
      for (const methodNode of defaultMethodNodes) {
        const nameNode = methodNode.childForFieldName("name");
        if (!nameNode) continue;

        const name = getNodeText(nameNode);
        const location = getNodeLocation(methodNode);
        const parameters = extractFunctionParameters(methodNode);
        const returnType = extractReturnType(methodNode);

        const method: ParsedEntity = {
          id: `${filePath}:trait:${traitName}:method:${name}`,
          name,
          type: "method",
          filePath,
          location,
          metadata: {
            traitName,
            parameters,
            returnType,
            isAbstract: false,
            hasDefaultImpl: true,
            rustType: "trait_method",
          },
        };

        methods.push(method);
        entities.push(method);
      }
    }

    return methods;
  }

  /**
   * Extract associated types
   */
  private extractAssociatedTypes(
    traitNode: ASTNode,
    traitName: string,
    entities: ParsedEntity[],
    filePath: string,
  ): ParsedEntity[] {
    const types: ParsedEntity[] = [];
    const body = traitNode.childForFieldName("body");

    if (body) {
      const typeNodes = findNodes(body, "associated_type");
      for (const typeNode of typeNodes) {
        const nameNode = typeNode.childForFieldName("name");
        if (!nameNode) continue;

        const name = getNodeText(nameNode);
        const location = getNodeLocation(typeNode);
        const bounds = extractTypeBounds(typeNode);

        const associatedType: ParsedEntity = {
          id: `${filePath}:trait:${traitName}:type:${name}`,
          name,
          type: "typedef", // Map associated type to typedef for compatibility
          filePath,
          location,
          metadata: {
            traitName,
            bounds,
            rustType: "associated_type",
          },
        };

        types.push(associatedType);
        entities.push(associatedType);
      }
    }

    return types;
  }

  /**
   * Extract impl blocks for a type
   */
  private extractImplBlocks(
    node: ASTNode,
    typeName: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const implNodes = findNodes(node, "impl_item");

    for (const implNode of implNodes) {
      const typeNode = implNode.childForFieldName("type");
      if (!typeNode) continue;

      const implType = getNodeText(typeNode);
      if (!implType.includes(typeName)) continue;

      // Check if it's a trait implementation
      const traitNode = implNode.childForFieldName("trait");
      if (traitNode) {
        const traitName = getNodeText(traitNode);

        relationships.push({
          from: `${filePath}:struct:${typeName}`,
          to: `${filePath}:trait:${traitName}`,
          type: "implements",
          sourceFile: filePath,
        });

        // Extract implemented methods
        const body = implNode.childForFieldName("body");
        if (body) {
          const methods = findNodes(body, "function_item");
          for (const method of methods) {
            const nameNode = method.childForFieldName("name");
            if (!nameNode) continue;

            const methodName = getNodeText(nameNode);
            const location = getNodeLocation(method);

            entities.push({
              id: `${filePath}:impl:${typeName}:${traitName}:${methodName}`,
              name: methodName,
              type: "method",
              filePath,
              location,
              metadata: {
                implType: typeName,
                traitName,
                isTraitImpl: true,
                rustType: "impl_method",
              },
            });
          }
        }
      } else {
        // Inherent implementation
        const body = implNode.childForFieldName("body");
        if (body) {
          const methods = findNodes(body, "function_item");
          for (const method of methods) {
            const nameNode = method.childForFieldName("name");
            if (!nameNode) continue;

            const methodName = getNodeText(nameNode);
            const location = getNodeLocation(method);
            const visibility = extractVisibility(method);

            entities.push({
              id: `${filePath}:impl:${typeName}:${methodName}`,
              name: methodName,
              type: "method",
              filePath,
              location,
              metadata: {
                implType: typeName,
                visibility,
                isInherent: true,
                rustType: "impl_method",
              },
            });
          }
        }
      }
    }
  }

  /**
   * Extract impl blocks globally (even when no struct node provided)
   */
  private extractImplBlocksGlobal(
    node: ASTNode,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    filePath: string,
  ): void {
    const implNodes = findNodes(node, "impl_item");
    for (const implNode of implNodes) {
      const typeNode = implNode.childForFieldName("type");
      const traitNode = implNode.childForFieldName("trait");
      const typeName = typeNode ? getNodeText(typeNode) : undefined;
      const traitName = traitNode ? getNodeText(traitNode) : undefined;

      // Relationship for trait impl
      if (typeName && traitName) {
        relationships.push({
          from: `${filePath}:struct:${typeName}`,
          to: `${filePath}:trait:${traitName}`,
          type: "implements",
          sourceFile: filePath,
        });
      }

      const body = implNode.childForFieldName("body");
      if (body) {
        const methods = findNodes(body, "function_item");
        for (const method of methods) {
          const nameNode = method.childForFieldName("name");
          if (!nameNode) continue;
          const methodName = getNodeText(nameNode);
          const location = getNodeLocation(method);

          entities.push({
            id: `${filePath}:impl:${typeName || "unknown"}:${traitName || "inherent"}:${methodName}`,
            name: methodName,
            type: "method",
            filePath,
            location,
            metadata: {
              implType: typeName || "",
              traitName,
              isTraitImpl: Boolean(traitName),
              isInherent: !traitName,
              rustType: "impl_method",
            },
          });
        }
      }
    }
  }

  /**
   * Extract use statements (imports)
   */
  private extractUseStatements(node: ASTNode, importsList: ImportDependency[], filePath: string): void {
    const useNodes = findNodes(node, "use_declaration");

    for (const useNode of useNodes) {
      const visibility = extractVisibility(useNode);
      const importPaths = extractUseTree(useNode);
      const line = useNode.startPosition.row + 1;

      for (const full of importPaths) {
        const isWildcard = full.endsWith("::*");
        const path = isWildcard ? full.slice(0, -3) : full;
        const parts = path.split("::").filter(Boolean);

        let targetModule = path;
        let symbolName = "*";

        if (!isWildcard && parts.length > 1) {
          symbolName = parts[parts.length - 1] || "*";
          targetModule = parts.slice(0, -1).join("::");
        } else if (!isWildcard && parts.length === 1) {
          targetModule = "";
          symbolName = parts[0] || "*";
        }

        const importType: ImportDependency["importType"] =
          full.startsWith("self::") || full.startsWith("super::") ? "relative" : "absolute";

        importsList.push({
          sourceFile: filePath,
          targetModule: targetModule || path,
          importType,
          symbols: [{ name: symbolName }],
          line,
          isUsed: false,
          usageLocations: [],
          type: "use",
          metadata: { visibility },
        });
      }
    }

    // Extract extern crate declarations
    const externNodes = findNodes(node, "extern_crate_declaration");
    for (const externNode of externNodes) {
      const nameNode = externNode.childForFieldName("name");
      if (!nameNode) continue;

      const name = getNodeText(nameNode);
      const line = externNode.startPosition.row + 1;
      importsList.push({
        sourceFile: filePath,
        targetModule: name,
        importType: "absolute",
        symbols: [{ name }],
        line,
        isUsed: false,
        usageLocations: [],
        type: "extern_crate",
        metadata: { isExternCrate: true },
      });
    }
  }
}

// Export default instance
export default new RustAnalyzer();

type AnalyzerMetrics = {
  entitiesExtracted: number;
  relationshipsFound: number;
  patternsIdentified: number;
  parseTime: number;
};
