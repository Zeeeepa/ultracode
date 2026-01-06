/**
 * Coordinator agent for managing multi-agent workflows
 * Implements task distribution, load balancing, and resource management
 */

import { getConfig } from "../config/yaml-config.js";
import { log } from "../logging/index.js";
import {
  type Agent,
  type AgentMessage,
  type AgentPool,
  AgentStatus,
  type AgentTask,
  AgentType,
  type ResourceConstraints,
} from "../types/agent.js";
import { BaseAgent } from "./base.js";

// Event-driven architecture: health monitoring uses setInterval for Node.js, disabled for Bun

/** Check if running in Bun */
function isBunRuntime(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

type EventfulAgent = Agent & {
  on: (event: string, listener: (...args: any[]) => void) => void;
};

export function isEventfulAgent(a: Agent): a is EventfulAgent {
  return typeof (a as any).on === "function";
}

interface CoordinatorConfig {
  resourceConstraints: ResourceConstraints;
  taskQueueLimit: number;
  loadBalancingStrategy: "round-robin" | "least-loaded" | "priority";
  maxConcurrency: number;
  memoryLimit: number;
  priority: number;
}

type CoordinatorConfigOverrides = Partial<Omit<CoordinatorConfig, "resourceConstraints">> & {
  resourceConstraints?: Partial<ResourceConstraints>;
};

const DEFAULT_RESOURCE_CONSTRAINTS: ResourceConstraints = {
  maxMemoryMB: 1024,
  maxCpuPercent: 80,
  maxConcurrentAgents: 10,
  maxTaskQueueSize: 100,
};

const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  resourceConstraints: DEFAULT_RESOURCE_CONSTRAINTS,
  taskQueueLimit: 100,
  loadBalancingStrategy: "least-loaded",
  maxConcurrency: 100,
  memoryLimit: 128,
  priority: 10,
};

function getCoordinatorAgentDefaults(): {
  capabilities: { maxConcurrency: number; memoryLimit: number; priority: number };
  config: CoordinatorConfig;
} {
  const appConfig = getConfig();
  const coordinatorOverrides = (appConfig.coordinator ?? {}) as CoordinatorConfigOverrides;
  const fallbackConcurrentAgents =
    coordinatorOverrides.resourceConstraints?.maxConcurrentAgents ??
    appConfig.mcp.agents?.maxConcurrent ??
    DEFAULT_RESOURCE_CONSTRAINTS.maxConcurrentAgents;

  const resourceConstraints: ResourceConstraints = {
    maxMemoryMB: coordinatorOverrides.resourceConstraints?.maxMemoryMB ?? DEFAULT_RESOURCE_CONSTRAINTS.maxMemoryMB,
    maxCpuPercent:
      coordinatorOverrides.resourceConstraints?.maxCpuPercent ?? DEFAULT_RESOURCE_CONSTRAINTS.maxCpuPercent,
    maxConcurrentAgents: coordinatorOverrides.resourceConstraints?.maxConcurrentAgents ?? fallbackConcurrentAgents,
    maxTaskQueueSize:
      coordinatorOverrides.resourceConstraints?.maxTaskQueueSize ?? DEFAULT_RESOURCE_CONSTRAINTS.maxTaskQueueSize,
  };

  const maxConcurrency = coordinatorOverrides.maxConcurrency ?? DEFAULT_COORDINATOR_CONFIG.maxConcurrency;
  const memoryLimit = coordinatorOverrides.memoryLimit ?? DEFAULT_COORDINATOR_CONFIG.memoryLimit;
  const priority = coordinatorOverrides.priority ?? DEFAULT_COORDINATOR_CONFIG.priority;

  const config: CoordinatorConfig = {
    resourceConstraints,
    taskQueueLimit: coordinatorOverrides.taskQueueLimit ?? DEFAULT_COORDINATOR_CONFIG.taskQueueLimit,
    loadBalancingStrategy:
      coordinatorOverrides.loadBalancingStrategy ?? DEFAULT_COORDINATOR_CONFIG.loadBalancingStrategy,
    maxConcurrency,
    memoryLimit,
    priority,
  };

  return {
    capabilities: { maxConcurrency, memoryLimit, priority },
    config,
  };
}

export class CoordinatorAgent extends BaseAgent implements AgentPool {
  public agents: Map<string, Agent> = new Map();
  private config: CoordinatorConfig;
  private roundRobinIndex: Map<AgentType, number> = new Map();
  private pendingTasks: Map<string, AgentTask> = new Map();
  private healthMonitorRunning = false;
  private stopped = false; // Flag to stop async loops on shutdown
  private readonly HEALTH_CHECK_INTERVAL_MS = 10000;

