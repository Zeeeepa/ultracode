/**
 * Entity Expander for Semantic Indexing
 *
 * Expands large entities (classes, interfaces) into their children (methods)
 * for better semantic search quality.
 *
 * Problem:
 * - Large classes (500+ lines) get truncated when creating embeddings
 * - Methods inside classes are not indexed separately
 * - Search for "method X" doesn't find method X inside a large class
 *
 * Solution:
 * - Detect large entities that exceed maxTokens threshold
 * - Expand them into: class header + individual methods
 * - Each method gets its own embedding
 *
 * @module entity-expander
 */

import { log } from "../logging/index.js";
import type { ParsedEntity } from "../types/parser.js";

export interface ExpanderConfig {
  /** Maximum tokens for a single entity (from embedding provider) */
  maxTokens: number;
  /** Types to expand (default: class, interface) */
  expandableTypes?: string[];
  /** Minimum children count to trigger expansion */
  minChildrenForExpansion?: number;
  /** Include parent reference in child entity name */
  includeParentInChildName?: boolean;
}

const DEFAULT_CONFIG: Required<ExpanderConfig> = {
  maxTokens: 512,
  expandableTypes: ["class", "interface", "struct", "trait", "impl_block"],
  minChildrenForExpansion: 2,
  includeParentInChildName: true,
};

/**
 * Estimate token count for code (conservative estimate)
 * ~10 tokens per line, ~4 chars per token
 */
export function estimateEntityTokens(entity: ParsedEntity): number {
  const loc = entity.location;
  if (!loc?.start?.line || !loc?.end?.line) {
    return 100; // Default for unknown size
  }

  const lines = loc.end.line - loc.start.line + 1;

  // Rough estimate: ~10 tokens per line of code
  // Adjust based on entity type
  const multiplier = entity.type === "interface" ? 6 : 10;

  return lines * multiplier;
}

/**
 * Check if entity should be expanded into children
 */
export function shouldExpand(entity: ParsedEntity, config: ExpanderConfig): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Must be an expandable type
  if (!cfg.expandableTypes.includes(entity.type)) {
    return false;
  }

  // Must have children
  if (!entity.children || entity.children.length < cfg.minChildrenForExpansion) {
    return false;
  }

  // Check if entity exceeds token limit
  const estimatedTokens = estimateEntityTokens(entity);
  return estimatedTokens > cfg.maxTokens * 0.8; // 80% threshold for safety
}

/**
 * Create a header-only version of an entity (class signature without method bodies)
 */
function createHeaderEntity(entity: ParsedEntity): ParsedEntity {
  // For class header, we want: name, modifiers, inheritance, but NOT method bodies
  // Location should point to just the class declaration line(s)
  const headerEndLine = Math.min(
    entity.location.start.line + 10, // Max 10 lines for header
    entity.location.end.line,
  );

  return {
    ...entity,
    id: entity.id ? `${entity.id}:header` : undefined,
    name: `${entity.name} (header)`,
    children: undefined, // Remove children from header
    location: {
      start: entity.location.start,
      end: {
        line: headerEndLine,
        column: 0,
        index: entity.location.start.index + 500, // Approximate
      },
    },
  };
}

/**
 * Create a child entity with parent context
 */
function createChildEntity(parent: ParsedEntity, child: ParsedEntity, includeParentName: boolean): ParsedEntity {
  const childName = includeParentName ? `${parent.name}.${child.name}` : child.name;

  return {
    ...child,
    id: child.id || (parent.id ? `${parent.id}:${child.name}` : undefined),
    name: childName,
    filePath: child.filePath || parent.filePath,
    language: child.language || parent.language,
    // Add parent reference in metadata
    references: [...(child.references || []), parent.id || parent.name],
  };
}

/**
 * Expand large entities into their children for better semantic indexing
 *
 * @param entities - Original parsed entities
 * @param config - Expander configuration
 * @returns Expanded entities (large classes split into header + methods)
 */
export function expandLargeEntities(entities: ParsedEntity[], config: ExpanderConfig): ParsedEntity[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const result: ParsedEntity[] = [];
  let expandedCount = 0;
  let childrenAdded = 0;

  for (const entity of entities) {
    if (shouldExpand(entity, cfg)) {
      // Expand this entity
      expandedCount++;

      // 1. Add class header (for searching by class name)
      result.push(createHeaderEntity(entity));

      // 2. Add each child as separate entity
      for (const child of entity.children || []) {
        result.push(createChildEntity(entity, child, cfg.includeParentInChildName));
        childrenAdded++;
      }
    } else {
      // Keep entity as-is
      result.push(entity);
    }
  }

  if (expandedCount > 0) {
    log.d("EXPANDER", "Expanded large entities", {
      expandedCount,
      childrenAdded,
      maxTokens: cfg.maxTokens,
    });
  }

  return result;
}

