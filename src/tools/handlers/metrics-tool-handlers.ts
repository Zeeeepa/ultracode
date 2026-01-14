/**
 * Metrics Tool Handlers
 *
 * Handlers for monitoring and metrics operations:
 * - get_metrics
 * - get_version
 * - get_agent_metrics
 * - get_bus_stats
 * - clear_bus_topic
 */

import { z } from "zod";
import { toError } from "../../utils/error-handling.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// GET METRICS
// =============================================================================

const GetMetricsSchema = z.object({
  includeSystem: z.boolean().optional().default(true),
  includeGraph: z.boolean().optional().default(true),
  includeAgents: z.boolean().optional().default(false),
});

export class GetMetricsToolHandler extends BaseToolHandler<z.infer<typeof GetMetricsSchema>> {
  protected parseArgs(args: unknown) {
    return GetMetricsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetMetricsSchema>): Promise<ToolResult> {
    const metrics: any = {
      timestamp: new Date().toISOString(),
    };

    if (args.includeSystem) {
      const { memoryUsage } = await import("node:process");
      const mem = memoryUsage();

      metrics.system = {
        memory: {
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          external: Math.round(mem.external / 1024 / 1024),
          rss: Math.round(mem.rss / 1024 / 1024),
          unit: "MB",
        },
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
      };
    }

    if (args.includeGraph) {
      try {
        const storage = await this.context.getGraphStorage();
        const stats = await storage.getStatistics();
        metrics.graph = stats;
      } catch {
        metrics.graph = { error: "Graph storage not available" };
      }
    }

    if (args.includeAgents) {
      const conductor = this.context.getConductor();
      metrics.agents = conductor.getAgentMetrics?.() || {};
    }

    return {
      content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
    };
  }
}

// =============================================================================
// GET VERSION
// =============================================================================

const GetVersionSchema = z.object({
  detailed: z.boolean().optional().default(false),
});

export class GetVersionToolHandler extends BaseToolHandler<z.infer<typeof GetVersionSchema>> {
  protected parseArgs(args: unknown) {
    return GetVersionSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetVersionSchema>): Promise<ToolResult> {
    const { readJSON } = await import("../../utils/file-ops.js");
    const { join } = await import("node:path");

    try {
      // Read package.json for version - use resolveProjectPath for directory
      const projectPath = this.resolveProjectPath({});
      const packagePath = join(projectPath, "package.json");
      let version = "unknown";
      let name = "ultrascript-tools-mcp";

      try {
        const pkg = (await readJSON(packagePath)) as { name?: string | undefined; version?: string };
        version = pkg.version || version;
        name = pkg.name || name;
      } catch {
        // Use defaults
      }

      const result: any = {
        name,
        version,
      };

      if (args.detailed) {
        result.details = {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          cwd: process.cwd(),
        };

        // Check available features
        result.features = {
          semanticSearch: true,
          multiLanguage: true,
          branchManagement: !!(await this.context.getBranchManager()),
          snapshots: !!this.context.getSnapshotManager(),
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}

// =============================================================================
// GET AGENT METRICS
// =============================================================================

const GetAgentMetricsSchema = z.object({
  agentType: z.string().optional(),
  includeHistory: z.boolean().optional().default(false),
});

export class GetAgentMetricsToolHandler extends BaseToolHandler<z.infer<typeof GetAgentMetricsSchema>> {
  protected parseArgs(args: unknown) {
    return GetAgentMetricsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetAgentMetricsSchema>): Promise<ToolResult> {
    const conductor = this.context.getConductor();

    const allMetrics = conductor.getAgentMetrics?.() || {};

    let metrics: any;
    if (args.agentType) {
      metrics = allMetrics[args.agentType] || { error: `Agent '${args.agentType}' not found` };
    } else {
      metrics = allMetrics;
    }

    // Add summary
    const summary = {
      totalAgents: Object.keys(allMetrics).length,
      activeAgents: Object.values(allMetrics).filter((m: any) => m.status === "active").length,
      totalTasksProcessed: Object.values(allMetrics).reduce((sum: number, m: any) => sum + (m.tasksProcessed || 0), 0),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              summary,
              agents: metrics,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// GET BUS STATS
// =============================================================================

const GetBusStatsSchema = z.object({
  topic: z.string().optional(),
  includeMessages: z.boolean().optional().default(false),
  messageLimit: z.number().optional().default(10),
});

export class GetBusStatsToolHandler extends BaseToolHandler<z.infer<typeof GetBusStatsSchema>> {
  protected parseArgs(args: unknown) {
    return GetBusStatsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetBusStatsSchema>): Promise<ToolResult> {
    const bus = this.context.getKnowledgeBus();

    if (!bus) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Knowledge bus not available" }) }],
      };
    }

    const stats = bus.getStats?.() || {};

    const result: any = {
      totalTopics: Object.keys(stats.topics || {}).length,
      totalMessages: stats.totalMessages || 0,
      topics: {},
    };

    if (args.topic) {
      result.topics[args.topic] = stats.topics?.[args.topic] || { error: "Topic not found" };
    } else {
      result.topics = stats.topics || {};
    }

    // Add recent messages if requested
    if (args.includeMessages && bus.getRecentMessages) {
      const messages = await bus.getRecentMessages(args.topic, args.messageLimit);
      result.recentMessages = messages;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}

// =============================================================================
// CLEAR BUS TOPIC
// =============================================================================

const ClearBusTopicSchema = z.object({
  topic: z.string(),
  confirm: z.boolean().optional().default(false),
});

export class ClearBusTopicToolHandler extends BaseToolHandler<z.infer<typeof ClearBusTopicSchema>> {
  protected parseArgs(args: unknown) {
    return ClearBusTopicSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ClearBusTopicSchema>): Promise<ToolResult> {
    if (!args.confirm) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              warning: "This will clear all messages in the topic",
              topic: args.topic,
              hint: "Set confirm: true to proceed",
            }),
          },
        ],
      };
    }

    const bus = this.context.getKnowledgeBus();

    if (!bus) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Knowledge bus not available" }) }],
      };
    }

