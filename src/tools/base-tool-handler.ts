/**
 * Base interface for MCP tool handlers
 *
 * Each tool handler should implement this interface to provide:
 * - Type-safe argument validation
 * - Isolated business logic
 * - Consistent error handling
 * - Testability
 * - Automatic response size limiting
 */

import { getProjectContext, type ProjectContextManager } from "../shared/project-context.js";
import { MAX_RESPONSE_SIZE_BYTES, truncateResponse } from "./response-limits.js";

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export interface ToolContext {
  requestId: string;
  config: any;
  logger: any;
  getConductor: () => any;
  getGraphStorage: () => Promise<any>; // v4: libsql unified, no params needed
  getSQLiteManager: () => any; // legacy: kept for AutoDoc and BatchOperations
  getSemanticAgent: () => Promise<any>;
  getBranchManager: () => any;
  getSnapshotManager: () => any;
  getKnowledgeBus: () => any;
  normalizeInputPath: (path?: string) => string | undefined;
  withTimeout: <T>(promise: Promise<T>, ms: number, operation: string, reqId: string) => Promise<T>;
}

export abstract class BaseToolHandler<TArgs = any> {
  /** Maximum response size in bytes. Override in subclass if needed. */
  protected maxResponseSize: number = MAX_RESPONSE_SIZE_BYTES;

  constructor(protected context: ToolContext) {}

  // ==========================================================================
  // PROJECT CONTEXT HELPERS
  // ==========================================================================

  /**
   * Get the ProjectContextManager singleton
   */
  protected getProjectContext(): ProjectContextManager {
    return getProjectContext();
  }

  /**
   * Resolve project path from args, falling back to current project
   */
  protected resolveProjectPath(args: { projectPath?: string }): string {
    return getProjectContext().resolveProjectPath(args.projectPath);
  }

  /**
   * Get storage paths for a project
   */
  protected getProjectStoragePaths(projectPath?: string) {
    return getProjectContext().getStoragePaths(projectPath);
  }

  /**
   * Check if project is indexed, optionally trigger indexing if not
   */
  protected isProjectIndexed(projectPath?: string): boolean {
    return getProjectContext().isProjectIndexed(projectPath);
  }

  /**
   * Get GraphStorage with project context automatically set.
   * v4: Uses libsql unified storage, no SQLiteManager needed.
   */
  protected async ensureGraphStorageForProject(projectPath?: string): Promise<any> {
    const resolved = getProjectContext().resolveProjectPath(projectPath);
    console.error(`[BaseToolHandler.ensureGraphStorageForProject] resolved=${resolved}`);
    const storage = await this.context.getGraphStorage();
    storage.setProject(resolved);
    console.error(`[BaseToolHandler.ensureGraphStorageForProject] called storage.setProject(${resolved})`);
    return storage;
  }

  /**
   * Ensure SemanticAgent is initialized for the correct project.
   * This must be called before using semantic search operations.
   *
   * v3: Now uses project context instead of database path switching.
   * The VectorStore is not recreated - only the project context changes.
   */
  protected async ensureSemanticAgentForProject(projectPath?: string): Promise<any> {
    const resolved = getProjectContext().resolveProjectPath(projectPath);
    const semanticAgent = await this.context.getSemanticAgent();

    // v3: Log current project context instead of DB path
    const vectorStore = semanticAgent?.getVectorStore?.();
    const currentContext = vectorStore?.getProjectContext?.();
    console.error(
      `[BaseToolHandler] ensureSemanticAgentForProject: resolved=${resolved}, currentContext=${JSON.stringify(currentContext)}`,
    );

    // v3: reinitializeForProject now just changes context, no VectorStore recreation
    if (semanticAgent && typeof semanticAgent.reinitializeForProject === "function") {
      console.error(`[BaseToolHandler] Calling reinitializeForProject(${resolved})`);
      await semanticAgent.reinitializeForProject(resolved);

      // Verify context switch happened
      const newContext = semanticAgent.getVectorStore?.()?.getProjectContext?.();
      console.error(`[BaseToolHandler] After reinitialize: newContext=${JSON.stringify(newContext)}`);
    }

    return semanticAgent;
  }

  /**
   * Validate and parse tool arguments
   */
  protected abstract parseArgs(args: unknown): TArgs;

  /**
   * Execute the tool logic
   */
  protected abstract execute(args: TArgs): Promise<ToolResult>;

  /**
   * Apply response size limits and truncation if needed
   */
  protected applyResponseLimits(result: ToolResult): ToolResult {
    if (!result.content || result.content.length === 0) {
      return result;
    }

    const newContent = result.content.map((item) => {
      if (item.type !== "text") return item;

      const size = Buffer.byteLength(item.text, "utf8");
      if (size <= this.maxResponseSize) {
        return item;
      }

      // Try to parse as JSON and truncate intelligently
      try {
        const data = JSON.parse(item.text);
        const truncated = truncateResponse(data, this.maxResponseSize);

        if (truncated.wasTruncated) {
          // Re-parse to add metadata
          const parsed = JSON.parse(truncated.text);
          parsed._responseMeta = {
            truncated: true,
            originalSizeBytes: truncated.originalSize,
            truncatedSizeBytes: truncated.truncatedSize,
            hint: "Response was truncated. Use 'offset' and 'limit' parameters for pagination.",
          };
          return {
            type: "text" as const,
            text: JSON.stringify(parsed, null, 2),
          };
        }

        return { type: "text" as const, text: truncated.text };
      } catch {
        // Not JSON, truncate as plain text
        const truncatedText = item.text.slice(0, this.maxResponseSize);
        return {
          type: "text" as const,
          text: truncatedText + "\n\n[RESPONSE TRUNCATED - original size: " + size + " bytes]",
        };
      }
    });

    return { content: newContent };
  }

  /**
   * Main entry point for tool execution
   */
  async handle(args: unknown): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = this.constructor.name.replace("ToolHandler", "").toLowerCase();

    try {
      const parsedArgs = this.parseArgs(args);
      const result = await this.execute(parsedArgs);

      // Apply response size limits
      const limitedResult = this.applyResponseLimits(result);

      const duration = Date.now() - startTime;
      this.context.logger.mcpResponse?.(toolName, limitedResult, duration, this.context.requestId);

      return limitedResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.context.logger.error?.(
        toolName.toUpperCase(),
        `Tool execution failed after ${duration}ms: ${(error as Error).message}`,
        { error: error as Error, duration },
        this.context.requestId,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: (error as Error).message,
            }),
          },
        ],
      };
    }
  }
}
