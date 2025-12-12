/**
 * Semantic Tool Handlers
 *
 * Handlers for semantic search operations:
 * - semantic_search
 * - find_similar_code
 * - detect_code_clones (find_duplicates alias)
 * - jscpd_detect_clones
 * - cross_language_search
 * - pattern_search
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, paginate, SAFE_LIMITS } from "../response-limits.js";

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
    console.error(
      `[SemanticSearch] args.projectPath=${args.projectPath}, resolvedPath=${resolvedPath}, currentProject=${currentProject}`,
    );

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
      console.warn(
        `[SemanticSearch] Cross-project search requested. Current: ${currentProject}, Requested: ${resolvedPath}`,
      );
    }

    // Ensure SemanticAgent uses the correct project's VectorStore
    const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
    // v3: Also ensure GraphStorage context for expandWithGraphNeighbors
    await this.ensureGraphStorageForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more results for pagination and filtering
    // Use semanticSearch method (returns SemanticResult with results array)
    const searchResult = await semanticAgent.semanticSearch(args.query, 1000);
    const allResults = searchResult.results || [];

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
      filteredResults = allResults.filter((r: any) => {
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
              ...(expansionStats.expanded ? { expansion: expansionStats } : {}),
              results: paginatedResult.data.map((r: any) => {
                const meta = r.metadata || {};
                return {
                  id: r.id,
                  name: r.name || meta.name,
                  type: r.type || meta.entityType || meta.type,
                  similarity: r.similarity,
                  filePath: r.filePath || meta.filePath || meta.path,
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
    results: any[],
    depth: number,
    minSimilarity: number,
  ): Promise<{ results: any[]; neighborsAdded: number }> {
    const storage = await this.context.getGraphStorage();
    const seen = new Set<string>(results.map((r) => r.id));
    const neighbors: any[] = [];

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
            entityId = found[0].id;
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
            content: relatedEntity.metadata?.content,
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
                  content: hop2Entity.metadata?.content,
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

    // Fetch more for pagination
    const allResults = await semanticAgent.findSimilarCode(args.code, {
      limit: 500,
      minSimilarity: args.minSimilarity,
    });

    const paginatedResult = paginate(allResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              results: paginatedResult.data.map((r: any) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                similarity: r.similarity,
                filePath: r.filePath,
                snippet: r.snippet,
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

const DetectCodeClonesSchema = z.object({
  projectPath: projectPathParam,
  minSimilarity: z.number().optional().default(0.85),
  minLines: z.number().optional().default(5),
  entityTypes: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.clones),
});

export class DetectCodeClonesToolHandler extends BaseToolHandler<z.infer<typeof DetectCodeClonesSchema>> {
  protected parseArgs(args: unknown) {
    return DetectCodeClonesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof DetectCodeClonesSchema>): Promise<ToolResult> {
    // Ensure SemanticAgent uses the correct project's VectorStore
    const resolvedPath = this.resolveProjectPath(args);
    const semanticAgent = await this.ensureSemanticAgentForProject(resolvedPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more groups for pagination
    const allClones = await semanticAgent.detectClones({
      minSimilarity: args.minSimilarity,
      minLines: args.minLines,
      entityTypes: args.entityTypes,
      maxGroups: 200,
    });

    const paginatedResult = paginate(allClones, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              groupsFound: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              clones: paginatedResult.data.map((group: any) => ({
                similarity: group.similarity,
                members: group.members.map((m: any) => ({
                  id: m.id,
                  name: m.name,
                  filePath: m.filePath,
                  lines: m.lines,
                })),
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
    const targetDir = args.directory || this.context.config.directory;

    try {
      const { InFilesDetector, MemoryStore, Statistic, getDefaultOptions, SimpleTokenizer } = await import(
        "../../vendor/jscpd/index.js"
      );

      const options = {
        ...getDefaultOptions(),
        path: [targetDir],
        minLines: args.minLines,
        minTokens: args.minTokens,
        threshold: args.threshold,
        format: args.format || ["javascript", "typescript", "python"],
        silent: true,
      };

      const tokenizer = new SimpleTokenizer();
      const store = new MemoryStore() as any;
      const statistic = new Statistic();
      const inFilesDetector = new InFilesDetector(tokenizer, store, options, [statistic]);

      const clones = await inFilesDetector.detectFromOptions(options);
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
                duplicates: paginatedResult.data.map((c: any) => ({
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
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: (error as Error).message }),
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

    // Fetch more for pagination
    const allResults = await semanticAgent.crossLanguageSearch(args.query, {
      languages: args.languages,
      limit: 500,
    });

    const paginatedResult = paginate(allResults, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: args.query,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              results: paginatedResult.data.map((r: any) => ({
                ...r,
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
      scope: { entityTypes: args.entityTypes as any },
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
