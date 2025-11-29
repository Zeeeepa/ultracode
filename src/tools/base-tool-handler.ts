/**
 * Base interface for MCP tool handlers
 *
 * Each tool handler should implement this interface to provide:
 * - Type-safe argument validation
 * - Isolated business logic
 * - Consistent error handling
 * - Testability
 */

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
   * Main entry point for tool execution
   */
  async handle(args: unknown): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = this.constructor.name.replace("ToolHandler", "").toLowerCase();

    try {
      const parsedArgs = this.parseArgs(args);
      const result = await this.execute(parsedArgs);

      const duration = Date.now() - startTime;
      this.context.logger.mcpResponse?.(toolName, result, duration, this.context.requestId);

      return result;
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
