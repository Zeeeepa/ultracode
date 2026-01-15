/**
 * Semantic Tool Handlers
 *
 * Handlers for semantic search operations:
 * - semantic_search
 * - find_similar_code
 * - find_duplicates
 * - jscpd_detect_clones
 * - cross_language_search
 * - pattern_search
 */

import { z } from "zod";
import { log } from "../../logging/index.js";
import type { EntityType } from "../../types/storage.js";
import { toError } from "../../utils/error-handling.js";
import type { IClone } from "../../vendor/jscpd/index.js";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, paginate, SAFE_LIMITS } from "../response-limits.js";
import { DetectCodeClonesSchema } from "../schemas/semantic-schemas.js";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Metadata for semantic search results
 */
interface SemanticResultMetadata {
  name?: string;
  entityType?: string;
  type?: string;
  filePath?: string;
  path?: string;
  content?: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  entityId?: string;
  // Complexity metrics
  cyclomatic?: number;
  cognitive?: number;
  linesOfCode?: number;
  nestingDepth?: number;
  // Control flow
  hasBranches?: boolean;
  hasLoops?: boolean;
  hasExceptions?: boolean;
  hasAwaits?: boolean;
  branchCount?: number;
  loopCount?: number;
  returnCount?: number;
  // Calls
  callCount?: number;
  hasAsyncCalls?: boolean;
  // Documentation
  hasDocumentation?: boolean;
  hasParams?: boolean;
  hasExamples?: boolean;
  isDeprecated?: boolean;
  // Types
  returnType?: string;
  paramCount?: number;
}

/**
 * Semantic search result
 */
interface SemanticSearchResult {
  id: string;
  name?: string;
  type?: string;
  similarity: number;
  reranked?: boolean;
  filePath?: string;
  content?: string;
  metadata?: SemanticResultMetadata;
  isExpanded?: boolean;
  relationshipType?: string;
}

/**
 * Clone group member
 */
interface CloneMember {
  id: string;
  name: string;
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Clone detection group
 */
interface CloneGroup {
  avgSimilarity: number;
  cloneType: string;
  members?: CloneMember[];
}

// =============================================================================
// SEMANTIC SEARCH
// =============================================================================

const SemanticSearchSchema = z.object({
  query: z.string().describe("Natural language search query"),
  projectPath: projectPathParam,
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  entityTypes: z.array(z.string()).optional().describe("Filter by entity types (function, class, interface, etc.)"),
  minSimilarity: z.number().optional().default(0.7).describe("Minimum similarity threshold (0.0-1.0)"),
  includeContent: z.boolean().optional().default(true).describe("Include full code content with comments in results"),
  expandRelated: z
    .boolean()
    .optional()
    .default(false)
    .describe("Expand results with graph neighbors (callers, dependencies, inheritors)"),
  expansionDepth: z.number().optional().default(1).describe("Graph traversal depth for expansion (1 or 2 hops)"),
  // Two-stage retrieval with reranking
  rerank: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Enable two-stage retrieval: rerank top results with cross-encoder for better precision (requires vLLM or TEI provider)",
    ),
  rerankTopK: z.number().optional().default(50).describe("Number of top embedding results to rerank (default: 50)"),
  // New filters based on parser-extracted data
  minCyclomatic: z.number().optional().describe("Filter: minimum cyclomatic complexity"),
  maxCyclomatic: z.number().optional().describe("Filter: maximum cyclomatic complexity"),
  hasExceptions: z.boolean().optional().describe("Filter: must have try-catch blocks"),
  hasLoops: z.boolean().optional().describe("Filter: must have loops"),
  hasAwaits: z.boolean().optional().describe("Filter: must have await expressions (async code)"),
  hasDocumentation: z.boolean().optional().describe("Filter: must have documentation/docstrings"),
  isDeprecated: z.boolean().optional().describe("Filter: deprecated entities only"),
  minCallCount: z.number().optional().describe("Filter: minimum number of function calls"),
});

