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
      description:
        "[INFO] Get detailed documentation and guides about UltraCode. Essential reading before using tools. Topics: 'quick-start', 'tool-reference', 'workflows', 'tracing', 'autodoc', 'patterns', 'security'. Agent-specific: 'explore' (fast search), 'planning' (risk assessment), 'modification' (safe code changes). Use category matching your role for optimized guidance.",
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
            .describe("Documentation topic to read. Use explore/planning/modification for agent-specific guides."),
        }),
      ),
    },
    {
      name: "get_tools_for_task",
      description:
        "[INFO] Recommend relevant tools for your task. Describe what you want to do (e.g. 'find duplicates', 'refactor safely', 'understand data flow') and get ranked tool suggestions. Optionally specify your agent type (explore/plan/modify) for filtered recommendations. Returns top 10 tools with scores and reasons.",
      inputSchema: zodToJsonSchema(
        z.object({
          task: z.string().describe("What you want to do (e.g. 'find duplicates', 'trace execution path')"),
          agentType: z
            .enum(["explore", "plan", "modify", "analyze", "any"])
            .optional()
            .describe("Your agent type for filtered recommendations"),
        }),
      ),
    },

    // ==========================================================================
    // Indexing Tools
    // ==========================================================================
    {
      name: "index",
      description:
        "[INDEX] ⚠️ USUALLY NOT NEEDED! GitWatcher indexes automatically: incremental on file changes, full on branch switch and first setup. Manual call only to force full reindex or if indexing failed. Multi-agent parsing for TS/JS/Python/Go/Rust/Java/C++. Example: index(directory='D:\\\\project'). 📖 get_help(topic='quick-start').",
      inputSchema: zodToJsonSchema(IndexToolSchema),
    },
    {
      name: "clean_index",
      description: "[INDEX] Reset graph and then perform a full index",
      inputSchema: zodToJsonSchema(CleanIndexSchema),
    },

    // ==========================================================================
    // Entity & Relationship Tools
    // ==========================================================================
    {
      name: "get_members",
      description:
        "[EXPLORE] List parsed entities within a single file (imports, functions, classes, etc.); use as the entry point to discover stable entity identifiers before running relationship queries.",
      inputSchema: zodToJsonSchema(ListEntitiesToolSchema),
    },
    {
      name: "list_entity_relationships",
      description:
        "[EXPLORE] List outgoing relationships for an entity (imports, references, containment). Provide either the entity id (preferred) or name+file path to inspect its dependencies.",
      inputSchema: zodToJsonSchema(ListRelationshipsToolSchema),
    },

    // ==========================================================================
    // Query & Search Tools
    // ==========================================================================
    {
      name: "query",
      description: "[EXPLORE] Query the code graph using natural language or structured queries",
      inputSchema: zodToJsonSchema(QueryToolSchema),
    },
    {
      name: "semantic_search",
      description:
        "[EXPLORE] Search codebase by MEANING using natural language (5-10x faster than Grep). Understands 'auth functions', 'error handlers', 'API endpoints'. Returns rich metadata: complexity, control flow, documentation status. Supports filters: minCyclomatic, hasExceptions, hasAwaits, hasDocumentation. Supports changedInLastCommits/changedSinceMs to narrow to recently changed code. Examples: 'data processing minCyclomatic=10' (complex code), 'API hasAwaits=true changedInLastCommits=5' (recently changed async code). 📖 Run get_help(topic='quick-start') for full guide.",
      inputSchema: zodToJsonSchema(SemanticSearchSchema),
    },
    {
      name: "find_similar_code",
      description: "[EXPLORE] Find code similar to a given snippet using semantic analysis",
      inputSchema: zodToJsonSchema(FindSimilarCodeSchema),
    },
    {
      name: "cross_language_search",
      description: "[EXPLORE] Search across multiple programming languages",
      inputSchema: zodToJsonSchema(CrossLanguageSearchSchema),
    },
    {
      name: "pattern_search",
      description:
        "[EXPLORE] Advanced multi-mode search: entity (regex on names/types), content (search inside code), semantic (meaning), hybrid (combined). Framework-aware (filter by React/Vue/Angular). SIMD-accelerated. Supports changedInLastCommits/changedSinceMs history filters. Use when semantic_search isn't enough. Examples: pattern_search(pattern='handle.*Error', mode='entity'), pattern_search(pattern='useState', mode='content', changedInLastCommits=5). 📖 get_help(topic='tool-reference').",
      inputSchema: zodToJsonSchema(PatternSearchSchema),
    },

    // ==========================================================================
    // Analysis Tools
    // ==========================================================================
    {
      name: "analyze_code_impact",
      description:
        "[PLAN] Impact analysis: what breaks if I change X? Find all entities/files depending on a symbol. Use BEFORE refactoring/deletion to prevent regressions. Supports highlightRecentChanges to annotate volatile dependencies. Workflow: 1) get_members(file='utils.ts') to get entity IDs, 2) analyze_code_impact(entityId='...', highlightRecentChanges=true). Returns dependent files, functions, risk score, volatility ratio. 📖 get_help(topic='workflows').",
      inputSchema: zodToJsonSchema(AnalyzeCodeImpactSchema),
    },
    {
      name: "find_duplicates",
      description: "[ANALYZE] Find duplicate or similar code blocks across the codebase using semantic similarity",
      inputSchema: zodToJsonSchema(DetectCodeClonesSchema),
    },
    {
      name: "jscpd_detect_clones",
      description: "[ANALYZE] Run JSCPD clone detection using a lightweight tokenizer",
      inputSchema: zodToJsonSchema(JscpdCloneDetectionSchema),
    },
    {
      name: "suggest_refactoring",
      description: "[ANALYZE] Get refactoring suggestions for improving code quality",
      inputSchema: zodToJsonSchema(SuggestRefactoringSchema),
    },
    {
      name: "analyze_hotspots",
      description: "[PLAN] Find code hotspots based on complexity, changes, or coupling",
      inputSchema: zodToJsonSchema(AnalyzeHotspotsSchema),
    },
    {
      name: "find_related_concepts",
      description: "[ANALYZE] Find conceptually related code to a given entity",
      inputSchema: zodToJsonSchema(FindRelatedConceptsSchema),
    },
    {
      name: "analyze_state_chaos",
      description:
        "[ANALYZE] Analyze state management chaos in any codebase (TypeScript, C#, etc.). Detects scattered state, race conditions, C# anti-patterns (async-void, mutable-static, god-service), and suggests refactoring strategies.",
      inputSchema: zodToJsonSchema(AnalyzeStateChaosSchema),
    },
    {
      name: "analyze_swagger_impact",
      description:
        "[PLAN] Analyze impact of Swagger/OpenAPI spec changes. Shows affected controllers (producers), generated clients (consumers), and generated types. Assesses breaking change risk. Use before modifying swagger files or controllers that produce API. 📖 get_help(topic='workflows').",
      inputSchema: zodToJsonSchema(AnalyzeSwaggerImpactSchema),
    },
    {
      name: "analyze_api_impact",
      description:
        "[PLAN] Analyze impact of API contract changes across Swagger/OpenAPI, Protobuf/gRPC, and GraphQL schemas. Shows affected producers (servers/resolvers), consumers (clients/hooks), and generated types. Auto-detects contract type or filter with contractType parameter. Use before modifying any API spec.",
      inputSchema: zodToJsonSchema(AnalyzeApiImpactSchema),
    },
    {
      name: "get_database_schema",
      description:
        "[EXPLORE] Show database schema reconstructed from SQL files, Prisma schemas, ORM models (TypeORM, Sequelize, JPA, EF Core, Django, SQLAlchemy, GORM, Dapper, linq2db), and Redis key patterns. Filters: tableName (partial match), dbEngine (postgres/mysql/clickhouse/redis/sqlite/mssql). Use includeRelationships=true for FK and code links.",
      inputSchema: zodToJsonSchema(GetDatabaseSchemaSchema),
    },
    {
      name: "graph_metrics",
      description:
        "[PLAN] Graph-based architecture metrics: PageRank (entity importance), Louvain (community/module detection), centrality (hub/authority/bridge roles), bus factor (knowledge concentration risk). Use persist=true to store PageRank/Louvain in entity metadata for semantic search boosting. Workflow: graph_metrics({metric:'pagerank', topN:10}) → top-10 most important entities.",
      inputSchema: zodToJsonSchema(GraphMetricsSchema),
    },
    {
      name: "detect_technology_stack",
      description:
        "[EXPLORE] Automatically detect languages, frameworks, build tools, and dependencies. Useful for understanding project context. Can generate tech context for embeddings.",
      inputSchema: zodToJsonSchema(DetectTechnologyStackSchema),
    },

    // ==========================================================================
    // Architecture Diagrams
    // ==========================================================================
    {
      name: "get_architecture_diagram",
      description:
        "[EXPLORE] Generate architecture diagrams in Mermaid, Graphviz DOT, or D2 format. " +
        "Specify entryPoint (file/class/module) or omit for project overview. " +
        "depth controls detail level (1=files, 2=classes, 3=methods). " +
        "dataFlowLevel adds type annotations (0=none, 1=basic types, 2=params+conditionals, 3=field mapping). " +
        "Auto-detects diagramType (flowchart/class/component) from code structure. " +
        "Example: get_architecture_diagram({depth:2, dataFlowLevel:1, format:'mermaid'}).",
      inputSchema: zodToJsonSchema(GetArchitectureDiagramSchema),
    },

    // ==========================================================================
    // Pattern Detection
    // ==========================================================================
    {
      name: "detect_patterns",
      description:
        "[ANALYZE] Detect anti-patterns, best-patterns, code smells, and optimization opportunities. " +
        "Uses structural analysis + semantic validation (embedding similarity with curated examples) " +
        "to dramatically reduce false positives. Supports 100+ rules across 6 languages. " +
        "Filters: category, tags, severity, minConfidence. " +
        "Categories: anti-pattern (bad practices), best-pattern (good practices), " +
        "code-smell (structural issues), optimization (performance improvements with Big-O). " +
        "Example: detect_patterns({category:'optimization', tags:['performance']}). " +
        "📖 get_help(topic='patterns')",
      inputSchema: zodToJsonSchema(DetectPatternsSchema),
    },
    {
      name: "check_entity_patterns",
      description:
        "[ANALYZE] Check specific entity for anti-patterns, best-patterns, and optimization opportunities. " +
        "Returns matched patterns with confidence scores, Big-O analysis, and improvement suggestions.",
      inputSchema: zodToJsonSchema(CheckEntityPatternsSchema),
    },

    // ==========================================================================
    // Stacktrace Analysis
    // ==========================================================================
    {
      name: "analyze_stacktrace",
      description:
        "[ANALYZE] Parse and diagnose stacktraces from any language (JS/TS, Python, Java/Kotlin, C#, Go, Rust, C/C++, Zig). " +
        "Auto-detects language, resolves frames to code graph entities, classifies errors, " +
        "runs backwards trace and impact analysis on crash point. " +
        "Returns crash location, call chain, severity, suggested fixes, and Mermaid diagram. " +
        "Example: analyze_stacktrace({stacktrace: '...error text...', format: 'text'}).",
      inputSchema: zodToJsonSchema(AnalyzeStacktraceSchema),
    },

    // ==========================================================================
    // Security Tools
    // ==========================================================================
    {
      name: "taint_analysis",
      description:
        "[SECURITY] Interprocedural taint analysis: trace untrusted data from sources (req.body, process.env, fetch) to sinks (eval, exec, innerHTML, db.query) and detect missing sanitization. Categories: sql_injection, xss, command_injection, path_traversal, ssrf, prototype_pollution, missing_auth. The missing_auth category detects API endpoints (REST, gRPC, GraphQL) without authorization checks reaching sensitive operations. Returns vulnerability flows with severity, confidence, and fix suggestions. Supports offset/limit pagination for large results. Example: taint_analysis({category:'missing_auth', offset:0, limit:10}).",
      inputSchema: zodToJsonSchema(TaintAnalysisSchema),
    },

    // ==========================================================================
    // Graph Tools
    // ==========================================================================
    {
      name: "get_graph",
      description: "[INFO] Get the code graph with all entities and relationships",
      inputSchema: zodToJsonSchema(GetGraphSchema),
    },
    {
      name: "get_graph_stats",
      description: "[INFO] Get statistics about the code graph",
      inputSchema: zodToJsonSchema(GetGraphStatsSchema),
    },
    {
      name: "reset_graph",
      description: "[SYSTEM] Clear all graph data (entities, relationships, files)",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_graph_health",
      description: "[INFO] Health check for graph storage (totals + sample)",
      inputSchema: zodToJsonSchema(GetGraphHealthSchema),
    },

    // ==========================================================================
    // Metrics & Diagnostics Tools
    // ==========================================================================
    {
      name: "get_metrics",
      description: "[INFO] Get system metrics and agent performance statistics",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_version",
      description: "[INFO] Get MCP server version information and runtime details",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    {
      name: "get_agent_metrics",
      description: "[INFO] Collect runtime telemetry for conductor and registered agents",
      inputSchema: zodToJsonSchema(GetAgentMetricsSchema),
    },
    {
      name: "get_bus_stats",
      description: "[INFO] Inspect knowledge bus statistics (topics, entries, subscriptions)",
      inputSchema: zodToJsonSchema(GetBusStatsSchema),
    },
    {
      name: "clear_bus_topic",
      description: "[SYSTEM] Remove cached knowledge entries for a specific topic",
      inputSchema: zodToJsonSchema(ClearBusTopicSchema),
    },
    {
      name: "get_watcher_status",
      description:
        "[INFO] Get FileWatcher and GitWatcher status for diagnostics. Shows if background workers are running for incremental parsing and embedding generation.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },

    // ==========================================================================
    // Snapshot & Version Tools
    // ==========================================================================
    {
      name: "create_snapshot",
      description:
        "[MODIFY] Create a version snapshot for rollback. Uses git stash if available, otherwise .backup/ directory. Returns snapshot ID for rollback.",
      inputSchema: zodToJsonSchema(CreateSnapshotSchema),
    },
    {
      name: "undo",
      description: "[MODIFY] Rollback to a previous snapshot by ID. Restores all files to their snapshot state.",
      inputSchema: zodToJsonSchema(RollbackSnapshotSchema),
    },
    {
      name: "list_snapshots",
      description: "[MODIFY] List available snapshots with creation time and description.",
      inputSchema: zodToJsonSchema(ListSnapshotsSchema),
    },
    {
      name: "cleanup_snapshots",
      description: "[MODIFY] Delete old snapshots to free disk space.",
      inputSchema: zodToJsonSchema(CleanupSnapshotsSchema),
    },

    // ==========================================================================
    // Code Modification Tools
    // ==========================================================================
    {
      name: "modify_code",
      description:
        "[MODIFY] Safe code modification with auto-snapshot, validation, rollback. Modifies specific entity by ID (get ID via get_members first). Preview mode by default (no changes). Set apply=true for real changes. Workflow: 1) get_members(file='...'), 2) modify_code(entityId='...', newCode='...', preview=false, apply=true). Auto-validates syntax, updates embeddings. 📖 get_help(topic='workflows').",
      inputSchema: zodToJsonSchema(ModifyEntityCodeSchema),
    },
    {
      name: "copy_file",
      description:
        "[MODIFY] Copy file or directory with automatic graph updates. Streaming for large files. Token-efficient alternative to reading full content.",
      inputSchema: zodToJsonSchema(CopyFileSchema),
    },
    {
      name: "rename_file",
      description:
        "[MODIFY] Rename file with automatic import updates across project. Updates graph and embeddings. Token-efficient alternative to read-write pattern.",
      inputSchema: zodToJsonSchema(RenameFileSchema),
    },
    {
      name: "split_file",
      description:
        "[MODIFY] Extract entities from a file into separate files. Useful for refactoring large files. Updates graph with new locations.",
      inputSchema: zodToJsonSchema(SplitFileSchema),
    },
    {
      name: "synthesize_files",
      description:
        "[MODIFY] Combine multiple files into one. Merges entities in graph. Can optionally delete originals. Token-efficient way to consolidate code.",
      inputSchema: zodToJsonSchema(SynthesizeFilesSchema),
    },
    {
      name: "create_file",
      description:
        "[MODIFY] Create a new file with content. Automatically parses and adds entities to graph. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(CreateFileSchema),
    },
    {
      name: "rename_symbol",
      description:
        "[MODIFY] Safe rename across project: updates ALL references automatically. Works on variables, functions, classes, etc. Find via entity ID (get_members) or name+file. Creates snapshot before changes. Example: rename_symbol(entityName='oldName', newName='newName', filePath='src/utils.ts'). Much safer than manual find-replace. 📖 get_help(topic='workflows').",
      inputSchema: zodToJsonSchema(RenameSymbolSchema),
    },
    {
      name: "add_member",
      description:
        "[MODIFY] Add a new member (method, property, field) to a class or interface. Supports precise positioning. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(AddMemberSchema),
    },

    // ==========================================================================
    // Validation Tools
    // ==========================================================================
    {
      name: "validate_file",
      description:
        "[ANALYZE] Validate code file using appropriate linter (oxlint for JS/TS, Pylint for Python). Supports automatic fixes with fixable parameter and auto-detection of linter based on project config (biome.json, .eslintrc). Returns problems categorized by severity.",
      inputSchema: zodToJsonSchema(ValidateFileSchema),
    },
    {
      name: "validate_directory",
      description:
        "[ANALYZE] Validate all code files in directory with batch processing. Supports automatic fixes with fixable parameter and auto-detection of linter. Returns aggregated validation report.",
      inputSchema: zodToJsonSchema(ValidateDirectorySchema),
    },

    // ==========================================================================
    // Merge Tools
    // ==========================================================================
    {
      name: "semantic_merge",
      description:
        "[MERGE] AI-powered semantic merge of git branches. Automatically finds merge-base, reads files from branches, performs semantic 3-way merge, and writes results as unstaged changes. Supports dry-run mode and auto-resolve.",
      inputSchema: zodToJsonSchema(SemanticMergeSchema),
    },
    {
      name: "analyze_merge_conflicts",
      description:
        "[MERGE] Analyze potential merge conflicts between two branches without performing the merge. Returns conflicts with severity classification and affected code units.",
      inputSchema: zodToJsonSchema(AnalyzeMergeConflictsSchema),
    },
    {
      name: "get_merge_suggestions",
      description:
        "[MERGE] Get AI-generated suggestions for resolving a specific merge conflict. Requires conflict ID from analyze_merge_conflicts.",
      inputSchema: zodToJsonSchema(GetMergeSuggestionsSchema),
    },
    {
      name: "get_semantic_merge_info",
      description: "[MERGE] Get information about semantic merge capabilities, supported features, and usage examples.",
      inputSchema: zodToJsonSchema(GetSemanticMergeInfoSchema),
    },

    // ==========================================================================
    // AutoDoc Tools
    // ==========================================================================
    {
      name: "autodoc_init",
      description:
        "[DOC] Initialize AutoDoc semantic documentation layer. Configure language, docs directory, and enable/disable.",
      inputSchema: zodToJsonSchema(AutoDocInitSchema),
    },
    {
      name: "autodoc_save",
      description:
        "[DOC] Save a markdown documentation file. Parses sections, extracts references to code entities, and indexes for search.",
      inputSchema: zodToJsonSchema(AutoDocSaveSchema),
    },
    {
      name: "autodoc_get",
      description: "[DOC] Get documentation by ID or file path. Returns parsed sections with metadata.",
      inputSchema: zodToJsonSchema(AutoDocGetSchema),
    },
    {
      name: "autodoc_search",
      description: "[DOC] Search documentation by text query. Returns matching sections with relevance scores.",
      inputSchema: zodToJsonSchema(AutoDocSearchSchema),
    },
    {
      name: "autodoc_validate",
      description:
        "[DOC] Validate documentation references. Checks that all code entity references point to existing entities.",
      inputSchema: zodToJsonSchema(AutoDocValidateSchema),
    },
    {
      name: "autodoc_status",
      description: "[DOC] Get AutoDoc status including statistics on documents, references, and broken links.",
      inputSchema: zodToJsonSchema(AutoDocStatusSchema),
    },
    {
      name: "autodoc_sync",
      description: "[DOC] Sync documentation with code changes. Validates references and marks outdated docs.",
      inputSchema: zodToJsonSchema(AutoDocSyncSchema),
    },
    {
      name: "autodoc_generate",
      description:
        "[DOC] Auto-generate documentation for the codebase. Creates .autodoc/ for general docs and README.md in each module folder.",
      inputSchema: zodToJsonSchema(AutoDocGenerateSchema),
    },
    {
      name: "autodoc_changelog",
      description: "[DOC] View documentation change history. Shows what docs were affected by code changes.",
      inputSchema: zodToJsonSchema(AutoDocChangelogSchema),
    },
    {
      name: "autodoc_install_hooks",
      description:
        "[DOC] Install or uninstall git pre-commit hooks for documentation validation. Ensures references are valid before commits.",
      inputSchema: zodToJsonSchema(AutoDocInstallHooksSchema),
    },
    {
      name: "autodoc_detect_language",
      description: "[DOC] Detect documentation language from code comments and existing docs. Supports en, ru, zh.",
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
      description:
        "[HISTORY] Get change history for a specific entity across commits. Shows when entity was added, modified, or deleted.",
      inputSchema: zodToJsonSchema(GetEntityHistorySchema),
    },
    {
      name: "diff_commits",
      description: "[HISTORY] Compare two graph commits and show differences (added, modified, deleted entities).",
      inputSchema: zodToJsonSchema(DiffCommitsSchema),
    },
    {
      name: "checkout_commit",
      description:
        "[HISTORY] View graph state at a specific commit (time travel). Retrieve entity snapshots from historical versions.",
      inputSchema: zodToJsonSchema(CheckoutCommitSchema),
    },
    {
      name: "list_commits",
      description:
        "[HISTORY] List graph commits (version history). Shows commit hashes, messages, entity counts, and timestamps.",
      inputSchema: zodToJsonSchema(ListCommitsSchema),
    },
  ];
}
