/**
 * Base interface for MCP tool handlers
 *
 * Each tool handler should implement this interface to provide:
 * - Type-safe argument validation
 * - Isolated business logic
 * - Consistent error handling
 * - Testability
 * - Automatic response size limiting
 *
 * v5: Added ClientSession support for per-client state isolation.
 * Tools should use context.session.projectPath instead of global singleton.
 */

import type { ConductorOrchestrator } from "../agents/conductor-orchestrator.js";
import type { SemanticAgent } from "../agents/semantic-agent.js";
import type { AutoIndexContext } from "../core/auto-indexer.js";
import type { BranchManager } from "../core/branch-manager.js";
import type { ClientSession } from "../core/client-session.js";
import type { KnowledgeBus } from "../core/knowledge-bus.js";
import { log } from "../logging/index.js";
import { getProjectContext, type ProjectContextManager } from "../shared/project-context.js";
import type { GraphStorage } from "../types/storage.js";
import type { VersionManager } from "../versioning/version-manager.js";
import { MAX_RESPONSE_SIZE_BYTES, truncateResponse } from "./response-limits.js";

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

/**
 * Output format for tool responses (synced with Zig's registry.OutputFormat).
 * - "text": human-readable plain text (DEFAULT — best for LLM consumption)
 * - "json": structured JSON (for programmatic use)
 * - "markdown": rich formatting with tables, headers, code blocks
 */
export type OutputFormat = "text" | "json" | "markdown";

/** Parse _format parameter from tool args */
export function parseOutputFormat(args: Record<string, unknown>): OutputFormat {
  const fmt = args["_format"] ?? args["format"];
  if (fmt === "json") return "json";
  if (fmt === "markdown" || fmt === "md") return "markdown";
  return "text"; // default
}

export interface ToolContext {
  requestId: string;
  config: unknown;

  /**
   * v5: Per-client session with isolated project state.
   * Use this instead of global ProjectContextManager!
   *
   * If undefined (legacy mode), falls back to global singleton.
   */
  session?: ClientSession | undefined;

  /**
   * v5: Project path for this request (from session or args).
   * Guaranteed to be set - use this for all project-scoped operations.
   */
  projectPath: string;

  getConductor: () => ConductorOrchestrator;
  getGraphStorage: () => Promise<GraphStorage>; // v4: libsql unified, no params needed
  getSQLiteManager: () => unknown; // legacy: kept for AutoDoc and BatchOperations
  getSemanticAgent: () => Promise<SemanticAgent>;
  getBranchManager: () => Promise<BranchManager>;
  getSnapshotManager: () => Promise<VersionManager>;
  getKnowledgeBus: () => KnowledgeBus;
  getServiceContainer?: (() => unknown) | undefined; // DI Container for services
  normalizeInputPath: (path?: string) => string | undefined;
  withTimeout: <T>(promise: Promise<T>, ms: number, operation: string, reqId: string) => Promise<T>;
  createAutoIndexContext?: (() => AutoIndexContext) | undefined;
}

export abstract class BaseToolHandler<TArgs = unknown> {
  /** Maximum response size in bytes. Override in subclass if needed. */
  protected maxResponseSize: number = MAX_RESPONSE_SIZE_BYTES;

  constructor(protected context: ToolContext) {}

  // ==========================================================================
  // PROJECT CONTEXT HELPERS (v5: session-aware)
  // ==========================================================================

  /**
   * Get the ProjectContextManager singleton.
   * @deprecated Use context.session or context.projectPath instead for isolation.
   */
  protected getProjectContext(): ProjectContextManager {
    return getProjectContext();
  }

  /**
   * v5: Resolve project path using session-aware logic.
   *
   * Priority:
   * 1. Explicit path from args (if provided)
   * 2. context.projectPath (set from session or startup)
   * 3. Fallback to global singleton (legacy mode)
   */
  protected resolveProjectPath(args: { projectPath?: string | undefined; directory?: string | undefined }): string {
    // Check for explicit path in args
    if (args.projectPath) {
      return this.context.session?.resolvePath(args.projectPath) ?? args.projectPath;
    }
    if (args.directory) {
      return this.context.session?.resolvePath(args.directory) ?? args.directory;
    }

    // Use session's project path if available
    if (this.context.session) {
      return this.context.session.projectPath;
    }

    // Use context.projectPath (always set in v5+)
    if (this.context.projectPath) {
      return this.context.projectPath;
    }

    // Ultimate fallback: use CWD (no global singleton dependency)
    return process.cwd();
  }

  /**
   * Get storage paths for a project
   */
  protected getProjectStoragePaths(projectPath?: string) {
    const resolved = this.resolveProjectPath({ projectPath });
    return getProjectContext().getStoragePaths(resolved);
  }

  /**
   * Check if project is indexed
   */
  protected isProjectIndexed(projectPath?: string): boolean {
    const resolved = this.resolveProjectPath({ projectPath });
    return getProjectContext().isProjectIndexed(resolved);
  }

  /**
   * v5: Get GraphStorage with project context automatically set.
   * Uses session-aware project resolution.
   */
  protected async ensureGraphStorageForProject(_projectPath?: string): Promise<GraphStorage> {
    // ALS context (set by runWithRequestContext in index.ts) takes priority
    // in graph-adapter.ts getContext(). No need for setProject() or scoped proxy.
    log.d("BASETOOL", "ensure_storage", { hasSession: !!this.context.session });
    return await this.context.getGraphStorage();
  }