export class SemanticSearchToolHandler extends BaseToolHandler<z.infer<typeof SemanticSearchSchema>> {
  protected parseArgs(args: unknown) {
    return SemanticSearchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SemanticSearchSchema>): Promise<ToolResult> {
    // Project context validation
    const resolvedPath = this.resolveProjectPath(args);
    const currentProject = this.getProjectContext().getCurrentProject();

    // DEBUG: Log project paths
    log.d("SEMSEARCH", "proj_paths", { arg: args.projectPath, resolved: resolvedPath, current: currentProject });

    if (args.projectPath && resolvedPath !== currentProject) {
      // Check if requested project is indexed
      if (!this.isProjectIndexed(resolvedPath)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: `Project not indexed: ${resolvedPath}`,
                  hint: "Run 'index' tool on the target directory first",
                  currentProject,
                  requestedProject: resolvedPath,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Warn that cross-project search requires project switch
      log.w("SEMSEARCH", "cross_proj", { current: currentProject, requested: resolvedPath });
    }

    // Ensure SemanticAgent uses the correct project's VectorStore
    const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
    // v3: Also ensure GraphStorage context for expandWithGraphNeighbors
    await this.ensureGraphStorageForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more results for pagination and filtering
    // Use semanticSearch method (returns SemanticResult with results array)
    const searchResult = await semanticAgent.semanticSearch(args.query, 1000);
    let allResults = searchResult.results || [];

    // Two-stage retrieval: rerank top results with cross-encoder for better precision
    let rerankStats = { reranked: false, provider: "" as string };
    if (args.rerank && allResults.length > 0) {
      const provider = semanticAgent.getEmbeddingProvider?.();
      const capabilities = provider?.getCapabilities?.();

      if (capabilities?.rerank && provider?.rerank) {
        try {
          // Take top K results for reranking (cross-encoder is slower but more accurate)
          const topK = Math.min(args.rerankTopK, allResults.length);
          const toRerank = allResults.slice(0, topK);

          // Prepare documents for reranking
          const documents = toRerank.map((r: SemanticSearchResult, idx: number) => ({
            text: r.content || r.metadata?.content || r.name || "",
            id: r.id || String(idx),
          }));

          // Rerank with cross-encoder
          const reranked = await provider.rerank(args.query, documents, {
            topK,
            threshold: args.minSimilarity,
          });

          // Update results with reranked scores
          const rerankedMap = new Map(reranked.map((r: { id?: string | undefined; score: number }) => [r.id, r.score]));
          for (const result of toRerank) {
            const newScore = rerankedMap.get(result.id);
            if (newScore !== undefined) {
              result.similarity = newScore;
              result.reranked = true;
            }
          }

          // Re-sort by new scores
          allResults = [...toRerank, ...allResults.slice(topK)];
          allResults.sort(
            (a: SemanticSearchResult, b: SemanticSearchResult) => (b.similarity || 0) - (a.similarity || 0),
          );

          rerankStats = { reranked: true, provider: provider.info?.name || "unknown" };
        } catch (error: unknown) {
          const err = toError(error);
          log.w("SEMSEARCH", "rerank_fail", { err: err.message });
          // Continue with embedding-only results
        }
      }
    }

    // Apply metadata-based filters
    let filteredResults = allResults;
    const hasFilters =
      args.minCyclomatic !== undefined ||
      args.maxCyclomatic !== undefined ||
      args.hasExceptions !== undefined ||
      args.hasLoops !== undefined ||
      args.hasAwaits !== undefined ||
      args.hasDocumentation !== undefined ||
      args.isDeprecated !== undefined ||
      args.minCallCount !== undefined;

    if (hasFilters) {
      filteredResults = allResults.filter((r: SemanticSearchResult) => {
        const meta = r.metadata || {};

        // Complexity filters
        if (args.minCyclomatic !== undefined && (meta.cyclomatic || 0) < args.minCyclomatic) return false;
        if (args.maxCyclomatic !== undefined && (meta.cyclomatic || Infinity) > args.maxCyclomatic) return false;

        // Control flow filters
        if (args.hasExceptions !== undefined && meta.hasExceptions !== args.hasExceptions) return false;
        if (args.hasLoops !== undefined && meta.hasLoops !== args.hasLoops) return false;
        if (args.hasAwaits !== undefined && meta.hasAwaits !== args.hasAwaits) return false;

        // Documentation filters
        if (args.hasDocumentation !== undefined && meta.hasDocumentation !== args.hasDocumentation) return false;
        if (args.isDeprecated !== undefined && meta.isDeprecated !== args.isDeprecated) return false;

        // Call count filter
        if (args.minCallCount !== undefined && (meta.callCount || 0) < args.minCallCount) return false;

        return true;
      });
    }

    // Expand results with graph neighbors if requested
    let expandedResults = filteredResults;
    let expansionStats = { expanded: false, neighborsAdded: 0 };

    if (args.expandRelated && filteredResults.length > 0) {
      const expansion = await this.expandWithGraphNeighbors(filteredResults, args.expansionDepth, args.minSimilarity);
      expandedResults = expansion.results;
      expansionStats = { expanded: true, neighborsAdded: expansion.neighborsAdded };
    }

    const paginatedResult = paginate(expandedResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: args.query,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              ...(rerankStats.reranked ? { rerank: rerankStats } : {}),
              ...(expansionStats.expanded ? { expansion: expansionStats } : {}),
              results: (paginatedResult.data as SemanticSearchResult[]).map((r) => {
                const meta = r.metadata || {};
                return {
                  id: r.id,
                  name: r.name || meta.name,
                  type: r.type || meta.entityType || meta.type,
                  similarity: r.similarity,
                  ...(r.reranked ? { reranked: true } : {}),
                  filePath: r.filePath || meta.filePath || meta.path,
                  // Location info for navigation (file:startLine-endLine)
                  startLine: meta.startLine,
                  endLine: meta.endLine,
                  language: meta.language,
                  // Complexity metrics (if available)
                  ...(meta.cyclomatic
                    ? {
                        complexity: {
                          cyclomatic: meta.cyclomatic,
                          cognitive: meta.cognitive,
                          linesOfCode: meta.linesOfCode,
                          nestingDepth: meta.nestingDepth,
                        },
                      }
                    : {}),
                  // Control flow info (if available)
                  ...(meta.hasBranches !== undefined
                    ? {
                        controlFlow: {
                          hasBranches: meta.hasBranches,
                          hasLoops: meta.hasLoops,
                          hasExceptions: meta.hasExceptions,
                          hasAwaits: meta.hasAwaits,
                          branchCount: meta.branchCount,
                          loopCount: meta.loopCount,
                          returnCount: meta.returnCount,
                        },
                      }
                    : {}),
                  // Call info (if available)
                  ...(meta.callCount
                    ? {
                        calls: {
                          count: meta.callCount,
                          hasAsync: meta.hasAsyncCalls,
                        },
                      }
                    : {}),
                  // Documentation info (if available)
                  ...(meta.hasDocumentation
                    ? {
                        documentation: {
                          hasDocumentation: true,
                          hasParams: meta.hasParams,
                          hasExamples: meta.hasExamples,
                          isDeprecated: meta.isDeprecated,
                        },
                      }
                    : {}),
                  // Type info
                  ...(meta.returnType ? { returnType: meta.returnType } : {}),
                  ...(meta.paramCount ? { paramCount: meta.paramCount } : {}),
                  // Expansion info
                  ...(r.isExpanded ? { isExpanded: true, relationshipType: r.relationshipType } : {}),
                  // Content (if requested)
                  ...(args.includeContent && r.content ? { content: r.content } : {}),
                };
              }),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Expand search results with graph neighbors (callers, dependencies, inheritors)
   */
  private async expandWithGraphNeighbors(
    results: SemanticSearchResult[],
    depth: number,
    minSimilarity: number,
  ): Promise<{ results: SemanticSearchResult[]; neighborsAdded: number }> {
    const storage = await this.context.getGraphStorage();
    const seen = new Set<string>(results.map((r) => r.id));
    const neighbors: SemanticSearchResult[] = [];

    // Process each result to find neighbors
    for (const result of results.slice(0, 20)) {
      // Limit expansion to top 20 results
      // Try to find entity ID - vector store uses different IDs than graph storage
      let entityId = result.metadata?.entityId;

      // If no entityId, try to find entity by name and path in graph storage
      if (!entityId && result.metadata?.name && result.metadata?.path) {
        try {
          const found = await storage.findEntities({
            filters: {
              name: result.metadata.name,
              filePath: result.metadata.path,
            },
            limit: 1,
          });
          if (found.length > 0) {
            entityId = found[0]?.id;
          }
        } catch {
          // Ignore lookup failures
        }
      }

      if (!entityId) continue;

      try {
        // Get relationships for this entity
        const relationships = await storage.getRelationshipsForEntity(entityId);

        for (const rel of relationships) {
          // Get the related entity ID (could be fromId or toId)
          const relatedId = rel.fromId === entityId ? rel.toId : rel.fromId;

          if (seen.has(relatedId) || seen.has(`ent:${relatedId}`)) continue;
          seen.add(relatedId);

          // Fetch the related entity
          const relatedEntity = await storage.getEntity(relatedId);
          if (!relatedEntity) continue;

          // Calculate reduced similarity score for neighbors
          const neighborSimilarity = result.similarity * 0.7; // 30% reduction for 1-hop
          if (neighborSimilarity < minSimilarity) continue;

          neighbors.push({
            id: `ent:${relatedId}`,
            name: relatedEntity.name,
            type: relatedEntity.type,
            similarity: neighborSimilarity,
            filePath: relatedEntity.filePath,
            content: relatedEntity.metadata?.["content"] as string | undefined,
            isExpanded: true,
            relationshipType: rel.type,
            metadata: { entityId: relatedId },
          });
        }

        // 2-hop expansion if requested
        if (depth >= 2 && neighbors.length < 50) {
          for (const neighbor of neighbors.slice(-10)) {
            // Last 10 neighbors for 2-hop
            const neighborEntityId = neighbor.id?.replace(/^ent:/, "");
            if (!neighborEntityId) continue;

            try {
              const hop2Rels = await storage.getRelationshipsForEntity(neighborEntityId);

              for (const rel of hop2Rels.slice(0, 5)) {
                // Limit 2-hop to 5 per neighbor
                const hop2Id = rel.fromId === neighborEntityId ? rel.toId : rel.fromId;

                if (seen.has(hop2Id) || seen.has(`ent:${hop2Id}`)) continue;
                seen.add(hop2Id);

                const hop2Entity = await storage.getEntity(hop2Id);
                if (!hop2Entity) continue;

                // Further reduced similarity for 2-hop
                const hop2Similarity = neighbor.similarity * 0.7;
                if (hop2Similarity < minSimilarity) continue;

                neighbors.push({
                  id: `ent:${hop2Id}`,
                  name: hop2Entity.name,
                  type: hop2Entity.type,
                  similarity: hop2Similarity,
                  filePath: hop2Entity.filePath,
                  content: hop2Entity.metadata?.["content"] as string | undefined,
                  isExpanded: true,
                  relationshipType: `${rel.type} (2-hop)`,
                  metadata: { entityId: hop2Id },
                });
              }
            } catch {
              // Skip failed 2-hop lookups
            }
          }
        }
      } catch {
        // Skip failed relationship lookups
      }
    }

    // Combine and sort by similarity
    const combined = [...results, ...neighbors];
    combined.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return {
      results: combined,
      neighborsAdded: neighbors.length,
    };
  }
}

// =============================================================================
// FIND SIMILAR CODE
// =============================================================================

const FindSimilarCodeSchema = z.object({
  code: z.string().describe("Code snippet to find similar code for"),
  projectPath: projectPathParam,
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  minSimilarity: z.number().optional().default(0.7).describe("Minimum similarity threshold (0.0-1.0)"),
  includeContent: z.boolean().optional().default(true).describe("Include full code content with comments in results"),
});

export class FindSimilarCodeToolHandler extends BaseToolHandler<z.infer<typeof FindSimilarCodeSchema>> {
  protected parseArgs(args: unknown) {
    return FindSimilarCodeSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof FindSimilarCodeSchema>): Promise<ToolResult> {
    // Ensure SemanticAgent uses the correct project's VectorStore
    const resolvedPath = this.resolveProjectPath(args);
    const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more for pagination (pass threshold as number, not options object)
    const allResults = await semanticAgent.findSimilarCode(args.code, args.minSimilarity);

    const paginatedResult = paginate(allResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              results: (paginatedResult.data as SemanticSearchResult[]).map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                similarity: r.similarity,
                filePath: r.filePath || r.metadata?.path,
                startLine: r.metadata?.startLine,
                endLine: r.metadata?.endLine,
                ...(args.includeContent && r.content ? { content: r.content } : {}),
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// DETECT CODE CLONES
// =============================================================================

// Uses DetectCodeClonesSchema from schemas/semantic-schemas.ts (imported at top)

export class DetectCodeClonesToolHandler extends BaseToolHandler<z.infer<typeof DetectCodeClonesSchema>> {
  protected parseArgs(args: unknown) {
    return DetectCodeClonesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof DetectCodeClonesSchema>): Promise<ToolResult> {
    try {
      const semanticAgent = await this.ensureSemanticAgentForProject();
      const minSimilarity = args.minSimilarity ?? 0.8;

      // Fetch clone groups (pass threshold as number)
      const allClones = await semanticAgent.detectClones(minSimilarity);

      // Handle case when detectClones returns undefined/null or empty array
      if (!allClones || !Array.isArray(allClones)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  groupsFound: 0,
                  clones: [],
                  warning: "Clone detection unavailable - vector store may not be initialized",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                groupsFound: allClones.length,
                scope: args.scope ?? "all",
                minSimilarity,
                clones: allClones.map((group: CloneGroup) => ({
                  similarity: group.avgSimilarity,
                  cloneType: group.cloneType,
                  members: (group.members || []).map((m: CloneMember) => ({
                    id: m.id,
                    name: m.name,
                    filePath: m.path,
                    startLine: m.startLine,
                    endLine: m.endLine,
                  })),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      log.e("CLONES", "detectClones failed", { error: err.message, stack: err.stack });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                groupsFound: 0,
                clones: [],
                error: err.message,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }
}

// =============================================================================
// JSCPD DETECT CLONES
// =============================================================================

const JscpdDetectClonesSchema = z.object({
  directory: z.string().optional(),
  minLines: z.number().optional().default(5),
  minTokens: z.number().optional().default(50),
  threshold: z.number().optional().default(0),
  format: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.clones),
});

export class JscpdDetectClonesToolHandler extends BaseToolHandler<z.infer<typeof JscpdDetectClonesSchema>> {
  protected parseArgs(args: unknown) {
    return JscpdDetectClonesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof JscpdDetectClonesSchema>): Promise<ToolResult> {
    // Use resolveProjectPath for proper path resolution, ensure non-undefined
    const targetDir = args.directory
      ? (this.context.normalizeInputPath(args.directory) ?? this.resolveProjectPath({}))
      : this.resolveProjectPath({});

    try {
      const { InFilesDetector, MemoryStore, Statistic, getDefaultOptions, SimpleTokenizer } = await import(
        "../../vendor/jscpd/index.js"
      );

      const options = {
        ...getDefaultOptions(),
        path: [targetDir] as string[],
        minLines: args.minLines,
        minTokens: args.minTokens,
        threshold: args.threshold,
        format: args.format || ["javascript", "typescript", "python"],
        silent: true,
      };

      const tokenizer = new SimpleTokenizer();
      // Note: MemoryStore type from jscpd is not exported, using direct instantiation
      const store = new MemoryStore();
      const statistic = new Statistic();
      // Type assertion needed for vendor code compatibility
      const inFilesDetector = new InFilesDetector(tokenizer, store as never, options, [statistic]);

      const clones: IClone[] = await inFilesDetector.detectFromOptions(options);
      const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);
      const paginatedResult = paginate(clones, args.offset, safeLimit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                duplicatesFound: paginatedResult.data.length,
                pagination: paginatedResult.pagination,
                statistics: statistic.getStatistic(),
                duplicates: paginatedResult.data.map((c) => ({
                  format: c.format,
                  foundDate: c.foundDate,
                  duplicationA: {
                    sourceId: c.duplicationA.sourceId,
                    start: c.duplicationA.start,
                    end: c.duplicationA.end,
                  },
                  duplicationB: {
                    sourceId: c.duplicationB.sourceId,
                    start: c.duplicationB.start,
                    end: c.duplicationB.end,
                  },
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }),
          },
        ],
      };
    }
  }
}

// =============================================================================
// CROSS LANGUAGE SEARCH
// =============================================================================

const CrossLanguageSearchSchema = z.object({
  query: z.string().describe("Search query"),
  projectPath: projectPathParam,
  languages: z.array(z.string()).optional().describe("Languages to search in"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  includeContent: z.boolean().optional().default(true).describe("Include full code content with comments in results"),
});

export class CrossLanguageSearchToolHandler extends BaseToolHandler<z.infer<typeof CrossLanguageSearchSchema>> {
  protected parseArgs(args: unknown) {
    return CrossLanguageSearchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CrossLanguageSearchSchema>): Promise<ToolResult> {
    // Ensure SemanticAgent uses the correct project's VectorStore
    const resolvedPath = this.resolveProjectPath(args);
    const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Get all languages from vector store if not specified
    const languages = args.languages || [
      "typescript",
      "javascript",
      "python",
      "go",
      "rust",
      "java",
      "cpp",
      "swift",
      "kotlin",
      "csharp",
    ];

    // Fetch more for pagination (pass languages array directly, not options object)
    const allResults = await semanticAgent.crossLanguageSearch(args.query, languages);

    const paginatedResult = paginate(allResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: args.query,
              languages,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              results: (paginatedResult.data as SemanticSearchResult[]).map((r) => ({
                id: r.id,
                name: r.name,
                language: r.metadata?.language,
                filePath: r.filePath || r.metadata?.path,
                startLine: r.metadata?.startLine,
                endLine: r.metadata?.endLine,
                similarity: r.similarity,
                ...(args.includeContent && r.content ? { content: r.content } : {}),
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// PATTERN SEARCH
// =============================================================================

const PatternSearchSchema = z.object({
  pattern: z.string(),
  projectPath: projectPathParam,
  mode: z.enum(["entity", "content", "semantic", "hybrid"]).optional().default("hybrid"),
  entityTypes: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  minSimilarity: z.number().optional().default(0.7),
});

export class PatternSearchToolHandler extends BaseToolHandler<z.infer<typeof PatternSearchSchema>> {
  protected parseArgs(args: unknown) {
    return PatternSearchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof PatternSearchSchema>): Promise<ToolResult> {
    const { PatternSearch } = await import("../../search/pattern-search.js");
    const resolvedPath = this.resolveProjectPath(args);
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    let vectorStore = null;
    try {
      // Ensure SemanticAgent uses the correct project's VectorStore
      const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
      vectorStore = semanticAgent.getVectorStore?.();
    } catch {
      // Vector store not available
    }

    const patternSearch = new PatternSearch(storage, vectorStore, null);
    await patternSearch.initialize();

    // Fetch more for pagination
    const allResults = await patternSearch.search({
      pattern: args.pattern,
      mode: args.mode,
      scope: { entityTypes: args.entityTypes as EntityType[] | undefined },
      limit: 500,
    });

    const paginatedResult = paginate(allResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              pattern: args.pattern,
              mode: args.mode,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              results: paginatedResult.data.map((r) => ({
                id: r.entity.id,
                name: r.entity.name,
                type: r.entity.type,
                matchType: r.matchType,
                score: r.score,
                filePath: r.entity.filePath,
                startLine: r.entity.location?.start?.line,
                endLine: r.entity.location?.end?.line,
                snippet: r.snippet,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
