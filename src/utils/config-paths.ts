/**
 * Cross-platform configuration paths for UltraCode
 *
 * Provides unified paths for storing configuration and data files
 * across Windows, macOS, and Linux.
 *
 * Paths:
 *   Windows: %LOCALAPPDATA%\UltraCode\
 *   macOS:   ~/Library/Application Support/UltraCode/
 *   Linux:   ~/.config/ultracode/  (or $XDG_CONFIG_HOME)
 *
 * Uses runtime-optimized file operations from file-ops.ts
 */

import { homedir, platform } from "node:os";
import { basename, join } from "node:path";
import { log } from "../logging/index.js";
import { existsSync, mkdirSync, readJSONSync, writeFileSync } from "./file-ops.js";

const APP_NAME = "ultracode";
const LEGACY_APP_NAME = "UltraCode";

/**
 * Get the central configuration directory for UltraCode
 * NOTE: Must match storage-paths.ts getConfigDir() for consistency
 */
export function getConfigDir(): string {
  // Config is stored inside the data directory
  return join(getDataDir(), "config");
}

/**
 * Get the logs directory for UltraCode
 */
export function getLogsDir(): string {
  return join(getDataDir(), "logs");
}

/**
 * Get the central data directory for UltraCode
 * (for databases, embeddings, cache, etc.)
 * NOTE: Must match storage-paths.ts getDataDir() for consistency
 */