  constructor(config: CoordinatorConfigOverrides = {}) {
    const defaults = getCoordinatorAgentDefaults();
    const resolvedCapabilities = {
      maxConcurrency: config.maxConcurrency ?? defaults.capabilities.maxConcurrency,
      memoryLimit: config.memoryLimit ?? defaults.capabilities.memoryLimit,
      priority: config.priority ?? defaults.capabilities.priority,
    };
    super(AgentType.COORDINATOR, resolvedCapabilities);

    const resourceConstraints: ResourceConstraints = {
      maxMemoryMB: config.resourceConstraints?.maxMemoryMB ?? defaults.config.resourceConstraints.maxMemoryMB,
      maxCpuPercent: config.resourceConstraints?.maxCpuPercent ?? defaults.config.resourceConstraints.maxCpuPercent,
      maxConcurrentAgents:
        config.resourceConstraints?.maxConcurrentAgents ?? defaults.config.resourceConstraints.maxConcurrentAgents,
      maxTaskQueueSize:
        config.resourceConstraints?.maxTaskQueueSize ?? defaults.config.resourceConstraints.maxTaskQueueSize,
    };

    this.config = {
      resourceConstraints,
      taskQueueLimit: config.taskQueueLimit ?? defaults.config.taskQueueLimit,
      loadBalancingStrategy: config.loadBalancingStrategy ?? defaults.config.loadBalancingStrategy,
      maxConcurrency: resolvedCapabilities.maxConcurrency,
      memoryLimit: resolvedCapabilities.memoryLimit,
      priority: resolvedCapabilities.priority,
    };
  }

  protected async onInitialize(): Promise<void> {
    log.i("COORDINATOR", "init", { ...this.config.resourceConstraints });
    this.startHealthMonitoring();
  }

  protected async onShutdown(): Promise<void> {
    log.i("COORDINATOR", "shutdown_start");

    // Stop all async loops
    this.stopped = true;

    // Clear timer
    if (this.healthMonitorTimer) {
      clearInterval(this.healthMonitorTimer);
      this.healthMonitorTimer = undefined;
    }

    const shutdownPromises = Array.from(this.agents.values()).map((agent) =>
      agent.shutdown().catch((err) => log.e("COORDINATOR", "shutdown_fail", { agent: agent.id, err: String(err) })),
    );
    await Promise.all(shutdownPromises);
    this.agents.clear();
    this.pendingTasks.clear();
  }

