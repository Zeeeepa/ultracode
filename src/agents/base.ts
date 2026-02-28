import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../logging/index.js";
import {
  type Agent,
  type AgentCapabilities,
  type AgentMessage,
  type AgentMetrics,
  AgentStatus,
  type AgentTask,
  type AgentType,
} from "../types/agent.js";
import { type AgentBusyDetails, AgentBusyError } from "../types/errors.js";

interface QueuedTask {
  task: AgentTask;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export abstract class BaseAgent extends EventEmitter implements Agent {
  public readonly id: string;
  public readonly type: AgentType;
  public status: AgentStatus;
  public readonly capabilities: AgentCapabilities;

  protected tasks: AgentTask[] = [];
  protected activeTask: AgentTask | null = null;
  protected metrics: AgentMetrics;
  protected memoryUsage = 0;
  protected cpuUsage = 0;
  private lastRejection: AgentBusyDetails | undefined;

  private waiting: QueuedTask[] = [];
  private draining = false;

  private _ready = false;
  private initGate: Promise<void> | null = null;

  constructor(type: AgentType, capabilities: AgentCapabilities) {
    super();
    this.id = `${type}-${randomUUID().slice(0, 8)}`;
    this.type = type;
    this.status = AgentStatus.IDLE;
    this.capabilities = capabilities;
    this.metrics = {
      agentId: this.id,
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      averageProcessingTime: 0,
      currentMemoryMB: 0,
      currentCpuPercent: 0,
      lastActivity: Date.now(),
    };
  }

  async initialize(): Promise<void> {
    if (this.initGate) return this.initGate;
    if (this._ready) return;

    this.initGate = (async () => {
      try {
        log.d("BASEAGENT", "init_start", { id: this.id });
        this.status = AgentStatus.IDLE;
        await this.onInitialize();
        this._ready = true;
        this.emit("initialized", this.id);
      } finally {
        this.initGate = null;
      }
    })();

    return this.initGate;
  }

  async shutdown(): Promise<void> {
    log.d("BASEAGENT", "shutdown_start", { id: this.id });
    this.status = AgentStatus.SHUTDOWN;
    await this.onShutdown();
    this.emit("shutdown", this.id);
  }

  canHandle(task: AgentTask): boolean {
    this.lastRejection = undefined;

    if (this.type === "indexer") {
      log.t("BASEAGENT", "can_handle_chk", {
        id: task.id,
        type: task.type,
        status: this.status,
        queue: this.tasks.length,
      });
    }

    if (this.status !== AgentStatus.IDLE) {
      if (this.type === "indexer") log.t("BASEAGENT", "reject_not_idle", { status: this.status });
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "not_idle",
        queueLength: this.tasks.length,
        maxQueue: this.capabilities.maxConcurrency,
        retryAfterMs: 200,
      };
      return false;
    }

    if (this.tasks.length >= this.capabilities.maxConcurrency) {
      if (this.type === "indexer")
        log.t("BASEAGENT", "reject_queue_full", { queue: this.tasks.length, max: this.capabilities.maxConcurrency });
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "queue_full",
        queueLength: this.tasks.length,
        maxQueue: this.capabilities.maxConcurrency,
        retryAfterMs: 250,
      };
      return false;
    }

    const canProcess = this.canProcessTask(task);
    if (this.type === "indexer" && !canProcess) log.t("BASEAGENT", "reject_cant_proc");

    if (!canProcess) {
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "unsupported_task",
        queueLength: this.tasks.length,
        maxQueue: this.capabilities.maxConcurrency,
      };
    }

    return canProcess;
  }

  async process(task: AgentTask): Promise<unknown> {
    if (!this.canHandle(task)) {
      const details: AgentBusyDetails = {
        agentId: this.id,
        status: this.status,
        reason: this.lastRejection?.reason ?? "unknown",
        ...(this.lastRejection?.queueLength !== undefined && { queueLength: this.lastRejection.queueLength }),
        ...(this.lastRejection?.maxQueue !== undefined && { maxQueue: this.lastRejection.maxQueue }),
        retryAfterMs: this.lastRejection?.retryAfterMs ?? 300,
        taskId: task.id,
        memoryUsageMB: this.lastRejection?.memoryUsageMB ?? this.memoryUsage,
        memoryLimitMB: this.lastRejection?.memoryLimitMB ?? this.capabilities.memoryLimit,
      };
      throw new AgentBusyError(details);
    }

    return this.runTask(task, true);
  }

  async enqueue(task: AgentTask, maxQueueSize = 1000): Promise<unknown> {
    if (!this.canProcessTask(task)) {
      throw new AgentBusyError({
        agentId: this.id,
        status: this.status,
        reason: "unsupported_task",
        queueLength: this.waiting.length,
        maxQueue: maxQueueSize,
        taskId: task.id,
      });
    }

    if (this.waiting.length >= maxQueueSize) {
      throw new AgentBusyError({
        agentId: this.id,
        status: this.status,
        reason: "queue_full",
        queueLength: this.waiting.length,
        maxQueue: maxQueueSize,
        retryAfterMs: 500,
        taskId: task.id,
      });
    }

    return new Promise((resolve, reject) => {
      this.waiting.push({ task, resolve, reject });
      this.drainQueue();
    });
  }

  waitingCount(): number {
    return this.waiting.length;
  }

  async send(message: AgentMessage): Promise<void> {
    this.emit("message:send", message);
  }

  async receive(message: AgentMessage): Promise<void> {
    this.emit("message:received", message);
    await this.handleMessage(message);
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }
  getCpuUsage(): number {
    return this.cpuUsage;
  }
  getTaskQueue(): AgentTask[] {
    return [...this.tasks];
  }
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract canProcessTask(task: AgentTask): boolean;
  protected abstract processTask(task: AgentTask): Promise<unknown>;
  protected abstract handleMessage(message: AgentMessage): Promise<void>;

  protected startResourceMonitoring(): void {
    /* no-op: disabled for Bun/OpenVINO compat */
  }
  protected stopResourceMonitoring(): void {
    /* no-op */
  }

  private async runTask(task: AgentTask, setIdle: boolean): Promise<unknown> {
    this.tasks.push(task);
    this.status = AgentStatus.BUSY;
    this.activeTask = task;
    task.startedAt = Date.now();

    try {
      const result = await this.processTask(task);
      task.completedAt = Date.now();
      task.result = result;
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.updateAverageProcessingTime(task.completedAt - task.startedAt);
      this.emit("task:completed", { agentId: this.id, task });
      return result;
    } catch (error) {
      task.error = error as Error;
      task.completedAt = Date.now();
      this.metrics.tasksProcessed++;
      this.metrics.tasksFailed++;
      this.emit("task:failed", { agentId: this.id, task, error });
      throw error;
    } finally {
      this.tasks = this.tasks.filter((t) => t.id !== task.id);
      this.activeTask = null;
      this.metrics.lastActivity = Date.now();
      if (setIdle && this.tasks.length === 0) this.status = AgentStatus.IDLE;
      this.lastRejection = undefined;
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.waiting.length > 0) {
        const queued = this.waiting.shift();
        if (!queued) break;
        const { task, resolve, reject } = queued;
        try {
          resolve(await this.runTask(task, false));
        } catch (error) {
          reject(error as Error);
        }
      }
    } finally {
      this.draining = false;
      if (this.tasks.length === 0) this.status = AgentStatus.IDLE;
    }
  }

  private updateAverageProcessingTime(duration: number): void {
    const count = this.metrics.tasksSucceeded;
    this.metrics.averageProcessingTime += (duration - this.metrics.averageProcessingTime) / count;
  }
}
