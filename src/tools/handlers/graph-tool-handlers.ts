/**
 * Graph Tool Handlers
 *
 * Handlers for graph storage operations:
 * - reset_graph
 * - clean_index
 * - get_graph
 * - get_graph_stats
 * - get_graph_health
 */

import { z } from "zod";
import { log } from "../../logging/index.js";
import { AgentType } from "../../types/agent.js";
import type { Entity, EntityType, Relationship } from "../../types/storage.js";
import { toError } from "../../utils/error-handling.js";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, type PaginatedResult, paginate, SAFE_LIMITS } from "../response-limits.js";

// =============================================================================
// RESET GRAPH
// =============================================================================

const ResetGraphSchema = z.object({
  projectPath: projectPathParam,
});

export class ResetGraphToolHandler extends BaseToolHandler<z.infer<typeof ResetGraphSchema>> {
  protected parseArgs(args: unknown) {
    return ResetGraphSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ResetGraphSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    await storage.clear();

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, message: "Graph reset completed" }) }],
    };
  }
}

// =============================================================================
// CLEAN INDEX
// =============================================================================

const CleanIndexSchema = z.object({
  directory: z.string().optional(),
  projectPath: projectPathParam,
});

export class CleanIndexToolHandler extends BaseToolHandler<z.infer<typeof CleanIndexSchema>> {
  protected parseArgs(args: unknown) {
    return CleanIndexSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CleanIndexSchema>): Promise<ToolResult> {
    const targetDir = args.directory || (this.context.config as { directory?: string }).directory;

    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(targetDir);
    await storage.clear();

    // Ensure SemanticAgent uses the correct project's VectorStore before indexing
    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      try {
        const semanticAgent = await this.ensureSemanticAgentForProject(targetDir);
        // Also clear vector store for clean index
        const vectorStore = semanticAgent?.getVectorStore?.();
        if (vectorStore) {
          await vectorStore.clear();
        }
      } catch (error: unknown) {
        // Semantic agent may not be available, that's ok for clean_index
        const err = toError(error);
        log.w("CLEANINDEX", "sem_reinit_fail", { err: err.message, stack: err.stack });
      }
    }

    // Re-index via DevAgent (conductor no longer processes tasks directly)
    const conductor = this.context.getConductor();
    await conductor.initialize();

    const devAgent = conductor.getAgentByType?.(AgentType.DEV);
    if (!devAgent) {
      throw new Error("DevAgent not available for indexing");
    }

    const task = {
      id: `clean-index-${Date.now()}`,
      type: "index",
      priority: 9,
      payload: { directory: targetDir, incremental: false, excludePatterns: [] },
      createdAt: Date.now(),
    };

    const result = await devAgent.process(task);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, message: "Clean index completed", result }, null, 2),
        },
      ],
    };
  }
}

// =============================================================================
// GET GRAPH
// =============================================================================

const GetGraphSchema = z.object({
  projectPath: projectPathParam,
  entityTypes: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.graphNodes),
  includeRelationships: z.boolean().optional().default(true),
});

export class GetGraphToolHandler extends BaseToolHandler<z.infer<typeof GetGraphSchema>> {
  protected parseArgs(args: unknown) {
    return GetGraphSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetGraphSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch all entities (up to 5000 for pagination accuracy)
    const allEntities = await storage.findEntities({
      filters: args.entityTypes ? { entityType: args.entityTypes as EntityType[] } : {},
      limit: 5000,
    });

    const paginatedEntities = paginate(allEntities, args.offset, safeLimit);

    let paginatedRelationships: PaginatedResult<Relationship> = {
      data: [],
      pagination: { offset: 0, limit: 0, total: 0, hasMore: false },
    };

    if (args.includeRelationships && paginatedEntities.data.length > 0) {
      const entityIds = (paginatedEntities.data as Entity[]).map((e: Entity) => e.id);
      const allRelationships = await storage.findRelationships({
        filters: { fromId: entityIds },
        limit: 5000,
      });
      paginatedRelationships = paginate(allRelationships, 0, safeLimit);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entities: paginatedEntities.data.length,
              relationships: paginatedRelationships.data.length,
              pagination: {
                entities: paginatedEntities.pagination,
                relationships: paginatedRelationships.pagination,
              },
              data: {
                entities: paginatedEntities.data,
                relationships: paginatedRelationships.data,
              },
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
// GET GRAPH STATS
// =============================================================================

const GetGraphStatsSchema = z.object({
  projectPath: projectPathParam,
});

export class GetGraphStatsToolHandler extends BaseToolHandler<z.infer<typeof GetGraphStatsSchema>> {
  protected parseArgs(args: unknown) {
    return GetGraphStatsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetGraphStatsSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const stats = await storage.getStatistics();

    return {
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
    };
  }
}

// =============================================================================
// GET GRAPH HEALTH
// =============================================================================

const GetGraphHealthSchema = z.object({
  projectPath: projectPathParam,
});

export class GetGraphHealthToolHandler extends BaseToolHandler<z.infer<typeof GetGraphHealthSchema>> {
  protected parseArgs(args: unknown) {
    return GetGraphHealthSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetGraphHealthSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const stats = await storage.getStatistics();
    const sqliteManager = this.context.getSQLiteManager();

    const health = {
      status: "healthy",
      database: {
        path: (sqliteManager as { getDatabasePath?: () => string })?.getDatabasePath?.() || "unknown",
        entities: stats.totalEntities || 0,
        relationships: stats.totalRelationships || 0,
        files: stats.totalFiles || 0,
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
    };
  }
}