  /**
   * v5: Ensure SemanticAgent is initialized for the correct project.
   * Uses session-aware project resolution.
   */
  protected async ensureSemanticAgentForProject(projectPath?: string): Promise<any> {
    const resolved = this.resolveProjectPath({ projectPath });
    const semanticAgent = await this.context.getSemanticAgent();

    // Log current project context
    const vectorStore = semanticAgent?.getVectorStore?.();
    const currentContext = vectorStore?.getProjectContext?.();
    log.d("BASETOOL", "semantic_ctx", {
      resolved,
      hasSession: !!this.context.session,
      ctx: JSON.stringify(currentContext),
    });

    // reinitializeForProject now just changes context, no VectorStore recreation
    if (semanticAgent && typeof semanticAgent.reinitializeForProject === "function") {
      log.d("BASETOOL", "reinit_proj", { resolved });
      await semanticAgent.reinitializeForProject(resolved);

      // Verify context switch happened
      const newContext = semanticAgent.getVectorStore?.()?.getProjectContext?.();
      log.d("BASETOOL", "ctx_switched", { ctx: JSON.stringify(newContext) });
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
   * Strip unpaired UTF-16 surrogates that break JSON serialization.
   * Replaces orphaned \uD800-\uDFFF with U+FFFD (replacement character).
   */
  private static sanitizeUtf(text: string): string {
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: intentional surrogate matching
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
  }

  /**
   * Apply response size limits and truncation if needed
   */
  protected applyResponseLimits(result: ToolResult): ToolResult {
    if (!result.content || result.content.length === 0) {
      return result;
    }

    const newContent = result.content.map((item) => {
      if (item.type !== "text") return item;

      // Sanitize orphaned surrogates before any JSON/size processing
      item = { type: "text", text: BaseToolHandler.sanitizeUtf(item.text) };

      const size = Buffer.byteLength(item.text, "utf8");
      if (size <= this.maxResponseSize) {
        return item;
      }

      // Try to parse as JSON and truncate intelligently
      let newItem: { type: "text"; text: string };

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
          newItem = {
            type: "text" as const,
            text: JSON.stringify(parsed, null, 2),
          };
        } else {
          newItem = { type: "text" as const, text: truncated.text };
        }
      } catch {
        // Not JSON, truncate as plain text
        const truncatedText = item.text.slice(0, this.maxResponseSize);
        newItem = {
          type: "text" as const,
          text: truncatedText + "\n\n[RESPONSE TRUNCATED - original size: " + size + " bytes]",
        };
      }

      // Hard cap: if truncation logic didn't reduce size enough, slice as last resort
      const finalSize = Buffer.byteLength(newItem.text, "utf8");
      if (finalSize > this.maxResponseSize) {
        const sliced = newItem.text.slice(0, this.maxResponseSize - 200);
        return {
          type: "text" as const,
          text:
            sliced +
            "\n\n[RESPONSE TRUNCATED — hard cap at " +
            this.maxResponseSize +
            " bytes. Original: " +
            finalSize +
            " bytes. Use 'offset'/'limit' for pagination.]",
        };
      }

      return newItem;
    });

    return { content: newContent };
  }

  /**
   * Summarize tool args for logging (truncate large values)
   */
  private summarizeArgs(args: unknown): Record<string, unknown> {
    if (!args || typeof args !== "object") return {};
    const summary: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string") {
        summary[key] = value.length > 80 ? value.slice(0, 80) + "..." : value;
      } else if (Array.isArray(value)) {
        summary[key] = `[${value.length}]`;
      } else {
        summary[key] = value;
      }
    }
    return summary;
  }

  /**
   * Calculate response size in bytes
   */
  private responseSize(result: ToolResult): number {
    let size = 0;
    for (const item of result.content) {
      size += item.text.length;
    }
    return size;
  }

  /**
   * Normalize parameter names: accept both snake_case and camelCase.
   * Zig sends snake_case, TS expects camelCase — this bridge ensures MCP compatibility.
   * Converts: entity_name→entityName, file_path→filePath, max_depth→maxDepth, etc.
   */
  private normalizeArgs(args: unknown): unknown {
    if (!args || typeof args !== "object" || Array.isArray(args)) return args;
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      // Convert snake_case to camelCase
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      // Keep both forms: if snake_case key has a camelCase equivalent, set camelCase
      // but also preserve the original snake_case key for schemas that expect it
      if (camelKey !== key) {
        normalized[camelKey] = value; // camelCase version
        normalized[key] = value; // original snake_case preserved for Zig-compat schemas
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  /**
   * Main entry point for tool execution
   */
  async handle(args: unknown): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = this.constructor.name.replace("ToolHandler", "").toLowerCase();

    try {
      const parsedArgs = this.parseArgs(this.normalizeArgs(args));
      const result = await this.execute(parsedArgs);

      // Apply response size limits
      const limitedResult = this.applyResponseLimits(result);

      const duration = Date.now() - startTime;
      const respSize = this.responseSize(limitedResult);
      log.i("BASETOOL", "mcp_response", {
        tool: toolName,
        durationMs: duration,
        respBytes: respSize,
        args: this.summarizeArgs(args),
        reqId: this.context.requestId,
      });

      return limitedResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      log.e("BASETOOL", "exec_failed", {
        tool: toolName,
        durationMs: duration,
        err: (error as Error).message,
        args: this.summarizeArgs(args),
        reqId: this.context.requestId,
      });

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

// createScopedStorage() removed — ALS context via runWithRequestContext()
// makes the scoped Proxy unnecessary. graph-adapter.ts getContext() checks
// AsyncLocalStorage first, so each tool call is automatically scoped.
