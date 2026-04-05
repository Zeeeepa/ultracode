/**
 * AutoDoc Batch Generate Handler
 *
 * Generates AUTODOC.md templates for changed directories.
 * Ported from Zig batch_generator.zig — uses ChangeKind-based strategy.
 *
 * Flow:
 *   getChangedDirectories → generateForDirectory (per dir) → sync to disk → LLM enrich (optional)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  type BatchResult,
  computeDirectoryHash,
  type DirectorySummaryEntity,
  detectChangeKind,
  generateDirectorySummary,
  mergeNewEntities,
  readCodeSnippets,
} from "../../autodoc/generator/batch-autodoc.js";
import { DocStorage } from "../../autodoc/storage/doc-storage.js";
import { ChangeKind } from "../../autodoc/types.js";
import { log } from "../../logging/index.js";
import type { Entity, GraphStorage } from "../../types/storage.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { AutoDocBatchGenerateSchema } from "../schemas/missing-tool-schemas.js";

type Args = z.infer<typeof AutoDocBatchGenerateSchema>;

export class AutoDocBatchGenerateHandler extends BaseToolHandler<Args> {
  protected parseArgs(args: unknown): Args {
    return AutoDocBatchGenerateSchema.parse(args);
  }

  protected async execute(args: Args): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const forceRegen = args.force ?? false;
    const enrich = args.enrich ?? false;
    const target = args.target;

    const result: BatchResult = { generated: 0, skipped: 0, errors: 0, synced: 0 };
    const enrichFullDirs: string[] = [];
    const enrichIncrDirs: string[] = [];

    try {
      // Get graph storage for entity queries
      const graphStorage = await this.context.getGraphStorage();

      // Get doc storage for autodoc DB
      const storagePaths = this.getProjectStoragePaths(projectPath);
      const docDbPath = path.join(storagePaths.dir, "autodoc.db");
      const docStorage = new DocStorage(docDbPath);
      await docStorage.initialize();

      // Get changed directories — resolve target to absolute path for DB LIKE match
      let resolvedTarget = target;
      if (resolvedTarget && !path.isAbsolute(resolvedTarget)) {
        resolvedTarget = path.join(projectPath, resolvedTarget);
      }
      const dirs = resolvedTarget ? [resolvedTarget] : await getChangedDirectories(graphStorage, projectPath);

      if (dirs.length === 0) {
        return this.textResult(`No changed directories found.`);
      }

      log.i("AUTODOC", "batch-start", { dirs: dirs.length, force: forceRegen, enrich });

      for (const dir of dirs) {
        try {
          const change = await generateForDirectory(graphStorage, docStorage, dir, projectPath, result, forceRegen);

          switch (change) {
            case ChangeKind.NEW:
              enrichFullDirs.push(dir);
              break;
            case ChangeKind.ENTITIES_ADDED:
            case ChangeKind.LOC_CHANGED:
              enrichIncrDirs.push(dir);
              break;
          }
        } catch (err) {
          log.w("AUTODOC", "batch-dir-err", { dir, err: (err as Error).message });
          result.errors++;
        }
      }

      // Sync to disk
      if (result.generated > 0) {
        result.synced = await syncAutodocFiles(docStorage, projectPath, dirs);
      }

      log.i("AUTODOC", "batch-done", {
        generated: result.generated,
        skipped: result.skipped,
        errors: result.errors,
        synced: result.synced,
        llmFull: enrichFullDirs.length,
        llmIncr: enrichIncrDirs.length,
      });

      // LLM enrichment (background, non-blocking)
      if (enrich && (enrichFullDirs.length > 0 || enrichIncrDirs.length > 0)) {
        // Don't await — run in background like Zig's enrichThread
        startEnrichBackground(docStorage, projectPath, enrichFullDirs, enrichIncrDirs).catch((e) => {
          log.w("AUTODOC", "enrich-bg-err", { err: (e as Error).message });
        });
      }

      return this.textResult(
        `Batch autodoc: generated=${result.generated} skipped=${result.skipped} errors=${result.errors} synced=${result.synced}` +
          (enrich ? ` llm_full=${enrichFullDirs.length} llm_incr=${enrichIncrDirs.length}` : ""),
      );
    } catch (err) {
      return this.textResult(`Error: ${(err as Error).message}`);
    }
  }

  private textResult(text: string): ToolResult {
    return { content: [{ type: "text", text }] };
  }
}

// =============================================================================
// Core logic — ported from Zig batch_generator
// =============================================================================

/**
 * Get directories with changed entities.
 * Queries graph storage for all indexed file paths, extracts unique directories.
 */
