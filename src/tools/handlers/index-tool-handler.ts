/**
 * Index Tool Handler
 *
 * Handles codebase indexing with adaptive resource management
 * Extracted from src/index.ts case "index" block
 */

import { z } from "zod";
import { getIndexingStatus, isIndexing, setIndexingState } from "../../index.js";
import { log } from "../../logging/index.js";
import { type AgentTask, AgentType } from "../../types/agent.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

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
    const targetDir = args.directory || this.context.config.directory;

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
        const devAgent = conductor.getAgentByType?.(AgentType.DEV) as any;
        if (devAgent?.parserAgent?.destroyWorkerPools) {
          log.d("INDEXTOOL", "destroy_pools");
          await devAgent.parserAgent.destroyWorkerPools();
          log.d("INDEXTOOL", "pools_destroyed");
        }
      } catch (error) {
        // Ignore - workers may not exist yet
        log.d("INDEXTOOL", "destroy_pools_skip", { err: (error as Error).message });
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
      } catch (error) {
        // Semantic agent may not be available yet, that's ok
        log.d("INDEXTOOL", "vector_idx_skip", { err: (error as Error).message });
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
      } catch (error) {
        log.e("INDEXTOOL", "embed_fail", { err: String(error) });
      }
    }

    // Step 6: Start FileWatcher/GitWatcher for incremental updates
    try {
      const conductor = this.context.getConductor();
      const indexerAgent = conductor.getAgent("indexer") as any;
      if (indexerAgent?.setRepositoryPath) {
        await indexerAgent.setRepositoryPath(targetDir);
        log.i("INDEXTOOL", "watcher_start", { dir: targetDir });
      }
    } catch (error) {
      log.e("INDEXTOOL", "watcher_fail", { err: String(error) });
    }

    // Step 7: Log and publish result
    this.logIndexingActivity(targetDir, incremental, excludePatterns, result);
    this.publishToKnowledgeBus(result);

    // Build response with optional AI warning
    const response: any = {
      success: true,
      message: "Indexing completed",
      result,
    };

    // Add embedding statistics
    if (embeddingStats) {
      response.embeddings = embeddingStats;
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

  private async processIndexingTask(directory: string, incremental: boolean, excludePatterns: string[]): Promise<any> {
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

    const isDebugMode = process.env["MCP_DEBUG"] === "1";
    // Indexing can take significant time for large codebases (e.g., 90+ seconds for 350 files)
    // Use a longer default timeout (5 minutes) to allow completion without early termination
    const INDEX_DEFAULT_TIMEOUT = 300000; // 5 minutes
    const configuredTimeout =
      this.context.config.mcp.agents?.defaultTimeout ||
      this.context.config.mcp.server?.timeout ||
      INDEX_DEFAULT_TIMEOUT;
    const timeoutMs = isDebugMode
      ? Math.max(configuredTimeout, 300000)
      : Math.max(configuredTimeout, INDEX_DEFAULT_TIMEOUT);

    return await this.context.withTimeout(conductor.process(task), timeoutMs, "index", this.context.requestId);
  }

  private logIndexingActivity(directory: string, incremental: boolean, excludePatterns: string[], result: any): void {
    const entitiesFound = Array.isArray(result?.entities) ? result.entities.length : 0;
    log.i("INDEXTOOL", "index_complete", {
      dir: directory,
      incr: incremental,
      exclude: excludePatterns.length,
      entities: entitiesFound,
    });
  }

  private publishToKnowledgeBus(result: any): void {
    const knowledgeBus = (global as any).knowledgeBus;
    if (knowledgeBus) {
      knowledgeBus.publish("index:completed", result, "mcp-server");
    }
  }
}
