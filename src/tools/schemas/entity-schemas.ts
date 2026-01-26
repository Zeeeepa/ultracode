/**
 * Entity Tool Schemas
 * Schemas for entity listing, querying, and relationship tools
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";

export const ListEntitiesToolSchema = z.object({
  filePath: z.string().describe("Path to the file to list entities from"),
  entityTypes: z.array(z.string()).describe("Types of entities to list").optional(),
  projectPath: projectPathParam,
});

export const ListRelationshipsToolSchema = z
  .object({
    entityId: z.string().optional().describe("Exact entity ID to find relationships for"),
    entityName: z.string().optional().describe("Name of the entity to find relationships for"),
    filePath: z.string().optional().describe("Optional file path hint to disambiguate entity"),
    depth: z.number().optional().default(1).describe("Depth of relationship traversal"),
    relationshipTypes: z.array(z.string()).optional().describe("Types of relationships to include"),
    projectPath: projectPathParam,
  })
  .refine((value) => Boolean(value.entityId || value.entityName), {
    message: "Provide either entityId or entityName",
    path: ["entityId"],
  });

export const QueryToolSchema = z.object({
  query: z.string().describe("Natural language or structured query"),
  limit: z.number().describe("Maximum number of results").optional().default(10),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
  projectPath: projectPathParam,
});
