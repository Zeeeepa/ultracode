import type { AgentStatus } from "./agent.js";

export interface AgentBusyDetails {
  agentId: string;
  status: AgentStatus;
  reason: "not_idle" | "queue_full" | "memory_limit" | "unsupported_task" | "unknown";
  queueLength?: number;
  maxQueue?: number;
  retryAfterMs?: number;
  taskId?: string;
  memoryUsageMB?: number;
  memoryLimitMB?: number;
}

export class AgentBusyError extends Error {
  readonly context: AgentBusyDetails;

  constructor(ctx: AgentBusyDetails, opts?: ErrorOptions) {
    super(`Agent ${ctx.agentId} busy: ${ctx.reason}`, opts);
    this.name = "AgentBusyError";
    this.context = ctx;
  }

  get details(): AgentBusyDetails {
    return this.context;
  }
}
