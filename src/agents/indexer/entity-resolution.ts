/**
 * Entity Resolution Module
 *
 * Functions for resolving entity references by name and location.
 * Extracted from indexer-agent.ts for better modularity.
 */

import type { Entity } from "../../types/storage.js";

/**
 * Build a map of entity names to their instances for efficient lookup.
 *
 * @param entities - Array of entities to index
 * @returns Map from entity name to array of matching entities
 */
export function buildEntityNameMap(entities: Entity[]): Map<string, Entity[]> {
  const byName = new Map<string, Entity[]>();
  for (const e of entities) {
    const arr = byName.get(e.name) || [];
    arr.push(e);
    byName.set(e.name, arr);
  }
  return byName;
}

/**
 * Resolve an entity by name, optionally using line number for disambiguation.
 * When multiple entities share the same name, returns the one closest to the given line.
 *
 * Supports both exact matching and suffix matching for call targets:
 * - Exact: "MyClass.myMethod" matches "MyClass.myMethod"
 * - Suffix: "myMethod" matches "MyClass.myMethod" (for call targets without class prefix)
 *
 * @param byName - Map from entity names to entity arrays
 * @param name - The entity name to resolve
 * @param line - Optional line number for disambiguation
 * @returns The entity ID if found, undefined otherwise
 */
export function resolveByNameAndLine(byName: Map<string, Entity[]>, name: string, line?: number): string | undefined {
  // First try exact match
  let candidates = byName.get(name);

  // If no exact match, try suffix matching for call targets
  // e.g., "myMethod" should match "MyClass.myMethod"
  if ((!candidates || candidates.length === 0) && !name.includes(".")) {
    const suffix = `.${name}`;
    candidates = [];
    for (const [entityName, entities] of byName) {
      if (entityName.endsWith(suffix)) {
        candidates.push(...entities);
      }
    }
  }

  if (!candidates || candidates.length === 0) return undefined;

  if (line == null) return candidates[0]?.id;

  let best: Entity | undefined;
  let bestDelta = Infinity;

  for (const c of candidates) {
    const d = Math.abs((c.location?.start?.line ?? 0) - line);
    if (d < bestDelta) {
      best = c;
      bestDelta = d;
    }
  }
  return best?.id;
}
