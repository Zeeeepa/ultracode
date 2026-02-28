import { access } from "node:fs/promises";
import { join } from "node:path";
import { LRUCache } from "lru-cache";

export interface LinterConfigInfo {
  hasBiomeConfig: boolean;
  hasESLintConfig: boolean;
  hasOxlintConfig: boolean;
  preferredFixerForTS: "oxlint" | "biome" | "eslint";
}

const CONFIG_FILES = {
  biome: ["biome.json", "biome.jsonc"],
  eslint: [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ],
  oxlint: ["oxlint.config.ts", "oxlint.config.js"],
};

// Cache for 100 projects, TTL 5 minutes
const configCache = new LRUCache<string, LinterConfigInfo>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 minutes
});

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect available linter configurations in the project (without cache)
 */
async function detectLinterConfigsUncached(projectPath: string): Promise<LinterConfigInfo> {
  // Check Biome
  const hasBiomeConfig = (await Promise.all(CONFIG_FILES.biome.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Check ESLint
  const hasESLintConfig = (await Promise.all(CONFIG_FILES.eslint.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Check oxlint
  const hasOxlintConfig = (await Promise.all(CONFIG_FILES.oxlint.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Determine preferred linter
  let preferredFixerForTS: "oxlint" | "biome" | "eslint" = "oxlint";

  if (hasBiomeConfig) {
    preferredFixerForTS = "biome"; // Priority - fast and already configured
  } else if (hasESLintConfig) {
    preferredFixerForTS = "eslint"; // More rules
  } else if (hasOxlintConfig) {
    preferredFixerForTS = "oxlint"; // Basic
  }

  return {
    hasBiomeConfig,
    hasESLintConfig,
    hasOxlintConfig,
    preferredFixerForTS,
  };
}

/**
 * Detect available linter configurations in the project (with caching)
 *
 * @param projectPath - Path to the project root
 * @returns Linter configuration information
 *
 * @example
 * ```typescript
 * const config = await detectLinterConfigs('/path/to/project');
 * if (config.preferredFixerForTS === 'biome') {
 *   // Use Biome for autofixes
 * }
 * ```
 */
export async function detectLinterConfigs(projectPath: string): Promise<LinterConfigInfo> {
  // Check cache
  const cached = configCache.get(projectPath);
  if (cached) {
    return cached;
  }

  // Detect configs (main logic)
  const result = await detectLinterConfigsUncached(projectPath);

  // Save to cache
  configCache.set(projectPath, result);

  return result;
}
