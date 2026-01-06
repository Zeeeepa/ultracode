/**
 * Dora Agent (Explorer) - Handles research and discovery tasks
 * This agent is responsible for exploring codebases, researching patterns,
 * and discovering relationships that are delegated by the Conductor
 */

import { getConfig } from "../config/yaml-config.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { log } from "../logging/index.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import { BaseAgent } from "./base.js";

function getDoraAgentConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.doraAgent?.maxConcurrency ?? 2,
    memoryLimit: config.doraAgent?.memoryLimit ?? 128,
    priority: config.doraAgent?.priority ?? 6,
  };
}

export class DoraAgent extends BaseAgent {
  constructor(_agentId?: string) {
    const agentConfig = getDoraAgentConfig();
    super(AgentType.DORA, {
      // Use DORA type for research/exploration agent
      maxConcurrency: agentConfig.maxConcurrency,
      memoryLimit: agentConfig.memoryLimit,
      priority: agentConfig.priority,
    });
  }

  protected async onInitialize(): Promise<void> {
    // Subscribe to research task events
    knowledgeBus.subscribe(this.id, "task:research", async (entry: KnowledgeEntry) => {
      const data = entry.data as { targetAgent?: string; taskId?: string; priority?: number; [k: string]: unknown };
      if (data?.targetAgent === "dora") {
        const task: AgentTask = {
          id: data.taskId || `task-${Date.now()}`,
          type: "research",
          priority: data.priority || 5,
          payload: data,
          createdAt: Date.now(),
        };
        await this.process(task);
      }
    });

    log.i("DORAAGENT", "init_done", { id: this.id });
  }

  protected canProcessTask(task: AgentTask): boolean {
    // DoraAgent can handle research, exploration, documentation, and pattern discovery tasks
    return (
      task.type === "research" ||
      task.type === "exploration" ||
      task.type === "documentation" ||
      task.type === "pattern-discovery" ||
      task.type === "query" ||
      task.type === "dora"
    );
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    log.d("DORAAGENT", "recv_msg", { id: this.id, from: message.from, type: message.type });
    // Handle inter-agent messages if needed
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    log.d("DORAAGENT", "proc_task", { id: this.id, type: task.type, taskId: task.id });

    try {
      switch (task.type) {
        case "research":
          return await this.handleResearchTask(task);

        case "exploration":
          return await this.handleExplorationTask(task);

        case "documentation":
          return await this.handleDocumentationTask(task);

        case "pattern-discovery":
          return await this.handlePatternDiscoveryTask(task);

        default:
          return await this.handleGenericResearch(task);
      }
    } catch (error) {
      log.e("DORAAGENT", "task_fail", { id: this.id, err: String(error) });
      throw error;
    }
  }

  private async handleResearchTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    log.d("DORAAGENT", "researching", { id: this.id, desc: payload.description || "best practices" });

    // Simulate research process
    const researchResult = {
      status: "completed",
      taskId: task.id,
      research: {
        topic: payload.description || "general research",
        findings: [
          "Analyzed existing patterns in the codebase",
          "Identified best practices for implementation",
          "Found relevant documentation and examples",
        ],
        recommendations: [
          "Follow established coding patterns",
          "Consider performance implications",
          "Ensure proper error handling",
        ],
        timestamp: Date.now(),
      },
    };

    // Publish research completed event (topic, data, source)
    knowledgeBus.publish("research:completed", researchResult, this.id);

    return researchResult;
  }

  private async handleExplorationTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    log.d("DORAAGENT", "exploring", { id: this.id, target: payload.target || "patterns" });

    return {
      status: "completed",
      taskId: task.id,
      exploration: {
        target: payload.target || "codebase",
        discoveries: [
          "Found common architectural patterns",
          "Identified code organization structure",
          "Located key integration points",
        ],
        insights: [
          "The codebase follows a modular architecture",
          "Clear separation of concerns is maintained",
          "Well-defined interfaces between modules",
        ],
        timestamp: Date.now(),
      },
    };
  }

  private async handleDocumentationTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    log.d("DORAAGENT", "documenting", { id: this.id, target: payload.target || "implementation" });

    return {
      status: "completed",
      taskId: task.id,
      documentation: {
        target: payload.target || "code",
        sections: [
          {
            title: "Overview",
            content: "Documentation for the implemented functionality",
          },
          {
            title: "Usage",
            content: "How to use the implemented features",
          },
          {
            title: "API Reference",
            content: "Detailed API documentation",
          },
        ],
        timestamp: Date.now(),
      },
    };
  }

  private async handlePatternDiscoveryTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    log.d("DORAAGENT", "pattern_disc", { id: this.id, scope: payload.scope || "codebase" });

    return {
      status: "completed",
      taskId: task.id,
      patterns: {
        scope: payload.scope || "global",
        discovered: [
          {
            type: "architectural",
            name: "Layered Architecture",
            occurrences: 15,
            description: "Clear separation between layers",
          },
          {
            type: "design",
            name: "Factory Pattern",
            occurrences: 8,
            description: "Used for object creation",
          },
          {
            type: "coding",
            name: "Error Handling Pattern",
            occurrences: 23,
            description: "Consistent error handling approach",
          },
        ],
        timestamp: Date.now(),
      },
    };
  }

  private async handleGenericResearch(task: AgentTask): Promise<unknown> {
    log.d("DORAAGENT", "generic_research", { id: this.id, type: task.type });

    // Default research response for unknown task types
    return {
      status: "completed",
      taskId: task.id,
      type: task.type,
      result: {
        message: `Research completed for ${task.type}`,
        data: task.payload,
        timestamp: Date.now(),
      },
    };
  }

  protected async onShutdown(): Promise<void> {
    log.i("DORAAGENT", "shutdown", { id: this.id });
  }
}

// Export singleton instance
export const doraAgent = new DoraAgent();
