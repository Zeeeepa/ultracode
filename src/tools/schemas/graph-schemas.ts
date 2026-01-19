/**
 * Graph Tool Schemas
 * Schemas for graph operations and knowledge bus tools
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";

export const GetGraphSchema = z.object({
  query: z.string().optional().describe("Optional search query"),
  limit: z.number().optional().default(100).describe("Maximum entities to return"),
  projectPath: projectPathParam,
});

export const GetGraphStatsSchema = z.object({
  projectPath: projectPathParam,
});

export const GetGraphHealthSchema = z.object({
  minEntities: z.number().optional().default(1).describe("Minimum entity count for healthy status"),
  minRelationships: z.number().optional().default(0).describe("Minimum relationship count for healthy status"),
  sample: z.number().optional().default(1).describe("Sample size to fetch for verification"),
  projectPath: projectPathParam,
});

export const GetBusStatsSchema = z.object({});

export const ClearBusTopicSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe("Exact knowledge bus topic to clear (use wildcards via knowledgeBus.query for inspection)"),
});
