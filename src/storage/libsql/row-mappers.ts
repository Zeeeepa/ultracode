/**
 * Row Mappers — Convert database rows to domain objects
 *
 * Contains EntityRow/RelationshipRow types and conversion functions.
 * Uses decodeMetadata from cbor-utils for CBOR/JSON deserialization.
 */

import type { Entity, EntityType, Relationship, RelationType } from "../../types/storage.js";
import { decodeMetadata } from "./cbor-utils.js";
import { parseLocation } from "./entity-ops.js";

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

/**
 * Database row structure for Entity table (snake_case columns)
 */
export interface EntityRow {
  id: string;
  name: string;
  type: string;
  file_path: string;
  location: string;
  metadata?: Buffer | Uint8Array | string | null; // CBOR BLOB or legacy JSON TEXT
  hash: string;
  created_at: number;
  updated_at: number;
  complexity_score?: number | null;
  language?: string | null;
  size_bytes?: number | null;
  embedding_base64?: string | null;
  embedding_text?: string | null;
}

/**
 * Database row structure for Relationship table (snake_case columns)
 */
export interface RelationshipRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  metadata?: Buffer | Uint8Array | string | null; // CBOR BLOB or legacy JSON TEXT
  weight: number;
  created_at: number;
}

// =============================================================================
// ROW CONVERSION FUNCTIONS
// =============================================================================

/**
 * Convert an EntityRow from the database to an Entity domain object.
 */
export function rowToEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type as EntityType,
    filePath: row.file_path,
    location: parseLocation(row.location) as Entity["location"],
    metadata: row.metadata ? (decodeMetadata(row.metadata) ?? {}) : {},
    hash: row.hash || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    complexityScore: row.complexity_score ?? undefined,
    language: row.language ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    embeddingBase64: row.embedding_base64 ?? undefined,
    embeddingText: row.embedding_text ?? undefined,
  };
}

/**
 * Convert a RelationshipRow from the database to a Relationship domain object.
 */
export function rowToRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    type: row.type as RelationType,
    metadata: row.metadata ? decodeMetadata(row.metadata) : undefined,
    weight: row.weight,
    createdAt: row.created_at,
  };
}

// =============================================================================
// VECTOR UTILITIES
// =============================================================================

/**
 * Convert Float32Array to SQLite-compatible string representation.
 */
export function vectorToString(vector: Float32Array): string {
  const values = Array.from(vector).map((v) => v.toFixed(6));
  return `[${values.join(", ")}]`;
}

/**
 * Parse string representation back to Float32Array.
 */
export function stringToVector(str: string): Float32Array {
  const clean = str.replace(/[[\]]/g, "");
  const values = clean.split(",").map((s) => parseFloat(s.trim()));
  return new Float32Array(values);
}
