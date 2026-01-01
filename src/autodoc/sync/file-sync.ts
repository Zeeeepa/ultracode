/**
 * AutoDoc File Sync
 *
 * Bidirectional synchronization between .md files on disk and SQLite database.
 *
 * - Disk → DB: User edits .md file → validate → incremental update to DB
 * - DB → Disk: API changes → sync to physical files
 *
 * All file operations use optimized Bun/Node utilities from file-ops.ts.
 * Parallelized with up to 8 concurrent operations.
 *
 * Architecture References:
 * - AutoDoc Manager: src/autodoc/storage/autodoc-manager.ts
 * - File Ops: src/utils/file-ops.ts
 * - Parallel: src/utils/parallel.ts
 */

import path from "node:path";
import { fileExists, mkdir, readdir, readText, stat, writeFile } from "../../utils/file-ops.js";
import { mapParallel } from "../../utils/parallel.js";
import type { DocEntity } from "../types.js";

// =============================================================================
// 1. TYPES
// =============================================================================

export interface FileSyncResult {
  /** Files synced from disk to DB */
  diskToDb: {
    added: string[];
    updated: string[];
    errors: Array<{ file: string; error: string }>;
  };
  /** Files synced from DB to disk */
  dbToDisk: {
    written: string[];
    errors: Array<{ file: string; error: string }>;
  };
}

export interface FileInfo {
  path: string;
  mtime: number;
}

// =============================================================================
// 2. FILE DISCOVERY
// =============================================================================

/**
 * Recursively find all .md files in a directory
 * Uses optimized readdir from file-ops.ts + parallel stat calls
 */
export async function findMarkdownFiles(dir: string, maxDepth = 5): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  const pendingDirs: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];

  // BFS with parallel processing at each level
  while (pendingDirs.length > 0) {
    // Process current level directories in parallel
    const currentLevel = pendingDirs.splice(0, pendingDirs.length);

    const levelResults = await mapParallel(
      currentLevel,
      async ({ path: currentDir, depth }) => {
        if (depth > maxDepth) return { files: [], subdirs: [] };

        try {
          const entries = await readdir(currentDir, { withFileTypes: true });
          const files: FileInfo[] = [];
          const subdirs: Array<{ path: string; depth: number }> = [];

          // Collect files and subdirs
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
              // Skip hidden dirs and node_modules
              if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
                subdirs.push({ path: fullPath, depth: depth + 1 });
              }
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
              try {
                const stats = await stat(fullPath);
                files.push({ path: fullPath, mtime: stats.mtime.getTime() });
              } catch {
                // Skip files we can't stat
              }
            }
          }

          return { files, subdirs };
        } catch {
          return { files: [], subdirs: [] };
        }
      },
      8, // Process up to 8 directories in parallel
    );

    // Aggregate results
    for (const { files, subdirs } of levelResults) {
      results.push(...files);
      pendingDirs.push(...subdirs);
    }
  }

  return results;
}

// =============================================================================
// 3. DISK → DB SYNC
// =============================================================================

/**
 * Sync files from disk to database
 * Only syncs files that are newer than what's in DB
 */
export async function syncDiskToDb(
  docsDir: string,
  getDocsByFile: (filePath: string) => DocEntity[] | Promise<DocEntity[]>,
  saveDocument: (filePath: string, content: string) => DocEntity[] | Promise<DocEntity[]>,
  concurrency = 8,
): Promise<FileSyncResult["diskToDb"]> {
  const result: FileSyncResult["diskToDb"] = {
    added: [],
    updated: [],
    errors: [],
  };

  // Find all .md files
  const files = await findMarkdownFiles(docsDir);

  if (files.length === 0) {
    return result;
  }

  // Process files in parallel
  await mapParallel(
    files,
    async (fileInfo) => {
      try {
        const existingDocs = await getDocsByFile(fileInfo.path);
        const lastSync = existingDocs.length > 0 ? Math.max(...existingDocs.map((d) => d.lastSync || 0)) : 0;

        // Only sync if file is newer than last sync
        if (fileInfo.mtime > lastSync) {
          const content = await readText(fileInfo.path);
          await saveDocument(fileInfo.path, content);

          if (existingDocs.length === 0) {
            result.added.push(fileInfo.path);
          } else {
            result.updated.push(fileInfo.path);
          }
        }
      } catch (err) {
        result.errors.push({
          file: fileInfo.path,
          error: (err as Error).message,
        });
      }
    },
    concurrency,
  );

  return result;
}

