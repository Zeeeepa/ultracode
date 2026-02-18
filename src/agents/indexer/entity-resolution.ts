/**
 * Entity Resolution Module
 *
 * Functions for resolving entity references by name and location.
 * Extracted from indexer-agent.ts for better modularity.
 */

import type { Entity } from "../../types/storage.js";

// Container types that should be preferred for "contains" relationship resolution.
// In C#, constructors share the class name — without this filter, the constructor
// wins by line proximity and steals all "contains" relationships from the class.
const CONTAINER_TYPES = new Set(["class", "interface", "module", "namespace", "enum", "struct", "object"]);

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
 * @param sourceFile - Optional source file path; when provided, entities from the same file are strongly preferred
 * @param preferContainerType - When true, prefer container types (class, interface, module, etc.)
 *   over member types (constructor, method). Essential for "contains" relationships where
 *   a C# constructor shares the class name but should not be the parent.
 * @returns The entity ID if found, undefined otherwise
 */
export function resolveByNameAndLine(
  byName: Map<string, Entity[]>,
  name: string,
  line?: number,
  sourceFile?: string,
  preferContainerType?: boolean,
): string | undefined {
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

  // When sourceFile is provided, strongly prefer same-file entities.
  // This prevents cross-file name collisions in the pending buffer
  // (e.g., multiple files with a "Dispose" method).
  if (sourceFile && candidates.length > 1) {
    const sameFile = candidates.filter((c) => c.filePath === sourceFile);
    if (sameFile.length > 0) {
      candidates = sameFile;
    }
  }

  // For "contains" relationships, prefer container types over member types.
  // In C#, constructors have the same name as the class — without this,
  // the constructor wins by line proximity and steals all contains relationships.
  if (preferContainerType && candidates.length > 1) {
    const containers = candidates.filter((c) => CONTAINER_TYPES.has(c.type));
    if (containers.length > 0) {
      candidates = containers;
    }
  }

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
