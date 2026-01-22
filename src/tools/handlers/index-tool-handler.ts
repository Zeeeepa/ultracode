/**
 * Index Tool Handler
 *
 * Handles codebase indexing with adaptive resource management
 * Extracted from src/index.ts case "index" block
 */

import { z } from "zod";
import { getIndexingStatus, isIndexing, setIndexingState } from "../../index.js";
import { log } from "../../logging/index.js";
import { type Agent, type AgentTask, AgentType } from "../../types/agent.js";
import { toError } from "../../utils/error-handling.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// Type Interfaces
// =============================================================================

/**
 * DevAgent with parser agent property
 */
interface DevAgentWithParser extends Agent {
  parserAgent?: {
    destroyWorkerPools?: () => Promise<void>;
  };
  getEmbeddingStats?: () => {
    total: number;
    durationMs: number;
    speedPerSec: number;
    workers: number;
    batches: number;
    provider: string;
  } | null;
}

/**
 * IndexerAgent with repository path setter
 */
interface IndexerAgentWithRepository extends Agent {
  setRepositoryPath?: (path: string) => Promise<void>;
}

/**
 * GlobalThis with knowledgeBus
 */
interface GlobalWithKnowledgeBus {
  knowledgeBus?: {
    publish: (topic: string, data: unknown, source: string) => void;
  };
}

/**
 * Index tool response structure
 */
interface IndexToolResponse {
  success: boolean;
  message: string;
  result: IndexingResult;
  embeddings?: {
    generated: number;
    skipped: number;
  };
  embeddingPerformance?: {
    totalEmbeddings: number;
    durationSeconds: number;
    embeddingsPerSecond: number;
    workersUsed: number;
  };
  warning?: string;
  oversizedEntities?: {
    count: number;
    maxTokens: number;
  };
}

/**
 * Indexing result structure
 */
interface IndexingResult {
  entities?: unknown[];
  [key: string]: unknown;
}

const IndexToolSchema = z.object({
  directory: z.string().optional(),
  incremental: z.boolean().optional().default(false),
  reset: z.boolean().optional().default(false),
  excludePatterns: z.array(z.string()).optional().default([]),
  fullScan: z.boolean().optional().default(false),
});

type IndexToolArgs = z.infer<typeof IndexToolSchema>;

export class IndexToolHandler extends BaseToolHandler<IndexToolArgs> {
  protected parseArgs(args: unknown): IndexToolArgs {
    return IndexToolSchema.parse(args);
  }

