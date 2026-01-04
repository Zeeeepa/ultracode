/**
 * NgRx Relationship Resolution Module
 *
 * Handles NgRx-specific entity resolution for path tracing.
 * Includes reducer-selector connections and phantom entity resolution.
 */

import type { GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

/**
 * NgRx relationship types that should be traversed in flow tracing
 */
export const NGRX_RELATIONSHIP_TYPES = new Set([
  RelationType.LISTENS_TO_ACTION, // effect -> action (ofType)
  RelationType.HANDLES_ACTION, // reducer -> action (on)
  RelationType.SELECTS_STATE, // component -> selector
  RelationType.DISPATCHES_ACTION, // component/effect -> action
  RelationType.MODIFIES_STATE, // reducer -> state slice
]);

/**
 * Connection between a reducer and a feature selector
 */
export interface ReducerSelectorConnection {
  reducerId: string;
  selectorId: string;
  confidence: number;
}

/**
 * Get directory from file path
 */
export function getDirectory(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return lastSlash >= 0 ? filePath.slice(0, lastSlash) : "";
}

/**
 * Extract feature base name from file path
 * e.g., "roles.reducer.ts" -> "roles", "users.selector.ts" -> "users"
 */
export function getFeatureBaseName(filePath: string): string | null {
  const fileName = filePath.split(/[/\\]/).pop() || "";
  // Match: featureName.reducer.ts, featureName.selector.ts, featureName.reducers.ts, etc.
  const match = fileName.match(/^([a-z0-9-]+)\.(reducer|selector|reducers|selectors|state)/i);
  return match ? match[1]! : null;
}

/**
 * Extract feature name from entity name
 * e.g., "rolesReducer" -> "roles", "selectRolesFeature" -> "Roles"
 */
export function extractFeatureFromName(name: string): string | null {
  // rolesReducer -> roles
  let match = name.match(/^([a-z]+)Reducer$/i);
  if (match) return match[1]!;

  // selectRolesFeature -> Roles
  match = name.match(/^select([A-Z][a-z]+)Feature$/);
  if (match) return match[1]!;

  // selectRolesState -> Roles
  match = name.match(/^select([A-Z][a-z]+)State$/);
  if (match) return match[1]!;

  return null;
}

/**
 * Find implicit reducer -> featureSelector connections.
 * NgRx reducers update store state, featureSelectors read from it.
 * We connect them by:
 * 1. Same directory (e.g., store/roles/)
 * 2. Similar file names (roles.reducer.ts -> roles.selector.ts)
 * 3. Feature name matching
 */
export async function findReducerToSelectorConnections(storage: GraphStorage): Promise<ReducerSelectorConnection[]> {
  const connections: ReducerSelectorConnection[] = [];

  // Find all reducers and selectors
  const reducers = await storage.findEntities({
    type: "entity",
    filters: { entityType: ["ngrx_reducer"] as any },
    limit: 500,
  });

  const selectors = await storage.findEntities({
    type: "entity",
    filters: { entityType: ["ngrx_selector"] as any },
    limit: 500,
  });

  // Consider all selectors - featureSelectors typically have "Feature" or "State" in name
  // or are the first selector in the file (no dependencies on other selectors)
  const featureSelectors = selectors.filter((s) => {
    // Check if name contains Feature or State suffix
    if (s.name.includes("Feature") || s.name.endsWith("State")) {
      return true;
    }
    // Check metadata for featureName (if parser saved it)
    const meta = s.metadata as Record<string, any>;
    if (meta?.["ngrxSelector"]?.featureName) {
      return true;
    }
    return false;
  });

  for (const reducer of reducers) {
    const reducerDir = getDirectory(reducer.filePath);
    const reducerBaseName = getFeatureBaseName(reducer.filePath);

    for (const selector of featureSelectors) {
      const selectorDir = getDirectory(selector.filePath);
      const selectorBaseName = getFeatureBaseName(selector.filePath);

      let confidence = 0;

      // Same directory = strong signal
      if (reducerDir === selectorDir) {
        confidence += 0.5;
      }

      // Same parent directory (e.g., store/roles/reducers/ and store/roles/selectors/)
      const reducerParent = getDirectory(reducerDir);
      const selectorParent = getDirectory(selectorDir);
      if (reducerParent === selectorParent && reducerParent !== "") {
        confidence += 0.3;
      }

      // Similar base names (roles.reducer.ts -> roles.selector.ts)
      if (reducerBaseName && selectorBaseName && reducerBaseName === selectorBaseName) {
        confidence += 0.4;
      }

      // Name contains same feature keyword (rolesReducer -> selectRolesFeature)
      const reducerFeature = extractFeatureFromName(reducer.name);
      const selectorFeature = extractFeatureFromName(selector.name);
      if (reducerFeature && selectorFeature && reducerFeature.toLowerCase() === selectorFeature.toLowerCase()) {
        confidence += 0.3;
      }

      if (confidence >= 0.5) {
        connections.push({
          reducerId: reducer.id,
          selectorId: selector.id,
          confidence: Math.min(1.0, confidence),
        });
      }
    }
  }

  return connections;
}

/**
 * Resolve NgRx phantom entity target to real entity ID.
 * Phantom entities have names like "file:actionName", we extract the action name
 * and search for real entity with that name.
 */
export async function resolveNgRxTarget(storage: GraphStorage, phantomId: string): Promise<string | null> {
  // Get the phantom entity
  const phantomEntity = await storage.getEntity(phantomId);
  if (!phantomEntity) return null;

  // Extract the action/selector name from phantom entity name
  // Format: "\\path\\to\\file.ts:actionName" or just "actionName"
  const name = phantomEntity.name;
  const colonIndex = name.lastIndexOf(":");
  const targetName = colonIndex >= 0 ? name.slice(colonIndex + 1) : name;

  // Search for real entity with this name
  const entities = await storage.searchEntities({ namePattern: targetName });

  // Find exact match (not phantom)
  for (const entity of entities) {
    if (entity.name === targetName && entity.id !== phantomId) {
      return entity.id;
    }
  }

  return null;
}

/**
 * Find incoming NgRx relationships by entity name.
 * Searches for relationships where target name matches this entity.
 */
export async function findIncomingNgRxRelationships(
  storage: GraphStorage,
  entityName: string,
): Promise<Relationship[]> {
  const types = Array.from(NGRX_RELATIONSHIP_TYPES) as any[];
  return storage.findIncomingRelationshipsByName(entityName, types);
}

/**
 * Check if relationship type is inverted in flow tracing.
 * HANDLES_ACTION and LISTENS_TO_ACTION are "incoming" to action but should be "outgoing" in flow.
 */
export function isInvertedNgRxRelation(relType: RelationType): boolean {
  return relType === RelationType.HANDLES_ACTION || relType === RelationType.LISTENS_TO_ACTION;
}
