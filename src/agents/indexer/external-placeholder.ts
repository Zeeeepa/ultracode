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

  const placeholderBase: Omit<Entity, "id" | "createdAt" | "updatedAt"> = {
    name: symbol,
    type: EntityType.IMPORT,
    filePath: `external://${source}`,
    location: {
      start: { line: 0, column: 0, index: 0 },
      end: { line: 0, column: 0, index: 0 },
    },
    metadata: { isExternal: true, source, symbol },
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
 * Process relationships and replace external IDs with placeholder IDs.
 * Creates placeholder entities for any external references.
 *
 * @param relationships - Array of relationships to process
 * @param stableRelationshipIdFn - Function to generate stable relationship IDs
 * @returns Array of placeholder entities that need to be inserted
 */
export function processExternalRelationships<R extends { fromId: string; toId: string; type: string; id?: string }>(
  relationships: R[],
  stableRelationshipIdFn: (fromId: string, toId: string, type: string) => string,
): Entity[] {
  const seenExternal = new Map<string, string>();
  const placeholders: Entity[] = [];

  for (const rel of relationships) {
    // Handle external fromId (e.g., decorators from imported modules)
    if (typeof rel.fromId === "string" && rel.fromId.startsWith("external:")) {
      rel.fromId = createExternalPlaceholder(rel.fromId, seenExternal, placeholders);
    }

    // Handle external toId
    if (typeof rel.toId === "string" && rel.toId.startsWith("external:")) {
      rel.toId = createExternalPlaceholder(rel.toId, seenExternal, placeholders);
    }

    rel.id = stableRelationshipIdFn(rel.fromId, rel.toId, rel.type);
  }

  return placeholders;
}
