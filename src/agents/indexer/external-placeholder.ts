/**
 * External Placeholder Module
 *
 * Handles creation of placeholder entities for external references.
 * Extracted from indexer-agent.ts for better modularity.
 */

import type { Entity } from "../../types/storage.js";
import { EntityType } from "../../types/storage.js";
import { stableEntityId } from "./stable-id.js";

/**
 * Parse an external ID string into source and symbol components.
 * Handles both Unix and Windows paths correctly.
 *
 * @param extId - External ID in format "external:SOURCE:SYMBOL"
 * @returns Parsed source and symbol
 */
export function parseExternalId(extId: string): { source: string; symbol: string } {
  let source = "unknown";
  let symbol = "unknown";

  if (extId.startsWith("external:")) {
    const rest = extId.slice("external:".length); // Remove "external:" prefix

    // Check for Windows drive letter pattern (e.g., "D:\...")
    if (/^[A-Za-z]:[\\/]/.test(rest)) {
      // Windows path: find the last ":" which separates path from symbol
      const lastColonIdx = rest.lastIndexOf(":");
      if (lastColonIdx > 2) {
        // Must be after "D:\"
        source = rest.slice(0, lastColonIdx);
        symbol = rest.slice(lastColonIdx + 1) || "unknown";
      } else {
        source = rest;
      }
    } else {
      // Unix path or simple format: "SOURCE:SYMBOL"
      const colonIdx = rest.indexOf(":");
      if (colonIdx !== -1) {
        source = rest.slice(0, colonIdx);
        symbol = rest.slice(colonIdx + 1) || "unknown";
      } else {
        source = rest;
      }
    }
  }

  return { source, symbol };
}

/**
 * Create a placeholder entity for an external reference.
 *
 * @param extId - External ID string
 * @param seenExternal - Map to track already created placeholders
 * @param placeholders - Array to collect new placeholder entities
 * @returns The stable ID for the placeholder
 */
