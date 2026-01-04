/**
 * Startup Checks Module
 *
 * Background checks that run during server startup:
 * - Ollama availability check
 * - Orphaned embeddings detection and recovery
 *
 * Extracted from index.ts for better modularity.
 */

import { logger } from "../utils/logger.js";
import { ensureOllamaRunning, getStatusMessage } from "../utils/ollama-checker.js";

export interface StartupCheckConfig {
  embeddingEnabled: boolean;
  embeddingProvider: string;
  pipeServerMode: boolean;
  processStartTime: number;
}

/**
 * Run Ollama availability check in background
 * Non-blocking - logs results but doesn't wait
 */
export function runOllamaCheck(config: StartupCheckConfig): void {
  if (!config.embeddingEnabled) return;
  if (config.embeddingProvider !== "auto" && config.embeddingProvider !== "ollama") return;

  logger.trace("ASYNC", `[+${Date.now() - config.processStartTime}ms] ▶ Launching async: Ollama check`);
  console.error("🔍 Ollama check running in background...");

  (async () => {
    try {
      const ollamaStartTime = Date.now();
      logger.trace("ASYNC", `[+${Date.now() - config.processStartTime}ms] ▶ START: ensureOllamaRunning`);
      const ollamaStatus = await ensureOllamaRunning(true);
      logger.trace(
        "ASYNC",
        `[+${Date.now() - config.processStartTime}ms] ◀ END: ensureOllamaRunning (${Date.now() - ollamaStartTime}ms)`,
      );
      const statusMessage = getStatusMessage(ollamaStatus);
      console.error(statusMessage);

      if (!ollamaStatus.isRunning) {
        console.error(
          "💡 Tip: Install Ollama from https://ollama.com or run setup-embeddings.cmd/sh for automatic setup",
        );
      } else if (!ollamaStatus.hasGranite && ollamaStatus.hasModels) {
        console.error("💡 Tip: Install granite-embedding with: ollama pull granite-embedding");
      }
    } catch (error) {
      logger.warn("STARTUP", "Ollama check failed, will use auto-detection", {
        error: (error as Error).message,
      });
      console.error("⚠️  Ollama check failed, embedding provider will be auto-detected");
    }
  })();
}

export interface OrphanedEmbeddingsCheckConfig {
  embeddingEnabled: boolean;
  pipeServerMode: boolean;
  processStartTime: number;
  getSemanticAgent: () => Promise<any>;
}

/**
 * Check for orphaned embeddings and resume generation in background
 * Non-blocking - runs asynchronously
 */
export function runOrphanedEmbeddingsCheck(config: OrphanedEmbeddingsCheckConfig): void {
  if (!config.embeddingEnabled || config.pipeServerMode) return;

  logger.trace("ASYNC", `[+${Date.now() - config.processStartTime}ms] ▶ START: orphaned embeddings check`);

  (async () => {
    try {
      const checkStartTime = Date.now();
      const semanticAgent = await config.getSemanticAgent();
      logger.trace(
        "ASYNC",
        `[+${Date.now() - config.processStartTime}ms] getSemanticAgent took ${Date.now() - checkStartTime}ms`,
      );
      if (!semanticAgent) return;

      // Check if there are entities without embeddings
      const { getGraphStorage } = await import("../storage/graph-storage-factory.js");
      const storage = await getGraphStorage();
      const allEntities = await storage.findEntities({ type: "entity", limit: 1 });
      const entityCount =
        allEntities.length > 0 ? (await storage.findEntities({ type: "entity", limit: 100000 })).length : 0;

      if (entityCount === 0) return;

      const embeddingCount = (await semanticAgent.getVectorStore()?.count()) ?? 0;
      const missing = entityCount - embeddingCount;

      if (missing > 10) {
        if (semanticAgent.isEmbeddingGenerationInProgress()) {
          logger.warn("AUTO_RESUME", `[SKIPPED] generation already in progress`, { missing });
          return;
        }
        if (semanticAgent.wasGenerationRecentlyCompleted(30000)) {
          logger.warn("AUTO_RESUME", `[SKIPPED] generation recently completed`, { missing });
          return;
        }

        logger.info("STARTUP", `Found ${missing} entities without embeddings, generating in background`, { missing });
        logger.trace(
          "EMBEDDING",
          `[+${Date.now() - config.processStartTime}ms] ▶ START: generateEmbeddingsFromStorage (${missing} missing)`,
        );
        logger.info("STARTUP", "Resuming embedding generation", { missing, entityCount, embeddingCount });

        const embGenStartTime = Date.now();
        semanticAgent
          .generateEmbeddingsFromStorage()
          .then((stats: { generated: number; skipped: number }) => {
            logger.trace(
              "EMBEDDING",
              `[+${Date.now() - config.processStartTime}ms] ◀ END: generateEmbeddingsFromStorage (${Date.now() - embGenStartTime}ms)`,
            );
            logger.info("STARTUP", `Background embedding complete`, {
              generated: stats.generated,
              skipped: stats.skipped,
            });
          })
          .catch((error: Error) => {
            logger.error("EMBEDDING", "Background embedding generation failed", { error: error.message });
          });
      } else {
        logger.trace(
          "EMBEDDING",
          `[+${Date.now() - config.processStartTime}ms] ◀ END: orphaned embeddings check (no action needed, missing=${missing})`,
        );
      }
    } catch (error) {
      logger.warn("STARTUP", "Background embedding check failed", { error: (error as Error).message });
    }
  })();
}
