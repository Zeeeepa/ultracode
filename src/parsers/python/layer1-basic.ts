/**
 * Python Layer 1: Enhanced Basic Parsing
 *
 * Method classification, complex type hints, decorator chaining.
 */

import { log } from "../../logging/index.js";
import type { ASTNode, ParsedEntity, PythonMethodInfo } from "../../types/parser.js";
import { CallExtractor, ControlFlowExtractor, DocstringParser, TypeExtractor } from "./extractors/index.js";
import type { AnalysisContext } from "./types.js";
import {
  convertPosition,
  getNodeText,
  hasYieldExpression,
  isBuiltinDecorator,
  isMagicMethod,
  MAGIC_METHOD_TYPES,
  withPerformanceMonitoring,
} from "./utils/helpers.js";

// =============================================================================
// LAYER 1 ANALYZER CLASS
// =============================================================================

export class Layer1BasicAnalyzer {
  private callExtractor: CallExtractor;
  private controlFlowExtractor: ControlFlowExtractor;
  private docstringParser: DocstringParser;
  private typeExtractor: TypeExtractor;

  constructor() {
    this.callExtractor = new CallExtractor();
    this.controlFlowExtractor = new ControlFlowExtractor();
    this.docstringParser = new DocstringParser();
    this.typeExtractor = new TypeExtractor();
  }

  /**
   * Execute Layer 1 analysis - enhanced basic parsing
   */
  async executeAnalysis(rootNode: ASTNode, context: AnalysisContext): Promise<void> {
    log.d("PYBASIC", "layer1_start");
    const layer1StartTime = Date.now();

    await withPerformanceMonitoring(
      "Layer1Analysis",
      () => {
        this.traverseNodeForLayer1(rootNode, context);
      },
      context.metrics,
    );

    context.metrics.basicParsing.parseTimeMs = Date.now() - layer1StartTime;
    log.d("PYBASIC", "layer1_done", { methods: context.metrics.basicParsing.methodsClassified });
  }

  /**
   * Traverse nodes for Layer 1 analysis
   */
  private traverseNodeForLayer1(node: ASTNode, context: AnalysisContext): void {
    switch (node.type) {
      case "function_definition":
      case "async_function_definition":
        this.analyzeEnhancedFunction(node, context);
        break;

      case "class_definition":
        this.analyzeEnhancedClass(node, context);
        break;

      case "import_statement":
      case "import_from_statement":
        this.analyzeEnhancedImport(node, context);
        break;

      case "lambda":
        this.analyzeEnhancedLambda(node, context);
        break;

      case "decorated_definition":
        this.analyzeDecoratedDefinition(node, context);
        break;
    }

    for (const child of node.namedChildren) {
      this.traverseNodeForLayer1(child, context);
    }
  }

