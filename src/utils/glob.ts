/**
 * Glob Utilities - Runtime-optimized file pattern matching
 *
 * Provides unified glob operations that use Bun's native Glob API
 * when available, with a pure Node.js fallback for compatibility.
 *
 * Key optimizations under Bun:
 * - Bun.Glob is written in native code, significantly faster
 * - Lazy iteration with generators (memory efficient)
 * - Built-in pattern matching without regex compilation
 *
 * Usage:
 *   import { glob, match, scanFiles } from "./glob.js";
 *   const files = await glob("**\/*.ts", { cwd: "./src" });
 *   const isMatch = match("**\/*.ts", "src/index.ts");
 */

import { join, relative, sep } from "node:path";
import { log } from "../logging/index.js";
import { features } from "./runtime.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type definition for Bun.Glob constructor
 */
interface BunGlobConstructor {
  new (pattern: string): BunGlobInstance;
}

/**
 * Type definition for Bun.Glob instance
 */
interface BunGlobInstance {
  scan(options: { cwd: string; onlyFiles?: boolean; dot?: boolean }): AsyncIterableIterator<string>;
  match(path: string): boolean;
}

/**
 * Extended globalThis with typed Bun.Glob
 */
type GlobalWithBunGlob = typeof globalThis & {
  Bun?: {
    Glob: BunGlobConstructor;
    [key: string]: unknown;
  };
};

export interface GlobOptions {
  /** Base directory for search (default: current working directory) */
  cwd?: string;
  /** Return only files (default: true) */
  onlyFiles?: boolean;
  /** Return only directories */
  onlyDirectories?: boolean;
  /** Patterns to ignore (glob patterns) */
  ignore?: string[];
  /** Return absolute paths (default: false) */
  absolute?: boolean;
  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;
  /** Include dot files/directories (default: false) */
  dot?: boolean;
  /** Maximum depth to traverse */
  maxDepth?: number | undefined;
}

export interface ScanOptions extends GlobOptions {
  /** Callback for each matched file */
  onMatch?: (path: string) => void;
}

// =============================================================================
// DEFAULT IGNORE PATTERNS
// =============================================================================

const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/vendor/**",
  "**/.venv/**",
  "**/venv/**",
];

// =============================================================================
// MAIN GLOB FUNCTION
// =============================================================================

/**
 * Find files matching glob pattern
 *
 * Under Bun: Uses Bun.Glob for native performance
 * Under Node: Uses recursive directory traversal with minimatch
 *
 * @param pattern - Glob pattern (e.g., "**\/*.ts", "src/**\/*.{js,ts}")
 * @param options - Search options
 * @returns Array of matching file paths
 */
export async function glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
  const {
    cwd = process.cwd(),
    onlyFiles = true,
    onlyDirectories = false,
    ignore = [],
    absolute = false,
    dot = false,
    maxDepth,
  } = options;

  const allIgnore = [...DEFAULT_IGNORE_PATTERNS, ...ignore];

  const global = globalThis as GlobalWithBunGlob;
  if (features.bunGlob && global.Bun?.Glob) {
    return globBun(pattern, { cwd, onlyFiles, onlyDirectories, ignore: allIgnore, absolute, dot });
  }

  return globNode(pattern, { cwd, onlyFiles, onlyDirectories, ignore: allIgnore, absolute, dot, maxDepth });
}

/**
 * Glob using Bun's native Glob API
 */
async function globBun(
  pattern: string,
  options: {
    cwd: string;
    onlyFiles: boolean;
    onlyDirectories: boolean;
    ignore: string[];
    absolute: boolean;
    dot: boolean;
  },
): Promise<string[]> {
  const global = globalThis as GlobalWithBunGlob;
  const BunGlob = global.Bun!.Glob;
  const globInstance = new BunGlob(pattern);
  const results: string[] = [];

  // Create ignore matchers
  const ignoreMatchers = options.ignore.map((p) => new BunGlob(p));

  for await (const path of globInstance.scan({
    cwd: options.cwd,
    onlyFiles: options.onlyFiles,
    dot: options.dot,
  })) {
    // Check if path matches any ignore pattern
    const shouldIgnore = ignoreMatchers.some((matcher) => matcher.match(path));
    if (shouldIgnore) continue;

    // Filter directories if onlyFiles is true
    if (options.onlyDirectories && !path.endsWith("/")) continue;

    results.push(options.absolute ? join(options.cwd, path) : path);
  }

  return results;
}

/**
 * Glob using pure Node.js (fallback)
 */