  protected async execute(args: IndexToolArgs): Promise<ToolResult> {
    const config = this.context.config as { directory?: string };
    const targetDir = args.directory || config.directory || process.cwd();

    // Step 0: Check if indexing is already in progress (prevent concurrent indexing)
    if (isIndexing()) {
      const status = getIndexingStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: "Indexing already in progress",
                currentDirectory: status.directory,
                elapsedSeconds: status.elapsedSeconds,
                message: "Please wait for the current indexing operation to complete",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Set indexing state to prevent concurrent operations
    setIndexingState(true, targetDir);

    try {
      return await this.executeIndexing(args, targetDir);
    } finally {
      // Always reset indexing state when done (success or error)
      setIndexingState(false);
    }
  }

  private async executeIndexing(args: IndexToolArgs, targetDir: string): Promise<ToolResult> {
    const { incremental, excludePatterns, reset, fullScan } = args;

    // Step 0: Kill existing worker pools before full reindex (prevents conflicts with keepalive workers)
    if (!incremental) {
      try {
        const conductor = this.context.getConductor();
        const devAgent = conductor.getAgentByType?.(AgentType.DEV) as DevAgentWithParser | undefined;
        if (devAgent?.parserAgent?.destroyWorkerPools) {
          log.d("INDEXTOOL", "destroy_pools");
          await devAgent.parserAgent.destroyWorkerPools();
          log.d("INDEXTOOL", "pools_destroyed");
        }
      } catch (error: unknown) {
        // Ignore - workers may not exist yet
        const err = toError(error);
        log.d("INDEXTOOL", "destroy_pools_skip", { err: err.message });
      }
    }

    // Step 1: Set project context for GraphStorage (like auto-indexer)
    const storage = await this.context.getGraphStorage();
    storage.setProject(targetDir);
    log.d("INDEXTOOL", "storage_context_set", { dir: targetDir });

    // Step 2: Optional reset - clear storage BEFORE indexing starts
    if (reset) {
      await storage.clear();
      log.d("INDEXTOOL", "storage_cleared", { dir: targetDir });
    }

    // Step 3: Drop vector index for faster bulk inserts (like auto-indexer)
    // Don't reinitialize VectorStore - just drop index
    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1" && !incremental) {
      try {
        const semanticAgent = await this.context.getSemanticAgent();
        await semanticAgent.dropVectorIndex();
        log.d("INDEXTOOL", "vector_idx_dropped");
      } catch (error: unknown) {
        // Semantic agent may not be available yet, that's ok
        const err = toError(error);
        log.d("INDEXTOOL", "vector_idx_skip", { err: err.message });
      }
    }

    // Step 4: Merge patterns (simple, no expensive codebase size detection)
    const enhancedExcludePatterns = await this.getEnhancedExcludePatterns(targetDir, excludePatterns, fullScan);

    // Step 5: Create and process indexing task (main work)
    const result = await this.processIndexingTask(targetDir, incremental, enhancedExcludePatterns);

    // Step 6: Finalize embeddings AFTER indexing completes (like auto-indexer)
    let oversizedWarning: { aiMessage: string | null; oversizedCount: number; maxTokens: number } | null = null;
    let embeddingStats: { generated: number; skipped: number } | null = null;

    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      try {
        const semanticAgent = await this.context.getSemanticAgent();

        // Check if embedding provider is configured
        const { buildWorkerEmbeddingConfig } = await import("../../config/worker-embedding-config.js");
        const workerConfig = buildWorkerEmbeddingConfig();

        if (!workerConfig?.enabled) {
          log.w("INDEXTOOL", "no_embedding_provider", {
            message: "Embeddings not generated - no provider configured",
            hint: "Configure TEI, OVMS, vLLM, or llamacpp in semantic-config.json",
          });
        }

        // Finalize: flush accumulator and save FAISS index
        log.d("INDEXTOOL", "finalize_embed");
        embeddingStats = await semanticAgent.generateEmbeddingsFromStorage();
        log.i("INDEXTOOL", "embed_done", { gen: embeddingStats?.generated ?? 0, skip: embeddingStats?.skipped ?? 0 });

        // Get warning about oversized entities
        const warning = semanticAgent.getLastOversizedWarning?.();
        if (warning?.hasWarning) {
          oversizedWarning = {
            aiMessage: warning.aiMessage,
            oversizedCount: warning.oversizedCount,
            maxTokens: warning.maxTokens,
          };
        }
      } catch (error: unknown) {
        const err = toError(error);
        log.e("INDEXTOOL", "embed_fail", { err: err.message, stack: err.stack });
      }
    }

    // Step 6: Start FileWatcher/GitWatcher for incremental updates
    try {
      const conductor = this.context.getConductor();
      // Get IndexerAgent through DevAgent (IndexerAgent is a private member of DevAgent)
      const devAgent = conductor.getAgentByType?.(AgentType.DEV) as
        | { getIndexerAgent?: () => IndexerAgentWithRepository | null }
        | undefined;
      log.d("INDEXTOOL", "watcher_diag", {
        hasDevAgent: !!devAgent,
        hasGetIndexerAgent: !!devAgent?.getIndexerAgent,
      });
      const indexerAgent = devAgent?.getIndexerAgent?.() ?? undefined;
      log.d("INDEXTOOL", "watcher_diag2", {
        hasIndexerAgent: !!indexerAgent,
        hasSetRepoPath: !!indexerAgent?.setRepositoryPath,
      });
      if (indexerAgent?.setRepositoryPath) {
        await indexerAgent.setRepositoryPath(targetDir);
        log.i("INDEXTOOL", "watcher_start", { dir: targetDir });
      } else {
        log.w("INDEXTOOL", "watcher_skip", {
          reason: !indexerAgent ? "no indexerAgent" : "no setRepositoryPath method",
        });
      }
    } catch (error: unknown) {
      const err = toError(error);
      log.e("INDEXTOOL", "watcher_fail", { err: err.message, stack: err.stack });
    }

    // Step 6b: Log embedding performance summary from parser agent
    let embeddingPerformance: {
      totalEmbeddings: number;
      durationSeconds: number;
      embeddingsPerSecond: number;
      workersUsed: number;
    } | null = null;