    try {
      const cleared = await bus.clearTopic?.(args.topic);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              topic: args.topic,
              messagesCleared: cleared || 0,
            }),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}

// =============================================================================
// GET WATCHER STATUS - Diagnostic tool to check FileWatcher/GitWatcher status
// =============================================================================

const GetWatcherStatusSchema = z.object({});

export class GetWatcherStatusToolHandler extends BaseToolHandler<z.infer<typeof GetWatcherStatusSchema>> {
  protected parseArgs(args: unknown) {
    return GetWatcherStatusSchema.parse(args);
  }

  protected async execute(_args: z.infer<typeof GetWatcherStatusSchema>): Promise<ToolResult> {
    try {
      const { AgentType } = await import("../../types/agent.js");
      const conductor = this.context.getConductor();

      // Get IndexerAgent to check watcher status
      const indexerAgent = conductor.getAgentByType?.(AgentType.INDEXER) as any;

      const result: any = {
        timestamp: new Date().toISOString(),
        indexerAgentExists: !!indexerAgent,
        fileWatcher: null as any,
        gitWatcher: null as any,
        repositoryPath: null as string | null,
      };

      if (indexerAgent) {
        // Check FileWatcher using public method
        result.fileWatcher = indexerAgent.getFileWatcherStatus?.() ?? { exists: false, reason: "Method not available" };

        // Check GitWatcher
        const gitWatcher = indexerAgent.getGitWatcher?.();
        if (gitWatcher) {
          result.gitWatcher = {
            exists: true,
            isWatching: gitWatcher.isWatching?.() ?? false,
            currentBranch: gitWatcher.getCurrentBranch?.() ?? "unknown",
          };
        } else {
          result.gitWatcher = { exists: false };
        }

        // Check BranchManager
        const branchManager = indexerAgent.getBranchManager?.();
        result.branchManager = { exists: !!branchManager };

        // Check repository path
        result.repositoryPath = indexerAgent.currentRepositoryPath ?? null;

        // Check indexing stats
        result.indexingStats = indexerAgent.getIndexingStats?.() ?? {};
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: err.message,
              stack: err.stack?.split("\n").slice(0, 5),
            }),
          },
        ],
      };
    }
  }
}
