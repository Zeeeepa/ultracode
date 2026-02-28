import { getConfig } from "../config/yaml-config.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { log } from "../logging/index.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import { BaseAgent } from "./base.js";

interface DoraPayload {
  description?: string;
  targetAgent?: string;
  taskId?: string;
  priority?: number;
  target?: string;
  scope?: string;
  [k: string]: unknown;
}

const DORA_DEFAULTS = { maxConcurrency: 2, memoryLimit: 128, priority: 6 } as const;

function buildResponse(taskId: string, key: string, data: Record<string, unknown>) {
  return { status: "completed", taskId, [key]: { ...data, timestamp: Date.now() } };
}

const taskHandlers = new Map<string, (task: AgentTask) => unknown>([
  [
    "research",
    (task) => {
      const p = task.payload as DoraPayload;
      log.d("DORAAGENT", "researching", { desc: p.description || "best practices" });
      const result = buildResponse(task.id, "research", {
        topic: p.description || "general research",
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
      });
      knowledgeBus.publish("research:completed", result, "dora");
      return result;
    },
  ],
  [
    "exploration",
    (task) => {
      const p = task.payload as DoraPayload;
      log.d("DORAAGENT", "exploring", { target: p.target || "patterns" });
      return buildResponse(task.id, "exploration", {
        target: p.target || "codebase",
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
      });
    },
  ],
  [
    "documentation",
    (task) => {
      const p = task.payload as DoraPayload;
      log.d("DORAAGENT", "documenting", { target: p.target || "implementation" });
      return buildResponse(task.id, "documentation", {
        target: p.target || "code",
        sections: [
          { title: "Overview", content: "Documentation for the implemented functionality" },
          { title: "Usage", content: "How to use the implemented features" },
          { title: "API Reference", content: "Detailed API documentation" },
        ],
      });
    },
  ],
  [
    "pattern-discovery",
    (task) => {
      const p = task.payload as DoraPayload;
      log.d("DORAAGENT", "pattern_disc", { scope: p.scope || "codebase" });
      return buildResponse(task.id, "patterns", {
        scope: p.scope || "global",
        discovered: [
          {
            type: "architectural",
            name: "Layered Architecture",
            occurrences: 15,
            description: "Clear separation between layers",
          },
          { type: "design", name: "Factory Pattern", occurrences: 8, description: "Used for object creation" },
          {
            type: "coding",
            name: "Error Handling Pattern",
            occurrences: 23,
            description: "Consistent error handling approach",
          },
        ],
      });
    },
  ],
]);

const SUPPORTED_TYPES = new Set(["research", "exploration", "documentation", "pattern-discovery", "query", "dora"]);

export class DoraAgent extends BaseAgent {
  constructor(_agentId?: string) {
    const cfg = getConfig();
    super(AgentType.DORA, {
      maxConcurrency: cfg.doraAgent?.maxConcurrency ?? DORA_DEFAULTS.maxConcurrency,
      memoryLimit: cfg.doraAgent?.memoryLimit ?? DORA_DEFAULTS.memoryLimit,
      priority: cfg.doraAgent?.priority ?? DORA_DEFAULTS.priority,
    });
  }

  protected async onInitialize(): Promise<void> {
    knowledgeBus.subscribe(this.id, "task:research", async (entry: KnowledgeEntry) => {
      const data = entry.data as DoraPayload;
      if (data?.targetAgent === "dora") {
        await this.process({
          id: data.taskId || `task-${Date.now()}`,
          type: "research",
          priority: data.priority || 5,
          payload: data,
          createdAt: Date.now(),
        });
      }
    });
    log.i("DORAAGENT", "init_done", { id: this.id });
  }

  protected canProcessTask(task: AgentTask): boolean {
    return SUPPORTED_TYPES.has(task.type);
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    log.d("DORAAGENT", "recv_msg", { id: this.id, from: message.from, type: message.type });
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    log.d("DORAAGENT", "proc_task", { id: this.id, type: task.type, taskId: task.id });
    try {
      const handler = taskHandlers.get(task.type);
      if (handler) return handler(task);
      log.d("DORAAGENT", "generic_research", { id: this.id, type: task.type });
      return {
        status: "completed",
        taskId: task.id,
        type: task.type,
        result: { message: `Research completed for ${task.type}`, data: task.payload, timestamp: Date.now() },
      };
    } catch (error) {
      log.e("DORAAGENT", "task_fail", { id: this.id, err: String(error) });
      throw error;
    }
  }

  protected async onShutdown(): Promise<void> {
    log.i("DORAAGENT", "shutdown", { id: this.id });
  }
}
