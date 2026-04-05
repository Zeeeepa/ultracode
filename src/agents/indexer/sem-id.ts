/**
 * Semantic ID (SemId) Generation — Zig-compatible entity IDs.
 *
 * Replaces opaque hex IDs (xxHash) with human-readable hierarchical IDs:
 *   "common/fn:generateSemId"
 *   "graph/st:CodeGraph/mt:addEdge"
 *   "entity/en:EntityType"
 *
 * Format: `{module}/{type}:{name}` or `{module}/{parent_type}:{parent_name}/{type}:{name}`
 * Duplicate names in the same scope get `~N` suffix.
 *
 * Ported from ultracode.zig/src/parsers/extractors/common.zig
 */

import { basename, extname } from "node:path";

// =============================================================================
// TYPES
// =============================================================================

/** Parent context for building hierarchical semIds. */
export interface ParentContext {
  semId: string;
  name: string;
  entityType: string;
}

/** Per-file ordinal tracker for disambiguating duplicate names in the same scope. */
export type OrdinalMap = Map<string, number>;

// =============================================================================
// TYPE ABBREVIATION MAP
// =============================================================================

/** 2-char type abbreviation for semId encoding (synced with Zig common.zig). */
const TYPE_ABBREV: Record<string, string> = {
  function: "fn",
  method: "mt",
  class: "cl",
  interface: "if",
  struct: "st",
  enum: "en",
  variable: "vr",
  constant: "cn",
  type: "ty",
  module: "md",
  import: "im",
  export: "ex",
  namespace: "ns",
  trait: "tr",
  component: "cp",
  constructor: "ct",
  property: "pr",
  field: "fl",
  service: "sv",
  guard: "gd",
  interceptor: "ic",
  middleware: "mw",
  route: "rt",
  hook: "hk",
  action: "ac",
  reducer: "rd",
  effect: "ef",
  selector: "sl",
  store: "sr",
  event: "ev",
  delegate: "dl",
  pipe: "pp",
  directive: "dr",
  decorator: "dc",
  parameter: "pm",
  package: "pk",
  comment: "cm",
};

/** Get 2-char abbreviation for entity type. Falls back to first 2 chars. */
export function typeAbbrev(entityType: string): string {
  return TYPE_ABBREV[entityType] ?? entityType.slice(0, 2);
}

// =============================================================================
// HELPERS
// =============================================================================

/** Extract file stem from path: "src/parsers/extractors/common.zig" → "common" */
export function fileStem(filePath: string): string {
  const base = basename(filePath);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

// =============================================================================
// SEM ID GENERATION
// =============================================================================

/**
 * Generate a semantic entity ID (Zig-compatible).
 *
 * Format: `{module}/{type}:{name}` or `{module}/{parent_type}:{parent_name}/{type}:{name}`
 * Duplicate names in the same scope get `~N` suffix (e.g. `common/fn:init~2`).
 *
 * @param filePath - Source file path (e.g. "src/storage/schema.ts")
 * @param name - Entity name (e.g. "createTables")
 * @param entityType - Entity type string (e.g. "function", "class")
 * @param parentCtx - Optional parent context for nested entities
 * @param ordinalMap - Per-file map for disambiguating duplicate names
 */
export function generateSemId(
  filePath: string,
  name: string,
  entityType: string,
  parentCtx: ParentContext | null,
  ordinalMap: OrdinalMap,
): string {
  const mod = fileStem(filePath).slice(0, 24);
  const abbrev = typeAbbrev(entityType);
  const nameCapped = name.slice(0, 40);

  // Build base semId
  let base: string;
  if (parentCtx) {
    const parentAbbrev = typeAbbrev(parentCtx.entityType);
    const parentName = parentCtx.name.slice(0, 40);
    base = `${mod}/${parentAbbrev}:${parentName}/${abbrev}:${nameCapped}`;
  } else {
    base = `${mod}/${abbrev}:${nameCapped}`;
  }

  // Ordinal disambiguation
  const existing = ordinalMap.get(base);
  if (existing !== undefined) {
    const next = existing + 1;
    ordinalMap.set(base, next);
    return `${base}~${next}`;
  } else {
    ordinalMap.set(base, 1);
    return base;
  }
}

/**
 * Generate a ref marker for cross-module calls.
 * Format: "ref:{name}" — resolved by graph adapter during disambiguation.
 */
export function generateRefId(name: string): string {
  return `ref:${name}`;
}
