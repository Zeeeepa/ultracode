/**
 * Tool Registry with Lazy Loading
 *
 * Central registry for all MCP tool handlers with support for lazy loading.
 * - Basic tools (index, query, graph, metrics) are loaded immediately
 * - Heavy tools (semantic, autodoc, tracing, merge, analysis, file, branch, snapshot, validation)
 *   are loaded on first use via dynamic imports
 *
 * This reduces cold start time from ~2s to <500ms by deferring ~80% of handler loading.
 */

import type { BaseToolHandler, ToolContext } from "./base-tool-handler.js";
import {
  ListEntityRelationshipsToolHandler,
  ListFileEntitiesToolHandler,
  QueryToolHandler,
} from "./handlers/entity-tool-handlers.js";
import { GetToolsForTaskHandler } from "./handlers/get-tools-for-task-handler.js";
// ==========================================================================
// Import ONLY basic handlers immediately (loaded at startup)
// ==========================================================================
import {
  CleanIndexToolHandler,
  GetGraphHealthToolHandler,
  GetGraphStatsToolHandler,
  GetGraphToolHandler,
  ResetGraphToolHandler,
} from "./handlers/graph-tool-handlers.js";
import { GetHelpToolHandler } from "./handlers/help-tool-handler.js";
import { IndexToolHandler } from "./handlers/index-tool-handler.js";
import {
  ClearBusTopicToolHandler,
  GetAgentMetricsToolHandler,
  GetBusStatsToolHandler,
  GetMetricsToolHandler,
  GetVersionToolHandler,
  GetWatcherStatusToolHandler,
} from "./handlers/metrics-tool-handlers.js";

type ToolHandlerConstructor = new (context: ToolContext) => BaseToolHandler;
type LazyHandlerLoader = () => Promise<ToolHandlerConstructor>;

export class ToolRegistry {
  private handlers: Map<string, ToolHandlerConstructor> = new Map();
  private lazyHandlers: Map<string, LazyHandlerLoader> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register an immediately-loaded tool handler
   */
  register(toolName: string, handlerClass: ToolHandlerConstructor): void {
    this.handlers.set(toolName, handlerClass);
  }

  /**
   * Register a lazy-loaded tool handler
   * The loader function is called only when the tool is first used
   */
  registerLazy(toolName: string, loader: LazyHandlerLoader): void {
    this.lazyHandlers.set(toolName, loader);
  }

