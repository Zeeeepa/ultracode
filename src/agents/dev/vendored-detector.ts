/**
 * Vendored/Generated Directory Detector
 *
 * Automatically detects directories containing vendored, generated, or
 * mass-duplicated code that should be parsed (for graph) but excluded
 * from embedding generation (to save TEI/GPU resources).
 *
 * Detection heuristics:
 * 1. Architecture mirrors — parent dir with 10+ subdirs sharing similar filenames
 * 2. Mass headers — dir subtree with >500 files of same extension, avg LOC < 150
 * 3. Known vendored path segments — lib/libc, third_party, vendor, etc.
 * 4. Definition files — .def files are typically auto-generated
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, extname, relative } from "node:path";
import { log } from "../../logging/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Known vendored path segments (case-insensitive match)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_VENDORED_SEGMENTS = [
  "libc",
  "libcxx",
  "libcxxabi",
  "libunwind",
  "musl",
  "glibc",
  "ucrt",
  "mingw",
  "msvc",
  "wasi-libc",
  "compiler-rt",
  "newlib",
  "bionic",
];

/** Extensions that are always low-value for embeddings */
const SKIP_EMBEDDING_EXTENSIONS = new Set([".def", ".inc"]);

/** Min subdirs with overlapping filenames to detect arch mirrors */
const ARCH_MIRROR_MIN_SUBDIRS = 8;

/** Min files of same type in a subtree to trigger mass-header detection */
const MASS_HEADER_MIN_FILES = 400;

/** Max average LOC for mass-header heuristic */
const MASS_HEADER_MAX_AVG_LOC = 150;

