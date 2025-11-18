/**
 * Tool Registry
 *
 * Central registry for all MCP tool handlers
 * Provides O(1) lookup instead of O(n) switch statement
 *
 * Usage in src/index.ts:
 *   const handler = toolRegistry.getHandler(toolName, context);
 *   return await handler.handle(args);
 */

import type { BaseToolHandler, ToolContext } from "./base-tool-handler.js";
import { IndexToolHandler } from "./handlers/index-tool-handler.js";

type ToolHandlerConstructor = new (context: ToolContext) => BaseToolHandler;

export class ToolRegistry {
  private handlers: Map<string, ToolHandlerConstructor> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register a tool handler
   */
  register(toolName: string, handlerClass: ToolHandlerConstructor): void {
    this.handlers.set(toolName, handlerClass);
  }

  /**
   * Get a handler instance for a tool
   */
  getHandler(toolName: string, context: ToolContext): BaseToolHandler {
    const HandlerClass = this.handlers.get(toolName);

    if (!HandlerClass) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return new HandlerClass(context);
  }

  /**
   * Check if a tool is registered
   */
  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register default tool handlers
   * TODO: Add remaining 29 handlers as they are migrated
   */
  private registerDefaultHandlers(): void {
    // P0: Critical priority - migrated tools
    this.register("index", IndexToolHandler);

    // P1: High priority - to be migrated
    // this.register("semantic_search", SemanticSearchToolHandler);
    // this.register("detect_code_clones", DetectCodeClonesToolHandler);
    // this.register("suggest_refactoring", SuggestRefactoringToolHandler);

    // P2: Medium priority - to be migrated
    // this.register("get_graph", GetGraphToolHandler);
    // this.register("reset_graph", ResetGraphToolHandler);
    // this.register("clean_index", CleanIndexToolHandler);

    // P3: Low priority - to be migrated
    // ... remaining 23 tools
  }
}

// Singleton instance (can be replaced with DI container later)
export const toolRegistry = new ToolRegistry();
