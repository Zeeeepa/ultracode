/**
 * Tool Handlers Index
 *
 * Re-exports all tool handlers for easy registration in ToolRegistry
 */

// Analysis tools
export {
  AnalyzeCodeImpactToolHandler,
  AnalyzeHotspotsToolHandler,
  AnalyzeStateChaosToolHandler,
  DetectTechnologyStackToolHandler,
  FindRelatedConceptsToolHandler,
  LernaProjectGraphToolHandler,
  SuggestRefactoringToolHandler,
} from "./analysis-tool-handlers.js";
// Branch tools
export {
  CleanupBranchesToolHandler,
  GetBranchStatusToolHandler,
  GetChangedFilesToolHandler,
  ListBranchesToolHandler,
  SwitchBranchToolHandler,
} from "./branch-tool-handlers.js";

// Entity tools
export {
  ListEntityRelationshipsToolHandler,
  ListFileEntitiesToolHandler,
  QueryToolHandler,
} from "./entity-tool-handlers.js";
// File modification tools
export {
  AddMemberToolHandler,
  CopyFileToolHandler,
  CreateFileToolHandler,
  ModifyEntityCodeToolHandler,
  RenameFileToolHandler,
  RenameSymbolToolHandler,
  SplitFileToolHandler,
  SynthesizeFilesToolHandler,
} from "./file-tool-handlers.js";
// Graph tools
export {
  CleanIndexToolHandler,
  GetGraphHealthToolHandler,
  GetGraphStatsToolHandler,
  GetGraphToolHandler,
  ResetGraphToolHandler,
} from "./graph-tool-handlers.js";
// Index tool
export { IndexToolHandler } from "./index-tool-handler.js";
// Merge tools
export {
  AnalyzeMergeConflictsToolHandler,
  GetMergeSuggestionsToolHandler,
  GetSemanticMergeInfoToolHandler,
  SemanticMergeToolHandler,
} from "./merge-tool-handlers.js";
// Metrics tools
export {
  ClearBusTopicToolHandler,
  GetAgentMetricsToolHandler,
  GetBusStatsToolHandler,
  GetMetricsToolHandler,
  GetVersionToolHandler,
} from "./metrics-tool-handlers.js";
// Semantic tools
export {
  CrossLanguageSearchToolHandler,
  DetectCodeClonesToolHandler,
  FindSimilarCodeToolHandler,
  JscpdDetectClonesToolHandler,
  PatternSearchToolHandler,
  SemanticSearchToolHandler,
} from "./semantic-tool-handlers.js";
// Snapshot tools
export {
  CleanupSnapshotsToolHandler,
  CreateSnapshotToolHandler,
  ListSnapshotsToolHandler,
  RollbackSnapshotToolHandler,
} from "./snapshot-tool-handlers.js";
// Validation tools
export {
  ValidateDirectoryToolHandler,
  ValidateFileToolHandler,
} from "./validation-tool-handlers.js";
