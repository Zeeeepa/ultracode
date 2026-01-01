/**
 * Tool Registry
 *
 * Central registry for all MCP tool handlers
 * Provides O(1) lookup instead of O(n) switch statement
 *
 * Usage in src/index.ts:
 *   const handler = toolRegistry.getHandler(toolName, context);
 *   return await handler.handle(args);
 */

import type { BaseToolHandler, ToolContext } from "./base-tool-handler.js";

// Import all handlers
import {
  AddMemberToolHandler,
  AnalyzeCodeImpactToolHandler,
  AnalyzeHotspotsToolHandler,
  AnalyzeMergeConflictsToolHandler,
  AnalyzeStateChaosToolHandler,
  AnalyzeStateImpactToolHandler,
  CleanIndexToolHandler,
  CleanupBranchesToolHandler,
  CleanupSnapshotsToolHandler,
  ClearBusTopicToolHandler,
  CopyFileToolHandler,
  CreateFileToolHandler,
  // Snapshot tools
  CreateSnapshotToolHandler,
  CrossLanguageSearchToolHandler,
  DetectCodeClonesToolHandler,
  DetectTechnologyStackToolHandler,
  FindDecisionPointsToolHandler,
  FindRelatedConceptsToolHandler,
  FindSimilarCodeToolHandler,
  GetAgentMetricsToolHandler,
  GetBranchStatusToolHandler,
  GetBusStatsToolHandler,
  GetChangedFilesToolHandler,
  GetGraphHealthToolHandler,
  GetGraphStatsToolHandler,
  GetGraphToolHandler,
  GetMergeSuggestionsToolHandler,
  // Metrics tools
  GetMetricsToolHandler,
  GetSemanticMergeInfoToolHandler,
  GetVersionToolHandler,
  // Index
  IndexToolHandler,
  JscpdDetectClonesToolHandler,
  // Branch tools
  ListBranchesToolHandler,
  ListEntityRelationshipsToolHandler,
  // Entity tools
  ListFileEntitiesToolHandler,
  ListSnapshotsToolHandler,
  // File modification tools
  ModifyEntityCodeToolHandler,
  PatternSearchToolHandler,
  QueryToolHandler,
  RenameFileToolHandler,
  RenameSymbolToolHandler,
  // Graph tools
  ResetGraphToolHandler,
  RollbackSnapshotToolHandler,
  // Merge tools
  SemanticMergeToolHandler,
  // Semantic tools
  SemanticSearchToolHandler,
  SplitFileToolHandler,
  // Analysis tools
  SuggestRefactoringToolHandler,
  SwitchBranchToolHandler,
  SynthesizeFilesToolHandler,
  TraceBackwardsToolHandler,
  TraceDataFlowToolHandler,
  // Tracing tools
  TraceFlowToolHandler,
  ValidateDirectoryToolHandler,
  // Validation tools
  ValidateFileToolHandler,
} from "./handlers/index.js";

type ToolHandlerConstructor = new (context: ToolContext) => BaseToolHandler;

export class ToolRegistry {
  private handlers: Map<string, ToolHandlerConstructor> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register a tool handler
   */
  register(toolName: string, handlerClass: ToolHandlerConstructor): void {
    this.handlers.set(toolName, handlerClass);
  }

  /**
   * Get a handler instance for a tool
   */
  getHandler(toolName: string, context: ToolContext): BaseToolHandler {
    const HandlerClass = this.handlers.get(toolName);

    if (!HandlerClass) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return new HandlerClass(context);
  }

