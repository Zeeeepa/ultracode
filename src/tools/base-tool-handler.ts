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
  getGraphStorage: (sqliteManager: any) => Promise<any>;
  getSQLiteManager: () => any;
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
