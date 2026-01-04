/**
 * TASK-003B: Advanced Python Analyzer Module
 *
 * This file re-exports the refactored Python analyzer from the python/ module.
 * The implementation has been split into multiple files for better maintainability:
 *
 * - python/python-analyzer.ts - Main analyzer class
 * - python/layer1-basic.ts - Layer 1: Enhanced Basic Parsing
 * - python/layer2-features.ts - Layer 2: Advanced Feature Analysis
 * - python/layer3-relationships.ts - Layer 3: Relationship Mapping
 * - python/layer4-patterns.ts - Layer 4: Pattern Recognition
 * - python/extractors/ - Specialized extractors (calls, control flow, docstrings, types)
 * - python/utils/ - Utility functions and helpers
 *
 * @task_id TASK-003B
 */

// Re-export extractors
export { CallExtractor, ControlFlowExtractor, DocstringParser, TypeExtractor } from "./python/extractors/index.js";
// Re-export everything from the refactored module
export { analyzePythonFile, createPythonAnalyzer, PythonAnalyzer } from "./python/index.js";
// Re-export layer analyzers for advanced usage
export { Layer1BasicAnalyzer } from "./python/layer1-basic.js";
export { Layer2FeatureAnalyzer } from "./python/layer2-features.js";
export { Layer3RelationshipAnalyzer } from "./python/layer3-relationships.js";
export { Layer4PatternAnalyzer } from "./python/layer4-patterns.js";
// Re-export types for backwards compatibility
export type { AnalysisContext, PythonAnalysisConfig } from "./python/types.js";
export { DEFAULT_PYTHON_CONFIG, initializeMetrics } from "./python/types.js";
export type { CycleAnalysisResult, CycleInfo } from "./python/utils/cycle-detector.js";
// Re-export utils
export { CycleDetector } from "./python/utils/cycle-detector.js";
