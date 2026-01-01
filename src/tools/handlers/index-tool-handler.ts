/**
 * Index Tool Handler
 *
 * Handles codebase indexing with adaptive resource management
 * Extracted from src/index.ts case "index" block
 */

import { z } from "zod";
import { getIndexingStatus, isIndexing, setIndexingState } from "../../index.js";
import type { AgentTask } from "../../types/agent.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
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

    // Step 1: Optional reset
    if (reset) {
      await this.resetGraphStorage(targetDir);
    }

    // Step 1.5: v4 - Always set project context for GraphStorage before indexing
    const storage = await this.context.getGraphStorage();
    storage.setProject(targetDir);
    this.context.logger.debug("INDEXING", "GraphStorage context set", { targetDir }, this.context.requestId);

    // Step 2: Initialize semantic agent if enabled and ensure correct project context
    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      // Use ensureSemanticAgentForProject to reinitialize VectorStore for the target directory
      await this.ensureSemanticAgentForProject(targetDir);
    }

    // Step 3: Detect codebase size and adjust patterns
    const enhancedExcludePatterns = await this.getEnhancedExcludePatterns(targetDir, excludePatterns, fullScan);

    // Step 4: Create and process indexing task
    const result = await this.processIndexingTask(targetDir, incremental, enhancedExcludePatterns);

    // Step 5: Generate embeddings for indexed entities (batch mode)
    let oversizedWarning: { aiMessage: string | null; oversizedCount: number; maxTokens: number } | null = null;
    let embeddingStats: { generated: number; skipped: number } | null = null;

    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      await this.ensureSemanticsReady();

      // Generate embeddings for all entities in storage (batch mode, with deduplication)
      try {
        const semanticAgent = await this.context.getSemanticAgent();
        console.error(`[IndexToolHandler] Generating embeddings from storage...`);
        embeddingStats = await semanticAgent.generateEmbeddingsFromStorage();
        console.error(
          `[IndexToolHandler] Embeddings: generated=${embeddingStats?.generated ?? 0}, skipped=${embeddingStats?.skipped ?? 0}`,
        );

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
        console.error(`[IndexToolHandler] Failed to generate embeddings:`, error);
      }
    }

    // Step 6: Start GitWatcher for incremental updates (if branchAware enabled)
    try {
      const conductor = this.context.getConductor();
      const indexerAgent = conductor.getAgent("indexer") as any;
      if (indexerAgent?.setRepositoryPath) {
        indexerAgent.setRepositoryPath(targetDir);
        console.error(`[IndexToolHandler] GitWatcher started for ${targetDir}`);
      }
    } catch (error) {
      console.error(`[IndexToolHandler] Failed to start GitWatcher:`, error);
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

  private async resetGraphStorage(targetDir: string): Promise<void> {
    // v4: Set project context before clearing
    const storage = await this.context.getGraphStorage();
    storage.setProject(targetDir);
    this.context.logger.systemEvent("GraphStorage context set for project", { directory: targetDir });

    // Clear graph storage for this project context
    await storage.clear();
    this.context.logger.systemEvent("Graph storage cleared before indexing", { directory: targetDir });

    // Clear vector store (embeddings) to ensure fresh semantic search
    try {
      // Ensure SemanticAgent uses the correct project's VectorStore before clearing
      const semanticAgent = await this.ensureSemanticAgentForProject(targetDir);
      const vectorStore = semanticAgent.getVectorStore?.();
      if (vectorStore) {
        await vectorStore.clear();
        this.context.logger.systemEvent("Vector store cleared before indexing", { directory: targetDir });
      }
    } catch (error) {
      // Semantic agent may not be available yet, that's ok
      this.context.logger.debug(
        "INDEXING",
        "Could not clear vector store (semantic agent not ready)",
        { error: (error as Error).message },
        this.context.requestId,
      );
    }
  }

  private async getEnhancedExcludePatterns(
    targetDir: string,
    basePatterns: string[],
    fullScan: boolean,
  ): Promise<string[]> {
    const enhancedPatterns = [...basePatterns];

    try {
      const { numFiles, projectSizeMB } = await this.detectCodebaseSize(targetDir);

      // Adjust resource allocation
      const resourceManager = (global as any).resourceManager;
      if (resourceManager) {
        resourceManager.adjustForCodebaseSize(numFiles, projectSizeMB);
      }

      // Large codebase detection - log only, no automatic pattern injection
      // User should explicitly specify excludePatterns if needed
      if (numFiles > 2000) {
        this.context.logger.info(
          "INDEXING",
          "Large codebase detected. Consider using excludePatterns for faster indexing.",
          { fileCount: numFiles },
          this.context.requestId,
        );
      }

      // Enable batch processing for large codebases
      if (!fullScan && numFiles > 2000) {
        this.context.logger.info(
          "INDEXING",
          "Large codebase detected, enabling batch processing",
          { fileCount: numFiles },
          this.context.requestId,
        );
        enhancedPatterns.push("__batch_processing_enabled__");
      }
    } catch (error) {
      this.context.logger.warn(
        "INDEXING",
        "Could not detect codebase size, using default patterns",
        { error: (error as Error).message },
        this.context.requestId,
      );
    }

    return enhancedPatterns;
  }

  private async detectCodebaseSize(targetDir: string): Promise<{ numFiles: number; projectSizeMB: number }> {
    // Cross-platform implementation using Node.js fs instead of Unix commands (find/du/wc)
    const { glob } = await import("../../utils/glob.js");
    const { stat } = await import("node:fs/promises");

    // Source file extensions to count
    const extensions = [
      "*.js",
      "*.ts",
      "*.tsx",
      "*.jsx",
      "*.py",
      "*.java",
      "*.cpp",
      "*.c",
      "*.h",
      "*.hpp",
      "*.go",
      "*.rs",
      "*.kt",
      "*.kts",
      "*.swift",
      "*.css",
      "*.scss",
      "*.sass",
      "*.less",
      "*.html",
      "*.htm",
      "*.xml",
      "*.json",
      "*.yaml",
      "*.yml",
    ];

    // Count source files using cross-platform glob
    const pattern = `**/{${extensions.join(",")}}`;
    const files = await glob(pattern, {
      cwd: targetDir,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
    });
    const numFiles = files.length;

    // Estimate project size by sampling (full recursive would be slow)
    const { join } = await import("node:path");
    let projectSizeMB = 0;
    try {
      // For quick estimate, sample first 100 files
      const sampleFiles = files.slice(0, 100);
      let sampleSize = 0;
      for (const file of sampleFiles) {
        try {
          const fileStat = await stat(join(targetDir, file));
          sampleSize += fileStat.size;
        } catch {
          // Ignore inaccessible files
        }
      }
      // Extrapolate to full size
      projectSizeMB = Math.floor(((sampleSize / Math.max(1, sampleFiles.length)) * numFiles) / (1024 * 1024));
    } catch {
      projectSizeMB = 0;
    }

    this.context.logger.info(
      "INDEXING",
      `Detected ${numFiles} source files in codebase`,
      { directory: targetDir, fileCount: numFiles },
      this.context.requestId,
    );

    return { numFiles, projectSizeMB };
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

  private async ensureSemanticsReady(): Promise<void> {
    // Wait for semantic agent to be ready
    const maxRetries = 5;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.context.getSemanticAgent();
        break;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await sleep(retryDelay);
      }
    }
  }

  private logIndexingActivity(directory: string, incremental: boolean, excludePatterns: string[], result: any): void {
    this.context.logger.agentActivity?.(
      "conductor",
      "indexing completed",
      {
        directory,
        incremental,
        excludePatterns,
        entitiesFound: Array.isArray(result?.entities) ? result.entities.length : 0,
      },
      this.context.requestId,
    );
  }

  private publishToKnowledgeBus(result: any): void {
    const knowledgeBus = (global as any).knowledgeBus;
    if (knowledgeBus) {
      knowledgeBus.publish("index:completed", result, "mcp-server");
    }
  }
}
