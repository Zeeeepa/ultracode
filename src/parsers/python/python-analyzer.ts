/**
 * TASK-003B: Advanced Python Analyzer Module (Refactored)
 *
 * Comprehensive Python code analysis implementing 4-layer enhancement architecture:
 * Layer 1: Enhanced Basic Parsing - Method classification, complex type hints, decorator chaining
 * Layer 2: Advanced Feature Analysis - Magic methods, properties, async patterns, generators, dataclasses
 * Layer 3: Relationship Mapping - Inheritance hierarchies, MRO, import dependencies, method overrides
 * Layer 4: Pattern Recognition - Context managers, exception handling, design patterns, Python idioms
 *
 * This is the refactored version that delegates to specialized layer classes.
 *
 * @task_id TASK-003B
 * @history
 * - 2024-01-15: Created by Dev-Agent - TASK-003B: Advanced Python analyzer with 4-layer architecture
 * - 2024: Refactored to use composition pattern with layer classes
 */

import { log } from "../../logging/index.js";
import type { ASTNode, ParsedEntity, PatternAnalysis, PythonParserMetrics } from "../../types/parser.js";
import { Layer1BasicAnalyzer } from "./layer1-basic.js";
import { Layer2FeatureAnalyzer } from "./layer2-features.js";
import { Layer3RelationshipAnalyzer } from "./layer3-relationships.js";
import { Layer4PatternAnalyzer } from "./layer4-patterns.js";
import { type AnalysisContext, DEFAULT_PYTHON_CONFIG, initializeMetrics, type PythonAnalysisConfig } from "./types.js";

// =============================================================================
// PYTHON ANALYZER CLASS
// =============================================================================

/**
 * Advanced Python Code Analyzer implementing 4-layer architecture
 *
 * Uses composition pattern with layer analyzers for cleaner separation of concerns.
 */
export class PythonAnalyzer {
  private config: PythonAnalysisConfig;
  private static dependencyCache: Map<string, Set<string>> = new Map();

  // Layer analyzers
  private layer1: Layer1BasicAnalyzer;
  private layer2: Layer2FeatureAnalyzer;
  private layer3: Layer3RelationshipAnalyzer;
  private layer4: Layer4PatternAnalyzer;

  constructor(config: Partial<PythonAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_PYTHON_CONFIG, ...config };

    // Initialize layer analyzers
    this.layer1 = new Layer1BasicAnalyzer();
    this.layer2 = new Layer2FeatureAnalyzer();
    this.layer3 = new Layer3RelationshipAnalyzer();
    this.layer4 = new Layer4PatternAnalyzer(PythonAnalyzer.dependencyCache);
  }

  /**
   * Main analysis entry point - analyzes Python AST with all 4 layers
   */
  async analyzePythonCode(
    filePath: string,
    rootNode: ASTNode,
    source: string,
  ): Promise<{
    entities: ParsedEntity[];
    relationships: import("../../types/parser.js").EntityRelationship[];
    patterns: PatternAnalysis;
    metrics: PythonParserMetrics;
  }> {
    log.d("PYANALYZER", "start", { file: filePath });
    const analysisStartTime = Date.now();

    // Initialize analysis context
    const context: AnalysisContext = {
      filePath,
      source,
      entities: [],
      relationships: [],
      imports: [],
      classes: new Map(),
      methods: new Map(),
      metrics: initializeMetrics(),
    };

    try {
      // Layer 1: Enhanced Basic Parsing
      if (this.config.enhancedBasicParsing) {
        await this.layer1.executeAnalysis(rootNode, context);
      }

      // Layer 2: Advanced Feature Analysis
      if (this.config.advancedFeatureAnalysis) {
        await this.layer2.executeAnalysis(rootNode, context);
      }

      // Layer 3: Relationship Mapping
      if (this.config.relationshipMapping) {
        await this.layer3.executeAnalysis(rootNode, context);
      }

      // Layer 4: Pattern Recognition
      let patterns: PatternAnalysis = {
        contextManagers: [],
        exceptionHandling: [],
        designPatterns: [],
        pythonIdioms: [],
        circularDependencies: [],
      };

      if (this.config.patternRecognition) {
        patterns = await this.layer4.executeAnalysis(rootNode, context);
      }

      // Update overall metrics
      const totalTime = Date.now() - analysisStartTime;
      context.metrics.overall.totalTimeMs = totalTime;
      context.metrics.overall.totalEntities = context.entities.length;
      context.metrics.overall.totalRelationships = context.relationships.length;
      context.metrics.overall.totalPatterns =
        patterns.contextManagers.length +
        patterns.exceptionHandling.length +
        patterns.designPatterns.length +
        patterns.pythonIdioms.length;

      log.i("PYANALYZER", "done", { dur: totalTime, cnt: context.entities.length });

      return {
        entities: context.entities,
        relationships: context.relationships,
        patterns,
        metrics: context.metrics,
      };
    } catch (error) {
      log.e("PYANALYZER", "fail", { file: filePath, err: String(error) });
      throw error;
    }
  }

  /**
   * Get the dependency cache for circular dependency detection
   */
  static getDependencyCache(): Map<string, Set<string>> {
    return PythonAnalyzer.dependencyCache;
  }

  /**
   * Clear the dependency cache
   */
  static clearDependencyCache(): void {
    PythonAnalyzer.dependencyCache.clear();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Factory function to create Python analyzer with configuration
 */
export function createPythonAnalyzer(config?: Partial<PythonAnalysisConfig>): PythonAnalyzer {
  return new PythonAnalyzer(config);
}

/**
 * Quick analysis function for single Python files
 */
export async function analyzePythonFile(
  filePath: string,
  rootNode: ASTNode,
  source: string,
  config?: Partial<PythonAnalysisConfig>,
) {
  const analyzer = createPythonAnalyzer(config);
  return analyzer.analyzePythonCode(filePath, rootNode, source);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

log.i("PYANALYZER", "module_loaded");
