/**
 * File Tool Handler Utilities
 *
 * Common utilities for file modification tool handlers.
 */

import type { ImpactAnalyzer } from "../impact-analyzer.js";

/**
 * Context for setting up semantic search
 */
export interface SemanticSearchContext {
  getSemanticAgent: () => Promise<any>;
}

/**
 * Setup semantic search capability for impact analysis.
 * Returns undefined if vector store is not available.
 */
export async function setupSemanticSearch(
  context: SemanticSearchContext,
): Promise<ImpactAnalyzer["semanticSearch"] | undefined> {
  try {
    const semanticAgent = await context.getSemanticAgent();
    const vectorStore = semanticAgent.getVectorStore?.();
    if (!vectorStore) return undefined;

    return {
      search: async (query: string, options: { limit: number; minSimilarity: number }) => {
        const results = await vectorStore.search(query, options.limit);
        return results
          .filter((r: any) => r.similarity >= options.minSimilarity)
          .map((r: any) => ({ entityId: r.entityId, similarity: r.similarity }));
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Conductor context for re-indexing files
 */
export interface ConductorContext {
  getConductor: () => any;
}

/**
 * Re-index files using conductor.
 * Creates an index task with specified priority.
 */
export async function reindexFiles(
  context: ConductorContext,
  files: string[],
  taskPrefix: string,
  priority = 5,
): Promise<void> {
  const conductor = context.getConductor();
  await conductor.process({
    id: `${taskPrefix}-${Date.now()}`,
    type: "index",
    priority,
    payload: { files },
    createdAt: Date.now(),
  });
}

/**
 * Build success response with optional fields.
 */
export function buildSuccessResponse(
  baseFields: Record<string, any>,
  optionalFields?: Record<string, any>,
): { content: Array<{ type: "text"; text: string }> } {
  const response = { ...baseFields };
  if (optionalFields) {
    for (const [key, value] of Object.entries(optionalFields)) {
      if (value !== undefined && value !== null) {
        response[key] = value;
      }
    }
  }
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
  };
}

/**
 * Build error response.
 */
export function buildErrorResponse(
  error: Error | string,
  additionalFields?: Record<string, any>,
): { content: Array<{ type: "text"; text: string }> } {
  const message = typeof error === "string" ? error : error.message;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...additionalFields }),
      },
    ],
  };
}

/**
 * Ensure directory exists for a file path.
 */
export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const { dirname } = await import("node:path");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(filePath), { recursive: true });
}