// =============================================================================
// 4. DB → DISK SYNC
// =============================================================================

/**
 * Group documents by file path
 */
function groupDocsByFile(docs: DocEntity[]): Map<string, DocEntity[]> {
  const groups = new Map<string, DocEntity[]>();

  for (const doc of docs) {
    const existing = groups.get(doc.filePath) || [];
    existing.push(doc);
    groups.set(doc.filePath, existing);
  }

  return groups;
}

/**
 * Generate markdown content from documents
 */
function generateMarkdownFromDocs(docs: DocEntity[]): string {
  // Sort by section to maintain order
  const sorted = [...docs].sort((a, b) => {
    // Empty section (root) first
    if (!a.section) return -1;
    if (!b.section) return 1;
    return (a.section || "").localeCompare(b.section || "");
  });

  const lines: string[] = [];

  for (const doc of sorted) {
    // Determine heading level from section depth or default to 2
    const level = doc.section ? (doc.section.split("-").length > 2 ? 3 : 2) : 1;

    lines.push(`${"#".repeat(level)} ${doc.title}`);
    lines.push("");

    if (doc.content) {
      lines.push(doc.content);
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Write a document to disk
 * Uses optimized writeFile from file-ops.ts
 */
async function writeDocToFile(filePath: string, content: string): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!(await fileExists(dir))) {
    await mkdir(dir, { recursive: true });
  }

  // Write file using optimized Bun/Node utility
  await writeFile(filePath, content);
}

/**
 * Sync documents from database to disk
 * Writes files that don't exist or are older than DB
 */
export async function syncDbToDisk(
  getAllDocs: () => DocEntity[] | Promise<DocEntity[]>,
  concurrency = 8,
): Promise<FileSyncResult["dbToDisk"]> {
  const result: FileSyncResult["dbToDisk"] = {
    written: [],
    errors: [],
  };

  const allDocs = await getAllDocs();
  if (allDocs.length === 0) {
    return result;
  }

  // Group by file
  const fileGroups = groupDocsByFile(allDocs);
  const filePaths = Array.from(fileGroups.keys());

  // Process files in parallel
  await mapParallel(
    filePaths,
    async (filePath) => {
      try {
        const docs = fileGroups.get(filePath)!;
        const dbTime = Math.max(...docs.map((d) => d.updatedAt));

        // Check if file exists and get its mtime
        let fileTime = 0;
        if (await fileExists(filePath)) {
          try {
            const stats = await stat(filePath);
            fileTime = stats.mtime.getTime();
          } catch {
            // Can't stat, assume needs writing
          }
        }

        // Write if DB is newer or file doesn't exist
        if (dbTime > fileTime || fileTime === 0) {
          const content = generateMarkdownFromDocs(docs);
          await writeDocToFile(filePath, content);
          result.written.push(filePath);
        }
      } catch (err) {
        result.errors.push({
          file: filePath,
          error: (err as Error).message,
        });
      }
    },
    concurrency,
  );

  return result;
}

// =============================================================================
// 5. BIDIRECTIONAL SYNC
// =============================================================================

/**
 * Full bidirectional sync
 */
export async function syncBidirectional(
  docsDir: string,
  getDocsByFile: (filePath: string) => DocEntity[] | Promise<DocEntity[]>,
  getAllDocs: () => DocEntity[] | Promise<DocEntity[]>,
  saveDocument: (filePath: string, content: string) => DocEntity[] | Promise<DocEntity[]>,
  concurrency = 8,
): Promise<FileSyncResult> {
  // First: Disk → DB (pick up user changes)
  const diskToDb = await syncDiskToDb(docsDir, getDocsByFile, saveDocument, concurrency);

  // Second: DB → Disk (write any DB-only docs)
  const dbToDisk = await syncDbToDisk(getAllDocs, concurrency);

  return { diskToDb, dbToDisk };
}

// =============================================================================
// 6. SINGLE FILE OPERATIONS
// =============================================================================

/**
 * Write a single document to disk
 */
export async function writeDocumentToDisk(filePath: string, content: string): Promise<void> {
  await writeDocToFile(filePath, content);
}

/**
 * Read and parse a single document from disk
 * Returns null if file doesn't exist
 */
export async function readDocumentFromDisk(filePath: string): Promise<{ content: string; mtime: number } | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  try {
    const content = await readText(filePath);
    const stats = await stat(filePath);
    return { content, mtime: stats.mtime.getTime() };
  } catch {
    return null;
  }
}