async function getChangedDirectories(graphStorage: GraphStorage, _projectPath: string): Promise<string[]> {
  // Get all entities, extract unique directories
  const entities = await graphStorage.findEntities({ limit: 10000, offset: 0 });
  const dirSet = new Set<string>();

  for (const entity of entities) {
    if (entity.filePath) {
      const dir = path.dirname(entity.filePath);
      if (dir && dir !== ".") dirSet.add(dir);
    }
  }

  return [...dirSet].sort();
}

/**
 * Generate/update template for a single directory.
 * Returns ChangeKind for LLM enrichment scheduling.
 */
async function generateForDirectory(
  graphStorage: GraphStorage,
  docStorage: DocStorage,
  dirPath: string,
  _projectPath: string,
  result: BatchResult,
  forceRegen: boolean,
): Promise<ChangeKind> {
  // Get entities in this directory — use searchEntitiesInDirectory (LIKE prefix search)
  // which exists on the implementation (graph-adapter.ts) but not the GraphStorage interface
  let entities: Entity[];
  if (typeof (graphStorage as any).searchEntitiesInDirectory === "function") {
    entities = await (graphStorage as any).searchEntitiesInDirectory(dirPath);
  } else {
    // Fallback: get all and filter by directory prefix
    const all = await graphStorage.findEntities({ limit: 10000, offset: 0 });
    const dirNorm = dirPath.replace(/\\/g, "/");
    entities = all.filter((e) => {
      const fp = e.filePath.replace(/\\/g, "/");
      return fp.startsWith(dirNorm + "/") || path.dirname(fp) === dirNorm;
    });
  }

  if (entities.length === 0) {
    result.skipped++;
    return ChangeKind.UNCHANGED;
  }

  // Map to DirectorySummaryEntity format
  const summaryEntities: DirectorySummaryEntity[] = entities.map((e: Entity) => ({
    name: e.name,
    type: e.type,
    filePath: e.filePath,
    location: e.location,
    language: e.language ?? "",
    size: e.size ?? 0,
    hash: e.hash ?? "",
  }));

  // Compute composite hash
  const compositeHash = computeDirectoryHash(summaryEntities);

  // Normalize path separators
  const dirNorm = dirPath.replace(/\\/g, "/");
  const entityId = `dir:${dirNorm}`;

  // Compute current metrics
  const curCount = entities.length;
  let curLoc = 0;
  for (const e of entities) curLoc += Math.max(e.size ?? 0, 0);

  // Check previous state
  const existingMeta = await docStorage.getSourceHash(entityId);
  const change = detectChangeKind(curCount, curLoc, existingMeta, compositeHash, forceRegen);

  if (change === ChangeKind.UNCHANGED) {
    result.skipped++;
    return ChangeKind.UNCHANGED;
  }

  // Generate template
  const templateContent = generateDirectorySummary(dirNorm, summaryEntities);
  const sourceHash = `${compositeHash}:${curCount}:${curLoc}`;

  // For enriched docs: merge new entities, preserve existing LLM content
  if (
    change === ChangeKind.ENTITIES_ADDED ||
    change === ChangeKind.ENTITIES_REMOVED_MINOR ||
    change === ChangeKind.LOC_CHANGED
  ) {
    const existingDoc = await docStorage.getDocByEntityId(entityId);
    if (existingDoc) {
      const isEnriched =
        (existingDoc.sourceHash?.startsWith("enriched|") ?? false) ||
        (existingDoc.sourceHash?.startsWith("synced|") ?? false) ||
        existingDoc.sourceHash === "edited";

      if (isEnriched) {
        const mergedContent =
          change === ChangeKind.ENTITIES_ADDED
            ? mergeNewEntities(existingDoc.content, templateContent)
            : existingDoc.content;

        await docStorage.upsertDirectoryDoc(entityId, mergedContent, sourceHash, `Module: ${dirNorm}`);
        result.generated++;
        return change;
      }
    }
  }

  // Insert/replace with new template
  await docStorage.upsertDirectoryDoc(entityId, templateContent, sourceHash, `Module: ${dirNorm}`);
  result.generated++;
  return change;
}

