/**
 * Startup Checks Module
 *
 * Background checks that run during server startup:
 * - Ollama availability check
 * - Orphaned embeddings detection and recovery
 *
 * Extracted from index.ts for better modularity.
 */

import { log } from "../logging/index.js";
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

  log.t("STARTUP", `[+${Date.now() - config.processStartTime}ms] ▶ Launching async: Ollama check`);
  log.i("STARTUP", "ollama_check_bg");

  (async () => {
    try {
      const ollamaStartTime = Date.now();
      log.t("STARTUP", "ollama_start");
      const ollamaStatus = await ensureOllamaRunning(true);
      log.t("STARTUP", "ollama_end", { elapsed: Date.now() - ollamaStartTime });
      const statusMessage = getStatusMessage(ollamaStatus);
      log.i("STARTUP", "ollama_status", { msg: statusMessage });

      if (!ollamaStatus.isRunning) {
        log.i("STARTUP", "ollama_not_running");
      } else if (!ollamaStatus.hasGranite && ollamaStatus.hasModels) {
        log.i("STARTUP", "granite_missing");
      }
    } catch (error) {
      log.w("STARTUP", "Ollama check failed, will use auto-detection", {
        error: (error as Error).message,
      });
      log.w("STARTUP", "ollama_check_fail");
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

  log.t("STARTUP", "orphan_emb_start");

  (async () => {
    try {
      const checkStartTime = Date.now();
      const semanticAgent = await config.getSemanticAgent();
      log.t("STARTUP", "semantic_agent_got", { elapsed: Date.now() - checkStartTime });
      if (!semanticAgent) return;

      // Check if there are entities without embeddings
      const { getGraphStorage } = await import("../storage/graph-storage-factory.js");
      const storage = await getGraphStorage();
      const allEntities = await storage.findEntities({ limit: 1 });
      const entityCount = allEntities.length > 0 ? (await storage.findEntities({ limit: 100000 })).length : 0;

      if (entityCount === 0) return;

      const embeddingCount = (await semanticAgent.getVectorStore()?.count()) ?? 0;
      const missing = entityCount - embeddingCount;

      if (missing > 10) {
        if (semanticAgent.isEmbeddingGenerationInProgress()) {
          log.w("STARTUP", `[SKIPPED] generation already in progress`, { missing });
          return;
        }
        if (semanticAgent.wasGenerationRecentlyCompleted(30000)) {
          log.w("STARTUP", `[SKIPPED] generation recently completed`, { missing });
          return;
        }

        log.i("STARTUP", `Found ${missing} entities without embeddings, generating in background`, { missing });
        log.t("STARTUP", "emb_gen_start", { missing });
        log.i("STARTUP", "Resuming embedding generation", { missing, entityCount, embeddingCount });

        const embGenStartTime = Date.now();
        semanticAgent
          .generateEmbeddingsFromStorage()
          .then((stats: { generated: number; skipped: number }) => {
            log.t("STARTUP", "emb_gen_end", { elapsed: Date.now() - embGenStartTime });
            log.i("STARTUP", `Background embedding complete`, {
              generated: stats.generated,
              skipped: stats.skipped,
            });
          })
          .catch((error: Error) => {
            log.e("EMBEDDING", "bg_gen_fail", { err: error.message });
          });
      } else {
        log.t("STARTUP", "orphan_emb_skip", { missing });
      }
    } catch (error) {
      log.w("STARTUP", "bg_emb_check_fail", { err: (error as Error).message });
    }
  })();
}
