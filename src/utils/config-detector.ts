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

// Кэш на 100 проектов, TTL 5 минут
const configCache = new LRUCache<string, LinterConfigInfo>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 минут
});

/**
 * Проверяет существование файла
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
 * Определяет доступные конфигурации линтеров в проекте (без кэша)
 */
async function detectLinterConfigsUncached(projectPath: string): Promise<LinterConfigInfo> {
  // Проверка Biome
  const hasBiomeConfig = (await Promise.all(CONFIG_FILES.biome.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Проверка ESLint
  const hasESLintConfig = (await Promise.all(CONFIG_FILES.eslint.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Проверка oxlint
  const hasOxlintConfig = (await Promise.all(CONFIG_FILES.oxlint.map((f) => fileExists(join(projectPath, f))))).some(
    (exists) => exists,
  );

  // Определение предпочтительного линтера
  let preferredFixerForTS: "oxlint" | "biome" | "eslint" = "oxlint";

  if (hasBiomeConfig) {
    preferredFixerForTS = "biome"; // Приоритет - быстрый и уже настроен
  } else if (hasESLintConfig) {
    preferredFixerForTS = "eslint"; // Больше правил
  } else if (hasOxlintConfig) {
    preferredFixerForTS = "oxlint"; // Базовый
  }

  return {
    hasBiomeConfig,
    hasESLintConfig,
    hasOxlintConfig,
    preferredFixerForTS,
  };
}

/**
 * Определяет доступные конфигурации линтеров в проекте (с кэшированием)
 *
 * @param projectPath - Путь к корню проекта
 * @returns Информация о конфигурациях линтеров
 *
 * @example
 * ```typescript
 * const config = await detectLinterConfigs('/path/to/project');
 * if (config.preferredFixerForTS === 'biome') {
 *   // Использовать Biome для автофиксов
 * }
 * ```
 */
export async function detectLinterConfigs(projectPath: string): Promise<LinterConfigInfo> {
  // Проверка кэша
  const cached = configCache.get(projectPath);
  if (cached) {
    return cached;
  }

  // Определение конфигов (основная логика)
  const result = await detectLinterConfigsUncached(projectPath);

  // Сохранение в кэш
  configCache.set(projectPath, result);

  return result;
}