  /**
   * Check if a tool is registered
   */
  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register all tool handlers
   */
  private registerDefaultHandlers(): void {
    // ==========================================================================
    // Index tools
    // ==========================================================================
    this.register("index", IndexToolHandler);

    // ==========================================================================
    // Graph tools
    // ==========================================================================
    this.register("reset_graph", ResetGraphToolHandler);
    this.register("clean_index", CleanIndexToolHandler);
    this.register("get_graph", GetGraphToolHandler);
    this.register("get_graph_stats", GetGraphStatsToolHandler);
    this.register("get_graph_health", GetGraphHealthToolHandler);

    // ==========================================================================
    // Entity tools
    // ==========================================================================
    this.register("get_members", ListFileEntitiesToolHandler);
    this.register("list_entity_relationships", ListEntityRelationshipsToolHandler);
    this.register("query", QueryToolHandler);

    // ==========================================================================
    // Semantic tools
    // ==========================================================================
    this.register("semantic_search", SemanticSearchToolHandler);
    this.register("find_similar_code", FindSimilarCodeToolHandler);
    this.register("find_duplicates", DetectCodeClonesToolHandler);
    this.register("jscpd_detect_clones", JscpdDetectClonesToolHandler);
    this.register("cross_language_search", CrossLanguageSearchToolHandler);
    this.register("pattern_search", PatternSearchToolHandler);

    // ==========================================================================
    // Analysis tools
    // ==========================================================================
    this.register("suggest_refactoring", SuggestRefactoringToolHandler);
    this.register("analyze_hotspots", AnalyzeHotspotsToolHandler);
    this.register("find_related_concepts", FindRelatedConceptsToolHandler);
    this.register("analyze_state_chaos", AnalyzeStateChaosToolHandler);
    this.register("analyze_code_impact", AnalyzeCodeImpactToolHandler);
    this.register("detect_technology_stack", DetectTechnologyStackToolHandler);

    // ==========================================================================
    // Branch tools
    // ==========================================================================
    this.register("list_branches", ListBranchesToolHandler);
    this.register("switch_branch", SwitchBranchToolHandler);
    this.register("get_branch_status", GetBranchStatusToolHandler);
    this.register("cleanup_branches", CleanupBranchesToolHandler);
    this.register("get_changed_files", GetChangedFilesToolHandler);

    // ==========================================================================
    // Snapshot tools
    // ==========================================================================
    this.register("create_snapshot", CreateSnapshotToolHandler);
    this.register("undo", RollbackSnapshotToolHandler);
    this.register("list_snapshots", ListSnapshotsToolHandler);
    this.register("cleanup_snapshots", CleanupSnapshotsToolHandler);

    // ==========================================================================
    // File modification tools
    // ==========================================================================
    this.register("modify_code", ModifyEntityCodeToolHandler);
    this.register("copy_file", CopyFileToolHandler);
    this.register("rename_file", RenameFileToolHandler);
    this.register("split_file", SplitFileToolHandler);
    this.register("synthesize_files", SynthesizeFilesToolHandler);
    this.register("create_file", CreateFileToolHandler);
    this.register("rename_symbol", RenameSymbolToolHandler);
    this.register("add_member", AddMemberToolHandler);

    // ==========================================================================
    // Validation tools
    // ==========================================================================
    this.register("validate_file", ValidateFileToolHandler);
    this.register("validate_directory", ValidateDirectoryToolHandler);

    // ==========================================================================
    // Metrics tools
    // ==========================================================================
    this.register("get_metrics", GetMetricsToolHandler);
    this.register("get_version", GetVersionToolHandler);
    this.register("get_agent_metrics", GetAgentMetricsToolHandler);
    this.register("get_bus_stats", GetBusStatsToolHandler);
    this.register("clear_bus_topic", ClearBusTopicToolHandler);

    // ==========================================================================
    // Merge tools
    // ==========================================================================
    this.register("semantic_merge", SemanticMergeToolHandler);
    this.register("analyze_merge_conflicts", AnalyzeMergeConflictsToolHandler);
    this.register("get_merge_suggestions", GetMergeSuggestionsToolHandler);
    this.register("get_semantic_merge_info", GetSemanticMergeInfoToolHandler);

    // ==========================================================================
    // Tracing tools
    // ==========================================================================
    this.register("trace_flow", TraceFlowToolHandler);
    this.register("trace_backwards", TraceBackwardsToolHandler);
    this.register("trace_data_flow", TraceDataFlowToolHandler);
    this.register("analyze_state_impact", AnalyzeStateImpactToolHandler);
    this.register("find_decision_points", FindDecisionPointsToolHandler);
  }
}

// Singleton instance (can be replaced with DI container later)
export const toolRegistry = new ToolRegistry();
