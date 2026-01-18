/**
 * File Collector
 *
 * Recursively collects source files from a directory,
 * respecting exclude patterns and default exclusions.
 *
 * Performance optimizations:
 * - Uses readdirSync with withFileTypes (eliminates separate lstat calls)
 * - Uses Bun.Glob.scan() when running under Bun (3x faster, native async iterator)
 */

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { log } from "../../logging/index.js";
import { isBunRuntime } from "../../utils/runtime.js";
import { isCodeExtension, isDataExtension, SUPPORTED_DATA_EXTENSIONS } from "./file-extensions.js";

/** Name of the ignore file */
const IGNORE_FILE_NAME = ".ultrascriptignore";

/**
 * Load patterns from .ultrascriptignore file if it exists
 * Supports gitignore-style syntax:
 * - Lines starting with # are comments
 * - Empty lines are ignored
 * - Patterns follow glob syntax
 */
export function loadIgnoreFile(directory: string): string[] {
  const ignoreFilePath = join(directory, IGNORE_FILE_NAME);
  if (!existsSync(ignoreFilePath)) {
    return [];
  }

  try {
    const content = readFileSync(ignoreFilePath, "utf-8");
    const patterns: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      // Convert to glob pattern if needed
      let pattern = trimmed;
      // If pattern doesn't have glob markers, treat as directory/file name
      if (!pattern.includes("*") && !pattern.includes("/")) {
        pattern = `**/${pattern}/**`;
      }
      patterns.push(pattern);
    }

    if (patterns.length > 0) {
      log.i("FILESCAN", "ignore_loaded", { path: ignoreFilePath, cnt: patterns.length });
    }

    return patterns;
  } catch (error) {
    log.w("FILESCAN", "ignore_read_fail", { path: ignoreFilePath, err: String(error) });
    return [];
  }
}

/** Default directory names to exclude from scanning */
const DEFAULT_EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  "tmp",
  "temp",
  "cache",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  ".memory_bank",
  "build",
  "dist",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "archives",
  "archive",
  "backups",
  "backup",
]);

/**
 * Check if a file path should be excluded based on patterns
 */
