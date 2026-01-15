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
// TYPE DEFINITIONS
// =============================================================================

/**
 * Location in source code
 */
interface Location {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
}

/**
 * Context manager pattern (with statement)
 */
interface ContextManagerPattern {
  type: "context_manager";
  location: Location;
  expression: string;
  isAsync: boolean;
}

/**
 * Exception handling pattern (try/except/finally)
 */
interface ExceptionHandlingPattern {
  type: "exception_handling";
  location: Location;
  hasExcept: boolean;
  hasFinally: boolean;
  hasElse: boolean;
  exceptCount: number;
}

/**
 * Design pattern detection result
 */
interface DesignPattern {
  type: "singleton" | "factory";
  className: string;
  confidence: number;
}

/**
 * Python idiom (comprehensions, generators)
 */
interface PythonIdiom {
  type: "list_comprehension" | "dict_comprehension" | "set_comprehension" | "generator_expression";
  location: Location;
}

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
        patterns.contextManagers = this.analyzeContextManagers(
          rootNode,
        ) as unknown as PatternAnalysis["contextManagers"];
        patterns.exceptionHandling = this.analyzeExceptionHandling(
          rootNode,
        ) as unknown as PatternAnalysis["exceptionHandling"];
        patterns.designPatterns = this.detectDesignPatterns(context) as unknown as PatternAnalysis["designPatterns"];
        patterns.pythonIdioms = this.identifyPythonIdioms(rootNode) as unknown as PatternAnalysis["pythonIdioms"];
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
  private analyzeContextManagers(rootNode: ASTNode): ContextManagerPattern[] {
    const withNodes = findNodesByType(rootNode, ["with_statement"]);
    const contextManagers: ContextManagerPattern[] = [];

    for (const withNode of withNodes) {
      const contextManager: ContextManagerPattern = {
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
  private analyzeExceptionHandling(rootNode: ASTNode): ExceptionHandlingPattern[] {
    const tryNodes = findNodesByType(rootNode, ["try_statement"]);
    const exceptionHandling: ExceptionHandlingPattern[] = [];

    for (const tryNode of tryNodes) {
      const exceptNodes = findNodesByType(tryNode, ["except_clause"]);
      const finallyNodes = findNodesByType(tryNode, ["finally_clause"]);
      const elseNodes = findNodesByType(tryNode, ["else_clause"]);

      const pattern: ExceptionHandlingPattern = {
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
  private detectDesignPatterns(context: AnalysisContext): DesignPattern[] {
    const patterns: DesignPattern[] = [];

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
  private identifyPythonIdioms(rootNode: ASTNode): PythonIdiom[] {
    const idioms: PythonIdiom[] = [];

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
