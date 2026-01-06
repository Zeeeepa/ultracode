/**
 * File Collector
 *
 * Recursively collects source files from a directory,
 * respecting exclude patterns and default exclusions.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { log } from "../../logging/index.js";
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
 * Recursively collect source files from a directory
 */
export function collectFiles(directory: string, options: CollectFilesOptions): CollectFilesResult {
  const { excludePatterns: baseExcludePatterns, agentId: _agentId } = options;

  // Load project-specific ignore patterns from .ultrascriptignore
  const ignorePatterns = loadIgnoreFile(directory);
  const excludePatterns = [...baseExcludePatterns, ...ignorePatterns];

  const files: string[] = [];

  // Stats for logging
  const dirStats: Record<string, number> = {};
  let excludedByPattern = 0;
  let excludedByDefault = 0;
  let scannedDirs = 0;

  function walkDir(dir: string) {
    try {
      scannedDirs++;
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);

        if (shouldExclude(fullPath, excludePatterns)) {
          excludedByPattern++;
          continue;
        }

        const lstat = lstatSync(fullPath, { throwIfNoEntry: false });
        if (!lstat) {
          continue;
        }
        if (lstat.isSymbolicLink()) {
          continue;
        }

        if (lstat.isDirectory()) {
          const lowerItem = item.toLowerCase();
          if (DEFAULT_EXCLUDED_DIR_NAMES.has(lowerItem)) {
            excludedByDefault++;
            continue;
          }
          if (!item.startsWith(".")) {
            walkDir(fullPath);
          }
        } else if (lstat.isFile()) {
          const ext = extname(fullPath).toLowerCase();
          // Support code and data files for semantic merge
          const fileName = item.toLowerCase();
          const isSupported =
            isCodeExtension(ext) ||
            isDataExtension(ext) ||
            // Dotfiles without extension (e.g. .gitignore, .dockerignore)
            SUPPORTED_DATA_EXTENSIONS.some((d) => fileName === d.slice(1) || fileName.endsWith(d));
          if (isSupported) {
            files.push(fullPath);
            // Track files by directory (relative to root)
            const relDir = dir.replace(directory, "").replace(/^[\\/]/, "") || ".";
            dirStats[relDir] = (dirStats[relDir] || 0) + 1;
          }
        }
      }
    } catch (error) {
      log.e("FILESCAN", "dir_read_error", { dir, err: String(error) });
    }
  }

  walkDir(directory);

  // Count files by extension for diagnostics
  const extStats: Record<string, number> = {};
  for (const f of files) {
    const ext = extname(f).toLowerCase() || "(no ext)";
    extStats[ext] = (extStats[ext] || 0) + 1;
  }

  log.i("FILESCAN", "scan_done", {
    root: directory,
    dirs: scannedDirs,
    files: files.length,
    excludedPat: excludedByPattern,
    excludedDef: excludedByDefault,
  });

  return {
    files,
    stats: {
      dirsScanned: scannedDirs,
      excludedByPattern,
      excludedByDefault,
      byExtension: extStats,
    },
  };
}
