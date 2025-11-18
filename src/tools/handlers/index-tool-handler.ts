/**
 * Index Tool Handler
 *
 * Handles codebase indexing with adaptive resource management
 * Extracted from src/index.ts case "index" block
 */

import { z } from "zod";
import type { AgentTask } from "../../types/agent.js";
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
    const { directory: indexDir, incremental, excludePatterns, reset, fullScan } = args;
    const targetDir = indexDir || this.context.config.directory;

    // Step 1: Optional reset
    if (reset) {
      await this.resetGraphStorage(targetDir);
    }

    // Step 2: Initialize semantic agent if enabled
    if (process.env.MCP_DEBUG_DISABLE_SEMANTIC !== "1") {
      await this.context.getSemanticAgent();
    }

    // Step 3: Detect codebase size and adjust patterns
    const enhancedExcludePatterns = await this.getEnhancedExcludePatterns(targetDir, excludePatterns, fullScan);

    // Step 4: Create and process indexing task
    const result = await this.processIndexingTask(targetDir, incremental, enhancedExcludePatterns);

    // Step 5: Ensure semantics ready
    if (process.env.MCP_DEBUG_DISABLE_SEMANTIC !== "1") {
      await this.ensureSemanticsReady();
    }

    // Step 6: Log and publish result
    this.logIndexingActivity(targetDir, incremental, excludePatterns, result);
    this.publishToKnowledgeBus(result);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message: "Indexing completed",
              result,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async resetGraphStorage(targetDir: string): Promise<void> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    await storage.clear();
    this.context.logger.systemEvent("Graph storage cleared before indexing", { directory: targetDir });
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

      // Add patterns for large codebases
      if (numFiles > 2000) {
        this.context.logger.info(
          "INDEXING",
          "Large codebase detected, adding additional exclude patterns",
          { fileCount: numFiles },
          this.context.requestId,
        );

        enhancedPatterns.push(
          "**/test/**",
          "**/tests/**",
          "**/*_test.*",
          "**/*_spec.*",
          "**/*.test.*",
          "**/*.spec.*",
          "**/docs/**",
          "**/doc/**",
          "**/documentation/**",
          "**/examples/**",
          "**/example/**",
          "**/demo/**",
          "**/demos/**",
          "**/migrations/**",
          "**/scripts/**",
          "**/tools/**",
          "**/*.min.js",
          "**/*.min.css",
          "**/bundle.*",
          "**/vendor.*",
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
    const { execSync } = await import("node:child_process");

    const fileCount = execSync(
      `find "${targetDir}" -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.java" -o -name "*.cpp" -o -name "*.c" -o -name "*.go" -o -name "*.rs" -o -name "*.kt" -o -name "*.kts" -o -name "*.swift" -o -name "*.css" -o -name "*.scss" -o -name "*.sass" -o -name "*.less" -o -name "*.html" -o -name "*.htm" -o -name "*.xml" -o -name "*.vba" \\) | wc -l`,
      { encoding: "utf8" },
    ).trim();
    const numFiles = parseInt(fileCount, 10);

    const projectSizeBytes = execSync(`du -sb "${targetDir}" | cut -f1`, { encoding: "utf8" }).trim();
    const projectSizeMB = Math.floor(parseInt(projectSizeBytes, 10) / (1024 * 1024));

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

    const isDebugMode = process.env.MCP_DEBUG === "1";
    const configuredTimeout =
      this.context.config.mcp.agents?.defaultTimeout || this.context.config.mcp.server?.timeout || 30000;
    const timeoutMs = isDebugMode ? Math.max(configuredTimeout, 120000) : configuredTimeout;

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
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
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