  /**
   * Analyze enhanced function with improved method classification
   */
  private analyzeEnhancedFunction(node: ASTNode, context: AnalysisContext): void {
    const nameNode = node.namedChildren.find((child) => child.type === "identifier");
    if (!nameNode) return;

    const name = nameNode.text;
    const isAsync = node.type === "async_function_definition";

    const decorators = this.extractDecoratorsWithChaining(node, context);
    const methodType = this.classifyMethodType(node, decorators);
    const parameters = this.typeExtractor.extractComplexParameters(node, context.source);
    const returnType = this.typeExtractor.extractComplexReturnType(node, context.source);
    const calls = this.callExtractor.extractCalls(node, context.source);
    const controlFlow = this.controlFlowExtractor.extractControlFlow(node, context.source);
    const documentation = this.docstringParser.extractDocumentation(node, context.source);

    let entityType: ParsedEntity["type"] = "function";
    if (isAsync) entityType = "async_function";
    if (isMagicMethod(name)) entityType = "magic_method";
    if (methodType === "static") entityType = "static_method";
    if (methodType === "class") entityType = "class_method";
    if (methodType === "property") entityType = "property";

    const entity: ParsedEntity = {
      name,
      type: entityType,
      location: convertPosition(node),
      methodType,
      decorators: decorators.map((d) => ({
        name: d.name,
        arguments: d.arguments,
        isBuiltin: isBuiltinDecorator(d.name),
      })),
      asyncInfo: {
        isAsync,
        isGenerator: hasYieldExpression(node),
        isAsyncGenerator: isAsync && hasYieldExpression(node),
      },
      parameters,
      returnType,
      modifiers: this.extractEnhancedModifiers(node, decorators),
      calls,
      controlFlow,
      documentation,
    };

    context.entities.push(entity);
    context.metrics.basicParsing.methodsClassified++;

    const methodInfo: PythonMethodInfo = {
      classification: methodType,
      isAsync,
      isGenerator: entity.asyncInfo?.isGenerator || false,
      decorators: decorators.map((d) => ({ ...d, line: node.startPosition.row + 1 })),
      magicType: isMagicMethod(name) ? MAGIC_METHOD_TYPES[name as keyof typeof MAGIC_METHOD_TYPES] : undefined,
      location: convertPosition(node),
    };
    context.methods.set(name, methodInfo);
  }

  /**
   * Analyze enhanced class with comprehensive information
   */
  private analyzeEnhancedClass(node: ASTNode, context: AnalysisContext): void {
    const nameNode = node.namedChildren.find((child) => child.type === "identifier");
    if (!nameNode) return;

    const name = nameNode.text;
    const baseClasses = this.extractBaseClasses(node);
    const decorators = this.extractDecoratorsWithChaining(node, context);
    const classType = this.determineClassType(decorators, node);
    const documentation = this.docstringParser.extractDocumentation(node, context.source);

    const entity: ParsedEntity = {
      name,
      type: classType === "dataclass" ? "dataclass" : "class",
      location: convertPosition(node),
      decorators: decorators.map((d) => ({
        name: d.name,
        arguments: d.arguments,
        isBuiltin: isBuiltinDecorator(d.name),
      })),
      inheritance: {
        baseClasses,
        isAbstract: this.isAbstractClass(node),
      },
      children: [],
      documentation,
    };

    const classInfo = {
      classType,
      baseClasses,
      mro: [name, ...baseClasses],
      abstractMethods: [] as string[],
      magicMethods: [] as string[],
      properties: [] as { name: string; hasGetter: boolean; hasSetter: boolean; hasDeleter: boolean }[],
      classDecorators: decorators.map((d) => ({ name: d.name, arguments: d.arguments })),
      decorators: decorators.map((d) => d.name),
      methods: [] as string[],
      location: convertPosition(node),
    };

    const bodyNode = node.namedChildren.find((child) => child.type === "block");
    if (bodyNode) {
      for (const child of bodyNode.namedChildren) {
        let fnNode: ASTNode | null = null;

        if (child.type === "function_definition" || child.type === "async_function_definition") {
          fnNode = child;
        } else if (child.type === "decorated_definition") {
          const def = child.namedChildren[child.namedChildren.length - 1];
          if (def && (def.type === "function_definition" || def.type === "async_function_definition")) {
            fnNode = def;
          }
        }

        if (fnNode) {
          const id = fnNode.namedChildren.find((c) => c.type === "identifier");
          if (id) {
            classInfo.methods.push(id.text);
            if (isMagicMethod(id.text)) {
              classInfo.magicMethods.push(id.text);
            }
          }
        }
      }
    }

    context.classes.set(name, classInfo);
    context.entities.push(entity);
  }