async function globNode(
  pattern: string,
  options: {
    cwd: string;
    onlyFiles: boolean;
    onlyDirectories: boolean;
    ignore: string[];
    absolute: boolean;
    dot: boolean;
    maxDepth?: number | undefined;
  },
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const results: string[] = [];

  // Simple pattern matcher (supports *, **, ?)
  const matcher = createPatternMatcher(pattern);
  const ignoreMatchers = options.ignore.map(createPatternMatcher);

  async function walk(dir: string, depth: number = 0): Promise<void> {
    if (options.maxDepth !== undefined && depth > options.maxDepth) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip dot files/directories unless explicitly included
        if (!options.dot && entry.name.startsWith(".")) continue;

        const fullPath = join(dir, entry.name);
        const relativePath = relative(options.cwd, fullPath).split(sep).join("/");

        // Check ignore patterns
        const shouldIgnore = ignoreMatchers.some((m) => m(relativePath) || m(relativePath + "/"));
        if (shouldIgnore) continue;

        if (entry.isDirectory()) {
          // Check if directory matches (for ** patterns)
          if (options.onlyDirectories && matcher(relativePath)) {
            results.push(options.absolute ? fullPath : relativePath);
          }
          await walk(fullPath, depth + 1);
        } else if (entry.isFile() && options.onlyFiles) {
          if (matcher(relativePath)) {
            results.push(options.absolute ? fullPath : relativePath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  await walk(options.cwd);
  return results;
}

// =============================================================================
// PATTERN MATCHING
// =============================================================================

/**
 * Check if a path matches a glob pattern
 *
 * Under Bun: Uses Bun.Glob.match() for native matching
 * Under Node: Uses simple pattern matcher
 *
 * @param pattern - Glob pattern
 * @param path - Path to test
 * @returns true if path matches pattern
 */
export function match(pattern: string, path: string): boolean {
  const global = globalThis as GlobalWithBunGlob;
  if (features.bunGlob && global.Bun?.Glob) {
    const BunGlob = global.Bun.Glob;
    const globInstance = new BunGlob(pattern);
    return globInstance.match(path);
  }

  const matcher = createPatternMatcher(pattern);
  return matcher(path);
}

/**
 * Create a pattern matcher function from glob pattern
 *
 * Supports:
 * - * - matches any characters except /
 * - ** - matches any characters including /
 * - ? - matches single character
 * - {a,b} - matches a or b
 * - [abc] - matches a, b, or c
 */
function createPatternMatcher(pattern: string): (path: string) => boolean {
  // Convert glob pattern to regex
  let regexPattern = pattern
    // Escape special regex chars (except glob chars)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Handle ** (matches anything including /)
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    // Handle * (matches anything except /)
    .replace(/\*/g, "[^/]*")
    // Handle ?
    .replace(/\?/g, "[^/]")
    // Restore **
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    // Handle {a,b,c} alternatives
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(",").join("|")})`);

  // Anchor pattern
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  return (path: string) => regex.test(path);
}

// =============================================================================
// ASYNC GENERATOR FOR STREAMING
// =============================================================================

/**
 * Stream files matching pattern (memory efficient for large directories)
 *
 * @param pattern - Glob pattern
 * @param options - Scan options
 * @yields Matching file paths
 */
export async function* scan(pattern: string, options: ScanOptions = {}): AsyncGenerator<string> {
  const {
    cwd = process.cwd(),
    onlyFiles = true,
    ignore = [],
    absolute = false,
    dot = false,
    maxDepth,
    onMatch,
  } = options;

  const allIgnore = [...DEFAULT_IGNORE_PATTERNS, ...ignore];

  const global = globalThis as GlobalWithBunGlob;
  if (features.bunGlob && global.Bun?.Glob) {
    const BunGlob = global.Bun.Glob;
    const globInstance = new BunGlob(pattern);
    const ignoreMatchers = allIgnore.map((p) => new BunGlob(p));

    for await (const path of globInstance.scan({ cwd, onlyFiles, dot })) {
      const shouldIgnore = ignoreMatchers.some((m) => m.match(path));
      if (shouldIgnore) continue;

      const resultPath = absolute ? join(cwd, path) : path;
      onMatch?.(resultPath);
      yield resultPath;
    }
  } else {
    // Node.js fallback with generator
    const files = await globNode(pattern, {
      cwd,
      onlyFiles,
      onlyDirectories: false,
      ignore: allIgnore,
      absolute,
      dot,
      maxDepth,
    });

    for (const file of files) {
      onMatch?.(file);
      yield file;
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Find all TypeScript/JavaScript files
 */
export async function findSourceFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.{ts,tsx,js,jsx,mjs,cjs}", { cwd, ...options });
}

/**
 * Find all Python files
 */
export async function findPythonFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.py", { cwd, ...options });
}

/**
 * Find all C/C++ source files
 */
export async function findCppFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.{c,cpp,cc,cxx,h,hpp,hxx}", { cwd, ...options });
}

/**
 * Find all Go files
 */
export async function findGoFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.go", { cwd, ...options });
}

/**
 * Find all Rust files
 */
export async function findRustFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.rs", { cwd, ...options });
}

/**
 * Find all Java files
 */
export async function findJavaFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.java", { cwd, ...options });
}

/**
 * Find configuration files
 */
export async function findConfigFiles(cwd: string, options?: GlobOptions): Promise<string[]> {
  return glob("**/*.{json,yaml,yml,toml,ini,xml}", { cwd, ...options });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Log glob info (for debugging)
 */
export function logGlobInfo(): void {
  log.i("GLOB", `[Glob] Bun.Glob: ${features.bunGlob ? "enabled" : "disabled (using Node fallback)"}`);
}
