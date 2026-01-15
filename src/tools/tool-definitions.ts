/**
 * MCP Tool Definitions
 *
 * Defines all available MCP tools with their schemas and descriptions.
 * Used by ListToolsRequestSchema handler.
 */

import { z } from "zod";
import { branchToolDefinitions } from "./branch-schemas.js";
import {
  AddMemberSchema,
  AnalyzeCodeImpactSchema,
  AnalyzeHotspotsSchema,
  AnalyzeMergeConflictsSchema,
  AnalyzeStateChaosSchema,
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
  CleanIndexSchema,
  CleanupSnapshotsSchema,
  ClearBusTopicSchema,
  CopyFileSchema,
  CreateFileSchema,
  CreateSnapshotSchema,
  CrossLanguageSearchSchema,
  DetectCodeClonesSchema,
  DetectTechnologyStackSchema,
  FindRelatedConceptsSchema,
  FindSimilarCodeSchema,
  GetAgentMetricsSchema,
  GetBusStatsSchema,
  GetGraphHealthSchema,
  GetGraphSchema,
  GetGraphStatsSchema,
  GetMergeSuggestionsSchema,
  GetSemanticMergeInfoSchema,
  IndexToolSchema,
  JscpdCloneDetectionSchema,
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
  ValidateDirectorySchema,
  ValidateFileSchema,
} from "./schemas/index.js";
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
    // Indexing Tools
    // ==========================================================================
    {
      name: "index",
      description: "Index a codebase using multi-agent parsing and analysis",
      inputSchema: zodToJsonSchema(IndexToolSchema),
    },
    {
      name: "clean_index",
      description: "Reset graph and then perform a full index",
      inputSchema: zodToJsonSchema(CleanIndexSchema),
    },

    // ==========================================================================
    // Entity & Relationship Tools
    // ==========================================================================
    {
      name: "get_members",
      description:
        "List parsed entities within a single file (imports, functions, classes, etc.); use as the entry point to discover stable entity identifiers before running relationship queries.",
      inputSchema: zodToJsonSchema(ListEntitiesToolSchema),
    },
    {
      name: "list_entity_relationships",
      description:
        "List outgoing relationships for an entity (imports, references, containment). Provide either the entity id (preferred) or name+file path to inspect its dependencies.",
      inputSchema: zodToJsonSchema(ListRelationshipsToolSchema),
    },

    // ==========================================================================
    // Query & Search Tools
    // ==========================================================================
    {
      name: "query",
      description: "Query the code graph using natural language or structured queries",
      inputSchema: zodToJsonSchema(QueryToolSchema),
    },
    {
      name: "semantic_search",
      description:
        "Search the codebase using natural language keywords or file/module paths. Useful for discovery before diving into structural graph queries.",
      inputSchema: zodToJsonSchema(SemanticSearchSchema),
    },
    {
      name: "find_similar_code",
      description: "Find code similar to a given snippet using semantic analysis",
      inputSchema: zodToJsonSchema(FindSimilarCodeSchema),
    },
    {
      name: "cross_language_search",
      description: "Search across multiple programming languages",
      inputSchema: zodToJsonSchema(CrossLanguageSearchSchema),
    },
    {
      name: "pattern_search",
      description:
        "Advanced search with multiple modes: entity (name/type regex), content (inside entity bodies), semantic (vector similarity), hybrid (all combined). Framework-aware filtering. SIMD-accelerated similarity computation.",
      inputSchema: zodToJsonSchema(PatternSearchSchema),
    },

    // ==========================================================================
    // Analysis Tools
    // ==========================================================================
    {
      name: "analyze_code_impact",
      description:
        "Discover entities and files that depend on a given symbol. Use together with get_members to obtain the precise entity id for impact analysis.",
      inputSchema: zodToJsonSchema(AnalyzeCodeImpactSchema),
    },
    {
      name: "find_duplicates",
      description: "Find duplicate or similar code blocks across the codebase using semantic similarity",
      inputSchema: zodToJsonSchema(DetectCodeClonesSchema),
    },
    {
      name: "jscpd_detect_clones",
      description: "Run JSCPD clone detection using a lightweight tokenizer",
      inputSchema: zodToJsonSchema(JscpdCloneDetectionSchema),
    },
    {
      name: "suggest_refactoring",
      description: "Get refactoring suggestions for improving code quality",
      inputSchema: zodToJsonSchema(SuggestRefactoringSchema),
    },
    {
      name: "analyze_hotspots",
      description: "Find code hotspots based on complexity, changes, or coupling",
      inputSchema: zodToJsonSchema(AnalyzeHotspotsSchema),
    },
    {
      name: "find_related_concepts",
      description: "Find conceptually related code to a given entity",
      inputSchema: zodToJsonSchema(FindRelatedConceptsSchema),
    },
    {
      name: "analyze_state_chaos",
      description:
        "Analyze state management chaos in TypeScript/Angular codebases. Detects scattered state, measures coupling, identifies mutations, and suggests refactoring strategies. Returns AI-friendly summary or detailed report.",
      inputSchema: zodToJsonSchema(AnalyzeStateChaosSchema),
    },
    {
      name: "detect_technology_stack",
      description:
        "Automatically detect languages, frameworks, build tools, and dependencies. Useful for understanding project context. Can generate tech context for embeddings.",
      inputSchema: zodToJsonSchema(DetectTechnologyStackSchema),
    },

    // ==========================================================================
    // Graph Tools
    // ==========================================================================
    {
      name: "get_graph",
      description: "Get the code graph with all entities and relationships",
      inputSchema: zodToJsonSchema(GetGraphSchema),
    },
    {
      name: "get_graph_stats",
      description: "Get statistics about the code graph",
      inputSchema: zodToJsonSchema(GetGraphStatsSchema),
    },
    {
      name: "reset_graph",
      description: "Clear all graph data (entities, relationships, files)",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_graph_health",
      description: "Health check for graph storage (totals + sample)",
      inputSchema: zodToJsonSchema(GetGraphHealthSchema),
    },

    // ==========================================================================
    // Metrics & Diagnostics Tools
    // ==========================================================================
    {
      name: "get_metrics",
      description: "Get system metrics and agent performance statistics",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_version",
      description: "Get MCP server version information and runtime details",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_agent_metrics",
      description: "Collect runtime telemetry for conductor and registered agents",
      inputSchema: zodToJsonSchema(GetAgentMetricsSchema),
    },
    {
      name: "get_bus_stats",
      description: "Inspect knowledge bus statistics (topics, entries, subscriptions)",
      inputSchema: zodToJsonSchema(GetBusStatsSchema),
    },
    {
      name: "clear_bus_topic",
      description: "Remove cached knowledge entries for a specific topic",
      inputSchema: zodToJsonSchema(ClearBusTopicSchema),
    },
    {
      name: "get_watcher_status",
      description:
        "Get FileWatcher and GitWatcher status for diagnostics. Shows if background workers are running for incremental parsing and embedding generation.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },

    // ==========================================================================
    // Snapshot & Version Tools
    // ==========================================================================
    {
      name: "create_snapshot",
      description:
        "Create a version snapshot for rollback. Uses git stash if available, otherwise .backup/ directory. Returns snapshot ID for rollback.",
      inputSchema: zodToJsonSchema(CreateSnapshotSchema),
    },
    {
      name: "undo",
      description: "Rollback to a previous snapshot by ID. Restores all files to their snapshot state.",
      inputSchema: zodToJsonSchema(RollbackSnapshotSchema),
    },
    {
      name: "list_snapshots",
      description: "List available snapshots with creation time and description.",
      inputSchema: zodToJsonSchema(ListSnapshotsSchema),
    },
    {
      name: "cleanup_snapshots",
      description: "Delete old snapshots to free disk space.",
      inputSchema: zodToJsonSchema(CleanupSnapshotsSchema),
    },

    // ==========================================================================
    // Code Modification Tools
    // ==========================================================================
    {
      name: "modify_code",
      description:
        "Modify code of a specific entity by ID. Automatically creates snapshot, validates before/after, updates embeddings, and can rollback on error. Default preview mode shows changes without applying.",
      inputSchema: zodToJsonSchema(ModifyEntityCodeSchema),
    },
    {
      name: "copy_file",
      description:
        "Copy file or directory with automatic graph updates. Streaming for large files. Token-efficient alternative to reading full content.",
      inputSchema: zodToJsonSchema(CopyFileSchema),
    },
    {
      name: "rename_file",
      description:
        "Rename file with automatic import updates across project. Updates graph and embeddings. Token-efficient alternative to read-write pattern.",
      inputSchema: zodToJsonSchema(RenameFileSchema),
    },
    {
      name: "split_file",
      description:
        "Extract entities from a file into separate files. Useful for refactoring large files. Updates graph with new locations.",
      inputSchema: zodToJsonSchema(SplitFileSchema),
    },
    {
      name: "synthesize_files",
      description:
        "Combine multiple files into one. Merges entities in graph. Can optionally delete originals. Token-efficient way to consolidate code.",
      inputSchema: zodToJsonSchema(SynthesizeFilesSchema),
    },
    {
      name: "create_file",
      description:
        "Create a new file with content. Automatically parses and adds entities to graph. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(CreateFileSchema),
    },
    {
      name: "rename_symbol",
      description:
        "Rename a symbol (variable, function, class, etc.) and update all references. Supports entity ID or name-based lookup. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(RenameSymbolSchema),
    },
    {
      name: "add_member",
      description:
        "Add a new member (method, property, field) to a class or interface. Supports precise positioning. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(AddMemberSchema),
    },

    // ==========================================================================
    // Validation Tools
    // ==========================================================================
    {
      name: "validate_file",
      description:
        "Validate code file using appropriate linter (ESLint for JS/TS, Pylint for Python). Returns problems categorized by severity.",
      inputSchema: zodToJsonSchema(ValidateFileSchema),
    },
    {
      name: "validate_directory",
      description:
        "Validate all code files in directory. Batch processing with concurrency limit. Returns aggregated validation report.",
      inputSchema: zodToJsonSchema(ValidateDirectorySchema),
    },

    // ==========================================================================
    // Merge Tools
    // ==========================================================================
    {
      name: "semantic_merge",
      description:
        "AI-powered semantic merge of git branches. Automatically finds merge-base, reads files from branches, performs semantic 3-way merge, and writes results as unstaged changes. Supports dry-run mode and auto-resolve.",
      inputSchema: zodToJsonSchema(SemanticMergeSchema),
    },
    {
      name: "analyze_merge_conflicts",
      description:
        "Analyze potential merge conflicts between two branches without performing the merge. Returns conflicts with severity classification and affected code units.",
      inputSchema: zodToJsonSchema(AnalyzeMergeConflictsSchema),
    },
    {
      name: "get_merge_suggestions",
      description:
        "Get AI-generated suggestions for resolving a specific merge conflict. Requires conflict ID from analyze_merge_conflicts.",
      inputSchema: zodToJsonSchema(GetMergeSuggestionsSchema),
    },
    {
      name: "get_semantic_merge_info",
      description: "Get information about semantic merge capabilities, supported features, and usage examples.",
      inputSchema: zodToJsonSchema(GetSemanticMergeInfoSchema),
    },

    // ==========================================================================
    // AutoDoc Tools
    // ==========================================================================
    {
      name: "autodoc_init",
      description:
        "Initialize AutoDoc semantic documentation layer. Configure language, docs directory, and enable/disable.",
      inputSchema: zodToJsonSchema(AutoDocInitSchema),
    },
    {
      name: "autodoc_save",
      description:
        "Save a markdown documentation file. Parses sections, extracts references to code entities, and indexes for search.",
      inputSchema: zodToJsonSchema(AutoDocSaveSchema),
    },
    {
      name: "autodoc_get",
      description: "Get documentation by ID or file path. Returns parsed sections with metadata.",
      inputSchema: zodToJsonSchema(AutoDocGetSchema),
    },
    {
      name: "autodoc_search",
      description: "Search documentation by text query. Returns matching sections with relevance scores.",
      inputSchema: zodToJsonSchema(AutoDocSearchSchema),
    },
    {
      name: "autodoc_validate",
      description:
        "Validate documentation references. Checks that all code entity references point to existing entities.",
      inputSchema: zodToJsonSchema(AutoDocValidateSchema),
    },
    {
      name: "autodoc_status",
      description: "Get AutoDoc status including statistics on documents, references, and broken links.",
      inputSchema: zodToJsonSchema(AutoDocStatusSchema),
    },
    {
      name: "autodoc_sync",
      description: "Sync documentation with code changes. Validates references and marks outdated docs.",
      inputSchema: zodToJsonSchema(AutoDocSyncSchema),
    },
    {
      name: "autodoc_generate",
      description:
        "Auto-generate documentation for the codebase. Creates .autodoc/ for general docs and README.md in each module folder.",
      inputSchema: zodToJsonSchema(AutoDocGenerateSchema),
    },
    {
      name: "autodoc_changelog",
      description: "View documentation change history. Shows what docs were affected by code changes.",
      inputSchema: zodToJsonSchema(AutoDocChangelogSchema),
    },
    {
      name: "autodoc_install_hooks",
      description:
        "Install or uninstall git pre-commit hooks for documentation validation. Ensures references are valid before commits.",
      inputSchema: zodToJsonSchema(AutoDocInstallHooksSchema),
    },
    {
      name: "autodoc_detect_language",
      description: "Detect documentation language from code comments and existing docs. Supports en, ru, zh.",
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
  ];
}