  /**
   * Analyze enhanced import statements
   */
  private analyzeEnhancedImport(node: ASTNode, context: AnalysisContext): void {
    let importSource = "";
    let isRelative = false;
    const specifiers: Array<{ local: string; imported?: string; alias?: string }> = [];

    if (node.type === "import_statement") {
      const dottedNameNodes = node.descendantsOfType("dotted_name");
      const identifierNodes = node.descendantsOfType("identifier");

      for (const nameNode of [...dottedNameNodes, ...identifierNodes]) {
        if (nameNode.parent?.type === "aliased_import") {
          const alias = nameNode.parent.namedChildren[1]?.text;
          specifiers.push({ local: alias || nameNode.text, imported: nameNode.text });
        } else if (nameNode.parent?.type === "import_statement") {
          specifiers.push({ local: nameNode.text });
          if (!importSource) importSource = nameNode.text;
        }
      }
    } else if (node.type === "import_from_statement") {
      const moduleNode = node.namedChildren.find(
        (child) => child.type === "dotted_name" || child.type === "relative_import",
      );

      if (moduleNode) {
        importSource = moduleNode.text;
        isRelative = moduleNode.text.startsWith(".");
      }

      const importList = node.descendantsOfType("import_list")[0];
      if (importList) {
        for (const item of importList.namedChildren) {
          if (item.type === "identifier") {
            specifiers.push({ local: item.text, imported: item.text });
          } else if (item.type === "aliased_import") {
            const imported = item.namedChildren[0]?.text;
            const local = item.namedChildren[1]?.text;
            if (imported && local) {
              specifiers.push({ local, imported, alias: local });
            }
          }
        }
      }
    }

    const entity: ParsedEntity = {
      name: importSource || "unknown",
      type: "import",
      location: convertPosition(node),
      importData: {
        source: importSource,
        specifiers,
        isRelative,
        fromModule: node.type === "import_from_statement" ? importSource : undefined,
      },
    };

    context.entities.push(entity);
  }

  /**
   * Analyze enhanced lambda functions
   */
  private analyzeEnhancedLambda(node: ASTNode, context: AnalysisContext): void {
    const parameters = this.extractLambdaParameters(node);

    const entity: ParsedEntity = {
      name: "<lambda>",
      type: "lambda",
      location: convertPosition(node),
      parameters,
      modifiers: ["lambda"],
      asyncInfo: {
        isAsync: false,
        isGenerator: false,
        isAsyncGenerator: false,
      },
    };

    context.entities.push(entity);
  }

  /**
   * Extract lambda parameters
   */
  private extractLambdaParameters(node: ASTNode): ParsedEntity["parameters"] {
    const params: NonNullable<ParsedEntity["parameters"]> = [];

    for (const child of node.namedChildren) {
      if (child.type === "identifier") {
        params.push({ name: child.text, optional: false });
      } else if (child.type === ":") {
        break;
      }
    }

    return params;
  }

  /**
   * Analyze decorated definitions
   */
  private analyzeDecoratedDefinition(node: ASTNode, context: AnalysisContext): void {
    const definition = node.namedChildren[node.namedChildren.length - 1];

    if (definition) {
      this.traverseNodeForLayer1(definition, context);
    }
  }

  /**
   * Extract decorators with chaining analysis
   */
  private extractDecoratorsWithChaining(
    node: ASTNode,
    context: AnalysisContext,
  ): Array<{ name: string; arguments?: string[] }> {
    const decorators: Array<{ name: string; arguments?: string[] }> = [];

    let current = node.parent;
    while (current && current.type === "decorated_definition") {
      const decoratorNodes = current.children.filter((child) => child.type === "decorator");

      for (const decoratorNode of decoratorNodes) {
        const nameNode = decoratorNode.namedChildren.find(
          (child) => child.type === "identifier" || child.type === "attribute",
        );

        if (nameNode) {
          const decorator = {
            name: nameNode.text,
            arguments: this.extractDecoratorArguments(decoratorNode, context),
          };
          decorators.unshift(decorator);
          context.metrics.basicParsing.decoratorsExtracted++;
        }
      }
      current = current.parent;
    }

    return decorators;
  }