/**
 * Get expansion statistics for a set of entities
 */
export function getExpansionStats(
  entities: ParsedEntity[],
  config: ExpanderConfig,
): {
  total: number;
  needsExpansion: number;
  wouldExpand: number;
  childrenCount: number;
  largestEntity: { name: string; tokens: number } | null;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let needsExpansion = 0;
  let childrenCount = 0;
  let largest: { name: string; tokens: number } | null = null;

  for (const entity of entities) {
    const tokens = estimateEntityTokens(entity);

    if (tokens > (largest?.tokens || 0)) {
      largest = { name: entity.name, tokens };
    }

    if (shouldExpand(entity, cfg)) {
      needsExpansion++;
      childrenCount += entity.children?.length || 0;
    }
  }

  return {
    total: entities.length,
    needsExpansion,
    wouldExpand: needsExpansion,
    childrenCount,
    largestEntity: largest,
  };
}

/**
 * Analyze entities for oversized ones that can't be fully indexed
 * Returns AI-friendly warning message if there are problematic entities
 */
export interface OversizedEntityInfo {
  name: string;
  type: string;
  filePath: string;
  estimatedTokens: number;
  lines: number;
  recommendation: string;
}

export interface OversizedEntitiesWarning {
  /** Has any oversized entities */
  hasWarning: boolean;
  /** Current maxTokens from embedding provider */
  maxTokens: number;
  /** Number of entities exceeding maxTokens (after expansion) */
  oversizedCount: number;
  /** Total entities analyzed */
  totalEntities: number;
  /** Percentage of oversized entities */
  oversizedPercent: number;
  /** Details of oversized entities (top 10) */
  entities: OversizedEntityInfo[];
  /** AI-friendly recommendation message */
  aiMessage: string | null;
}

/**
 * Get warning about entities that are still too large after expansion
 * Designed to return AI-friendly message for index tool response
 */
export function getOversizedEntitiesWarning(
  expandedEntities: ParsedEntity[],
  maxTokens: number,
): OversizedEntitiesWarning {
  const oversized: OversizedEntityInfo[] = [];

  for (const entity of expandedEntities) {
    const tokens = estimateEntityTokens(entity);
    if (tokens > maxTokens) {
      const lines =
        entity.location?.end?.line && entity.location?.start?.line
          ? entity.location.end.line - entity.location.start.line + 1
          : 0;

      let recommendation: string;
      if (entity.type === "function" || entity.type === "method") {
        recommendation = `Split function into smaller functions (${lines} lines → aim for <${Math.floor(maxTokens / 10)} lines)`;
      } else if (entity.type === "class" || entity.type === "interface") {
        recommendation = `Add child methods/properties parsing or split into multiple files`;
      } else {
        recommendation = `Consider refactoring to reduce size`;
      }

      oversized.push({
        name: entity.name,
        type: entity.type,
        filePath: (entity as any).filePath || "",
        estimatedTokens: tokens,
        lines,
        recommendation,
      });
    }
  }

  // Sort by token count descending
  oversized.sort((a, b) => b.estimatedTokens - a.estimatedTokens);

  const oversizedCount = oversized.length;
  const oversizedPercent =
    expandedEntities.length > 0 ? Math.round((oversizedCount / expandedEntities.length) * 100 * 10) / 10 : 0;

  let aiMessage: string | null = null;

  if (oversizedCount > 0) {
    const topEntities = oversized.slice(0, 5);
    const entityList = topEntities
      .map((e) => `  - ${e.type} "${e.name}" (${e.lines} lines, ~${e.estimatedTokens} tokens): ${e.recommendation}`)
      .join("\n");

    aiMessage = `⚠️ **Large Entity Warning**: ${oversizedCount} entities (${oversizedPercent}%) exceed embedding context (${maxTokens} tokens).

These entities may have reduced search quality:
${entityList}${oversizedCount > 5 ? `\n  ... and ${oversizedCount - 5} more` : ""}

**Recommendations**:
1. For large functions: Split into smaller, focused functions
2. For large classes without parsed methods: Check if parser extracts children
3. Consider using an embedding provider with larger context (e.g., 8192 tokens)`;
  }

  return {
    hasWarning: oversizedCount > 0,
    maxTokens,
    oversizedCount,
    totalEntities: expandedEntities.length,
    oversizedPercent,
    entities: oversized.slice(0, 10), // Return top 10
    aiMessage,
  };
}