export function getDataDir(): string {
  const os = platform();

  let baseDir: string;

  switch (os) {
    case "win32": {
      // Windows: %LOCALAPPDATA%\UltraCode\
      baseDir = process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local");
      break;
    }

    case "darwin": {
      // macOS: ~/Library/Application Support/UltraCode/
      baseDir = join(homedir(), "Library", "Application Support");
      break;
    }

    default: {
      // Linux: ~/.local/share/UltraCode/ (XDG Base Directory)
      baseDir = process.env["XDG_DATA_HOME"] || join(homedir(), ".local", "share");
      break;
    }
  }

  // Windows is case-insensitive — use legacy "UltraCode" to avoid path confusion.
  // Unix: prefer lowercase "ultracode" (Zig compat).
  if (platform() === "win32") {
    return join(baseDir, LEGACY_APP_NAME);
  }

  const newDir = join(baseDir, APP_NAME);
  const legacyDir = join(baseDir, LEGACY_APP_NAME);
  if (!existsSync(newDir) && existsSync(legacyDir)) {
    return legacyDir;
  }
  return newDir;
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
 * Get the path to the parser configuration file
 * Stores cached settings like JVM paths for kotlin-language-server
 */
export function getParserConfigPath(): string {
  return join(getConfigDir(), "parser-config.json");
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
 * Shared config fields between Zig and TS (written by either, read by both).
 * These live at the root or in shared namespaces of semantic-config.json.
 */
export interface SharedBaseConfig {
  /** Zig: embedding.model / TS: resolved from platform config */
  embedding_model?: string | undefined;
  /** Zig: embedding.dimension */
  embedding_dimension?: number | undefined;
  /** Zig: doc_language (ISO 639-1: en, ru, de, ...) */
  doc_language?: string | undefined;
  /** Zig: llm.platform ("claude_cli", "ollama", etc.) */
  llm_platform?: string | undefined;
  /** Zig: llm.model */
  llm_model?: string | undefined;
  /** Zig: inference section (preserved as-is when TS writes) */
  inference?: Record<string, unknown> | undefined;
  /** Zig: io_threads */
  io_threads?: number | undefined;
  /** Zig: optimal_qd */
  optimal_qd?: number | undefined;
}

/**
 * Semantic configuration structure
 */
export interface SemanticConfig {
  enabled: boolean;
  embedding: {
    platform: "tei" | "ovms" | "ovms-native" | "vllm" | "llamacpp" | "mlx";
    architecture: string;
    ovms?:
      | {
          endpoint: string;
          batch_size?: number | undefined;
          ovms_mini_batch?: number | undefined;
          selected_model: string | null;
          target_device?: string | undefined; // NPU, GPU, NVIDIA, AUTO, MULTI:NPU,GPU,CPU
          /** Multi-device endpoints for round-robin load balancing (e.g., ["embeddings-gpu", "embeddings-gpu", "embeddings-cpu"]) */
          endpoints?: string[] | undefined;
          models?:
            | Array<{
                id: string;
                languages: string[];
                vector_size: number;
              }>
            | undefined;
          // OVMS v3 API options
          useEmbeddingsApi?: boolean | undefined; // Use /v3/embeddings OpenAI-compatible API (default: true)
          encodingFormat?: "float" | "base64" | undefined; // Response format (default: base64)
        }
      | undefined;
    tei?:
      | {
          endpoint: string;
          max_batch_tokens?: number | undefined;
          max_client_batch_size?: number | undefined;
          concurrency?: number | undefined; // Client-side concurrent requests (default 16)
          selected_model: string | null;
          models?:
            | Array<{
                id: string;
                languages: string[];
                vector_size: number;
              }>
            | undefined;
        }
      | undefined;
    vllm?:
      | {
          endpoint: string;
          max_batch_size?: number | undefined;
          encoding_format?: "float" | "base64" | undefined;
          selected_model: string | null;
          models?:
            | Array<{
                id: string;
                languages: string[];
                vector_size: number;
              }>
            | undefined;
        }
      | undefined;
    llamacpp?:
      | {
          endpoint: string;
          context_size?: number | undefined;
          n_gpu_layers?: number | undefined;
          // Performance tuning
          parallel_slots?: number | undefined; // Number of parallel request slots (default: 4)
          ubatch_size?: number | undefined; // Micro-batch size (default: 1536)
          batch_size?: number | undefined; // Batch size for prompt processing (default: 3072)
          // Client settings
          max_batch_size?: number | undefined; // Max texts per HTTP request (default: 256)
          concurrency?: number | undefined; // Parallel HTTP requests (default: 4)
          auto_start?: boolean | undefined; // Auto-start llama-server (default: true)
          selected_model: string | null;
          models?:
            | Array<{
                id: string;
                languages: string[];
                vector_size: number;
              }>
            | undefined;
        }
      | undefined;
    mlx?:
      | {
          endpoint: string;
          max_batch_size?: number | undefined;
          concurrency?: number | undefined;
          auto_start?: boolean | undefined;
          selected_model: string | null;
          models?:
            | Array<{
                id: string;
                languages: string[];
                vector_size: number;
              }>
            | undefined;
        }
      | undefined;
  };
  auto_detection?:
    | undefined
    | {
        gpu_architecture: boolean;
        codebase_size: boolean;
        language: boolean;
      };
  llm?:
    | undefined
    | {
        enabled: boolean;
        platform: "ollama" | "tgi" | "llamacpp" | "claude-code" | "docker-model-runner";
        claude?:
          | {
              model_id: string;
              context_tokens: number;
            }
          | undefined;
        ollama?:
          | {
              endpoint: string;
              model_id: string;
              context_tokens: number;
            }
          | undefined;
        tgi?:
          | {
              endpoint: string;
              model_id: string;
              context_tokens: number;
              container_name: string;
            }
          | undefined;
        docker_model_runner?:
          | {
              endpoint: string;
              model_id: string;
              context_tokens: number;
            }
          | undefined;
      };
}

/**
 * Load semantic configuration from central config directory.
 * Supports both TS-native format and Zig shared format.
 * If the file has Zig-format fields (embedding.model, llm, doc_language),
 * they are parsed into SharedBaseConfig for cross-project compatibility.
 */
export function loadSemanticConfig(): SemanticConfig | null {
  const configPath = getSemanticConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return readJSONSync<SemanticConfig>(configPath);
  } catch (error) {
    log.i("CONFIGPATH", `[Config] Failed to load semantic config: ${error}`);
    return null;
  }
}

/**
 * Load shared base config fields (readable by both Zig and TS).
 * Reads from the same semantic-config.json but extracts the shared fields.
 */
export function loadSharedBaseConfig(): SharedBaseConfig | null {
  const configPath = getSemanticConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readJSONSync<Record<string, unknown>>(configPath);
    if (!raw) return null;

    const embedding = raw["embedding"] as Record<string, unknown> | undefined;
    const llm = raw["llm"] as Record<string, unknown> | undefined;

    return {
      embedding_model: (embedding?.["model"] as string) ?? undefined,
      embedding_dimension: (embedding?.["dimension"] as number) ?? undefined,
      doc_language: (raw["doc_language"] as string) ?? undefined,
      llm_platform: (llm?.["platform"] as string) ?? undefined,
      llm_model: (llm?.["model"] as string) ?? undefined,
      inference: (raw["inference"] as Record<string, unknown>) ?? undefined,
      io_threads: (raw["io_threads"] as number) ?? undefined,
      optimal_qd: (raw["optimal_qd"] as number) ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Save semantic configuration to central config directory.
 * MERGE strategy: reads existing file first, preserves Zig-written fields
 * (inference, io_threads, optimal_qd, doc_language, etc.), then overlays TS fields.
 * This ensures neither Zig nor TS overwrites the other's settings.
 */
export function saveSemanticConfig(config: SemanticConfig): void {
  ensureConfigDir();
  const configPath = getSemanticConfigPath();

  try {
    // Read existing file to preserve Zig-written fields
    let existing: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existing = readJSONSync<Record<string, unknown>>(configPath) ?? {};
      } catch {
        // Corrupt file — overwrite
      }
    }

    // Merge: existing (Zig fields preserved) + new TS config on top
    const merged = { ...existing, ...config };

    writeFileSync(configPath, JSON.stringify(merged, null, 2));
  } catch (error) {
    log.i("CONFIGPATH", `[Config] Failed to save semantic config: ${error}`);
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
 * Model dimensions lookup table (from embedding-models.json)
 * Maps model_id to dimensions for quick lookup without file I/O
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  // OVMS models
  "all-MiniLM-L6-v2": 384,
  "bge-small-en-v1.5": 384,
  "gte-small": 384,
  "multilingual-e5-base": 768,
  "multilingual-e5-small": 384,
  "distiluse-base-multilingual-cased-v2": 512,
  "paraphrase-multilingual-MiniLM-L12-v2": 384,
  "bge-m3": 1024,
  // Jina models
  "jina-embeddings-v2-base-code": 768,
  "jina-embeddings-v3": 1024,
  // TEI models
  "BAAI/bge-m3": 1024,
  "BAAI/bge-small-en-v1.5": 384,
  // Ollama models
  "all-minilm": 384,
  "granite-embedding:30m": 384,
  "snowflake-arctic-embed2": 1024,
  // vLLM models
  "intfloat/multilingual-e5-large-instruct": 1024,
  "intfloat/multilingual-e5-base": 768,
  "intfloat/multilingual-e5-small": 384,
  "intfloat/e5-mistral-7b-instruct": 4096,
  "Alibaba-NLP/gte-Qwen2-1.5B-instruct": 1536,
  "Alibaba-NLP/gte-Qwen2-7B-instruct": 3584,
  "jinaai/jina-embeddings-v3": 1024,
  // New TEI 1.9+ models
  "google/embeddinggemma-300m": 768,
  "Qwen/Qwen3-Embedding-0.6B": 1024,
};

/**
 * Get dimensions for a model by its ID
 */
export function getModelDimensions(modelId: string): number | null {
  return MODEL_DIMENSIONS[modelId] ?? null;
}

/**
 * Get the vector dimensions from the active embedding model.
 * Priority:
 * 1. semantic-config.json (if exists and has model info)
 * 2. YAML config (development.yaml) model name lookup
 * 3. Default: 384 (MiniLM)
 */
export function getVectorDimensions(): number {
  const DEFAULT_DIMENSIONS = 384;

  // Try semantic-config.json first
  const config = loadSemanticConfig();
  if (config?.enabled && config.embedding) {
    const platform = config.embedding.platform;
    let selectedModel: string | null = null;
    let models:
      | Array<{
          id: string;
          vector_size: number;
        }>
      | undefined;

    // Get selected model and models array based on platform
    switch (platform) {
      case "ovms":
      case "ovms-native":
        selectedModel = config.embedding.ovms?.selected_model || null;
        models = config.embedding.ovms?.models;
        break;
      case "vllm":
        selectedModel = config.embedding.vllm?.selected_model || null;
        models = config.embedding.vllm?.models;
        break;
      case "tei":
        selectedModel = config.embedding.tei?.selected_model || null;
        models = config.embedding.tei?.models;
        break;
      case "llamacpp":
        selectedModel = config.embedding.llamacpp?.selected_model || null;
        models = config.embedding.llamacpp?.models;
        break;
      case "mlx":
        selectedModel = config.embedding.mlx?.selected_model || null;
        models = config.embedding.mlx?.models;
        break;
    }

    if (selectedModel && models && models.length > 0) {
      const modelConfig = models.find((m) => m.id === selectedModel);
      if (modelConfig) {
        log.i(
          "CONFIGPATH",
          `[Config] Using vector dimensions from semantic-config (${platform}/${selectedModel}): ${modelConfig.vector_size}`,
        );
        return modelConfig.vector_size;
      }
    }
  }

  // Fallback: Try YAML config model name
  try {
    const { loadConfiguration } = require("../config/yaml-config.js");
    const yamlConfig = loadConfiguration();
    const modelName = yamlConfig?.embedding?.modelName;

    if (modelName) {
      // Try direct lookup
      const dims = MODEL_DIMENSIONS[modelName];
      if (dims) {
        log.i("CONFIGPATH", `[Config] Using vector dimensions from YAML model '${modelName}': ${dims}`);
        return dims;
      }

      // Try without prefix (e.g., "Xenova/all-MiniLM-L6-v2" -> "all-MiniLM-L6-v2")
      const shortName = basename(modelName);
      if (shortName) {
        const shortDims = MODEL_DIMENSIONS[shortName];
        if (shortDims) {
          log.i("CONFIGPATH", `[Config] Using vector dimensions from YAML model '${shortName}': ${shortDims}`);
          return shortDims;
        }
      }

      log.i(
        "CONFIGPATH",
        `[Config] Model '${modelName}' not in dimensions table, using default: ${DEFAULT_DIMENSIONS}`,
      );
    }
  } catch (_e) {
    // yaml-config not available, continue with default
  }

  log.i("CONFIGPATH", `[Config] No model config found, using default dimensions: ${DEFAULT_DIMENSIONS}`);
  return DEFAULT_DIMENSIONS;
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