  /**
   * Extract decorator arguments from decorator node
   */
  private extractDecoratorArguments(node: ASTNode, context: AnalysisContext): string[] {
    const args: string[] = [];

    const argumentList = node.namedChildren.find((child) => child.type === "argument_list");
    if (!argumentList) return args;

    for (const arg of argumentList.namedChildren) {
      if (arg.type !== ",") {
        args.push(getNodeText(arg, context.source).trim());
      }
    }

    return args;
  }

  /**
   * Classify method type
   */
  private classifyMethodType(
    node: ASTNode,
    decorators: Array<{ name: string; arguments?: string[] }>,
  ): PythonMethodInfo["classification"] {
    const functionName = node.namedChildren.find((child) => child.type === "identifier")?.text || "";

    for (const decorator of decorators) {
      if (decorator.name === "staticmethod") return "static";
      if (decorator.name === "classmethod") return "class";
      if (decorator.name === "property") return "property";
      if (decorator.name === "abstractmethod") return "abstract";
    }

    if (isMagicMethod(functionName)) return "magic";

    return "instance";
  }

  /**
   * Extract enhanced modifiers from function/class
   */
  private extractEnhancedModifiers(node: ASTNode, decorators: Array<{ name: string; arguments?: string[] }>): string[] {
    const modifiers: string[] = [];

    if (node.type === "async_function_definition") {
      modifiers.push("async");
    }

    for (const decorator of decorators) {
      switch (decorator.name) {
        case "staticmethod":
          modifiers.push("static");
          break;
        case "classmethod":
          modifiers.push("class");
          break;
        case "abstractmethod":
          modifiers.push("abstract");
          break;
        case "property":
          modifiers.push("property");
          break;
      }
    }

    const nameNode = node.namedChildren.find((child) => child.type === "identifier");
    if (nameNode) {
      const name = nameNode.text;
      if (name.startsWith("__") && !name.endsWith("__")) {
        modifiers.push("private");
      } else if (name.startsWith("_")) {
        modifiers.push("protected");
      }
    }

    return modifiers;
  }

  /**
   * Extract base classes from class definition
   */
  private extractBaseClasses(node: ASTNode): string[] {
    const baseClasses: string[] = [];

    const argumentList = node.namedChildren.find((child) => child.type === "argument_list");
    if (!argumentList) return baseClasses;

    for (const arg of argumentList.namedChildren) {
      if (arg.type === "identifier" || arg.type === "attribute") {
        baseClasses.push(arg.text);
      }
    }

    return baseClasses;
  }

  /**
   * Determine class type based on decorators and analysis
   */
  private determineClassType(
    decorators: Array<{ name: string; arguments?: string[] }>,
    node: ASTNode,
  ): "regular" | "dataclass" | "abstract" | "protocol" | "enum" | "namedtuple" {
    for (const decorator of decorators) {
      if (decorator.name === "dataclass" || decorator.name === "dataclasses.dataclass") {
        return "dataclass";
      }
    }

    const baseClasses = this.extractBaseClasses(node);
    if (baseClasses.some((base) => base === "ABC" || base.includes("ABC"))) {
      return "abstract";
    }

    if (baseClasses.some((base) => base === "Protocol" || base.includes("Protocol"))) {
      return "protocol";
    }

    if (baseClasses.some((base) => base === "Enum" || base.includes("Enum"))) {
      return "enum";
    }

    if (baseClasses.some((base) => base === "NamedTuple" || base.includes("NamedTuple"))) {
      return "namedtuple";
    }

    return "regular";
  }

  /**
   * Check if class is abstract (has abstract methods)
   */
  private isAbstractClass(node: ASTNode): boolean {
    const bodyNode = node.namedChildren.find((child) => child.type === "block");
    if (!bodyNode) return false;

    for (const child of bodyNode.namedChildren) {
      if (child.type === "decorated_definition") {
        const decoratorNodes = child.children.filter((c) => c.type === "decorator");
        for (const decorator of decoratorNodes) {
          if (decorator.text.includes("abstractmethod")) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
