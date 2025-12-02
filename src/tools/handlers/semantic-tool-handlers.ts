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
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { paginate, SAFE_LIMITS, MAX_PAGE_SIZE } from "../response-limits.js";

// =============================================================================
// SEMANTIC SEARCH
// =============================================================================

const SemanticSearchSchema = z.object({
  query: z.string(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  entityTypes: z.array(z.string()).optional(),
  minSimilarity: z.number().optional().default(0.7),
});

export class SemanticSearchToolHandler extends BaseToolHandler<z.infer<typeof SemanticSearchSchema>> {
  protected parseArgs(args: unknown) {
    return SemanticSearchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SemanticSearchSchema>): Promise<ToolResult> {
    const semanticAgent = await this.context.getSemanticAgent();
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more results for pagination
    const allResults = await semanticAgent.searchSimilar(args.query, {
      limit: 500, // Fetch more for accurate pagination
      entityTypes: args.entityTypes,
      minSimilarity: args.minSimilarity,
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
                id: r.id,
                name: r.name || r.metadata?.name,
                type: r.type || r.metadata?.entityType,
                similarity: r.similarity,
                filePath: r.filePath || r.metadata?.filePath,
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
// FIND SIMILAR CODE
// =============================================================================

const FindSimilarCodeSchema = z.object({
  code: z.string(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
  minSimilarity: z.number().optional().default(0.7),
});

export class FindSimilarCodeToolHandler extends BaseToolHandler<z.infer<typeof FindSimilarCodeSchema>> {
  protected parseArgs(args: unknown) {
    return FindSimilarCodeSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof FindSimilarCodeSchema>): Promise<ToolResult> {
    const semanticAgent = await this.context.getSemanticAgent();
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
    const semanticAgent = await this.context.getSemanticAgent();
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
  query: z.string(),
  languages: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
});

export class CrossLanguageSearchToolHandler extends BaseToolHandler<z.infer<typeof CrossLanguageSearchSchema>> {
  protected parseArgs(args: unknown) {
    return CrossLanguageSearchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CrossLanguageSearchSchema>): Promise<ToolResult> {
    const semanticAgent = await this.context.getSemanticAgent();
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
              results: paginatedResult.data,
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
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    let vectorStore = null;
    try {
      const semanticAgent = await this.context.getSemanticAgent();
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
