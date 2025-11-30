/**
 * Tree-sitter Prebuild Loader
 *
 * Loads tree-sitter native bindings from prebuilds (external-libs/)
 * with fallback to npm-installed versions.
 *
 * Priority:
 * 1. Prebuilds in external-libs/tree-sitter-{platform}-{arch}/
 * 2. npm-installed tree-sitter (may require compilation)
 */

import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Platform detection
const PLATFORM = platform() === "win32" ? "win32" : platform() === "darwin" ? "darwin" : "linux";
const ARCH = arch() === "arm64" ? "arm64" : "x64";
const PREBUILD_DIR = `tree-sitter-${PLATFORM}-${ARCH}`;

// Paths to check for prebuilds (from dist/parsers/ location)
const PREBUILD_PATHS = [
  // npm package structure: external-libs/tree-sitter-{platform}-{arch}/
  join(__dirname, "..", "..", "external-libs", PREBUILD_DIR),
  // Development: same relative path
  join(__dirname, "..", "..", "..", "external-libs", PREBUILD_DIR),
];

interface TreeSitterBinding {
  default?: unknown;
  // Language-specific exports
  typescript?: unknown;
  tsx?: unknown;
}

// Cache for loaded bindings
const loadedBindings: Map<string, unknown> = new Map();

/**
 * Load tree-sitter or a language grammar, preferring prebuilds
 */
export function loadTreeSitterBinding(packageName: string): unknown {
  // Check cache
  if (loadedBindings.has(packageName)) {
    return loadedBindings.get(packageName);
  }

  // Try prebuilds first
  const prebuildBinding = tryLoadPrebuild(packageName);
  if (prebuildBinding) {
    loadedBindings.set(packageName, prebuildBinding);
    return prebuildBinding;
  }

  // Fallback to npm-installed version
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const npmBinding = require(packageName);
    loadedBindings.set(packageName, npmBinding);
    return npmBinding;
  } catch (error) {
    console.warn(`[Tree-sitter Loader] Failed to load ${packageName}:`, (error as Error).message);
    throw new Error(`Cannot load ${packageName}: no prebuild found and npm version failed to load`);
  }
}

/**
 * Try to load a prebuild .node file
 */
function tryLoadPrebuild(packageName: string): unknown | null {
  // Map package name to .node file name
  const nodeFileName = getNodeFileName(packageName);

  for (const basePath of PREBUILD_PATHS) {
    const prebuildPath = join(basePath, nodeFileName);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const binding = require(prebuildPath);
      console.debug(`[Tree-sitter Loader] Loaded prebuild: ${prebuildPath}`);
      return binding;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Map npm package name to .node file name
 */
function getNodeFileName(packageName: string): string {
  // tree-sitter -> tree_sitter.node
  // tree-sitter-javascript -> tree_sitter_javascript.node
  const baseName = packageName.replace(/-/g, "_");
  return `${baseName}.node`;
}

/**
 * Get language grammar from loaded binding
 */
export function getLanguageFromBinding(binding: TreeSitterBinding, language: string): unknown {
  // Handle tree-sitter-typescript special case (exports typescript and tsx)
  if (language === "typescript" && binding.typescript) {
    return binding.typescript;
  }
  if (language === "tsx" && binding.tsx) {
    return binding.tsx;
  }

  // Most bindings export default or the language directly
  return binding.default ?? binding;
}

/**
 * Check if prebuilds are available for current platform
 */
export function hasPrebuilds(): boolean {
  for (const basePath of PREBUILD_PATHS) {
    try {
      // Check for core tree-sitter prebuild
      const treeSitterPath = join(basePath, "tree_sitter.node");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(treeSitterPath);
      return true;
    } catch {
      // Try next path
    }
  }
  return false;
}

/**
 * Get prebuild directory path for current platform
 */
export function getPrebuildPath(): string {
  return join("external-libs", PREBUILD_DIR);
}
