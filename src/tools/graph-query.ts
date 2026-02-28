import type { Entity, GraphStorage, Relationship } from "../types/storage.js";

function likePattern(raw: string): string {
  return `%${raw.replace(/[%_]/g, (c) => `\\${c}`)}%`;
}

export async function queryGraphEntities(
  storage: GraphStorage,
  query?: string,
  limit = 100,
): Promise<{
  entities: Entity[];
  relationships: Relationship[];
  stats: { totalEntities: number; totalRelationships: number };
}> {
  const result = await storage.executeQuery({
    type: "entity",
    limit,
    filters: query ? { name: new RegExp(likePattern(query)) } : undefined,
  });
  return {
    entities: result.entities,
    relationships: result.relationships,
    stats: { totalEntities: result.stats.totalEntities, totalRelationships: result.stats.totalRelationships },
  };
}

export async function getGraphStats(storage: GraphStorage): Promise<{
  entities: { total: number; byType: Record<string, number> };
  relationships: { total: number; byType: Record<string, number> };
  files: { total: number };
}> {
  const m = await storage.getMetrics();
  return {
    entities: { total: m.totalEntities, byType: {} },
    relationships: { total: m.totalRelationships, byType: {} },
    files: { total: m.totalFiles },
  };
}