  /**
   * Get a handler instance for a tool (async to support lazy loading)
   */
  async getHandler(toolName: string, context: ToolContext): Promise<BaseToolHandler> {
    // Check eagerly-loaded handlers first (O(1) lookup)
    const EagerHandler = this.handlers.get(toolName);
    if (EagerHandler) {
      return new EagerHandler(context);
    }

    // Check lazy handlers
    const loader = this.lazyHandlers.get(toolName);
    if (loader) {
      // Load and cache the handler class
      const HandlerClass = await loader();
      this.handlers.set(toolName, HandlerClass);
      this.lazyHandlers.delete(toolName); // Remove from lazy map
      return new HandlerClass(context);
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * Check if a tool is registered (either eager or lazy)
   */
  has(toolName: string): boolean {
    return this.handlers.has(toolName) || this.lazyHandlers.has(toolName);
  }

  /**
   * Get all registered tool names (both eager and lazy)
   */
  getRegisteredTools(): string[] {
    return [...this.handlers.keys(), ...this.lazyHandlers.keys()];
  }

  /**
   * Register all tool handlers
   */
  private registerDefaultHandlers(): void {
    // ==========================================================================
    // PHASE 0: Basic tools - loaded immediately (blocking startup)
    // These are the most commonly used tools and should be available instantly
    // ==========================================================================

    // Help tools (essential for agents to discover features)
    this.register("get_help", GetHelpToolHandler);
    this.register("get_tools_for_task", GetToolsForTaskHandler);

    // Index tool
    this.register("index", IndexToolHandler);

    // Graph tools
    this.register("reset_graph", ResetGraphToolHandler);
    this.register("clean_index", CleanIndexToolHandler);
    this.register("get_graph", GetGraphToolHandler);
    this.register("get_graph_stats", GetGraphStatsToolHandler);
    this.register("get_graph_health", GetGraphHealthToolHandler);

    // Entity tools (basic navigation)
    this.register("get_members", ListFileEntitiesToolHandler);
    this.register("list_entity_relationships", ListEntityRelationshipsToolHandler);
    this.register("query", QueryToolHandler);

    // Metrics tools (lightweight)
    this.register("get_metrics", GetMetricsToolHandler);
    this.register("get_version", GetVersionToolHandler);
    this.register("get_agent_metrics", GetAgentMetricsToolHandler);
    this.register("get_bus_stats", GetBusStatsToolHandler);
    this.register("clear_bus_topic", ClearBusTopicToolHandler);
    this.register("get_watcher_status", GetWatcherStatusToolHandler);

    // ==========================================================================
    // PHASE 1: Lazy-loaded tools - loaded on first use
    // Grouped by functionality to enable tree-shaking and code splitting
    // ==========================================================================

    // --- Semantic tools (~80KB) ---
    const semanticLoader = () => import("./handlers/semantic-tool-handlers.js");
    this.registerLazy("semantic_search", async () => (await semanticLoader()).SemanticSearchToolHandler);
    this.registerLazy("find_similar_code", async () => (await semanticLoader()).FindSimilarCodeToolHandler);
    this.registerLazy("find_duplicates", async () => (await semanticLoader()).DetectCodeClonesToolHandler);
    this.registerLazy("jscpd_detect_clones", async () => (await semanticLoader()).JscpdDetectClonesToolHandler);
    this.registerLazy("cross_language_search", async () => (await semanticLoader()).CrossLanguageSearchToolHandler);
    this.registerLazy("pattern_search", async () => (await semanticLoader()).PatternSearchToolHandler);

    // --- Analysis tools (~25KB) ---
    const analysisLoader = () => import("./handlers/analysis-tool-handlers.js");
    this.registerLazy("suggest_refactoring", async () => (await analysisLoader()).SuggestRefactoringToolHandler);
    this.registerLazy("analyze_hotspots", async () => (await analysisLoader()).AnalyzeHotspotsToolHandler);
    this.registerLazy("find_related_concepts", async () => (await analysisLoader()).FindRelatedConceptsToolHandler);
    this.registerLazy("analyze_state_chaos", async () => (await analysisLoader()).AnalyzeStateChaosToolHandler);
    this.registerLazy("analyze_code_impact", async () => (await analysisLoader()).AnalyzeCodeImpactToolHandler);
    this.registerLazy("analyze_swagger_impact", async () => (await analysisLoader()).AnalyzeSwaggerImpactToolHandler);
    this.registerLazy("analyze_api_impact", async () => (await analysisLoader()).AnalyzeApiImpactToolHandler);
    this.registerLazy("detect_technology_stack", async () => (await analysisLoader()).DetectTechnologyStackToolHandler);

    // --- DB Schema tools (~15KB) ---
    const dbSchemaLoader = () => import("./handlers/db-schema-tool-handlers.js");
    this.registerLazy("get_database_schema", async () => (await dbSchemaLoader()).GetDatabaseSchemaToolHandler);

    // --- Branch tools (~15KB) ---
    const branchLoader = () => import("./handlers/branch-tool-handlers.js");
    this.registerLazy("list_branches", async () => (await branchLoader()).ListBranchesToolHandler);
    this.registerLazy("switch_branch", async () => (await branchLoader()).SwitchBranchToolHandler);
    this.registerLazy("get_branch_status", async () => (await branchLoader()).GetBranchStatusToolHandler);
    this.registerLazy("cleanup_branches", async () => (await branchLoader()).CleanupBranchesToolHandler);
    this.registerLazy("get_changed_files", async () => (await branchLoader()).GetChangedFilesToolHandler);

    // --- Snapshot tools (~10KB) ---
    const snapshotLoader = () => import("./handlers/snapshot-tool-handlers.js");
    this.registerLazy("create_snapshot", async () => (await snapshotLoader()).CreateSnapshotToolHandler);
    this.registerLazy("undo", async () => (await snapshotLoader()).RollbackSnapshotToolHandler);
    this.registerLazy("list_snapshots", async () => (await snapshotLoader()).ListSnapshotsToolHandler);
    this.registerLazy("cleanup_snapshots", async () => (await snapshotLoader()).CleanupSnapshotsToolHandler);

    // --- File modification tools (~30KB) ---
    const fileLoader = () => import("./handlers/file-tool-handlers.js");
    this.registerLazy("modify_code", async () => (await fileLoader()).ModifyEntityCodeToolHandler);
    this.registerLazy("copy_file", async () => (await fileLoader()).CopyFileToolHandler);
    this.registerLazy("rename_file", async () => (await fileLoader()).RenameFileToolHandler);
    this.registerLazy("split_file", async () => (await fileLoader()).SplitFileToolHandler);
    this.registerLazy("synthesize_files", async () => (await fileLoader()).SynthesizeFilesToolHandler);
    this.registerLazy("create_file", async () => (await fileLoader()).CreateFileToolHandler);
    this.registerLazy("rename_symbol", async () => (await fileLoader()).RenameSymbolToolHandler);
    this.registerLazy("add_member", async () => (await fileLoader()).AddMemberToolHandler);

    // --- Validation tools (~15KB) ---
    const validationLoader = () => import("./handlers/validation-tool-handlers.js");
    this.registerLazy("validate_file", async () => (await validationLoader()).ValidateFileToolHandler);
    this.registerLazy("validate_directory", async () => (await validationLoader()).ValidateDirectoryToolHandler);

    // --- Merge tools (~20KB) ---
    const mergeLoader = () => import("./handlers/merge-tool-handlers.js");
    this.registerLazy("semantic_merge", async () => (await mergeLoader()).SemanticMergeToolHandler);
    this.registerLazy("analyze_merge_conflicts", async () => (await mergeLoader()).AnalyzeMergeConflictsToolHandler);
    this.registerLazy("get_merge_suggestions", async () => (await mergeLoader()).GetMergeSuggestionsToolHandler);
    this.registerLazy("get_semantic_merge_info", async () => (await mergeLoader()).GetSemanticMergeInfoToolHandler);

    // --- Tracing tools (~30KB) ---
    const tracingLoader = () => import("./handlers/tracing-tool-handlers.js");
    this.registerLazy("trace_flow", async () => (await tracingLoader()).TraceFlowToolHandler);
    this.registerLazy("trace_backwards", async () => (await tracingLoader()).TraceBackwardsToolHandler);
    this.registerLazy("trace_data_flow", async () => (await tracingLoader()).TraceDataFlowToolHandler);
    this.registerLazy("analyze_state_impact", async () => (await tracingLoader()).AnalyzeStateImpactToolHandler);
    this.registerLazy("find_decision_points", async () => (await tracingLoader()).FindDecisionPointsToolHandler);

    // --- AutoDoc tools (~60KB) ---
    const autodocLoader = () => import("./handlers/autodoc-tool-handlers.js");
    this.registerLazy("autodoc_init", async () => (await autodocLoader()).AutoDocInitToolHandler);
    this.registerLazy("autodoc_save", async () => (await autodocLoader()).AutoDocSaveToolHandler);
    this.registerLazy("autodoc_get", async () => (await autodocLoader()).AutoDocGetToolHandler);
    this.registerLazy("autodoc_search", async () => (await autodocLoader()).AutoDocSearchToolHandler);
    this.registerLazy("autodoc_validate", async () => (await autodocLoader()).AutoDocValidateToolHandler);
    this.registerLazy("autodoc_status", async () => (await autodocLoader()).AutoDocStatusToolHandler);
    this.registerLazy("autodoc_sync", async () => (await autodocLoader()).AutoDocSyncToolHandler);
    this.registerLazy("autodoc_generate", async () => (await autodocLoader()).AutoDocGenerateToolHandler);
    this.registerLazy("autodoc_changelog", async () => (await autodocLoader()).AutoDocChangelogToolHandler);
    this.registerLazy("autodoc_install_hooks", async () => (await autodocLoader()).AutoDocInstallHooksToolHandler);
    this.registerLazy("autodoc_detect_language", async () => (await autodocLoader()).AutoDocDetectLanguageToolHandler);

    // --- Stacktrace analysis tools (~20KB) ---
    const stacktraceLoader = () => import("./handlers/stacktrace-tool-handler.js");
    this.registerLazy("analyze_stacktrace", async () => (await stacktraceLoader()).AnalyzeStacktraceToolHandler);

    // --- Taint analysis tools (~15KB) ---
    const taintLoader = () => import("./handlers/taint-tool-handlers.js");
    this.registerLazy("taint_analysis", async () => (await taintLoader()).TaintAnalysisToolHandler);

    // --- Diagram tools (~20KB) ---
    const diagramLoader = () => import("./handlers/diagram-tool-handler.js");
    this.registerLazy(
      "get_architecture_diagram",
      async () => (await diagramLoader()).GetArchitectureDiagramToolHandler,
    );

    // --- Graph metrics tools (~15KB) ---
    const graphMetricsLoader = () => import("./handlers/graph-metrics-tool-handlers.js");
    this.registerLazy("graph_metrics", async () => (await graphMetricsLoader()).GraphMetricsToolHandler);

    // --- Pattern detection tools (~20KB) ---
    const patternLoader = () => import("./handlers/pattern-tool-handlers.js");
    this.registerLazy("detect_patterns", async () => (await patternLoader()).DetectPatternsToolHandler);
    this.registerLazy("check_entity_patterns", async () => (await patternLoader()).CheckEntityPatternsToolHandler);

    // --- History & Time Travel tools (~15KB) ---
    const historyLoader = () => import("./handlers/history-tool-handlers.js");
    this.registerLazy("get_entity_history", async () => (await historyLoader()).GetEntityHistoryToolHandler);
    this.registerLazy("diff_commits", async () => (await historyLoader()).DiffCommitsToolHandler);
    this.registerLazy("checkout_commit", async () => (await historyLoader()).CheckoutCommitToolHandler);
    this.registerLazy("list_commits", async () => (await historyLoader()).ListCommitsToolHandler);
  }
}

// Singleton instance (can be replaced with DI container later)
export const toolRegistry = new ToolRegistry();
