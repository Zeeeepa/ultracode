/**
 * Minimal MCP tool definitions — short descriptions + output token estimates.
 * Detailed docs: get_help(topic='tool-reference').
 * Synced with Zig commit 5de969e1.
 */

import { z } from "zod";

// ── Dynamic index description ────────────────────────────────────────
// After successful indexing, setIndexStatus() updates the description shown in tools/list.
const INDEX_DEFAULT_DESC = "Index project codebase into SQLite+graph. ~200tok";
let indexDynamicDesc: string | null = null;

export function setIndexStatus(entities: number, hasSemantic: boolean): void {
  indexDynamicDesc = `Index project. Last: ${entities} entities, semantic ${hasSemantic ? "available" : "unavailable"}. ~200tok`;
}

export function getIndexDescription(): string {
  return indexDynamicDesc ?? INDEX_DEFAULT_DESC;
}

import { branchToolDefinitions } from "./branch-schemas.js";
import {
  AddMemberSchema,
  AnalyzeApiImpactSchema,
  AnalyzeCodeImpactSchema,
  AnalyzeHotspotsSchema,
  AnalyzeMergeConflictsSchema,
  AnalyzeStacktraceSchema,
  AnalyzeStateChaosSchema,
  AnalyzeSwaggerImpactSchema,
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
  CheckEntityPatternsSchema,
  // History & Time Travel
  CheckoutCommitSchema,
  CleanIndexSchema,
  CleanupSnapshotsSchema,
  ClearBusTopicSchema,
  CopyFileSchema,
  CreateFileSchema,
  CreateSnapshotSchema,
  CrossLanguageSearchSchema,
  DetectCodeClonesSchema,
  DetectPatternsSchema,
  DetectTechnologyStackSchema,
  DiffCommitsSchema,
  FindRelatedConceptsSchema,
  FindSimilarCodeSchema,
  GetAgentMetricsSchema,
  GetArchitectureDiagramSchema,
  GetBusStatsSchema,
  GetDatabaseSchemaSchema,
  GetEntityHistorySchema,
  GetGraphHealthSchema,
  GetGraphSchema,
  GetGraphStatsSchema,
  GetMergeSuggestionsSchema,
  GetSemanticMergeInfoSchema,
  GraphMetricsSchema,
  IndexToolSchema,
  JscpdCloneDetectionSchema,
  ListCommitsSchema,
  ListEntitiesToolSchema,
  ListRelationshipsToolSchema,
  ListSnapshotsSchema,
  ModifyEntityCodeSchema,
  PatternSearchSchema,
  QueryToolSchema,
  RenameFileSchema,
  RenameSymbolSchema,
  RollbackSnapshotSchema,
  SemanticMergeSchema,
  SemanticSearchSchema,
  SplitFileSchema,
  SuggestRefactoringSchema,
  SynthesizeFilesSchema,
  TaintAnalysisSchema,
  ValidateDirectorySchema,
  ValidateFileSchema,
} from "./schemas/index.js";
import {
  AutoDocBatchGenerateSchema,
  BatchModifySchema,
  BatchRenameSchema,
  DetectArchitectureLayersSchema,
  GenerateOnboardingSchema,
  GetReviewContextSchema,
  GrepIndexSchema,
  SecurityScanSchema,
  SetupEmbeddingSchema,
} from "./schemas/missing-tool-schemas.js";
import {
  CleanupWorktreeSchema,
  GetWorktreeInfoSchema,
  ListWorktreeAgentsSchema,
  SpawnAgentWorktreeSchema,
} from "./schemas/worktree-schemas.js";
import { traceToolDefinitions } from "./trace-schemas.js";

/**
 * Convert Zod schema to JSON Schema using native Zod v4 method
 */
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  const result = z.toJSONSchema(schema) as Record<string, unknown>;
  // Ensure type: "object" is present for MCP compatibility
  if (!result["type"]) {
    result["type"] = "object";
  }
  return result;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Get full list of available MCP tools
 */
