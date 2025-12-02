/**
 * Entity Tool Handlers
 *
 * Handlers for entity operations:
 * - list_file_entities (get_members alias)
 * - list_entity_relationships
 * - query
 */

import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { paginate, SAFE_LIMITS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../response-limits.js";

// =============================================================================
// LIST FILE ENTITIES
// =============================================================================

const ListFileEntitiesSchema = z.object({
  filePath: z.string(),
  entityTypes: z.array(z.string()).optional(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.entities),
});

export class ListFileEntitiesToolHandler extends BaseToolHandler<z.infer<typeof ListFileEntitiesSchema>> {
  protected parseArgs(args: unknown) {
    return ListFileEntitiesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ListFileEntitiesSchema>): Promise<ToolResult> {
    const normalizedPath = this.context.normalizeInputPath(args.filePath);
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

    const filters: any = { filePath: normalizedPath };
    if (args.entityTypes) {
      filters.entityType = args.entityTypes;
    }

    // Fetch all entities for this file (storage handles its own limit)
    const allEntities = await storage.findEntities({ filters, limit: 5000 });

    // Apply pagination
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);
    const paginatedResult = paginate(allEntities, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              file: normalizedPath,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              entities: paginatedResult.data.map((e: any) => ({
                id: e.id,
                name: e.name,
                type: e.type,
                location: e.location,
                signature: e.metadata?.signature,
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
// LIST ENTITY RELATIONSHIPS
// =============================================================================

const ListEntityRelationshipsSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  relationshipTypes: z.array(z.string()).optional(),
  direction: z.enum(["incoming", "outgoing", "both"]).optional().default("both"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.relationships),
});

export class ListEntityRelationshipsToolHandler extends BaseToolHandler<z.infer<typeof ListEntityRelationshipsSchema>> {
  protected parseArgs(args: unknown) {
    return ListEntityRelationshipsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ListEntityRelationshipsSchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

    let entityId = args.entityId;

    // If name provided, find entity by name
    if (!entityId && args.entityName) {
      const entities = await storage.findEntities({
        filters: { name: args.entityName },
        limit: 1,
      });
      if (entities.length > 0) {
        entityId = entities[0].id;
      }
    }

    if (!entityId) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Entity not found" }) }],
      };
    }

    const relationships = await storage.getRelationshipsForEntity(entityId);

    // Filter by direction
    let filtered = relationships;
    if (args.direction === "outgoing") {
      filtered = relationships.filter((r: any) => r.fromId === entityId);
    } else if (args.direction === "incoming") {
      filtered = relationships.filter((r: any) => r.toId === entityId);
    }

    // Filter by type
    if (args.relationshipTypes) {
      filtered = filtered.filter((r: any) => args.relationshipTypes!.includes(r.type));
    }

    // Apply pagination
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);
    const paginatedResult = paginate(filtered, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entityId,
              count: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              relationships: paginatedResult.data,
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
// QUERY
// =============================================================================

const QuerySchema = z.object({
  query: z.string(),
  type: z.enum(["entities", "relationships", "both"]).optional().default("both"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(DEFAULT_PAGE_SIZE),
});

export class QueryToolHandler extends BaseToolHandler<z.infer<typeof QuerySchema>> {
  protected parseArgs(args: unknown) {
    return QuerySchema.parse(args);
  }

  protected async execute(args: z.infer<typeof QuerySchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    const results: any = {};
    const pagination: any = {};

    if (args.type === "entities" || args.type === "both") {
      // Fetch more than needed for pagination info
      const allEntities = await storage.searchEntities({
        namePattern: args.query,
        limit: 1000,
      });
      const paginatedEntities = paginate(allEntities, args.offset, safeLimit);
      results.entities = paginatedEntities.data;
      pagination.entities = paginatedEntities.pagination;
    }

    if (args.type === "relationships" || args.type === "both") {
      const allRelationships = await storage.findRelationships({
        filters: {},
        limit: 1000,
      });
      const paginatedRelationships = paginate(allRelationships, args.offset, safeLimit);
      results.relationships = paginatedRelationships.data;
      pagination.relationships = paginatedRelationships.pagination;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: args.query,
              entitiesFound: results.entities?.length || 0,
              relationshipsFound: results.relationships?.length || 0,
              pagination,
              results,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