  protected canProcessTask(_task: AgentTask): boolean {
    // Coordinator can always accept tasks for routing
    return this.pendingTasks.size < this.config.taskQueueLimit;
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    // Route task to appropriate agent
    const agent = await this.route(task);

    if (!agent) {
      throw new Error(`No available agent for task ${task.id} of type ${task.type}`);
    }

    this.pendingTasks.set(task.id, task);

    try {
      const result = await agent.process(task);
      this.pendingTasks.delete(task.id);
      return result;
    } catch (error) {
      this.pendingTasks.delete(task.id);

      // Try to route to another agent if available
      const alternativeAgent = await this.route(task);
      if (alternativeAgent && alternativeAgent.id !== agent.id) {
        log.d("COORDINATOR", "retry_task", { task: task.id, agent: alternativeAgent.id });
        return alternativeAgent.process(task);
      }

      throw error;
    }
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case "register":
        this.handleAgentRegistration(message);
        break;
      case "health":
        this.handleHealthUpdate(message);
        break;
      case "broadcast":
        await this.broadcast(message);
        break;
      default: {
        // Route to specific agent
        const targetAgent = this.agents.get(message.to);
        if (targetAgent) {
          await targetAgent.receive(message);
        }
      }
    }
  }

  // AgentPool implementation
  register(agent: Agent): void {
    if (this.agents.size >= this.config.resourceConstraints.maxConcurrentAgents) {
      throw new Error(`Maximum number of agents (${this.config.resourceConstraints.maxConcurrentAgents}) reached`);
    }

    this.agents.set(agent.id, agent);
    log.i("COORDINATOR", "agent_registered", { id: agent.id, type: agent.type });

    if (isEventfulAgent(agent)) {
      agent.on("task:completed", this.handleTaskCompleted.bind(this));
      agent.on("task:failed", this.handleTaskFailed.bind(this));
    }
    this.emit("agent:registered", agent.id);
  }

  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      log.i("COORDINATOR", "agent_unregistered", { id: agentId });
      this.emit("agent:unregistered", agentId);
    }
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAgentsByType(type: AgentType): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.type === type);
  }

  getAvailableAgent(type: AgentType): Agent | undefined {
    const agents = this.getAgentsByType(type);
    // Memory limit check disabled - only check status
    const availableAgents = agents.filter((agent) => agent.status === AgentStatus.IDLE);

    if (availableAgents.length === 0) return undefined;

    switch (this.config.loadBalancingStrategy) {
      case "round-robin":
        return this.selectRoundRobin(type, availableAgents);
      case "least-loaded":
        return this.selectLeastLoaded(availableAgents);
      case "priority":
        return this.selectByPriority(availableAgents);
      default:
        return availableAgents[0];
    }
  }

  async broadcast(message: AgentMessage): Promise<void> {
    const promises = Array.from(this.agents.values()).map((agent) =>
      agent.receive(message).catch((err) => log.e("COORDINATOR", "msg_fail", { agent: agent.id, err: String(err) })),
    );
    await Promise.all(promises);
  }

  async route(task: AgentTask): Promise<Agent | undefined> {
    // Determine agent type from task type
    const agentType = this.getAgentTypeForTask(task);
    if (!agentType) return undefined;

    // Check resource constraints
    if (!this.checkResourceAvailability()) {
      log.w("COORDINATOR", "res_exceeded", { task: task.id });
      return undefined;
    }

    return this.getAvailableAgent(agentType);
  }

  // Private methods
  private getAgentTypeForTask(task: AgentTask): AgentType | undefined {
    // Map task types to agent types
    const taskTypeMap: Record<string, AgentType> = {
      parse: AgentType.PARSER,
      index: AgentType.INDEXER,
      query: AgentType.QUERY,
      semantic: AgentType.SEMANTIC,
    };

    return taskTypeMap[task.type];
  }

  private checkResourceAvailability(): boolean {
    let totalMemory = 0;
    let totalCpu = 0;
    for (const agent of this.agents.values()) {
      totalMemory += agent.getMemoryUsage();
      totalCpu += agent.getCpuUsage();
    }

    return (
      totalMemory < this.config.resourceConstraints.maxMemoryMB &&
      totalCpu < this.config.resourceConstraints.maxCpuPercent
    );
  }

  private selectRoundRobin(type: AgentType, agents: Agent[]): Agent {
    const index = this.roundRobinIndex.get(type) || 0;
    const selected = agents[index % agents.length]!;
    this.roundRobinIndex.set(type, index + 1);
    return selected;
  }

  private selectLeastLoaded(agents: Agent[]): Agent {
    return agents.slice(1).reduce((least, agent) => {
      const leastLoad = least.getTaskQueue().length + least.getMemoryUsage() / 100;
      const agentLoad = agent.getTaskQueue().length + agent.getMemoryUsage() / 100;
      return agentLoad < leastLoad ? agent : least;
    }, agents[0]!);
  }

  private selectByPriority(agents: Agent[]): Agent {
    return agents.slice().sort((a, b) => b.capabilities.priority - a.capabilities.priority)[0]!;
  }

  /** Timer handle for Node.js setInterval */
  private healthMonitorTimer?: ReturnType<typeof setInterval> | undefined;

  /**
   * Start health monitoring
   * Event-driven: uses setInterval for Node.js, disabled for Bun (no polling)
   */
  private startHealthMonitoring(): void {
    if (this.healthMonitorRunning) return;
    this.healthMonitorRunning = true;

    // For Node.js: use setInterval (safe)
    // For Bun: skip health monitoring loop to avoid CPU spinning
    if (!isBunRuntime()) {
      this.healthMonitorTimer = setInterval(() => {
        if (!this.stopped) {
          try {
            this.checkAgentHealth();
          } catch (error) {
            log.e("COORDINATOR", "health_err", { err: String(error) });
          }
        }
      }, this.HEALTH_CHECK_INTERVAL_MS);
    }
  }

  private checkAgentHealth(): void {
    for (const [agentId, agent] of this.agents) {
      if (agent.status === AgentStatus.ERROR) {
        log.w("COORDINATOR", "agent_err_state", { agent: agentId });
        this.emit("agent:unhealthy", agentId);
      }
    }
  }

  private handleAgentRegistration(message: AgentMessage): void {
    // Handle dynamic agent registration via messages
    log.d("COORDINATOR", "reg_request", { from: message.from });
  }

  private handleHealthUpdate(message: AgentMessage): void {
    // Handle health updates from agents
    log.d("COORDINATOR", "health_update", { from: message.from });
  }

  private handleTaskCompleted(data: any): void {
    log.d("COORDINATOR", "task_done", { task: data.task.id, agent: data.agentId });
    this.emit("task:routed:completed", data);
  }

  private handleTaskFailed(data: any): void {
    log.e("COORDINATOR", "task_fail", { task: data.task.id, agent: data.agentId, err: data.error });
    this.emit("task:routed:failed", data);
  }
}