export function getToolsList(): ToolDefinition[] {
  return [
    // ==========================================================================
    // Documentation & Help
    // ==========================================================================
    {
      name: "get_help",
      description: "Help docs by topic. ~1500tok",
      inputSchema: zodToJsonSchema(
        z.object({
          topic: z
            .enum([
              "quick-start",
              "tool-reference",
              "workflows",
              "tracing",
              "autodoc",
              "explore",
              "planning",
              "modification",
              "patterns",
              "security",
            ])
            .describe("quick-start | tool-reference (all tools) | explore | planning | modification"),
        }),
      ),
    },
    {
      name: "get_tools_for_task",
      description: "Recommend tools for a task description. ~200tok",
      inputSchema: zodToJsonSchema(
        z.object({
          task: z.string().describe("Task description"),
          agentType: z.enum(["explore", "plan", "modify", "analyze", "any"]).optional().describe("Agent type filter"),
        }),
      ),
    },

    // ==========================================================================
    // Indexing Tools
    // ==========================================================================
    {
      name: "index",
      description: getIndexDescription(),
      inputSchema: zodToJsonSchema(IndexToolSchema),
    },
    {
      name: "clean_index",
      description: "Clear all indexed data. ~50tok",
      inputSchema: zodToJsonSchema(CleanIndexSchema),
    },

    // ==========================================================================
    // Entity & Relationship Tools
    // ==========================================================================
    {
      name: "get_members",
      description: "List code entities with filters. limit scales output. ~200-2000tok",
      inputSchema: zodToJsonSchema(ListEntitiesToolSchema),
    },
    {
      name: "list_entity_relationships",
      description: "All relationships (in/out) for an entity. ~200-1000tok",
      inputSchema: zodToJsonSchema(ListRelationshipsToolSchema),
    },

    // ==========================================================================
    // Query & Search Tools
    // ==========================================================================
    {
      name: "query",
      description: "Search entities by name (LIKE). limit scales output. ~200-2000tok",
      inputSchema: zodToJsonSchema(QueryToolSchema),
    },
    {
      name: "semantic_search",
      description: "Search code by meaning (vector+text+graph hybrid). ~200-2000tok",
      inputSchema: zodToJsonSchema(SemanticSearchSchema),
    },
    {
      name: "find_similar_code",
      description: "Find entities similar to a given one. ~200-800tok",
      inputSchema: zodToJsonSchema(FindSimilarCodeSchema),
    },
    {
      name: "cross_language_search",
      description: "Search across all languages, grouped by language. ~200-2000tok",
      inputSchema: zodToJsonSchema(CrossLanguageSearchSchema),
    },
    {
      name: "pattern_search",
      description: "Search entities by name pattern. ~200-1000tok",
      inputSchema: zodToJsonSchema(PatternSearchSchema),
    },

    // ==========================================================================
    // Analysis Tools
    // ==========================================================================
    {
      name: "analyze_code_impact",
      description: "Impact of changing entity: dependents, risk. detail_level controls verbosity. ~200-2000tok",
      inputSchema: zodToJsonSchema(AnalyzeCodeImpactSchema),
    },
    {
      name: "find_duplicates",
      description: "Code duplicates by token similarity (Jaccard). ~200-1500tok",
      inputSchema: zodToJsonSchema(DetectCodeClonesSchema),
    },
    {
      name: "jscpd_detect_clones",
      description: "Code clones via rolling-hash fingerprinting. max_results scales output. ~300-2000tok",
      inputSchema: zodToJsonSchema(JscpdCloneDetectionSchema),
    },
    {
      name: "suggest_refactoring",
      description: "Refactoring suggestions by complexity/coupling. ~200-1000tok",
      inputSchema: zodToJsonSchema(SuggestRefactoringSchema),
    },
    {
      name: "analyze_hotspots",
      description: "High complexity/coupling code hotspots. ~200-1000tok",
      inputSchema: zodToJsonSchema(AnalyzeHotspotsSchema),
    },
    {
      name: "find_related_concepts",
      description: "Entities related to a concept (search + graph neighbors). ~200-800tok",
      inputSchema: zodToJsonSchema(FindRelatedConceptsSchema),
    },
    {
      name: "analyze_state_chaos",
      description: "Shared mutable state, god objects, circular deps. ~200-2000tok",
      inputSchema: zodToJsonSchema(AnalyzeStateChaosSchema),
    },
    {
      name: "analyze_swagger_impact",
      description: "Impact of OpenAPI spec changes on codebase. ~200-1000tok",
      inputSchema: zodToJsonSchema(AnalyzeSwaggerImpactSchema),
    },
    {
      name: "analyze_api_impact",
      description: "Breaking change risk for public API entity. ~200-800tok",
      inputSchema: zodToJsonSchema(AnalyzeApiImpactSchema),
    },
    {
      name: "get_database_schema",
      description: "SQLite schema for all 4 databases. ~500-1500tok",
      inputSchema: zodToJsonSchema(GetDatabaseSchemaSchema),
    },
    {
      name: "graph_metrics",
      description: "PageRank, betweenness, communities, bus factor. ~200-500tok",
      inputSchema: zodToJsonSchema(GraphMetricsSchema),
    },
    {
      name: "pagerank",
      description: "PageRank importance scores. persist saves to metadata. ~200tok",
      inputSchema: zodToJsonSchema(
        z.object({
          projectPath: z.string().optional().describe("Project dir"),
          topN: z.number().optional().default(20).describe("Top N entities (default 20)"),
          persist: z.boolean().optional().default(false).describe("Save to entity metadata"),
        }),
      ),
    },
    {
      name: "louvain_communities",
      description: "Detect code communities/clusters (Louvain). ~200-500tok",
      inputSchema: zodToJsonSchema(
        z.object({
          projectPath: z.string().optional().describe("Project dir"),
          minCommunitySize: z.number().optional().default(2).describe("Min community size"),
          persist: z.boolean().optional().default(false).describe("Save community IDs to metadata"),
        }),
      ),
    },
    {
      name: "centrality_analysis",
      description: "Degree centrality and entity roles (hub/authority/bridge/leaf). ~200tok",
      inputSchema: zodToJsonSchema(
        z.object({
          projectPath: z.string().optional().describe("Project dir"),
          topN: z.number().optional().default(20).describe("Top N entities (default 20)"),
        }),
      ),
    },
    {
      name: "bus_factor",
      description: "Knowledge concentration risk per file (git history). ~200tok",
      inputSchema: zodToJsonSchema(
        z.object({
          projectPath: z.string().optional().describe("Project dir"),
        }),
      ),
    },
    {
      name: "detect_technology_stack",
      description: "Detect project languages/frameworks/tools. ~200tok",
      inputSchema: zodToJsonSchema(DetectTechnologyStackSchema),
    },

    // ==========================================================================
    // Architecture Diagrams
    // ==========================================================================
    {
      name: "get_architecture_diagram",
      description: "Generate arch diagram (Mermaid/Graphviz/D2). max_nodes scales output. ~500-3000tok",
      inputSchema: zodToJsonSchema(GetArchitectureDiagramSchema),
    },

    // ==========================================================================
    // Pattern Detection
    // ==========================================================================
    {
      name: "detect_patterns",
      description: "Detect design patterns and anti-patterns. max_results scales output. ~300-2000tok",
      inputSchema: zodToJsonSchema(DetectPatternsSchema),
    },
    {
      name: "check_entity_patterns",
      description: "Patterns matched by specific entity. ~200tok",
      inputSchema: zodToJsonSchema(CheckEntityPatternsSchema),
    },

    // ==========================================================================
    // Stacktrace Analysis
    // ==========================================================================
    {
      name: "analyze_stacktrace",
      description: "Parse stack trace, match to indexed entities. ~300-1000tok",
      inputSchema: zodToJsonSchema(AnalyzeStacktraceSchema),
    },

    // ==========================================================================
    // Security Tools
    // ==========================================================================
    {
      name: "taint_analysis",
      description: "Find taint flows: SQLi, XSS, cmd injection, path traversal, SSRF. ~200-2000tok",
      inputSchema: zodToJsonSchema(TaintAnalysisSchema),
    },

    // ==========================================================================
    // Graph Tools
    // ==========================================================================
    {
      name: "get_graph",
      description: "Code graph overview with sample nodes. ~200-1000tok",
      inputSchema: zodToJsonSchema(GetGraphSchema),
    },
    {
      name: "get_graph_stats",
      description: "Entity/relationship counts and density. ~100tok",
      inputSchema: zodToJsonSchema(GetGraphStatsSchema),
    },
    {
      name: "reset_graph",
      description: "Clear graph and DB. Needs reindex. ~50tok",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_graph_health",
      description: "Graph health: entities, orphans, samples. ~200tok",
      inputSchema: zodToJsonSchema(GetGraphHealthSchema),
    },

    // ==========================================================================
    // Metrics & Diagnostics Tools
    // ==========================================================================
    {
      name: "get_metrics",
      description: "Server perf: uptime, memory, DB sizes. ~300tok",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_version",
      description: "Server version and platform info. ~50tok",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_agent_metrics",
      description: "Internal entity/relationship/file counts. ~200tok",
      inputSchema: zodToJsonSchema(GetAgentMetricsSchema),
    },
    {
      name: "get_bus_stats",
      description: "Event bus topic subscription counts. ~100tok",
      inputSchema: zodToJsonSchema(GetBusStatsSchema),
    },
    {
      name: "clear_bus_topic",
      description: "Clear event bus topic handlers. ~50tok",
      inputSchema: zodToJsonSchema(ClearBusTopicSchema),
    },
    {
      name: "get_watcher_status",
      description: "File/git watcher status. ~200tok",
      inputSchema: { type: "object", properties: {}, required: [] },
    },

    // ==========================================================================
    // Snapshot & Version Tools
    // ==========================================================================
    {
      name: "create_snapshot",
      description: "Create undo snapshot of current state. ~100tok",
      inputSchema: zodToJsonSchema(CreateSnapshotSchema),
    },
    {
      name: "undo",
      description: "Restore previous snapshot. ~100tok",
      inputSchema: zodToJsonSchema(RollbackSnapshotSchema),
    },
    {
      name: "list_snapshots",
      description: "List available snapshots. ~200tok",
      inputSchema: zodToJsonSchema(ListSnapshotsSchema),
    },
    {
      name: "cleanup_snapshots",
      description: "Remove snapshots older than N days. ~100tok",
      inputSchema: zodToJsonSchema(CleanupSnapshotsSchema),
    },

    // ==========================================================================
    // Code Modification Tools
    // ==========================================================================
    {
      name: "modify_code",
      description: "Modify code: entity/search-replace/line-range modes. Auto-snapshots. ~200-500tok",
      inputSchema: zodToJsonSchema(ModifyEntityCodeSchema),
    },
    {
      name: "copy_file",
      description: "Copy file within project. ~100tok",
      inputSchema: zodToJsonSchema(CopyFileSchema),
    },
    {
      name: "rename_file",
      description: "Rename/move file. ~100tok",
      inputSchema: zodToJsonSchema(RenameFileSchema),
    },
    {
      name: "split_file",
      description: "Split file into multiple by line ranges. ~200tok",
      inputSchema: zodToJsonSchema(SplitFileSchema),
    },
    {
      name: "synthesize_files",
      description: "Merge multiple files into one. ~100tok",
      inputSchema: zodToJsonSchema(SynthesizeFilesSchema),
    },
    {
      name: "create_file",
      description: "Create new file with content. ~100tok",
      inputSchema: zodToJsonSchema(CreateFileSchema),
    },
    {
      name: "rename_symbol",
      description: "Rename symbol across project (word-boundary). Auto-snapshots. ~200tok",
      inputSchema: zodToJsonSchema(RenameSymbolSchema),
    },
    {
      name: "add_member",
      description: "Add code to class/file at start or end. ~100tok",
      inputSchema: zodToJsonSchema(AddMemberSchema),
    },

    // ==========================================================================
    // Validation Tools
    // ==========================================================================
    {
      name: "validate_file",
      description: "Lint/validate source file. ~200tok",
      inputSchema: zodToJsonSchema(ValidateFileSchema),
    },
    {
      name: "validate_directory",
      description: "Lint all files in directory. limit scales output. ~200-1000tok",
      inputSchema: zodToJsonSchema(ValidateDirectorySchema),
    },

    // ==========================================================================
    // Merge Tools
    // ==========================================================================
    {
      name: "semantic_merge",
      description: "AI semantic 3-way merge. ~200-1000tok",
      inputSchema: zodToJsonSchema(SemanticMergeSchema),
    },
    {
      name: "analyze_merge_conflicts",
      description: "Potential merge conflicts between branches. ~200-1000tok",
      inputSchema: zodToJsonSchema(AnalyzeMergeConflictsSchema),
    },
    {
      name: "get_merge_suggestions",
      description: "Suggest mergeable branches. ~200tok",
      inputSchema: zodToJsonSchema(GetMergeSuggestionsSchema),
    },
    {
      name: "get_semantic_merge_info",
      description: "Semantic merge engine capabilities. ~200tok",
      inputSchema: zodToJsonSchema(GetSemanticMergeInfoSchema),
    },

    // ==========================================================================
    // AutoDoc Tools
    // ==========================================================================
    {
      name: "autodoc_init",
      description: "Init AutoDoc (.autodoc/ dir). ~100tok",
      inputSchema: zodToJsonSchema(AutoDocInitSchema),
    },
    {
      name: "autodoc_save",
      description: "Save doc content for entity. ~100tok",
      inputSchema: zodToJsonSchema(AutoDocSaveSchema),
    },
    {
      name: "autodoc_get",
      description: "Get doc by ID. ~300tok",
      inputSchema: zodToJsonSchema(AutoDocGetSchema),
    },
    {
      name: "autodoc_search",
      description: "Search documentation. ~200-1000tok",
      inputSchema: zodToJsonSchema(AutoDocSearchSchema),
    },
    {
      name: "autodoc_validate",
      description: "Validate entity docs exist. ~200tok",
      inputSchema: zodToJsonSchema(AutoDocValidateSchema),
    },
    {
      name: "autodoc_status",
      description: "AutoDoc status: init state, doc count. ~100tok",
      inputSchema: zodToJsonSchema(AutoDocStatusSchema),
    },
    {
      name: "autodoc_sync",
      description: "Sync docs between DB and .autodoc/ files. ~200tok",
      inputSchema: zodToJsonSchema(AutoDocSyncSchema),
    },
    {
      name: "autodoc_generate",
      description: "Generate docs for entity. ~300tok",
      inputSchema: zodToJsonSchema(AutoDocGenerateSchema),
    },
    {
      name: "autodoc_changelog",
      description: "Doc change history. ~200tok",
      inputSchema: zodToJsonSchema(AutoDocChangelogSchema),
    },
    {
      name: "autodoc_install_hooks",
      description: "Install git hooks for AutoDoc. ~100tok",
      inputSchema: zodToJsonSchema(AutoDocInstallHooksSchema),
    },
    {
      name: "autodoc_detect_language",
      description: "Detect file language. ~50tok",
      inputSchema: zodToJsonSchema(AutoDocDetectLanguageSchema),
    },

    // ==========================================================================
    // Branch Tools
    // ==========================================================================
    ...branchToolDefinitions,

    // ==========================================================================
    // Trace Tools
    // ==========================================================================
    ...traceToolDefinitions,

    // ==========================================================================
    // History & Time Travel Tools
    // ==========================================================================
    {
      name: "get_entity_history",
      description: "Git history for entity's file. ~300tok",
      inputSchema: zodToJsonSchema(GetEntityHistorySchema),
    },
    {
      name: "diff_commits",
      description: "Diff stats between two commits. ~200-1000tok",
      inputSchema: zodToJsonSchema(DiffCommitsSchema),
    },
    {
      name: "checkout_commit",
      description: "Checkout commit (auto-snapshots). ~100tok",
      inputSchema: zodToJsonSchema(CheckoutCommitSchema),
    },
    {
      name: "list_commits",
      description: "Recent git commits. limit scales output. ~300tok",
      inputSchema: zodToJsonSchema(ListCommitsSchema),
    },

    // ==========================================================================
    // Worktree & Multi-Agent Tools
    // ==========================================================================
    {
      name: "spawn_agent_worktree",
      description: "Create git worktree for parallel work. ~100tok",
      inputSchema: zodToJsonSchema(SpawnAgentWorktreeSchema),
    },
    {
      name: "list_worktree_agents",
      description: "List git worktrees. ~200tok",
      inputSchema: zodToJsonSchema(ListWorktreeAgentsSchema),
    },
    {
      name: "cleanup_worktree",
      description: "Remove git worktree. ~50tok",
      inputSchema: zodToJsonSchema(CleanupWorktreeSchema),
    },
    {
      name: "get_worktree_info",
      description: "Git worktree info. ~200tok",
      inputSchema: zodToJsonSchema(GetWorktreeInfoSchema),
    },

    // ==========================================================================
    // Zig-synced tools (ported from ultracode.zig)
    // ==========================================================================
    {
      name: "grep_index",
      description: "Trigram-indexed text/regex search across files. context_lines scales output. ~300-3000tok",
      inputSchema: zodToJsonSchema(GrepIndexSchema),
    },
    {
      name: "batch_modify",
      description: "Mass-modify entities: rename/replace/remove/wrap. Preview by default. ~200-2000tok",
      inputSchema: zodToJsonSchema(BatchModifySchema),
    },
    {
      name: "batch_rename",
      description: "Mass-rename symbols with filters. Preview by default. ~200-1000tok",
      inputSchema: zodToJsonSchema(BatchRenameSchema),
    },
    {
      name: "security_scan",
      description: "Security scan: SQLi, XSS, secrets, dangerous functions. limit scales output. ~300-2000tok",
      inputSchema: zodToJsonSchema(SecurityScanSchema),
    },
    {
      name: "get_review_context",
      description: "Review context for changed files: affected entities, skip list. ~200-1000tok",
      inputSchema: zodToJsonSchema(GetReviewContextSchema),
    },
    {
      name: "detect_architecture_layers",
      description: "Detect architecture layers (API/Service/Data/UI). ~300tok",
      inputSchema: zodToJsonSchema(DetectArchitectureLayersSchema),
    },
    {
      name: "generate_onboarding",
      description: "Onboarding tour for new developers. max_steps scales output. ~500-2000tok",
      inputSchema: zodToJsonSchema(GenerateOnboardingSchema),
    },
    {
      name: "autodoc_batch_generate",
      description: "Batch module-level AUTODOC.md generation. ~200tok",
      inputSchema: zodToJsonSchema(AutoDocBatchGenerateSchema),
    },
    {
      name: "setup_embedding",
      description: "Configure local embedding inference (GPU/NPU/CPU). ~300tok",
      inputSchema: zodToJsonSchema(SetupEmbeddingSchema),
    },
  ];
}
