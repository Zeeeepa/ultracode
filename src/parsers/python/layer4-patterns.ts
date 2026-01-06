/**
 * Python Layer 4: Pattern Recognition
 *
 * Context managers, exception handling, design patterns, Python idioms, circular dependencies.
 */

import { log } from "../../logging/index.js";
import type { ASTNode, PatternAnalysis, PythonClassInfo } from "../../types/parser.js";
import { findNodesByType } from "../base-parser-utils.js";
import type { AnalysisContext } from "./types.js";
import { CycleDetector } from "./utils/cycle-detector.js";
import { convertPosition, withPerformanceMonitoring } from "./utils/helpers.js";

// =============================================================================
// LAYER 4 ANALYZER CLASS
// =============================================================================

export class Layer4PatternAnalyzer {
  private cycleDetector: CycleDetector;

  constructor(dependencyCache?: Map<string, Set<string>>) {
    this.cycleDetector = new CycleDetector(dependencyCache);
  }

  /**
   * Execute Layer 4 analysis - pattern recognition
   */
  async executeAnalysis(rootNode: ASTNode, context: AnalysisContext): Promise<PatternAnalysis> {
    log.d("PYPATTERNS", "layer4_start");
    const layer4StartTime = Date.now();

    const patterns: PatternAnalysis = {
      contextManagers: [],
      exceptionHandling: [],
      designPatterns: [],
      pythonIdioms: [],
      circularDependencies: [],
    };

    await withPerformanceMonitoring(
      "Layer4Analysis",
      () => {
        patterns.contextManagers = this.analyzeContextManagers(rootNode);
        patterns.exceptionHandling = this.analyzeExceptionHandling(rootNode);
        patterns.designPatterns = this.detectDesignPatterns(context);
        patterns.pythonIdioms = this.identifyPythonIdioms(rootNode);
        patterns.circularDependencies = this.cycleDetector.detectCircularDependencies(context);
      },
      context.metrics,
    );

    context.metrics.patternRecognition.timeMs = Date.now() - layer4StartTime;
    context.metrics.patternRecognition.totalPatternsFound =
      patterns.contextManagers.length +
      patterns.exceptionHandling.length +
      patterns.designPatterns.length +
      patterns.pythonIdioms.length +
      patterns.circularDependencies.length;

    log.d("PYPATTERNS", "layer4_done", { dur: context.metrics.patternRecognition.timeMs });
    return patterns;
  }

  /**
   * Analyze context manager usage (with statements)
   */
  private analyzeContextManagers(rootNode: ASTNode): any[] {
    const withNodes = findNodesByType(rootNode, ["with_statement"]);
    const contextManagers = [];

    for (const withNode of withNodes) {
      const contextManager = {
        type: "context_manager",
        location: convertPosition(withNode),
        expression: withNode.text.substring(0, 100),
        isAsync: withNode.text.includes("async with"),
      };
      contextManagers.push(contextManager);
    }

    return contextManagers;
  }

  /**
   * Analyze exception handling patterns
   */
  private analyzeExceptionHandling(rootNode: ASTNode): any[] {
    const tryNodes = findNodesByType(rootNode, ["try_statement"]);
    const exceptionHandling = [];

    for (const tryNode of tryNodes) {
      const exceptNodes = findNodesByType(tryNode, ["except_clause"]);
      const finallyNodes = findNodesByType(tryNode, ["finally_clause"]);
      const elseNodes = findNodesByType(tryNode, ["else_clause"]);

      const pattern = {
        type: "exception_handling",
        location: convertPosition(tryNode),
        hasExcept: exceptNodes.length > 0,
        hasFinally: finallyNodes.length > 0,
        hasElse: elseNodes.length > 0,
        exceptCount: exceptNodes.length,
      };
      exceptionHandling.push(pattern);
    }

    return exceptionHandling;
  }

  /**
   * Detect common design patterns
   */
  private detectDesignPatterns(context: AnalysisContext): any[] {
    const patterns = [];

    for (const [className, classInfo] of context.classes.entries()) {
      if (this.isSingletonPattern(classInfo)) {
        patterns.push({
          type: "singleton",
          className,
          confidence: 0.8,
        });
      }

      if (this.isFactoryPattern(classInfo)) {
        patterns.push({
          type: "factory",
          className,
          confidence: 0.7,
        });
      }
    }

    return patterns;
  }

  /**
   * Identify Python idioms (comprehensions, etc.)
   */
  private identifyPythonIdioms(rootNode: ASTNode): any[] {
    const idioms = [];

    const listCompNodes = findNodesByType(rootNode, ["list_comprehension"]);
    for (const node of listCompNodes) {
      idioms.push({
        type: "list_comprehension",
        location: convertPosition(node),
      });
    }

    const dictCompNodes = findNodesByType(rootNode, ["dictionary_comprehension"]);
    for (const node of dictCompNodes) {
      idioms.push({
        type: "dict_comprehension",
        location: convertPosition(node),
      });
    }

    const setCompNodes = findNodesByType(rootNode, ["set_comprehension"]);
    for (const node of setCompNodes) {
      idioms.push({
        type: "set_comprehension",
        location: convertPosition(node),
      });
    }

    const genExpNodes = findNodesByType(rootNode, ["generator_expression"]);
    for (const node of genExpNodes) {
      idioms.push({
        type: "generator_expression",
        location: convertPosition(node),
      });
    }

    return idioms;
  }

  /**
   * Check if class implements Singleton pattern
   */
  private isSingletonPattern(classInfo: PythonClassInfo): boolean {
    return classInfo.methods.includes("__new__") && classInfo.methods.some((m) => m.includes("instance"));
  }

  /**
   * Check if class implements Factory pattern
   */
  private isFactoryPattern(classInfo: PythonClassInfo): boolean {
    return classInfo.methods.some((m) => m.includes("create") || m.includes("make") || m.includes("build"));
  }

  /**
   * Get the cycle detector for external access
   */
  getCycleDetector(): CycleDetector {
    return this.cycleDetector;
  }
}
