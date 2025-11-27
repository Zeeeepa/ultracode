/**
 * Cross-platform configuration paths for UltraScript Tools
 *
 * Provides unified paths for storing configuration and data files
 * across Windows, macOS, and Linux.
 *
 * Paths:
 *   Windows: %LOCALAPPDATA%\UltraScriptTools\
 *   macOS:   ~/Library/Application Support/UltraScriptTools/
 *   Linux:   ~/.config/ultrascript-tools/  (or $XDG_CONFIG_HOME)
 *
 * Uses runtime-optimized file operations from file-ops.ts
 */

import { homedir, platform } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readJSONSync, writeFileSync } from "./file-ops.js";

const APP_NAME = "UltraScriptTools";
const APP_NAME_LINUX = "ultrascript-tools";

/**
 * Get the central configuration directory for UltraScript Tools
 */
export function getConfigDir(): string {
  const os = platform();

  let configDir: string;

  switch (os) {
    case "win32": {
      // Windows: %LOCALAPPDATA%\UltraScriptTools\
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
      configDir = join(localAppData, APP_NAME);
      break;
    }

    case "darwin": {
      // macOS: ~/Library/Application Support/UltraScriptTools/
      configDir = join(homedir(), "Library", "Application Support", APP_NAME);
      break;
    }

    default: {
      // Linux and others: ~/.config/ultrascript-tools/ (XDG Base Directory)
      const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
      configDir = join(xdgConfig, APP_NAME_LINUX);
      break;
    }
  }

  return configDir;
}

/**
 * Get the central data directory for UltraScript Tools
 * (for databases, embeddings, cache, etc.)
 */
export function getDataDir(): string {
  const os = platform();

  let dataDir: string;

  switch (os) {
    case "win32": {
      // Windows: %LOCALAPPDATA%\UltraScriptTools\data\
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
      dataDir = join(localAppData, APP_NAME, "data");
      break;
    }

    case "darwin": {
      // macOS: ~/Library/Application Support/UltraScriptTools/data/
      dataDir = join(homedir(), "Library", "Application Support", APP_NAME, "data");
      break;
    }

    default: {
      // Linux: ~/.local/share/ultrascript-tools/ (XDG Base Directory)
      const xdgData = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
      dataDir = join(xdgData, APP_NAME_LINUX);
      break;
    }
  }

  return dataDir;
}

/**
 * Get the path to the semantic embedding configuration file
 */
export function getSemanticConfigPath(): string {
  return join(getConfigDir(), "semantic-config.json");
}

/**
 * Get the path to the embedding models JSON file
 */
export function getEmbeddingModelsPath(): string {
  return join(getConfigDir(), "embedding-models.json");
}

/**
 * Ensure configuration directory exists
 */
export function ensureConfigDir(): string {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, true);
  }
  return configDir;
}

/**
 * Ensure data directory exists
 */
export function ensureDataDir(): string {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, true);
  }
  return dataDir;
}

/**
 * Semantic configuration structure
 */
export interface SemanticConfig {
  enabled: boolean;
  embedding: {
    platform: "tei" | "ollama" | "memory";
    architecture: string;
    tei?: {
      endpoint: string;
      selected_model: string | null;
      models?: Array<{
        id: string;
        languages: string[];
        vector_size: number;
      }>;
    };
    ollama?: {
      endpoint: string;
      selected_model: string | null;
      models?: Array<{
        id: string;
        languages: string[];
        vector_size: number;
      }>;
    };
    memory?: {
      model_path: string;
      vector_size: number;
    };
  };
  auto_detection?: {
    gpu_architecture: boolean;
    codebase_size: boolean;
    language: boolean;
  };
}

/**
 * Load semantic configuration from central config directory
 */
export function loadSemanticConfig(): SemanticConfig | null {
  const configPath = getSemanticConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return readJSONSync<SemanticConfig>(configPath);
  } catch (error) {
    console.error(`[Config] Failed to load semantic config: ${error}`);
    return null;
  }
}

/**
 * Save semantic configuration to central config directory
 */
export function saveSemanticConfig(config: SemanticConfig): void {
  ensureConfigDir();
  const configPath = getSemanticConfigPath();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(`[Config] Failed to save semantic config: ${error}`);
    throw error;
  }
}

/**
 * Check if semantic embedding is configured
 */
export function isSemanticConfigured(): boolean {
  const config = loadSemanticConfig();
  return config !== null && config.enabled === true;
}

/**
 * Get display path for user (with ~ for home directory)
 */
export function getDisplayPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
}
