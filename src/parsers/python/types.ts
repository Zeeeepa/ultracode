/**
 * Python Analyzer Shared Types
 *
 * Types and interfaces used across Python analyzer modules.
 */

import type {
  EntityRelationship,
  ImportDependency,
  ParsedEntity,
  PythonClassInfo,
  PythonMethodInfo,
  PythonParserMetrics,
} from "../../types/parser.js";

// =============================================================================
// ANALYSIS CONTEXT
// =============================================================================

/**
 * Context object passed through all analysis layers
 */
export interface AnalysisContext {
  filePath: string;
  source: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  imports: ImportDependency[];
  classes: Map<string, PythonClassInfo>;
  methods: Map<string, PythonMethodInfo>;
  metrics: PythonParserMetrics;
}

// =============================================================================
// CONFIG
// =============================================================================

/**
 * Python analysis configuration with layer toggles
 */
export interface PythonAnalysisConfig {
  enhancedBasicParsing: boolean;
  advancedFeatureAnalysis: boolean;
  relationshipMapping: boolean;
  patternRecognition: boolean;
  extractAllMagicMethods: boolean;
  analyzePropertyDecorators: boolean;
  buildInheritanceHierarchies: boolean;
  detectCircularDependencies: boolean;
  patternConfidenceThreshold: number;
}

/**
 * Default configuration
 */
export const DEFAULT_PYTHON_CONFIG: PythonAnalysisConfig = {
  enhancedBasicParsing: true,
  advancedFeatureAnalysis: true,
  relationshipMapping: true,
  patternRecognition: true,
  extractAllMagicMethods: true,
  analyzePropertyDecorators: true,
  buildInheritanceHierarchies: true,
  detectCircularDependencies: true,
  patternConfidenceThreshold: 0.7,
};

// =============================================================================
// METRICS INITIALIZER
// =============================================================================

/**
 * Initialize empty metrics object
 */
export function initializeMetrics(): PythonParserMetrics {
  return {
    basicParsing: {
      methodsClassified: 0,
      typeHintsProcessed: 0,
      decoratorsExtracted: 0,
      parseTimeMs: 0,
    },
    advancedFeatures: {
      magicMethodsFound: 0,
      propertiesAnalyzed: 0,
      asyncPatternsDetected: 0,
      generatorsFound: 0,
      dataclassesProcessed: 0,
      analysisTimeMs: 0,
    },
    relationshipMapping: {
      inheritanceHierarchiesBuilt: 0,
      methodOverridesDetected: 0,
      crossFileReferencesResolved: 0,
      circularDependenciesFound: 0,
      mappingTimeMs: 0,
    },
    patternRecognition: {
      contextManagersDetected: 0,
      exceptionPatternsFound: 0,
      designPatternsIdentified: 0,
      pythonIdiomsDetected: 0,
      recognitionTimeMs: 0,
    },
    overall: {
      totalEntities: 0,
      totalRelationships: 0,
      totalPatterns: 0,
      totalTimeMs: 0,
      memoryUsedMB: 0,
    },
  };
}