function shouldExclude(filePath: string, excludePatterns: string[]): boolean {
  // Normalize path to forward slashes for cross-platform pattern matching
  const normalizedPath = filePath.replace(/\\/g, "/");
  for (const pattern of excludePatterns) {
    if (pattern.includes("**")) {
      // Convert glob pattern to regex
      // IMPORTANT: Directory names must match exactly as path segments, not substrings
      // e.g., **/test/** should match /test/ but NOT /testrunner/
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

      // Replace ** with pattern that matches any path segments
      // Replace * with pattern that matches within a single segment (no slashes)
      // Ensure directory names are matched as complete segments (between slashes)
      const regex = escaped
        .replace(/\*\*\//g, "(?:[^/]+/)*") // **/ matches zero or more directory levels
        .replace(/\/\*\*/g, "(?:/[^/]+)*") // /** matches zero or more trailing levels
        .replace(/\*\*/g, ".*") // standalone ** (rare)
        .replace(/\*/g, "[^/]*"); // * matches within segment

      // For patterns like **/dirname/** also match the directory itself
      // by making trailing pattern optional
      const flexibleRegex = regex.replace(/\(\?:\/\[\^\/\]\+\)\*$/, "(?:/[^/]+)*");

      if (new RegExp(flexibleRegex).test(normalizedPath)) return true;
    } else {
      // Simple pattern matching - extract core path segment
      const normalizedPattern = pattern.replace(/\*/g, "").replace(/\\/g, "/");
      if (normalizedPath.includes(normalizedPattern)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a file should be included based on extension
 */
function isSupportedFile(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  const lowerName = fileName.toLowerCase();
  return (
    isCodeExtension(ext) ||
    isDataExtension(ext) ||
    // Dotfiles without extension (e.g. .gitignore, .dockerignore)
    SUPPORTED_DATA_EXTENSIONS.some((d) => lowerName === d.slice(1) || lowerName.endsWith(d))
  );
}

export interface CollectFilesOptions {
  excludePatterns: string[];
  agentId: string;
}

export interface CollectFilesResult {
  files: string[];
  stats: {
    dirsScanned: number;
    excludedByPattern: number;
    excludedByDefault: number;
    byExtension: Record<string, number>;
  };
}

/**
 * Bun.Glob interface for type safety
 */
interface BunGlob {
  new (pattern: string): BunGlobInstance;
}

interface BunGlobInstance {
  scan(options: { cwd: string; onlyFiles?: boolean }): AsyncIterable<string>;
}

interface BunGlobal {
  Glob?: BunGlob;
}

/**
 * Collect files using Bun.Glob.scan() - 3x faster than fs operations
 * Uses native async iterator for streaming results
 */
async function collectFilesWithBunGlob(
  directory: string,
  excludePatterns: string[],
): Promise<{ files: string[]; excludedByPattern: number }> {
  const BunGlobClass = (globalThis as unknown as BunGlobal).Glob;
  if (!BunGlobClass) {
    throw new Error("Bun.Glob not available");
  }

  const files: string[] = [];
  let excludedByPattern = 0;

  // Build glob pattern for supported extensions
  // Bun.Glob is very fast at pattern matching
  const glob = new BunGlobClass("**/*");

  const startTime = Date.now();

  for await (const relativePath of glob.scan({ cwd: directory, onlyFiles: true })) {
    const fullPath = join(directory, relativePath);
    const fileName = relativePath.split("/").pop() || relativePath;

    // Skip hidden files/dirs (starting with .)
    if (relativePath.includes("/.") || relativePath.startsWith(".")) {
      continue;
    }

    // Check default excluded directories
    const pathParts = relativePath.split("/");
    let skipByDefault = false;
    for (const part of pathParts) {
      if (DEFAULT_EXCLUDED_DIR_NAMES.has(part.toLowerCase())) {
        skipByDefault = true;
        break;
      }
    }
    if (skipByDefault) {
      continue;
    }

    // Check exclude patterns
    if (shouldExclude(fullPath, excludePatterns)) {
      excludedByPattern++;
      continue;
    }

    // Check if supported file type
    if (isSupportedFile(fileName)) {
      files.push(fullPath);
    }
  }

  const elapsed = Date.now() - startTime;
  log.d("FILESCAN", "bun_glob_scan", { files: files.length, elapsed: `${elapsed}ms` });

  return { files, excludedByPattern };
}

/**
 * Collect files using Node.js fs with withFileTypes optimization
 * Eliminates separate lstat() calls - Dirent already has type info
 */
function collectFilesWithNodeFs(
  directory: string,
  excludePatterns: string[],
): { files: string[]; dirsScanned: number; excludedByPattern: number; excludedByDefault: number } {
  const files: string[] = [];
  let excludedByPattern = 0;
  let excludedByDefault = 0;
  let dirsScanned = 0;

  function walkDir(dir: string) {
    try {
      dirsScanned++;
      // withFileTypes: true returns Dirent objects with isDirectory()/isFile()
      // This eliminates the need for separate lstatSync calls!
      const entries: Dirent[] = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip symlinks early
        if (entry.isSymbolicLink()) {
          continue;
        }

        // Check exclude patterns
        if (shouldExclude(fullPath, excludePatterns)) {
          excludedByPattern++;
          continue;
        }

        if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();

          // Check default excluded directories
          if (DEFAULT_EXCLUDED_DIR_NAMES.has(lowerName)) {
            excludedByDefault++;
            continue;
          }

          // Skip hidden directories
          if (!entry.name.startsWith(".")) {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          // Check if supported file type
          if (isSupportedFile(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      log.e("FILESCAN", "dir_read_error", { dir, err: String(error) });
    }
  }

  walkDir(directory);

  return { files, dirsScanned, excludedByPattern, excludedByDefault };
}

/**
 * Recursively collect source files from a directory
 * Automatically uses the fastest method available:
 * - Bun.Glob.scan() when running under Bun (3x faster)
 * - Node.js fs with withFileTypes optimization otherwise
 */
export function collectFiles(directory: string, options: CollectFilesOptions): CollectFilesResult {
  const { excludePatterns: baseExcludePatterns } = options;

  // Load project-specific ignore patterns from .ultrascriptignore
  const ignorePatterns = loadIgnoreFile(directory);
  const excludePatterns = [...baseExcludePatterns, ...ignorePatterns];

  const startTime = Date.now();

  // Try Bun.Glob first (async, but we need sync interface)
  // For now, use sync Node.js approach but with withFileTypes optimization
  // Bun.Glob will be used when we can make collectFiles async
  const useBunGlob = false; // TODO: Enable when collectFiles can be async

  let files: string[];
  let dirsScanned = 0;
  let excludedByPattern = 0;
  let excludedByDefault = 0;

  if (useBunGlob && isBunRuntime()) {
    // Bun.Glob path - currently disabled as collectFiles is sync
    // Will be enabled when we can make the API async
    log.d("FILESCAN", "using_bun_glob");
    const result = collectFilesWithNodeFs(directory, excludePatterns);
    files = result.files;
    dirsScanned = result.dirsScanned;
    excludedByPattern = result.excludedByPattern;
    excludedByDefault = result.excludedByDefault;
  } else {
    // Node.js path with withFileTypes optimization (no lstat calls!)
    const result = collectFilesWithNodeFs(directory, excludePatterns);
    files = result.files;
    dirsScanned = result.dirsScanned;
    excludedByPattern = result.excludedByPattern;
    excludedByDefault = result.excludedByDefault;
  }

  const elapsed = Date.now() - startTime;

  // Count files by extension for diagnostics
  const extStats: Record<string, number> = {};
  for (const f of files) {
    const ext = extname(f).toLowerCase() || "(no ext)";
    extStats[ext] = (extStats[ext] || 0) + 1;
  }

  log.i("FILESCAN", "scan_done", {
    root: directory,
    dirs: dirsScanned,
    files: files.length,
    excludedPat: excludedByPattern,
    excludedDef: excludedByDefault,
    elapsed: `${elapsed}ms`,
  });

  return {
    files,
    stats: {
      dirsScanned,
      excludedByPattern,
      excludedByDefault,
      byExtension: extStats,
    },
  };
}

/**
 * Collect files using tiny-glob - fast async glob for Node.js
 * ~350% faster than node-glob, 2.5KB bundle size
 */
async function collectFilesWithTinyGlob(
  directory: string,
  excludePatterns: string[],
): Promise<{ files: string[]; excludedByPattern: number }> {
  // Dynamic import to avoid bundling issues
  const glob = (await import("tiny-glob")).default as (
    pattern: string,
    options?: { cwd?: string; filesOnly?: boolean; absolute?: boolean },
  ) => Promise<string[]>;

  const files: string[] = [];
  let excludedByPattern = 0;

  const startTime = Date.now();

  // tiny-glob returns relative paths by default
  const allFiles = await glob("**/*", {
    cwd: directory,
    filesOnly: true,
    absolute: true,
  });

  for (const fullPath of allFiles) {
    const relativePath = relative(directory, fullPath);
    const fileName = relativePath.split(/[/\\]/).pop() || relativePath;

    // Skip hidden files/dirs (starting with .)
    if (relativePath.includes("/.") || relativePath.includes("\\.") || relativePath.startsWith(".")) {
      continue;
    }

    // Check default excluded directories
    const pathParts = relativePath.split(/[/\\]/);
    let skipByDefault = false;
    for (const part of pathParts) {
      if (DEFAULT_EXCLUDED_DIR_NAMES.has(part.toLowerCase())) {
        skipByDefault = true;
        break;
      }
    }
    if (skipByDefault) {
      continue;
    }

    // Check exclude patterns
    if (shouldExclude(fullPath, excludePatterns)) {
      excludedByPattern++;
      continue;
    }

    // Check if supported file type
    if (isSupportedFile(fileName)) {
      files.push(fullPath);
    }
  }

  const elapsed = Date.now() - startTime;
  log.d("FILESCAN", "tiny_glob_scan", { files: files.length, elapsed: `${elapsed}ms` });

  return { files, excludedByPattern };
}

/**
 * Async version of collectFiles using Bun.Glob or tiny-glob
 * Use this when async API is acceptable for better performance
 *
 * Runtime selection:
 * - Bun: Bun.Glob.scan() (native, 3x faster)
 * - Node.js: tiny-glob (~350% faster than node-glob)
 */
export async function collectFilesAsync(directory: string, options: CollectFilesOptions): Promise<CollectFilesResult> {
  const { excludePatterns: baseExcludePatterns } = options;

  // Load project-specific ignore patterns from .ultrascriptignore
  const ignorePatterns = loadIgnoreFile(directory);
  const excludePatterns = [...baseExcludePatterns, ...ignorePatterns];

  const startTime = Date.now();

  let files: string[];
  let dirsScanned = 0;
  let excludedByPattern = 0;
  let excludedByDefault = 0;
  let method: "bun_glob" | "tiny_glob" | "node_fs";

  // Use Bun.Glob when available (native, 3x faster)
  if (isBunRuntime() && (globalThis as unknown as BunGlobal).Glob) {
    method = "bun_glob";
    const result = await collectFilesWithBunGlob(directory, excludePatterns);
    files = result.files;
    excludedByPattern = result.excludedByPattern;
    // Bun.Glob doesn't track dirs scanned, estimate from file paths
    const uniqueDirs = new Set(files.map((f) => relative(directory, f).split(/[/\\]/)[0]));
    dirsScanned = uniqueDirs.size;
  } else {
    // Node.js: use tiny-glob for async performance
    method = "tiny_glob";
    try {
      const result = await collectFilesWithTinyGlob(directory, excludePatterns);
      files = result.files;
      excludedByPattern = result.excludedByPattern;
      // Estimate dirs from file paths
      const uniqueDirs = new Set(files.map((f) => relative(directory, f).split(/[/\\]/)[0]));
      dirsScanned = uniqueDirs.size;
    } catch {
      // Fallback to Node.js fs if tiny-glob fails
      method = "node_fs";
      const result = collectFilesWithNodeFs(directory, excludePatterns);
      files = result.files;
      dirsScanned = result.dirsScanned;
      excludedByPattern = result.excludedByPattern;
      excludedByDefault = result.excludedByDefault;
    }
  }

  const elapsed = Date.now() - startTime;

  // Count files by extension for diagnostics
  const extStats: Record<string, number> = {};
  for (const f of files) {
    const ext = extname(f).toLowerCase() || "(no ext)";
    extStats[ext] = (extStats[ext] || 0) + 1;
  }

  log.i("FILESCAN", "scan_done", {
    root: directory,
    dirs: dirsScanned,
    files: files.length,
    excludedPat: excludedByPattern,
    excludedDef: excludedByDefault,
    elapsed: `${elapsed}ms`,
    method,
  });

  return {
    files,
    stats: {
      dirsScanned,
      excludedByPattern,
      excludedByDefault,
      byExtension: extStats,
    },
  };
}
