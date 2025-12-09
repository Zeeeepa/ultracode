/**
 * Base agent implementation with resource management
 * Provides common functionality for all specialized agents
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
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

// Task with resolver for queue-based processing
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

  protected taskQueue: AgentTask[] = [];
  protected currentTask: AgentTask | null = null;
  protected metrics: AgentMetrics;
  protected memoryUsage = 0;
  protected cpuUsage = 0;
  private lastRejection: AgentBusyDetails | undefined;

  // Queue for async task processing
  private pendingQueue: QueuedTask[] = [];
  private isProcessingQueue = false;

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

    this.startResourceMonitoring();
  }

  async initialize(): Promise<void> {
    console.error(`[${this.id}] Initializing agent...`);
    this.status = AgentStatus.IDLE;
    await this.onInitialize();
    this.emit("initialized", this.id);
  }

  async shutdown(): Promise<void> {
    console.error(`[${this.id}] Shutting down agent...`);
    this.status = AgentStatus.SHUTDOWN;
    await this.onShutdown();
    // Clear resource monitor if set
    if (this._resourceMonitorInterval !== undefined) {
      clearInterval(this._resourceMonitorInterval);
      this._resourceMonitorInterval = undefined;
    }
    this.emit("shutdown", this.id);
  }

  canHandle(task: AgentTask): boolean {
    this.lastRejection = undefined;
    // Debug logging for indexer agent issues
    if (this.type === "indexer") {
      console.error(`[${this.id}] canHandle check:`, {
        taskId: task.id,
        taskType: task.type,
        status: this.status,
        queueLength: this.taskQueue.length,
        maxConcurrency: this.capabilities.maxConcurrency,
        memoryUsage: this.memoryUsage,
        memoryLimit: this.capabilities.memoryLimit,
        memoryUsagePercent: (this.memoryUsage / this.capabilities.memoryLimit) * 100,
      });
    }

    if (this.status !== AgentStatus.IDLE) {
      if (this.type === "indexer") {
        console.error(`[${this.id}] Rejected: not idle (status: ${this.status})`);
      }
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "not_idle",
        queueLength: this.taskQueue.length,
        maxQueue: this.capabilities.maxConcurrency,
        retryAfterMs: 200,
      };
      return false;
    }
    if (this.taskQueue.length >= this.capabilities.maxConcurrency) {
      if (this.type === "indexer") {
        console.error(
          `[${this.id}] Rejected: queue full (${this.taskQueue.length}/${this.capabilities.maxConcurrency})`,
        );
      }
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "queue_full",
        queueLength: this.taskQueue.length,
        maxQueue: this.capabilities.maxConcurrency,
        retryAfterMs: 250,
      };
      return false;
    }
    // Memory limit check disabled - let OS handle memory management
    // if (this.memoryUsage > this.capabilities.memoryLimit * 0.9) { ... }

    const canProcess = this.canProcessTask(task);
    if (this.type === "indexer" && !canProcess) {
      console.error(`[${this.id}] Rejected: canProcessTask returned false`);
    }

    if (!canProcess) {
      this.lastRejection = {
        agentId: this.id,
        status: this.status,
        reason: "unsupported_task",
        queueLength: this.taskQueue.length,
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
        queueLength: this.lastRejection?.queueLength,
        maxQueue: this.lastRejection?.maxQueue,
        retryAfterMs: this.lastRejection?.retryAfterMs ?? 300,
        taskId: task.id,
        memoryUsageMB: this.lastRejection?.memoryUsageMB ?? this.memoryUsage,
        memoryLimitMB: this.lastRejection?.memoryLimitMB ?? this.capabilities.memoryLimit,
      };

      throw new AgentBusyError(details);
    }

    this.taskQueue.push(task);
    this.status = AgentStatus.BUSY;
    this.currentTask = task;
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
      this.taskQueue = this.taskQueue.filter((t) => t.id !== task.id);
      this.currentTask = null;

      if (this.taskQueue.length === 0) {
        this.status = AgentStatus.IDLE;
      }

      this.metrics.lastActivity = Date.now();
      this.lastRejection = undefined;
    }
  }

  /**
   * Enqueue a task for processing. Returns a Promise that resolves when the task completes.
   * Unlike process(), this method accepts tasks even when the agent is busy,
   * queuing them for later execution. This enables efficient parallel task submission.
   *
   * @param task - The task to enqueue
   * @param maxQueueSize - Maximum queue size before rejecting (default: 1000)
   * @returns Promise that resolves with the task result
   */
  async enqueue(task: AgentTask, maxQueueSize = 1000): Promise<unknown> {
    // Check if task type is supported
    if (!this.canProcessTask(task)) {
      throw new AgentBusyError({
        agentId: this.id,
        status: this.status,
        reason: "unsupported_task",
        queueLength: this.pendingQueue.length,
        maxQueue: maxQueueSize,
        taskId: task.id,
      });
    }

    // Reject if queue is too large (backpressure)
    if (this.pendingQueue.length >= maxQueueSize) {
      throw new AgentBusyError({
        agentId: this.id,
        status: this.status,
        reason: "queue_full",
        queueLength: this.pendingQueue.length,
        maxQueue: maxQueueSize,
        retryAfterMs: 500,
        taskId: task.id,
      });
    }

    // Create a promise that will be resolved when the task completes
    return new Promise((resolve, reject) => {
      this.pendingQueue.push({ task, resolve, reject });
      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Process tasks from the pending queue one by one
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent queue processing
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.pendingQueue.length > 0) {
        const queued = this.pendingQueue.shift();
        if (!queued) break;

        const { task, resolve, reject } = queued;

        try {
          // Process task directly (bypass canHandle since we already checked canProcessTask)
          this.taskQueue.push(task);
          this.status = AgentStatus.BUSY;
          this.currentTask = task;
          task.startedAt = Date.now();

          const result = await this.processTask(task);
          task.completedAt = Date.now();
          task.result = result;

          this.metrics.tasksProcessed++;
          this.metrics.tasksSucceeded++;
          this.updateAverageProcessingTime(task.completedAt - task.startedAt);

          this.emit("task:completed", { agentId: this.id, task });
          resolve(result);
        } catch (error) {
          task.error = error as Error;
          task.completedAt = Date.now();

          this.metrics.tasksProcessed++;
          this.metrics.tasksFailed++;

          this.emit("task:failed", { agentId: this.id, task, error });
          reject(error as Error);
        } finally {
          this.taskQueue = this.taskQueue.filter((t) => t.id !== task.id);
          this.currentTask = null;
          this.metrics.lastActivity = Date.now();
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.taskQueue.length === 0) {
        this.status = AgentStatus.IDLE;
      }
    }
  }

  /**
   * Get the current pending queue length
   */
  getPendingQueueLength(): number {
    return this.pendingQueue.length;
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
    return [...this.taskQueue];
  }

  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  // Abstract methods for subclasses to implement
  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract canProcessTask(task: AgentTask): boolean;
  protected abstract processTask(task: AgentTask): Promise<unknown>;
  protected abstract handleMessage(message: AgentMessage): Promise<void>;

  // Resource monitoring
  private _resourceMonitorInterval?: ReturnType<typeof setInterval>;

  private startResourceMonitoring(): void {
    this._resourceMonitorInterval = setInterval(() => {
      this.updateResourceUsage();
    }, 1000); // Update every second
  }

  private updateResourceUsage(): void {
    // Simplified resource tracking - in production would use actual process metrics
    const memUsed = process.memoryUsage();
    this.memoryUsage = Math.round(memUsed.heapUsed / 1024 / 1024);
    this.metrics.currentMemoryMB = this.memoryUsage;

    // CPU usage would require more sophisticated tracking
    // For now, estimate based on task processing
    this.cpuUsage = this.status === AgentStatus.BUSY ? 50 : 5;
    this.metrics.currentCpuPercent = this.cpuUsage;
  }

  private updateAverageProcessingTime(duration: number): void {
    const prev = this.metrics.averageProcessingTime;
    const count = this.metrics.tasksSucceeded;
    this.metrics.averageProcessingTime = (prev * (count - 1) + duration) / count;
  }
}