/**
 * Sync AUTODOC.md files from DB to disk.
 */
async function syncAutodocFiles(docStorage: DocStorage, projectPath: string, dirs: string[]): Promise<number> {
  let synced = 0;

  for (const dir of dirs) {
    const dirNorm = dir.replace(/\\/g, "/");
    const entityId = `dir:${dirNorm}`;
    const doc = await docStorage.getDocByEntityId(entityId);
    if (!doc) continue;

    try {
      const absDir = path.isAbsolute(dir) ? dir : path.join(projectPath, dir);
      const filePath = path.join(absDir, "AUTODOC.md");
      await mkdir(absDir, { recursive: true });
      await writeFile(filePath, doc.content, "utf-8");
      synced++;
    } catch (err) {
      log.w("AUTODOC", "sync-write-err", { dir, err: (err as Error).message });
    }
  }

  return synced;
}

/**
 * Background LLM enrichment (non-blocking).
 */
async function startEnrichBackground(
  docStorage: DocStorage,
  projectPath: string,
  fullDirs: string[],
  incrDirs: string[],
): Promise<void> {
  try {
    const { enrichSingleDoc } = await import("../../autodoc/llm/doc-writer.js");
    const { detectLLMProviders } = await import("../../autodoc/llm/index.js");

    const { recommended } = await detectLLMProviders();
    if (!recommended) {
      log.w("AUTODOC", "enrich-no-llm", { hint: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY" });
      return;
    }

    let total = 0;

    // Full enrichment (new dirs)
    for (const dir of fullDirs) {
      const dirNorm = dir.replace(/\\/g, "/");
      const entityId = `dir:${dirNorm}`;
      const doc = await docStorage.getDocByEntityId(entityId);
      if (!doc) continue;

      const codeCtx = await readCodeSnippets(path.join(projectPath, dir));
      const result = await enrichSingleDoc(
        recommended,
        { entityId, content: doc.content, sourceHash: doc.sourceHash ?? "", version: 1 },
        "full",
        codeCtx,
      );

      if (result) {
        await docStorage.upsertDirectoryDoc(entityId, result.enriched, result.newSourceHash, doc.title);
        // Write to disk immediately
        try {
          await writeFile(path.join(projectPath, dir, "AUTODOC.md"), result.enriched, "utf-8");
        } catch {
          /* skip */
        }
        total++;
      }
    }

    // Incremental enrichment (entities added / LOC changed)
    for (const dir of incrDirs) {
      const dirNorm = dir.replace(/\\/g, "/");
      const entityId = `dir:${dirNorm}`;
      const doc = await docStorage.getDocByEntityId(entityId);
      if (!doc) continue;

      const codeCtx = await readCodeSnippets(path.join(projectPath, dir));
      const result = await enrichSingleDoc(
        recommended,
        { entityId, content: doc.content, sourceHash: doc.sourceHash ?? "", version: 1 },
        "incremental",
        codeCtx,
      );

      if (result) {
        await docStorage.upsertDirectoryDoc(entityId, result.enriched, result.newSourceHash, doc.title);
        try {
          await writeFile(path.join(projectPath, dir, "AUTODOC.md"), result.enriched, "utf-8");
        } catch {
          /* skip */
        }
        total++;
      }
    }

    if (total > 0) log.i("AUTODOC", "enrich-done", { enriched: total });
  } catch (err) {
    log.w("AUTODOC", "enrich-err", { err: (err as Error).message });
  }
}
