/**
 * Embedding Provider Early Warmup
 *
 * Starts embedding provider initialization immediately after config is read,
 * running in parallel with other startup tasks. This saves ~500ms by
 * overlapping provider warmup with storage initialization, agent registration, etc.
 *
 * Usage:
 *   // Right after loading config
 *   const warmupPromise = startEmbeddingWarmup(semanticConfig, yamlConfig);
 *
 *   // ... other initialization ...
 *
 *   // When semantic agent needs provider
 *   const provider = await getWarmupProvider();
 */

import {
  buildEmbeddingGeneratorOptions,
  getModelNameFromSemanticConfig,
  mapSemanticConfigToProvider,
  type ProviderKind,
} from "../agents/semantic/provider-config.js";
import { log } from "../logging/index.js";
import type { EmbeddingConfig } from "../types/semantic.js";
import type { SemanticConfig } from "../utils/config-paths.js";
import { EmbeddingGenerator } from "./embedding-generator.js";

// Singleton state
let warmupPromise: Promise<EmbeddingGenerator | null> | null = null;
let warmupGenerator: EmbeddingGenerator | null = null;
let warmupDimensions: number | null = null;

// Minimal interface for YAML config access
interface YamlConfigMinimal {
  semanticAgent?: { modelPath?: string };
  mcp?: { embedding?: { provider?: string; model?: string; tei?: unknown } };
}

/**
 * Start embedding provider warmup in background.
 * Call this immediately after loading semantic config.
 *
 * @returns Promise that resolves when warmup is complete (or null if disabled)
 */
export function startEmbeddingWarmup(
  semanticConfig: SemanticConfig | null,
  yamlConfig: unknown,
): Promise<EmbeddingGenerator | null> {
  // Already started
  if (warmupPromise) {
    return warmupPromise;
  }

  // Check if disabled
  if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] === "1") {
    log.d("WARMUP", "Skipped - semantic disabled");
    warmupPromise = Promise.resolve(null);
    return warmupPromise;
  }

  const startTime = Date.now();
  log.i("WARMUP", "Starting early embedding warmup");

  // Cast to minimal interface for type-safe access
  const cfg = yamlConfig as YamlConfigMinimal | null;

  warmupPromise = (async (): Promise<EmbeddingGenerator | null> => {
    try {
      // Determine provider (same logic as SemanticAgent)
      const jsonProvider = mapSemanticConfigToProvider(semanticConfig);
      const yamlProvider = cfg?.mcp?.embedding?.provider as ProviderKind | undefined;
      const provider = jsonProvider !== "auto" ? jsonProvider : (yamlProvider ?? "auto");

      // Determine model name
      const yamlModel = cfg?.mcp?.embedding?.model;
      const jsonModel = getModelNameFromSemanticConfig(semanticConfig);
      const modelName = jsonModel !== "all-MiniLM-L6-v2" ? jsonModel : yamlModel || "all-MiniLM-L6-v2";

      log.d("WARMUP", "Provider config", { provider, model: modelName });

      // Build options (same as SemanticAgent.setupComponents)
      // Pass cfg as any to avoid type conflicts with YamlConfig interface
      const options = buildEmbeddingGeneratorOptions(provider, modelName, 50, semanticConfig, cfg as any);

      // Create and initialize generator
      const generator = new EmbeddingGenerator(options as EmbeddingConfig);
      await generator.initialize();

      // Get dimensions from warmup
      warmupDimensions = generator.getProvider()?.info.dimension ?? null;
      warmupGenerator = generator;

      // Warm GPU/CPU caches with a dummy request (first TEI batch is ~1.5s cold, subsequent ~80ms)
      try {
        await generator.generateBatch(["warmup embedding pipeline"]);
        log.d("WARMUP", "gpu_warmed_up");
      } catch {
        // Non-critical — GPU will warm on first real batch
      }

      const elapsed = Date.now() - startTime;
      log.i("WARMUP", "Complete", { elapsed: `${elapsed}ms`, dimensions: warmupDimensions, provider });

      return generator;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      log.w("WARMUP", "Failed (will retry when needed)", {
        elapsed: `${elapsed}ms`,
        error: (error as Error).message,
      });
      return null;
    }
  })();

  return warmupPromise;
}

/**
 * Get the pre-warmed embedding generator.
 * Returns null if warmup hasn't been started or failed.
 */
export async function getWarmupProvider(): Promise<EmbeddingGenerator | null> {
  if (!warmupPromise) {
    return null;
  }
  return warmupPromise;
}

/**
 * Get dimensions from warmup (available after warmup completes).
 */
export function getWarmupDimensions(): number | null {
  return warmupDimensions;
}

/**
 * Check if warmup is in progress.
 */
export function isWarmupInProgress(): boolean {
  return warmupPromise !== null && warmupGenerator === null;
}

/**
 * Check if warmup completed successfully.
 */
export function isWarmupComplete(): boolean {
  return warmupGenerator !== null;
}

/**
 * Take ownership of the warmed generator (clears the singleton).
 * Used by SemanticAgent to reuse the pre-warmed provider.
 */
export function takeWarmupGenerator(): EmbeddingGenerator | null {
  const gen = warmupGenerator;
  warmupGenerator = null;
  warmupPromise = null;
  warmupDimensions = null;
  return gen;
}
