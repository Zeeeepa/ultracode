/**
 * Batch AutoDoc Generator — ported from Zig batch_generator.zig
 *
 * Generates AUTODOC.md templates for changed directories using
 * ChangeKind-based strategy (new/entities_added/loc_changed/entities_removed/unchanged).
 * Integrates with LLM enrichment for full and incremental documentation.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { log } from "../../logging/index.js";
import { ChangeKind, parseSourceMeta } from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface BatchResult {
  generated: number;
  skipped: number;
  errors: number;
  synced: number;
}

export interface DirectoryDoc {
  entityId: string;
  content: string;
  sourceHash: string;
  title: string;
}

// =============================================================================
// computeDirectoryHash — FNV-1a 64-bit over sorted entity hashes
// =============================================================================

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * Compute composite hash for a directory's entities.
 * Collects entity hashes, sorts them, runs FNV-1a 64-bit over concatenation.
 * Returns 16-char hex string, or "empty" if no entities have hashes.
 */
export function computeDirectoryHash(entities: Array<{ hash?: string }>): string {
  const hashes: string[] = [];
  for (const e of entities) {
    if (e.hash && e.hash.length > 0) hashes.push(e.hash);
  }
  if (hashes.length === 0) return "empty";

  hashes.sort();

  let hash = FNV_OFFSET_BASIS;
  for (const h of hashes) {
    for (let i = 0; i < h.length; i++) {
      hash ^= BigInt(h.charCodeAt(i));
      hash = (hash * FNV_PRIME) & MASK_64;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

// =============================================================================
// Entity type ordering — matches Zig doc_generator.zig type_order
// =============================================================================

const TYPE_ORDER: string[] = [
  "class",
  "struct",
  "interface",
  "enum",
  "trait",
  "function",
  "method",
  "constant",
  "variable",
  "type_alias",
  "module",
  "component",
  "service",
  "middleware",
  "route",
  "hook",
];

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// generateDirectorySummary — Zig-format entity listings
// =============================================================================

/**
 * Parse entity location string "start-end" or "start" into line numbers.
 */
function parseLocation(loc?: string | { start?: { line?: number }; end?: { line?: number } }): {
  startLine: number;
  endLine: number;
} {
  if (!loc) return { startLine: 0, endLine: 0 };
  // Object format (TS Entity)
  if (typeof loc === "object") {
    const s = loc.start?.line ?? 0;
    const e = loc.end?.line ?? s;
    return { startLine: s, endLine: e };
  }
  // String format "start-end"
  const dash = loc.indexOf("-");
  if (dash < 0) {
    const n = parseInt(loc, 10) || 0;
    return { startLine: n, endLine: n };
  }
  return {
    startLine: parseInt(loc.slice(0, dash), 10) || 0,
    endLine: parseInt(loc.slice(dash + 1), 10) || 0,
  };
}

export interface DirectorySummaryEntity {
  name: string;
  type: string;
  filePath: string;
  location?: string | { start?: { line?: number }; end?: { line?: number } };
  language?: string;
  size?: number;
  hash?: string;
}

/**
 * Generate directory-level AUTODOC.md template.
 * Format matches Zig doc_generator.generateDirectorySummary:
 *
 * ```
 * # Module: src/tools
 *
 * **Files:** 5 | **Entities:** 12 | **Language:** TypeScript
 *
 * ## Function
 *
 * - **doSomething** — `utils.ts:10-25`
 * ```
 */
export function generateDirectorySummary(dirPath: string, entities: DirectorySummaryEntity[]): string {
  const lines: string[] = [];

  // Determine dominant language
  const langCounts = new Map<string, number>();
  for (const e of entities) {
    if (e.language) {
      langCounts.set(e.language, (langCounts.get(e.language) ?? 0) + 1);
    }
  }
  let dominantLang = "";
  let maxCount = 0;
  for (const [lang, count] of langCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantLang = lang;
    }
  }

  // Count unique files
  const fileSet = new Set<string>();
  for (const e of entities) fileSet.add(e.filePath);

  // Header
  lines.push(`# Module: ${dirPath}`);
  lines.push("");
  let header = `**Files:** ${fileSet.size} | **Entities:** ${entities.length}`;
  if (dominantLang) header += ` | **Language:** ${dominantLang}`;
  lines.push(header);
  lines.push("");

  // Group by entity type in defined order
  for (const etype of TYPE_ORDER) {
    const matching = entities.filter((e) => e.type === etype);
    if (matching.length === 0) continue;

    lines.push(`## ${capitalizeFirst(etype)}`);
    lines.push("");

    for (const e of matching) {
      const filename = path.basename(e.filePath);
      const loc = parseLocation(e.location);
      lines.push(`- **${e.name}** — \`${filename}:${loc.startLine}-${loc.endLine}\``);
    }
    lines.push("");
  }

  // Entities with unknown types (not in TYPE_ORDER)
  const uncategorized = entities.filter((e) => !TYPE_ORDER.includes(e.type));
  if (uncategorized.length > 0) {
    lines.push("## Other");
    lines.push("");
    for (const e of uncategorized) {
      const filename = path.basename(e.filePath);
      const loc = parseLocation(e.location);
      lines.push(`- **${e.name}** — \`${filename}:${loc.startLine}-${loc.endLine}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// detectChangeKind — determines update strategy
// =============================================================================

/**
 * Detect what kind of change occurred in a directory.
 * Compares current entity metrics against stored source_hash metadata.
 */
export function detectChangeKind(
  currentCount: number,
  currentLoc: number,
  existingMeta: string | null,
  currentHash: string,
  forceRegen: boolean,
): ChangeKind {
  if (!existingMeta) return ChangeKind.NEW;

  // Skip "edited" docs — user manually edited
  if (existingMeta === "edited") return ChangeKind.UNCHANGED;

  // Strip "synced|" prefix — treat synced docs same as regular for hash comparison
  let effective = existingMeta;
  if (effective.startsWith("synced|")) effective = effective.slice("synced|".length);

  const prev = parseSourceMeta(effective);

  if (!forceRegen && prev.hash === currentHash) return ChangeKind.UNCHANGED;

  // Force regen with same hash: treat as entities_added to preserve enriched content
  if (forceRegen && prev.hash === currentHash) return ChangeKind.ENTITIES_ADDED;

  if (prev.entityCount === 0) return ChangeKind.NEW;

  if (currentCount > prev.entityCount) return ChangeKind.ENTITIES_ADDED;

  if (currentCount < prev.entityCount) {
    const removed = prev.entityCount - currentCount;
    const pct = (removed * 100) / prev.entityCount;
    return pct < 10 ? ChangeKind.ENTITIES_REMOVED_MINOR : ChangeKind.LOC_CHANGED;
  }

  // Same count — check LOC change
  if (prev.totalLoc > 0) {
    const locDiff = Math.abs(currentLoc - prev.totalLoc);
    const pct = (locDiff * 100) / prev.totalLoc;
    return pct >= 10 ? ChangeKind.LOC_CHANGED : ChangeKind.UNCHANGED;
  }

  return ChangeKind.UNCHANGED;
}

// =============================================================================
// mergeNewEntities — append new entities to enriched content
// =============================================================================

/**
 * Merge new entities from template into existing enriched content.
 * Finds filenames from template not mentioned in existing, appends those entries
 * under `## New (pending description)` section.
 *
 * Ported from Zig batch_generator.mergeNewEntities.
 */
export function mergeNewEntities(existingContent: string, newTemplate: string): string {
  const newEntries: string[] = [];

  for (const line of newTemplate.split("\n")) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("- **")) continue;

    // Extract filename from backtick: `filename:start-end`
    const bt1 = trimmed.indexOf("`");
    if (bt1 < 0) continue;
    const bt2 = trimmed.indexOf("`", bt1 + 1);
    if (bt2 < 0) continue;
    const ref = trimmed.slice(bt1 + 1, bt2); // "filename:start-end"
    const colon = ref.indexOf(":");
    if (colon < 0) continue;
    const filename = ref.slice(0, colon);
    if (!filename) continue;

    // Check if filename is mentioned anywhere in existing content
    if (!existingContent.includes(filename)) {
      newEntries.push(trimmed);
    }
  }

  log.d("AUTODOC", "merge-check", {
    newEntries: newEntries.length,
    existingLen: existingContent.length,
  });

  if (newEntries.length === 0) return existingContent;

  // Build merged: existing + new entries
  let result = existingContent;
  if (!result.endsWith("\n")) result += "\n";
  result += "\n## New (pending description)\n\n";
  for (const entry of newEntries) {
    result += entry + "\n";
  }

  return result;
}

// =============================================================================
// readCodeSnippets — read key source files for LLM context
// =============================================================================

const SOURCE_EXTENSIONS = new Set([
  ".zig",
  ".ts",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".js",
  ".tsx",
  ".jsx",
  ".kt",
  ".swift",
  ".cpp",
  ".c",
  ".h",
]);

const KEY_FILE_NAMES = ["index", "main", "mod"];

/**
 * Read first ~1500 bytes from up to 3 key source files in a directory.
 * Returns markdown with code blocks, or null if no files found.
 *
 * Ported from Zig batch_generator.readCodeSnippets.
 */
export async function readCodeSnippets(dirPath: string): Promise<string | null> {
  let fileNames: string[];
  try {
    fileNames = await readdir(dirPath);
  } catch {
    return null;
  }

  const output: string[] = ["\n## Code samples from key files:\n"];
  let filesRead = 0;

  for (const name of fileNames) {
    if (filesRead >= 3) break;
    const ext = path.extname(name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    const baseName = path.basename(name, ext);
    const isKey = KEY_FILE_NAMES.some((k) => baseName.includes(k)) || filesRead === 0;
    if (!isKey && filesRead >= 1) continue;

    try {
      const { open } = await import("node:fs/promises");
      const fp = path.join(dirPath, name);
      const buf = Buffer.alloc(1500);
      const fh = await open(fp, "r");
      const { bytesRead } = await fh.read(buf, 0, 1500);
      await fh.close();
      if (bytesRead > 0) {
        output.push(
          `\n### \`${name}\` (first ${bytesRead} bytes):\n\`\`\`\n${buf.toString("utf-8", 0, bytesRead)}\n\`\`\`\n`,
        );
        filesRead++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (filesRead === 0) return null;
  return output.join("");
}

// =============================================================================
// postProcessLlmOutput — clean LLM response
// =============================================================================

const BAD_PHRASES = [
  "Замечу",
  "уточните",
  "Пожалуйста",
  "Please clarify",
  "I notice",
  "I don't see",
  "Let me know",
  "Could you",
  "no new entities",
  "no changes",
  "identical",
];

const TRAILING_PATTERNS = [
  "\n---\n",
  "\nDocumentation ready",
  "\nDocumentation complete",
  "\nReady for use",
  "\nДокументация готова",
  "\nДля применения",
];

const CODE_SAMPLE_MARKERS = ["\n## Code samples", "\n## Примеры кода", "\n## Code snippets", "\n## Raw code"];

/**
 * Post-process LLM output: trim to first heading, strip meta-text, reject invalid.
 * Returns cleaned markdown or null if output is invalid.
 *
 * Ported from Zig batch_generator.postProcessLlmOutput.
 */
export function postProcessLlmOutput(raw: string): string | null {
  // Find first markdown heading
  const headingIdx = raw.indexOf("# ");
  if (headingIdx < 0) return null; // No heading — invalid

  const start = headingIdx;
  let end = raw.length;

  const trimmed = raw.slice(start, end);

  // Reject conversational/meta-commentary
  if (trimmed.length < 50) return null;
  const first200 = trimmed.slice(0, 200);
  for (const phrase of BAD_PHRASES) {
    if (first200.includes(phrase)) return null;
  }

  // Strip trailing meta-text
  for (const pattern of TRAILING_PATTERNS) {
    const pos = raw.lastIndexOf(pattern, end);
    if (pos >= start && pos > end - 200) {
      end = pos;
    }
  }

  // Strip "## Code samples" section echoed back
  for (const marker of CODE_SAMPLE_MARKERS) {
    const pos = raw.indexOf(marker, start);
    if (pos >= start && pos < end) {
      end = pos;
    }
  }

  // Strip "## New (pending description)" — should have been integrated
  const pendingMarker = "\n## New (pending description)";
  const pendingPos = raw.indexOf(pendingMarker, start);
  if (pendingPos >= start && pendingPos < end) {
    end = pendingPos;
  }

  return raw.slice(start, end).trim();
}
