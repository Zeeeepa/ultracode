/**
 * Python Layer 2: Advanced Feature Analysis
 *
 * Magic methods, properties, async patterns, generators, dataclasses.
 */

import type { ASTNode, ParsedEntity } from "../../types/parser.js";
import { findNodesByType } from "../base-parser-utils.js";
import type { AnalysisContext } from "./types.js";
import { isMagicMethod, MAGIC_METHOD_TYPES, withPerformanceMonitoring } from "./utils/helpers.js";

// =============================================================================
// LAYER 2 ANALYZER CLASS
// =============================================================================

export class Layer2FeatureAnalyzer {
  /**
   * Execute Layer 2 analysis - advanced feature analysis
   */
  async executeAnalysis(rootNode: ASTNode, context: AnalysisContext): Promise<void> {
    console.error("[PythonAnalyzer] Executing Layer 2: Advanced Feature Analysis");
    const layer2StartTime = Date.now();

    await withPerformanceMonitoring(
      "Layer2Analysis",
      () => {
        this.analyzeMagicMethods(context);
        this.analyzePropertyDecorators(context);
        this.analyzeAsyncPatterns(rootNode, context);
        this.analyzeGeneratorPatterns(rootNode, context);
        this.analyzeDataclassesAndSpecialClasses(context);
      },
      context.metrics,
    );

    context.metrics.advancedFeatures.analysisTimeMs = Date.now() - layer2StartTime;
    console.error(
      `[PythonAnalyzer] Layer 2 complete: ${context.metrics.advancedFeatures.magicMethodsFound} magic methods found`,
    );
  }

  /**
   * Analyze magic methods and enhance entity metadata
   */
  private analyzeMagicMethods(context: AnalysisContext): void {
    for (const [name, _methodInfo] of context.methods.entries()) {
      if (isMagicMethod(name)) {
        context.metrics.advancedFeatures.magicMethodsFound++;

        const entity = context.entities.find((e) => e.name === name);
        if (entity) {
          entity.type = "magic_method";
          entity.pythonInfo = {
            ...entity.pythonInfo,
            magicMethodType: MAGIC_METHOD_TYPES[name as keyof typeof MAGIC_METHOD_TYPES] || "other",
          };
        }
      }
    }
  }

  /**
   * Analyze property decorators
   */
  private analyzePropertyDecorators(context: AnalysisContext): void {
    for (const [name, methodInfo] of context.methods.entries()) {
      if (methodInfo.classification === "property") {
        context.metrics.advancedFeatures.propertiesAnalyzed++;

        const baseEntity = context.entities.find((e) => e.name === name);
        const loc = methodInfo.location || baseEntity?.location;
        if (!loc) continue;

        const setterName = `${name}_setter`;
        const getterName = `${name}_getter`;

        const propertyEntity: ParsedEntity = {
          name,
          type: "property",
          location: loc,
          pythonInfo: {
            decorators: methodInfo.decorators,
            isProperty: true,
            hasGetter: context.methods.has(getterName),
            hasSetter: context.methods.has(setterName),
          },
        };
        context.entities.push(propertyEntity);
      }
    }
  }

  /**
   * Analyze async patterns in the code
   */
  private analyzeAsyncPatterns(node: ASTNode, context: AnalysisContext): void {
    const asyncNodes = findNodesByType(node, ["async_function_definition"]);

    for (const asyncNode of asyncNodes) {
      context.metrics.advancedFeatures.asyncPatternsDetected++;

      const awaitNodes = findNodesByType(asyncNode, ["await"]);

      const nameNode = asyncNode.namedChildren.find((c) => c.type === "identifier");
      if (nameNode) {
        const entity = context.entities.find((e) => e.name === nameNode.text);
        if (entity) {
          entity.asyncInfo = {
            isAsync: true,
            isGenerator: false,
            awaitCount: awaitNodes.length,
            asyncPatterns: this.detectAsyncPatterns(asyncNode),
          };
        }
      }
    }
  }

  /**
   * Analyze generator patterns
   */
  private analyzeGeneratorPatterns(node: ASTNode, context: AnalysisContext): void {
    const yieldNodes = findNodesByType(node, ["yield", "yield_from_expression"]);

    for (const yieldNode of yieldNodes) {
      let currentNode = yieldNode.parent;
      while (currentNode && !["function_definition", "async_function_definition"].includes(currentNode.type)) {
        currentNode = currentNode.parent;
      }

      if (currentNode) {
        const nameNode = currentNode.namedChildren.find((c) => c.type === "identifier");
        if (nameNode) {
          const entity = context.entities.find((e) => e.name === nameNode.text);
          if (entity) {
            entity.asyncInfo = {
              ...entity.asyncInfo,
              isGenerator: true,
              yieldCount: (entity.asyncInfo?.yieldCount || 0) + 1,
              generatorType: yieldNode.type === "yield_from_expression" ? "delegating" : "simple",
            };
            context.metrics.advancedFeatures.generatorsFound++;
          }
        }
      }
    }
  }

  /**
   * Analyze dataclasses and special class types
   */
  private analyzeDataclassesAndSpecialClasses(context: AnalysisContext): void {
    for (const [name, classInfo] of context.classes.entries()) {
      if (classInfo.decorators?.includes("dataclass")) {
        classInfo.classType = "dataclass";
        context.metrics.advancedFeatures.dataclassesProcessed++;

        const entity = context.entities.find((e) => e.name === name && e.type === "class");
        if (entity) {
          entity.pythonInfo = {
            ...entity.pythonInfo,
            isDataclass: true,
            specialClassType: "dataclass",
          };
        }
      }

      if (classInfo.decorators?.includes("enum.Enum") || classInfo.baseClasses?.includes("Enum")) {
        classInfo.classType = "enum";
        const entity = context.entities.find((e) => e.name === name && e.type === "class");
        if (entity) {
          entity.pythonInfo = {
            ...entity.pythonInfo,
            specialClassType: "enum",
          };
        }
      }
    }
  }

  /**
   * Detect async patterns in an async function
   */
  private detectAsyncPatterns(node: ASTNode): string[] {
    const patterns: string[] = [];
    const awaitNodes = findNodesByType(node, ["await"]);

    if (awaitNodes.length > 0) {
      patterns.push("uses_await");
    }

    if (node.text.includes("async with")) {
      patterns.push("async_context_manager");
    }

    return patterns;
  }
}