    try {
      const conductor = this.context.getConductor();
      const devAgent = conductor.getAgentByType?.(AgentType.DEV) as DevAgentWithParser | undefined;
      const embStats = devAgent?.getEmbeddingStats?.();
      if (embStats && embStats.total > 0) {
        log.i("EMBEDDING", "emb_summary", {
          total: embStats.total,
          dur: `${(embStats.durationMs / 1000).toFixed(1)}s`,
          speed: `${embStats.speedPerSec}/s`,
          workers: embStats.workers,
          batches: embStats.batches,
          provider: embStats.provider,
        });
        embeddingPerformance = {
          totalEmbeddings: embStats.total,
          durationSeconds: Math.round((embStats.durationMs / 1000) * 10) / 10,
          embeddingsPerSecond: embStats.speedPerSec,
          workersUsed: embStats.workers,
        };
      }
    } catch {
      // Non-critical, ignore
    }

    // Step 6c: Flush LibSQL to disk immediately (synchronous=OFF buffers writes)
    try {
      const storageWithFlush = storage as { flush?: () => Promise<void> };
      if (typeof storageWithFlush.flush === "function") {
        await storageWithFlush.flush();
        log.d("INDEXTOOL", "storage_flushed");
      }
    } catch (error: unknown) {
      const err = toError(error);
      log.w("INDEXTOOL", "storage_flush_error", { error: err.message, stack: err.stack });
    }

    // Step 7: Log and publish result
    this.logIndexingActivity(targetDir, incremental, excludePatterns, result);
    this.publishToKnowledgeBus(result);

    // Build response with optional AI warning
    const response: IndexToolResponse = {
      success: true,
      message: "Indexing completed",
      result,
    };

    // Add embedding statistics
    if (embeddingStats) {
      response.embeddings = embeddingStats;
    }

    // Add embedding performance metrics
    if (embeddingPerformance) {
      response.embeddingPerformance = embeddingPerformance;
    }

    // Add AI-friendly warning about oversized entities
    if (oversizedWarning?.aiMessage) {
      response.warning = oversizedWarning.aiMessage;
      response.oversizedEntities = {
        count: oversizedWarning.oversizedCount,
        maxTokens: oversizedWarning.maxTokens,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  private async getEnhancedExcludePatterns(
    _targetDir: string,
    basePatterns: string[],
    _fullScan: boolean,
  ): Promise<string[]> {
    // Simply return base patterns - no expensive codebase size detection
    // auto-indexer uses buildAutoIndexExcludePatterns() which is fast
    return [...basePatterns];
  }

  private async processIndexingTask(
    directory: string,
    incremental: boolean,
    excludePatterns: string[],
  ): Promise<IndexingResult> {
    const task: AgentTask = {
      id: `index-${Date.now()}`,
      type: "index",
      priority: 8,
      payload: {
        directory,
        incremental,
        excludePatterns,
      },
      createdAt: Date.now(),
    };

    const conductor = this.context.getConductor();
    await conductor.initialize();

    // Get DevAgent to process the index task (conductor no longer processes tasks directly)
    const devAgent = conductor.getAgentByType?.(AgentType.DEV);
    if (!devAgent) {
      throw new Error("DevAgent not available for indexing");
    }

    const isDebugMode = process.env["MCP_DEBUG"] === "1";
    // Indexing can take significant time for large codebases (e.g., 90+ seconds for 350 files)
    // Use a longer default timeout (5 minutes) to allow completion without early termination
    const INDEX_DEFAULT_TIMEOUT = 300000; // 5 minutes
    const mcpConfig = this.context.config as {
      mcp?: { agents?: { defaultTimeout?: number }; server?: { timeout?: number } };
    };
    const configuredTimeout =
      mcpConfig.mcp?.agents?.defaultTimeout || mcpConfig.mcp?.server?.timeout || INDEX_DEFAULT_TIMEOUT;
    const timeoutMs = isDebugMode
      ? Math.max(configuredTimeout, 300000)
      : Math.max(configuredTimeout, INDEX_DEFAULT_TIMEOUT);

    return (await this.context.withTimeout(
      devAgent.process(task),
      timeoutMs,
      "index",
      this.context.requestId,
    )) as IndexingResult;
  }

  private logIndexingActivity(
    directory: string,
    incremental: boolean,
    excludePatterns: string[],
    result: IndexingResult,
  ): void {
    const entitiesFound = Array.isArray(result?.entities) ? result.entities.length : 0;
    log.i("INDEXTOOL", "index_complete", {
      dir: directory,
      incr: incremental,
      exclude: excludePatterns.length,
      entities: entitiesFound,
    });
  }

  private publishToKnowledgeBus(result: IndexingResult): void {
    const globalWithKB = global as unknown as GlobalWithKnowledgeBus;
    const knowledgeBus = globalWithKB.knowledgeBus;
    if (knowledgeBus) {
      knowledgeBus.publish("index:completed", result, "mcp-server");
    }
  }
}