export function createExternalPlaceholder(
  extId: string,
  seenExternal: Map<string, string>,
  placeholders: Entity[],
): string {
  const { source, symbol } = parseExternalId(extId);

  // Determine if source is a file path (contains / or \ or ends with file extension)
  const isFilePath = source.includes("/") || source.includes("\\") || /\.\w+$/.test(source);

  // Use symbol as the primary name - it already contains qualified name for cross-module calls
  // Only prefix with source if source is a class/module name (not a file path)
  const qualifiedName = isFilePath || source === "unknown" ? symbol : `${source}.${symbol}`;

  const placeholderBase: Omit<Entity, "id" | "createdAt" | "updatedAt"> = {
    name: qualifiedName, // Qualified name for cross-module resolution
    type: EntityType.IMPORT,
    filePath: `external://${source}`,
    location: {
      start: { line: 0, column: 0, index: 0 },
      end: { line: 0, column: 0, index: 0 },
    },
    metadata: { isExternal: true, source, symbol, qualifiedName },
    hash: `external:${source}:${symbol}`,
  };

  const placeholderId = stableEntityId(placeholderBase);

  if (!seenExternal.has(extId)) {
    seenExternal.set(extId, placeholderId);
    placeholders.push({
      ...placeholderBase,
      id: placeholderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return placeholderId;
}

/**
 * Process relationships and replace external IDs with real entity IDs or placeholder IDs.
 * If lookupEntityByName is provided, tries to resolve external references to existing entities first.
 * Creates placeholder entities only for unresolved external references.
 *
 * @param relationships - Array of relationships to process
 * @param stableRelationshipIdFn - Function to generate stable relationship IDs
 * @param lookupEntityByName - Optional async function to lookup existing entities by qualified name
 * @returns Array of placeholder entities that need to be inserted
 */
export async function processExternalRelationships<
  R extends { fromId: string; toId: string; type: string; id?: string },
>(
  relationships: R[],
  stableRelationshipIdFn: (fromId: string, toId: string, type: string) => string,
  lookupEntityByName?: (qualifiedName: string) => Promise<Entity | undefined>,
): Promise<Entity[]> {
  const seenExternal = new Map<string, string>();
  const placeholders: Entity[] = [];

  for (const rel of relationships) {
    // Handle external fromId (e.g., decorators from imported modules)
    if (typeof rel.fromId === "string" && rel.fromId.startsWith("external:")) {
      rel.fromId = await resolveOrCreatePlaceholder(rel.fromId, seenExternal, placeholders, lookupEntityByName);
    }

    // Handle external toId
    if (typeof rel.toId === "string" && rel.toId.startsWith("external:")) {
      rel.toId = await resolveOrCreatePlaceholder(rel.toId, seenExternal, placeholders, lookupEntityByName);
    }

    rel.id = stableRelationshipIdFn(rel.fromId, rel.toId, rel.type);
  }

  return placeholders;
}

/**
 * Try to resolve an external reference to an existing entity, or create a placeholder.
 */
async function resolveOrCreatePlaceholder(
  extId: string,
  seenExternal: Map<string, string>,
  placeholders: Entity[],
  lookupEntityByName?: (qualifiedName: string) => Promise<Entity | undefined>,
): Promise<string> {
  // Check if already processed
  const cached = seenExternal.get(extId);
  if (cached) return cached;

  const { source, symbol } = parseExternalId(extId);

  // Try to resolve to existing entity first
  if (lookupEntityByName) {
    // Strategy 1: symbol already contains qualified name (e.g., "ServerPoster.postMobileConnect")
    // This is the most common case for cross-module calls
    const existingBySymbol = await lookupEntityByName(symbol);
    if (existingBySymbol) {
      seenExternal.set(extId, existingBySymbol.id);
      return existingBySymbol.id;
    }

    // Strategy 2: Try with source prefix if source is not a file path
    // File paths contain / or \ or end with file extension
    const isFilePath = source.includes("/") || source.includes("\\") || /\.\w+$/.test(source);
    if (!isFilePath && source && source !== "unknown") {
      const qualifiedName = `${source}.${symbol}`;
      const existingByQualified = await lookupEntityByName(qualifiedName);
      if (existingByQualified) {
        seenExternal.set(extId, existingByQualified.id);
        return existingByQualified.id;
      }
    }
  }

  // No existing entity found - create placeholder
  return createExternalPlaceholder(extId, seenExternal, placeholders);
}

/**
 * Resolve external placeholder entities to real entities after all projects are indexed.
 * This enables cross-module tracing by linking placeholder references to actual entities.
 *
 * @param storage - Graph storage for querying entities and updating relationships
 * @returns Statistics about resolved placeholders
 */
export interface PlaceholderResolutionResult {
  totalPlaceholders: number;
  resolved: number;
  unresolved: string[];
  relationshipsUpdated: number;
}

export async function resolveExternalPlaceholders(storage: {
  getAllEntities: () => Promise<Entity[]>;
  getRelationships: (options: {
    toId?: string;
  }) => Promise<Array<{ id: string; fromId: string; toId: string; type: string }>>;
  updateRelationship: (id: string, updates: { toId: string }) => Promise<void>;
  deleteEntity: (id: string) => Promise<void>;
}): Promise<PlaceholderResolutionResult> {
  const result: PlaceholderResolutionResult = {
    totalPlaceholders: 0,
    resolved: 0,
    unresolved: [],
    relationshipsUpdated: 0,
  };

  // Get all entities
  const allEntities = await storage.getAllEntities();

  // Separate placeholders and real entities
  const placeholders = allEntities.filter((e) => e.filePath?.startsWith("external://"));
  const realEntities = allEntities.filter((e) => !e.filePath?.startsWith("external://"));

  result.totalPlaceholders = placeholders.length;

  if (placeholders.length === 0) {
    return result;
  }

  // Build name -> real entity map for fast lookup
  const realEntityByName = new Map<string, Entity>();
  for (const entity of realEntities) {
    // Store by exact name
    realEntityByName.set(entity.name, entity);
  }

  // Resolve each placeholder
  for (const placeholder of placeholders) {
    const qualifiedName = placeholder.name; // e.g., "ServerPoster.postMobileConnect"

    // Try to find real entity by exact name match
    const realEntity = realEntityByName.get(qualifiedName);

    if (realEntity) {
      // Found matching real entity - update relationships pointing to placeholder
      const relationships = await storage.getRelationships({ toId: placeholder.id });

      for (const rel of relationships) {
        await storage.updateRelationship(rel.id, { toId: realEntity.id });
        result.relationshipsUpdated++;
      }

      // Delete the placeholder entity (no longer needed)
      await storage.deleteEntity(placeholder.id);

      result.resolved++;
    } else {
      result.unresolved.push(qualifiedName);
    }
  }

  return result;
}
