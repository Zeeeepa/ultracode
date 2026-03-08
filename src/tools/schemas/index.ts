/**
 * Tool Schemas - Central Export
 *
 * All Zod schemas for MCP tool validation
 */

// Code Analysis
export {
  AnalyzeHotspotsSchema,
  AnalyzeStateChaosSchema,
  JscpdCloneDetectionSchema,
  SuggestRefactoringSchema,
} from "./analysis-schemas.js";
// AutoDoc
export {
  AutoDocChangelogSchema,
  AutoDocDetectLanguageSchema,
  AutoDocGenerateSchema,
  AutoDocGetSchema,
  AutoDocInitSchema,
  AutoDocInstallHooksSchema,
  AutoDocSaveSchema,
  AutoDocSearchSchema,
  AutoDocStatusSchema,
  AutoDocSyncSchema,
  AutoDocValidateSchema,
} from "./autodoc-schemas.js";
// Architecture Diagrams
export { GetArchitectureDiagramSchema } from "./diagram-schemas.js";
// Entity Operations
export { ListEntitiesToolSchema, ListRelationshipsToolSchema, QueryToolSchema } from "./entity-schemas.js";
// Graph Metrics
export { GraphMetricsSchema } from "./graph-metrics-schemas.js";
// Graph Operations
export {
  ClearBusTopicSchema,
  GetBusStatsSchema,
  GetGraphHealthSchema,
  GetGraphSchema,
  GetGraphStatsSchema,
} from "./graph-schemas.js";
// History & Time Travel
export {
  CheckoutCommitSchema,
  DiffCommitsSchema,
  GetEntityHistorySchema,
  ListCommitsSchema,
} from "./history-schemas.js";
// Index & Graph Management
export {
  CleanIndexSchema,
  DEFAULT_EXCLUDE_PATTERNS,
  GetAgentMetricsSchema,
  IndexToolSchema,
} from "./index-schemas.js";
// Merge Operations
export {
  AnalyzeMergeConflictsSchema,
  GetMergeSuggestionsSchema,
  GetSemanticMergeInfoSchema,
  SemanticMergeSchema,
} from "./merge-schemas.js";
// Code Modification & File Operations
export {
  AddMemberSchema,
  CopyFileSchema,
  CreateFileSchema,
  ModifyEntityCodeSchema,
  RenameFileSchema,
  RenameSymbolSchema,
  SplitFileSchema,
  SynthesizeFilesSchema,
} from "./modification-schemas.js";
// Pattern Detection
export { CheckEntityPatternsSchema, DetectPatternsSchema } from "./pattern-schemas.js";
// Semantic Search & Analysis
export {
  AnalyzeApiImpactSchema,
  AnalyzeCodeImpactSchema,
  AnalyzeSwaggerImpactSchema,
  CrossLanguageSearchSchema,
  DetectCodeClonesSchema,
  FindRelatedConceptsSchema,
  FindSimilarCodeSchema,
  GetDatabaseSchemaSchema,
  PatternSearchSchema,
  SemanticSearchSchema,
} from "./semantic-schemas.js";
// Snapshots & Version Management
export {
  CleanupSnapshotsSchema,
  CreateSnapshotSchema,
  ListSnapshotsSchema,
  RollbackSnapshotSchema,
} from "./snapshot-schemas.js";
// Stacktrace Analysis
export { AnalyzeStacktraceSchema } from "./stacktrace-schemas.js";
// Taint Analysis
export { TaintAnalysisSchema } from "./taint-schemas.js";
// Validation & Technology Detection
export { DetectTechnologyStackSchema, ValidateDirectorySchema, ValidateFileSchema } from "./validation-schemas.js";
