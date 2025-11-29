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

// =============================================================================
// LIST FILE ENTITIES
// =============================================================================

const ListFileEntitiesSchema = z.object({
  filePath: z.string(),
  entityTypes: z.array(z.string()).optional(),
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

    const entities = await storage.findEntities({ filters, limit: 1000 });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              file: normalizedPath,
              count: entities.length,
              entities: entities.map((e: any) => ({
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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entityId,
              count: filtered.length,
              relationships: filtered,
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
  limit: z.number().optional().default(100),
});

export class QueryToolHandler extends BaseToolHandler<z.infer<typeof QuerySchema>> {
  protected parseArgs(args: unknown) {
    return QuerySchema.parse(args);
  }

  protected async execute(args: z.infer<typeof QuerySchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

    const results: any = {};

    if (args.type === "entities" || args.type === "both") {
      results.entities = await storage.searchEntities({
        namePattern: args.query,
        limit: args.limit,
      });
    }

    if (args.type === "relationships" || args.type === "both") {
      results.relationships = await storage.findRelationships({
        filters: {},
        limit: args.limit,
      });
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
