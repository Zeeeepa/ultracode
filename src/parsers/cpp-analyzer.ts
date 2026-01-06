/**
 * TASK-20251005191500: C++ Language Analyzer
 *
 * Analyzer for C++ language supporting:
 * Phase 3 - Core C++ features:
 * - Classes (with access modifiers: public, private, protected, abstract, final)
 * - Methods (const, static, virtual, override, final, noexcept)
 * - Constructors and Destructors
 * - Namespaces
 * - Member variables and constants
 * - Operator overloading (basic)
 * - Single and multiple inheritance
 * - Friend declarations
 *
 * Phase 4 - Limited Template Support:
 * - Simple template class definitions
 * - Simple template function definitions
 * - Template parameter extraction
 * - Skips complex metaprogramming (SFINAE, variadic templates)
 *
 * Implementation uses semantic layer with lazy evaluation pattern
 * and comprehensive circuit breakers for safety.
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

// Circuit breaker constants
const MAX_RECURSION_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const PARSE_TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;
const MAX_COMPLEXITY_SCORE = PARSER_CONSTANTS.COMPLEXITY_THRESHOLD;
const MAX_TEMPLATE_DEPTH = 10;

// Complexity scoring for templates
interface ComplexityScore {
  templateDepth: number;
  nestedClasses: number;
  inheritanceDepth: number;
  operatorCount: number;
  total: number;
}

export class CppAnalyzer {
  private recursionDepth = 0;
  private parseStartTime = 0;
  private templateDepth = 0;
  private complexityScore: ComplexityScore = {
    templateDepth: 0,
    nestedClasses: 0,
    inheritanceDepth: 0,
    operatorCount: 0,
    total: 0,
  };

  // Memoization cache for template patterns
  private templateCache = new Map<string, ParsedEntity>();

  /**
   * Main entry point for analyzing C++ code
   */
  async analyze(
    rootNode: ASTNode,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    this.resetState();

    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    try {
      // Phase 1: Syntactic extraction from CST
      this.extractEntities(rootNode, filePath, entities, relationships);

      // Phase 2: Build semantic graph with lazy evaluation
      this.buildSemanticGraph(entities, relationships);
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        log.w("CPPANALYZER", "circuit_break", { file: filePath, err: error.message });
      } else {
        log.e("CPPANALYZER", "analyze_err", { file: filePath, err: String(error) });
      }
      // Return partial results on error
    }

    return { entities, relationships };
  }

  /**
   * Reset analyzer state for new file
   */
  private resetState(): void {
    this.recursionDepth = 0;
    this.parseStartTime = Date.now();
    this.templateDepth = 0;
    this.complexityScore = {
      templateDepth: 0,
      nestedClasses: 0,
      inheritanceDepth: 0,
      operatorCount: 0,
      total: 0,
    };
    this.templateCache.clear();
  }

  /**
   * Check circuit breakers
   */
  private checkCircuitBreakers(): void {
    // Recursion depth check
    if (this.recursionDepth > MAX_RECURSION_DEPTH) {
      throw new CircuitBreakerError(`Maximum recursion depth ${MAX_RECURSION_DEPTH} exceeded`);
    }

    // Timeout check
    const elapsedTime = Date.now() - this.parseStartTime;
    if (elapsedTime > PARSE_TIMEOUT_MS) {
      throw new CircuitBreakerError(`Parse timeout ${PARSE_TIMEOUT_MS}ms exceeded`);
    }

    // Complexity score check
    this.complexityScore.total =
      this.complexityScore.templateDepth * 10 +
      this.complexityScore.nestedClasses * 5 +
      this.complexityScore.inheritanceDepth * 3 +
      this.complexityScore.operatorCount * 2;

    if (this.complexityScore.total > MAX_COMPLEXITY_SCORE) {
      throw new CircuitBreakerError(
        `Complexity score ${this.complexityScore.total} exceeds limit ${MAX_COMPLEXITY_SCORE}`,
      );
    }

    // Template depth check
    if (this.templateDepth > MAX_TEMPLATE_DEPTH) {
      throw new CircuitBreakerError(`Template depth ${this.templateDepth} exceeds limit ${MAX_TEMPLATE_DEPTH}`);
    }
  }

  /**
   * Extract entities from the CST
   */
  private extractEntities(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string = "",
  ): void {
    this.recursionDepth++;
    this.checkCircuitBreakers();

    try {
      switch (node.type) {
        case "translation_unit":
          // Root node - process all children
          for (const child of node.children) {
            this.extractEntities(child, filePath, entities, relationships, namespace);
          }
          break;

        case "namespace_definition":
          this.extractNamespace(node, filePath, entities, relationships, namespace);
          break;

        case "class_specifier":
        case "struct_specifier":
          this.extractClass(node, filePath, entities, relationships, namespace);
          break;

        case "function_definition":
          this.extractFunction(node, filePath, entities, relationships, namespace, false);
          break;

        case "template_declaration":
          this.extractTemplate(node, filePath, entities, relationships, namespace);
          break;

        case "using_declaration":
        case "using_directive":
        case "alias_declaration":
          this.extractUsing(node, filePath, entities, relationships, namespace);
          break;

        case "enum_specifier":
          this.extractEnum(node, filePath, entities, relationships, namespace);
          break;

        case "declaration":
          // Process declarations that might contain classes, functions, etc.
          for (const child of node.children) {
            this.extractEntities(child, filePath, entities, relationships, namespace);
          }
          break;

        default:
          // Recursively process other node types
          for (const child of node.children) {
            if (child.type !== "comment" && child.type !== "preproc_include") {
              this.extractEntities(child, filePath, entities, relationships, namespace);
            }
          }
      }
    } finally {
      this.recursionDepth--;
    }
  }

  /**
   * Extract namespace entities
   */
  private extractNamespace(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentNamespace: string = "",
  ): void {
    const nameNode = node.childForFieldName("name");
    const bodyNode = node.childForFieldName("body");

    if (nameNode && bodyNode) {
      const namespaceName = nameNode.text;
      const fullName = parentNamespace ? `${parentNamespace}::${namespaceName}` : namespaceName;

      const entity: ParsedEntity = {
        name: fullName,
        type: "module",
        location: getNodeLocation(node),
        modifiers: ["namespace"],
      };

      entities.push(entity);

      // Process namespace contents
      for (const child of bodyNode.children) {
        this.extractEntities(child, filePath, entities, relationships, fullName);
      }
    }
  }

  /**
   * Extract class/struct entities
   */
  private extractClass(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string,
  ): void {
    const nameNode = node.childForFieldName("name");
    const bodyNode = node.childForFieldName("body");

    if (!nameNode) return;

    const className = nameNode.text;
    const fullName = namespace ? `${namespace}::${className}` : className;

    // Track nested class complexity
    if (namespace.includes("::")) {
      this.complexityScore.nestedClasses++;
    }

    // Collect modifiers for the class
    const modifiers: string[] = [];
    if (node.type === "struct_specifier") modifiers.push("struct");
    if (isAbstractClass(node)) modifiers.push("abstract");
    if (isFinalClass(node)) modifiers.push("final");

    const entity: ParsedEntity = {
      name: fullName,
      type: "class",
      location: getNodeLocation(node),
      modifiers,
    };

    entities.push(entity);

    // Extract base classes (inheritance)
    const baseList = node.childForFieldName("base_class_clause");
    if (baseList) {
      this.extractInheritance(baseList, fullName, relationships, filePath);
    }

    // Process class body
    if (bodyNode) {
      this.extractClassMembers(bodyNode, fullName, filePath, entities, relationships);
    }
  }

  /**
   * Extract class members (methods, fields, etc.)
   */
  private extractClassMembers(
    bodyNode: ASTNode,
    className: string,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    let currentAccessSpecifier = "private"; // Default for class, "public" for struct

    for (const child of bodyNode.children) {
      switch (child.type) {
        case "access_specifier": {
          // Update current access level
          const specifierNode = child.firstChild;
          if (specifierNode) {
            currentAccessSpecifier = specifierNode.text.replace(":", "");
          }
          break;
        }

        case "field_declaration":
          this.extractField(child, className, filePath, entities, relationships, currentAccessSpecifier);
          break;

        case "friend_declaration":
          this.extractFriend(child, className, relationships, filePath);
          break;

        case "using_declaration":
          // Handle using declarations within class
          this.extractUsing(child, filePath, entities, relationships, className);
          break;

        case "template_declaration":
          // Member templates
          this.templateDepth++;
          if (this.templateDepth <= MAX_TEMPLATE_DEPTH) {
            this.extractTemplate(child, filePath, entities, relationships, className);
          }
          this.templateDepth--;
          break;

        case "function_definition":
          this.extractMethod(child, className, filePath, entities, relationships, currentAccessSpecifier);
          break;

        case "function_declaration":
          this.extractMethod(child, className, filePath, entities, relationships, currentAccessSpecifier);
          break;

        case "declaration":
          // Process nested declarations
          for (const decl of child.children) {
            if (decl.type === "function_definition" || decl.type === "function_declaration") {
              this.extractMethod(decl, className, filePath, entities, relationships, currentAccessSpecifier);
            } else if (decl.type === "field_declaration") {
              this.extractField(decl, className, filePath, entities, relationships, currentAccessSpecifier);
            }
          }
          break;
      }
    }
  }

  /**
   * Extract method/function entities
   */
  private extractMethod(
    node: ASTNode,
    className: string,
    _filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    accessSpecifier: string = "public",
  ): void {
    const declaratorNode = node.childForFieldName("declarator");
    if (!declaratorNode) return;
    let functionName = extractFunctionName(declaratorNode);
    if (!functionName) return;
    functionName = canonicalizeOperatorName(functionName, node);
    const fullName = `${className}::${functionName}`;

    // Check for operator overloading
    const isOperator = functionName.startsWith("operator");
    if (isOperator) {
      this.complexityScore.operatorCount++;
    }

    // Check for special methods
    const isConstructor = functionName === className.split("::").pop();
    const isDestructor = functionName.startsWith("~");

    // Extract method qualifiers
    const qualifiers = extractMethodQualifiers(node);

    // Collect modifiers
    const modifiers: string[] = [];
    if (accessSpecifier !== "public") modifiers.push(accessSpecifier);
    if (qualifiers.isStatic) modifiers.push("static");
    if (qualifiers.isConst) modifiers.push("const");
    if (qualifiers.isVirtual) modifiers.push("virtual");
    if (qualifiers.isOverride) modifiers.push("override");
    if (qualifiers.isFinal) modifiers.push("final");
    if (qualifiers.isNoexcept) modifiers.push("noexcept");
    if (isOperator) modifiers.push("operator");

    // Determine the correct type for ParsedEntity
    let entityType: ParsedEntity["type"] = "method";
    if (isConstructor || isDestructor) {
      entityType = "method"; // No specific constructor/destructor in the type union
    }

    const entity: ParsedEntity = {
      name: fullName,
      type: entityType,
      location: getNodeLocation(node),
      modifiers,
    };
    entities.push(entity);

    // Create relationship to parent class
    relationships.push({
      from: fullName,
      to: className,
      type: "contains",
    });
  }

  /**
   * Extract field/member variable entities
   */
  private extractField(
    node: ASTNode,
    className: string,
    _filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    accessSpecifier: string,
  ): void {
    const declaratorNode = node.childForFieldName("declarator");
    if (!declaratorNode) return;

    const fieldName = extractFieldName(declaratorNode);
    if (!fieldName) return;

    const fullName = `${className}::${fieldName}`;

    // Check if it's static or const
    const isStatic = node.text.includes("static");
    const isConst = node.text.includes("const");
    const isMutable = node.text.includes("mutable");

    // Collect modifiers
    const modifiers: string[] = [];
    if (accessSpecifier !== "public") modifiers.push(accessSpecifier);
    if (isStatic) modifiers.push("static");
    if (isConst) modifiers.push("const");
    if (isMutable) modifiers.push("mutable");

    const entity: ParsedEntity = {
      name: fullName,
      type: "property", // Using 'property' for fields
      location: getNodeLocation(node),
      modifiers,
    };

    entities.push(entity);

    // Create relationship to parent class
    relationships.push({
      from: fullName,
      to: className,
      type: "contains",
    });
  }

  /**
   * Extract function entities (non-member functions)
   */
  private extractFunction(
    node: ASTNode,
    _filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string,
    isTemplate: boolean = false,
  ): void {
    const declaratorNode = node.childForFieldName("declarator");
    if (!declaratorNode) return;

    let functionName = extractFunctionName(declaratorNode);
    if (!functionName) return;

    functionName = canonicalizeOperatorName(functionName, node);

    const fullName = namespace ? `${namespace}::${functionName}` : functionName;

    // Collect modifiers
    const modifiers: string[] = [];
    if (isTemplate) modifiers.push("template");
    if (node.text.includes("inline")) modifiers.push("inline");
    if (node.text.includes("extern")) modifiers.push("extern");

    const entity: ParsedEntity = {
      name: fullName,
      type: "function",
      location: getNodeLocation(node),
      modifiers,
    };

    entities.push(entity);

    // If in namespace, create relationship
    if (namespace) {
      relationships.push({
        from: fullName,
        to: namespace,
        type: "contains",
      });
    }
  }

  /**
   * Extract template entities (Phase 4 - Limited support)
   */
  private extractTemplate(
    node: ASTNode,
    _filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string,
  ): void {
    this.templateDepth++;
    this.complexityScore.templateDepth++;

    if (this.templateDepth > MAX_TEMPLATE_DEPTH) {
      log.w("CPPANALYZER", "tpl_too_deep", { depth: this.templateDepth });
      this.templateDepth--;
      return;
    }

    const parametersNode = node.childForFieldName("parameters");
    const declarationNode = node.children.find(
      (child) =>
        child.type === "class_specifier" || child.type === "struct_specifier" || child.type === "function_definition",
    );

    if (!declarationNode) {
      this.templateDepth--;
      return;
    }

    const templateParams = extractTemplateParameters(parametersNode);

    if (isComplexTemplate(templateParams, node.text)) {
      log.w("CPPANALYZER", "tpl_complex");
      this.templateDepth--;
      return;
    }

    // Build declaration name for cache key (avoid collisions like two different functions with same template params)
    let declName = "";
    if (declarationNode.type === "function_definition") {
      const d = declarationNode.childForFieldName("declarator");
      declName = extractFunctionName(d) || "";
    } else if (declarationNode.type === "class_specifier" || declarationNode.type === "struct_specifier") {
      const n = declarationNode.childForFieldName("name");
      declName = n?.text || "";
    }

    // Generate cache key for memoization with declaration name
    const cacheKey = `${namespace}::${declarationNode.type}::${declName}::${templateParams}`;

    if (this.templateCache.has(cacheKey)) {
      const cached = this.templateCache.get(cacheKey);
      if (cached) entities.push(cached);
      this.templateDepth--;
      return;
    }

    if (declarationNode.type === "class_specifier" || declarationNode.type === "struct_specifier") {
      this.extractClass(declarationNode, _filePath, entities, relationships, namespace);
      const classNameNode = declarationNode.childForFieldName("name");
      const declNameSafe = classNameNode?.text || declName;
      const targetName = namespace ? `${namespace}::${declNameSafe}` : declNameSafe;
      this.markEntityAsTemplate(entities, targetName, templateParams, cacheKey);
    } else if (declarationNode.type === "function_definition") {
      this.extractFunction(declarationNode, _filePath, entities, relationships, namespace, true);
      const targetName = namespace ? `${namespace}::${declName}` : declName;
      this.markEntityAsTemplate(entities, targetName, templateParams, cacheKey);
    }

    this.templateDepth--;
  }

  /**
   * Safely mark the last entity as a template and put into cache
   */

  private markEntityAsTemplate(
    entities: ParsedEntity[],
    targetName: string,
    templateParams: string,
    cacheKey: string,
  ): void {
    const ent = [...entities].reverse().find((e) => e.name === targetName);
    if (!ent) return;
    ent.modifiers = ent.modifiers || [];
    if (!ent.modifiers.includes("template")) {
      ent.modifiers.push("template");
    }
    if (templateParams) {
      const flag = `template<${templateParams}>`;
      if (!ent.modifiers.includes(flag)) ent.modifiers.push(flag);
    }
    this.templateCache.set(cacheKey, ent);
  }

  /**
   * Extract using declarations and directives
   */
  private extractUsing(
    node: ASTNode,
    _filePath: string,
    _entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string,
  ): void {
    // Extract the name being used
    const nameNode = node.children.find(
      (child) => child.type === "qualified_identifier" || child.type === "identifier",
    );

    if (nameNode) {
      const targetName = nameNode.text;

      // Create a using relationship
      if (namespace) {
        relationships.push({
          from: namespace,
          to: targetName,
          type: "references",
        });
      }
    }
  }

  /**
   * Extract enum entities
   */
  private extractEnum(
    node: ASTNode,
    _filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    namespace: string,
  ): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const enumName = nameNode.text;
    const fullName = namespace ? `${namespace}::${enumName}` : enumName;

    // Collect modifiers
    const modifiers: string[] = [];
    if (node.text.includes("class") || node.text.includes("struct")) {
      modifiers.push("scoped");
    }

    const entity: ParsedEntity = {
      name: fullName,
      type: "enum", // This is a valid type in ParsedEntity
      location: getNodeLocation(node),
      modifiers,
    };

    entities.push(entity);

    // Extract enum values
    const bodyNode = node.childForFieldName("body");
    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === "enumerator") {
          const enumeratorName = child.childForFieldName("name");
          if (enumeratorName) {
            const valueName = `${fullName}::${enumeratorName.text}`;
            entities.push({
              name: valueName,
              type: "constant", // Using 'constant' for enum values
              location: getNodeLocation(child),
              modifiers: ["enum_value"],
            });

            relationships.push({
              from: valueName,
              to: fullName,
              type: "contains",
            });
          }
        }
      }
    }
  }

  /**
   * Extract inheritance relationships
   */
  private extractInheritance(
    baseListNode: ASTNode,
    derivedClass: string,
    relationships: EntityRelationship[],
    _filePath: string,
  ): void {
    let inheritanceDepth = 0;

    for (const child of baseListNode.children) {
      if (child.type === "base_class_specifier" || child.type === "base_specifier") {
        inheritanceDepth++;

        // Track inheritance depth for complexity
        this.complexityScore.inheritanceDepth = Math.max(this.complexityScore.inheritanceDepth, inheritanceDepth);

        // Check for virtual inheritance
        const isVirtual = child.text.includes("virtual");

        // Extract access specifier (public, protected, private)
        let accessSpecifier = "private"; // default for class
        if (child.text.includes("public")) accessSpecifier = "public";
        else if (child.text.includes("protected")) accessSpecifier = "protected";

        // Find the base class name
        const baseNameNode = child.children.find(
          (node) => node.type === "type_identifier" || node.type === "qualified_identifier",
        );

        if (baseNameNode) {
          const baseClassName = baseNameNode.text;

          relationships.push({
            from: derivedClass,
            to: baseClassName,
            type: "inherits",
            metadata: {
              access: accessSpecifier,
              isVirtual: isVirtual,
            },
          });
        }
      }
    }
  }

  /**
   * Extract friend relationships
   */
  private extractFriend(
    node: ASTNode,
    className: string,
    relationships: EntityRelationship[],
    _filePath: string,
  ): void {
    const friendTarget = node.children.find(
      (child) =>
        child.type === "type_identifier" ||
        child.type === "qualified_identifier" ||
        child.type === "function_definition",
    );

    if (friendTarget) {
      const friendName =
        friendTarget.type === "function_definition"
          ? extractFunctionName(friendTarget.childForFieldName("declarator"))
          : friendTarget.text;

      if (friendName) {
        relationships.push({
          from: className,
          to: friendName,
          type: "references",
          metadata: { relation: "friend" },
        });
      }
    }
  }

  /**
   * Build semantic graph with lazy evaluation (Phase 2)
   */
  private buildSemanticGraph(_entities: ParsedEntity[], relationships: EntityRelationship[]): void {
    // This is where we would build a richer semantic graph
    // For now, we're keeping the syntactic information
    // Future enhancement: Add type resolution, symbol tables, etc.

    // Remove invalid relationships
    const validRelationships = relationships.filter((rel) => {
      // Keep relationships even if target doesn't exist (might be external)
      return rel.from && rel.to;
    });

    // Update relationships array
    relationships.length = 0;
    relationships.push(...validRelationships);
  }
}
