/**
 * Recent Changes Enrichment Utility
 *
 * Shared logic for annotating diagnostic tool results with recently-changed
 * entity status from Prolly Tree commit history. Eliminates boilerplate
 * duplication across trace_flow, trace_backwards, and 6 new tools.
 */

import { log } from "../../logging/index.js";
import type { GraphAdapter } from "../../storage/graph-adapter.js";
import { getRecentlyChangedEntities } from "../../storage/prolly/recently-changed.js";
import type { GraphStorage } from "../../types/storage.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ChangedEntityInfo {
  entityId: string;
  entityName?: string | undefined;
  filePath?: string | undefined;
  changeType: "added" | "modified";
  significance: "critical" | "high" | "medium";
  hint: string;
}

export interface RecentChangeSummary {
  recentlyChangedEntities: ChangedEntityInfo[];
  totalAnnotated: number;
  commitsAnalyzed: number;
  timeMs: number;
}

export interface EntityInfoInput {
  entityId: string;
  significance?: "critical" | "high" | "medium" | undefined;
  entityName?: string | undefined;
  filePath?: string | undefined;
}

// ─── Adapter extraction ─────────────────────────────────────────────────

/**
 * Extract GraphAdapter from storage (graceful — returns null if unavailable).
 */
export function getAdapterFromStorage(storage: GraphStorage): GraphAdapter | null {
  const s = storage as { getLibSQLAdapter?: () => GraphAdapter | null };
  return s.getLibSQLAdapter?.() ?? null;
}

// ─── Core enrichment ────────────────────────────────────────────────────

const SIGNIFICANCE_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 };

function hintForSignificance(significance: string, commitsCount: number): string {
  switch (significance) {
    case "critical":
      return `Modified in last ${commitsCount} commits — likely root cause`;
    case "high":
      return `Recently changed — review for regressions`;
    default:
      return `Changed recently — may be related`;
  }
}

/**
 * Build a summary of which entities from `entityInfos` were recently changed.
 * Returns null if Prolly Tree is unavailable or no entities matched.
 */
export async function buildRecentChangeSummary(
  storage: GraphStorage,
  entityInfos: EntityInfoInput[],
  recentCommitsCount: number,
): Promise<RecentChangeSummary | null> {
  const adapter = getAdapterFromStorage(storage);
  if (!adapter) {
    log.d("RECENT_ENRICHMENT", "no_adapter", { reason: "getLibSQLAdapter unavailable" });
    return null;
  }

  const recentlyChanged = await getRecentlyChangedEntities(adapter, {
    lastCommits: recentCommitsCount,
  });

  if (!recentlyChanged) {
    return null;
  }

  const matched: ChangedEntityInfo[] = [];

  for (const info of entityInfos) {
    if (!recentlyChanged.changedIds.has(info.entityId)) continue;

    const changeType = recentlyChanged.addedIds.has(info.entityId) ? "added" : "modified";
    const significance = info.significance ?? "medium";

    matched.push({
      entityId: info.entityId,
      entityName: info.entityName,
      filePath: info.filePath,
      changeType,
      significance,
      hint: hintForSignificance(significance, recentCommitsCount),
    });
  }

  if (matched.length === 0) return null;

  // Sort by significance: critical > high > medium
  matched.sort((a, b) => (SIGNIFICANCE_ORDER[a.significance] ?? 2) - (SIGNIFICANCE_ORDER[b.significance] ?? 2));

  return {
    recentlyChangedEntities: matched,
    totalAnnotated: matched.length,
    commitsAnalyzed: recentlyChanged.commitsAnalyzed,
    timeMs: recentlyChanged.timeMs,
  };
}

// ─── In-place annotation ────────────────────────────────────────────────

/**
 * Annotate items that have `entityId` with `recentlyChanged: true`.
 * Returns list of annotated entityIds.
 */
export function annotateEntitiesInPlace(
  items: Array<{ entityId?: string } & Record<string, unknown>>,
  changedIds: Set<string>,
): string[] {
  const annotated: string[] = [];
  for (const item of items) {
    if (item.entityId && changedIds.has(item.entityId)) {
      item["recentlyChanged"] = true;
      annotated.push(item.entityId);
    }
  }
  return annotated;
}

// ─── Location → Entity resolver ─────────────────────────────────────────

export interface ResolvedLocation {
  location: string;
  filePath: string;
  line: number;
  entityId: string;
  entityName: string;
}

/**
 * Resolve "file:line" location strings to entity IDs by matching line ranges.
 * Groups by file to minimize DB queries.
 */
export async function resolveLocationsToEntities(
  storage: GraphStorage,
  locations: string[],
): Promise<Map<string, ResolvedLocation>> {
  const result = new Map<string, ResolvedLocation>();

  // Parse locations and group by file
  const byFile = new Map<string, Array<{ location: string; line: number }>>();
  for (const loc of locations) {
    const colonIdx = loc.lastIndexOf(":");
    if (colonIdx <= 0) continue;

    const filePath = loc.substring(0, colonIdx);
    const line = parseInt(loc.substring(colonIdx + 1), 10);
    if (isNaN(line)) continue;

    let entries = byFile.get(filePath);
    if (!entries) {
      entries = [];
      byFile.set(filePath, entries);
    }
    entries.push({ location: loc, line });
  }

  // For each file, find entities and match by line range
  for (const [filePath, entries] of byFile) {
    try {
      const entities = await storage.findEntities({
        filters: { filePath },
        lightweight: true,
      });

      for (const entry of entries) {
        for (const entity of entities) {
          if (entity.location && entry.line >= entity.location.start.line && entry.line <= entity.location.end.line) {
            result.set(entry.location, {
              location: entry.location,
              filePath,
              line: entry.line,
              entityId: entity.id,
              entityName: entity.name,
            });
            break; // first match (most specific would need sorting by range size)
          }
        }
      }
    } catch {
      // Skip files that can't be queried
    }
  }

  return result;
}

// ─── Text formatting helpers ────────────────────────────────────────────

/**
 * Format RecentChangeSummary as a text section for appending to tool output.
 */
export function formatRecentChangesSection(summary: RecentChangeSummary): string {
  const lines: string[] = [
    "",
    "=== RECENT CHANGES ===",
    `Commits analyzed: ${summary.commitsAnalyzed} | Entities affected: ${summary.totalAnnotated} | Time: ${Math.round(summary.timeMs)}ms`,
    "",
  ];

  for (const entity of summary.recentlyChangedEntities) {
    const name = entity.entityName || entity.entityId;
    const file = entity.filePath ? ` (${entity.filePath})` : "";
    lines.push(`  [${entity.significance.toUpperCase()}] ${name}${file}`);
    lines.push(`    ${entity.changeType} — ${entity.hint}`);
  }

  return lines.join("\n");
}