/** Max files to sample for LOC estimation */
const LOC_SAMPLE_SIZE = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VendoredDetectionResult {
  /** Directory prefixes where embedding should be skipped */
  vendoredPrefixes: string[];
  /** Individual file extensions to always skip embeddings for */
  skipExtensions: Set<string>;
  /** Stats for logging */
  stats: {
    archMirrors: number;
    massHeaders: number;
    knownVendored: number;
    totalSkippedFiles: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze collected file list and detect vendored/generated directories.
 * Runs AFTER collectFiles, operates on the already-collected file paths.
 *
 * @param files - Absolute file paths from collectFilesAsync
 * @param rootDir - Project root directory
 * @returns Detection result with vendored prefixes
 */
export function detectVendoredDirectories(files: string[], rootDir: string): VendoredDetectionResult {
  const startTime = performance.now();
  const vendoredPrefixes: string[] = [];
  const stats = { archMirrors: 0, massHeaders: 0, knownVendored: 0, totalSkippedFiles: 0 };

  // Normalize root for consistent prefix matching
  const normalizedRoot = rootDir.replace(/\\/g, "/");

  // Build directory → files index (relative paths, forward slashes)
  const dirFiles = new Map<string, string[]>();
  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, "/");
    const dir = dirname(rel);
    let arr = dirFiles.get(dir);
    if (!arr) {
      arr = [];
      dirFiles.set(dir, arr);
    }
    arr.push(rel);
  }

  // 1. Known vendored path segments
  const knownVendoredDirs = detectKnownVendored(dirFiles, normalizedRoot);
  for (const dir of knownVendoredDirs) {
    vendoredPrefixes.push(dir);
    stats.knownVendored++;
  }

  // 2. Architecture mirrors (10+ sibling dirs with overlapping filenames)
  const archMirrorDirs = detectArchMirrors(dirFiles);
  for (const dir of archMirrorDirs) {
    if (!vendoredPrefixes.some((p) => dir.startsWith(p) || p.startsWith(dir))) {
      vendoredPrefixes.push(dir);
      stats.archMirrors++;
    }
  }

  // 3. Mass headers (>500 files of same extension in subtree)
  const massHeaderDirs = detectMassHeaders(dirFiles, files, rootDir);
  for (const dir of massHeaderDirs) {
    if (!vendoredPrefixes.some((p) => dir.startsWith(p) || p.startsWith(dir))) {
      vendoredPrefixes.push(dir);
      stats.massHeaders++;
    }
  }

  // Count total files that will skip embeddings
  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, "/");
    if (isVendoredPath(rel, vendoredPrefixes) || SKIP_EMBEDDING_EXTENSIONS.has(extname(file).toLowerCase())) {
      stats.totalSkippedFiles++;
    }
  }

  const elapsed = performance.now() - startTime;
  if (vendoredPrefixes.length > 0) {
    log.i("VENDORED", "detection_done", {
      prefixes: vendoredPrefixes.length,
      skippedFiles: stats.totalSkippedFiles,
      totalFiles: files.length,
      pct: ((stats.totalSkippedFiles / files.length) * 100).toFixed(1) + "%",
      elapsed: elapsed.toFixed(0) + "ms",
      details: { archMirrors: stats.archMirrors, massHeaders: stats.massHeaders, knownVendored: stats.knownVendored },
    });
    for (const prefix of vendoredPrefixes) {
      log.d("VENDORED", "prefix", { path: prefix });
    }
  }

  return {
    vendoredPrefixes,
    skipExtensions: SKIP_EMBEDDING_EXTENSIONS,
    stats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic 1: Known vendored path segments
// ─────────────────────────────────────────────────────────────────────────────

function detectKnownVendored(dirFiles: Map<string, string[]>, _rootDir: string): string[] {
  const result: string[] = [];
  const checked = new Set<string>();

  for (const dir of dirFiles.keys()) {
    const segments = dir.toLowerCase().split("/");
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (KNOWN_VENDORED_SEGMENTS.includes(seg)) {
        // Use path up to and including the vendored segment
        const prefix = segments.slice(0, i + 1).join("/");
        if (!checked.has(prefix)) {
          checked.add(prefix);
          // Count files under this prefix
          let fileCount = 0;
          for (const [d, f] of dirFiles) {
            if (d.toLowerCase().startsWith(prefix)) {
              fileCount += f.length;
            }
          }
          // Only mark as vendored if it has significant file count
          if (fileCount >= 50) {
            result.push(segments.slice(0, i + 1).join("/"));
          }
        }
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic 2: Architecture mirror directories
// ─────────────────────────────────────────────────────────────────────────────

function detectArchMirrors(dirFiles: Map<string, string[]>): string[] {
  const result: string[] = [];

  // Group directories by parent
  const parentToChildren = new Map<string, string[]>();
  for (const dir of dirFiles.keys()) {
    const parent = dirname(dir);
    if (parent === ".") continue;
    let children = parentToChildren.get(parent);
    if (!children) {
      children = [];
      parentToChildren.set(parent, children);
    }
    children.push(dir);
  }

  // Check each parent: if 10+ children have overlapping filenames → arch mirror
  for (const [parent, children] of parentToChildren) {
    if (children.length < ARCH_MIRROR_MIN_SUBDIRS) continue;

    // Collect filenames per child dir
    const childFileNames = new Map<string, Set<string>>();
    for (const child of children) {
      const files = dirFiles.get(child);
      if (!files) continue;
      const names = new Set<string>();
      for (const f of files) {
        const parts = f.split("/");
        names.add(parts[parts.length - 1]!);
      }
      childFileNames.set(child, names);
    }

    // Count how many child dirs share at least 3 common filenames
    const allNames = new Map<string, number>();
    for (const names of childFileNames.values()) {
      for (const name of names) {
        allNames.set(name, (allNames.get(name) || 0) + 1);
      }
    }

    // Files that appear in 50%+ of children
    const threshold = Math.floor(children.length * 0.5);
    let commonFiles = 0;
    for (const count of allNames.values()) {
      if (count >= threshold) commonFiles++;
    }

    // If 3+ files are common across 50%+ of subdirs → arch mirror
    if (commonFiles >= 3) {
      result.push(parent);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic 3: Mass header directories
// ─────────────────────────────────────────────────────────────────────────────

function detectMassHeaders(dirFiles: Map<string, string[]>, allFiles: string[], rootDir: string): string[] {
  const result: string[] = [];

  // Find top-level directories with many files of same extension
  // Group by 2-level prefix: "lib/include", "src/vendor", etc.
  const prefixExtCount = new Map<string, Map<string, number>>();

  for (const [dir, files] of dirFiles) {
    // Get 2-level prefix
    const parts = dir.split("/");
    const prefix = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0]!;

    let extMap = prefixExtCount.get(prefix);
    if (!extMap) {
      extMap = new Map();
      prefixExtCount.set(prefix, extMap);
    }

    for (const file of files) {
      const ext = extname(file).toLowerCase();
      extMap.set(ext, (extMap.get(ext) || 0) + 1);
    }
  }

  // Check each prefix
  for (const [prefix, extMap] of prefixExtCount) {
    for (const [ext, count] of extMap) {
      if (count < MASS_HEADER_MIN_FILES) continue;
      if (ext !== ".h" && ext !== ".hpp" && ext !== ".hxx") continue;

      // Sample files to estimate average LOC
      const matchingFiles = allFiles.filter((f) => {
        const rel = relative(rootDir, f).replace(/\\/g, "/");
        return rel.startsWith(prefix + "/") && extname(f).toLowerCase() === ext;
      });

      const avgLoc = estimateAvgLoc(matchingFiles);
      if (avgLoc <= MASS_HEADER_MAX_AVG_LOC) {
        result.push(prefix);
      }
    }
  }

  return result;
}

/**
 * Estimate average LOC by sampling files
 */
function estimateAvgLoc(files: string[]): number {
  if (files.length === 0) return 0;

  // Sample evenly distributed files
  const step = Math.max(1, Math.floor(files.length / LOC_SAMPLE_SIZE));
  let totalLines = 0;
  let sampled = 0;

  for (let i = 0; i < files.length && sampled < LOC_SAMPLE_SIZE; i += step) {
    try {
      const stat = statSync(files[i]!);
      if (stat.size > 1_000_000) continue; // Skip very large files
      const content = readFileSync(files[i]!, "utf-8");
      totalLines += content.split("\n").length;
      sampled++;
    } catch {
      // Skip unreadable files
    }
  }

  return sampled > 0 ? totalLines / sampled : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Check Utility (used by workers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a relative file path belongs to a vendored directory.
 * Used by embedding processors to skip embedding generation.
 */
export function isVendoredPath(relPath: string, vendoredPrefixes: string[]): boolean {
  if (vendoredPrefixes.length === 0) return false;
  const normalized = relPath.replace(/\\/g, "/").toLowerCase();
  for (const prefix of vendoredPrefixes) {
    if (normalized.startsWith(prefix.toLowerCase() + "/") || normalized === prefix.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Check if file extension should always skip embeddings
 */
export function isSkipEmbeddingExtension(filePath: string): boolean {
  return SKIP_EMBEDDING_EXTENSIONS.has(extname(filePath).toLowerCase());
}
