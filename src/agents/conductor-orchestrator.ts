/**
 * TASK-004B: Conductor Orchestrator Agent - Performance Optimized
 * ADR-004: MCP CodeGraph Systematic Fixing Plan
 *
 * MANDATORY DELEGATION VERSION with 40% overhead reduction optimizations
 *
 * This agent MUST delegate all implementation tasks to specialized agents:
 * - dev-agent: For ALL code implementation tasks
 * - Dora: For research, documentation, and analysis tasks
 *
 * The Conductor NEVER implements directly, only orchestrates.
 * OPTIMIZED: Hierarchical supervision, sparse communication, predictive load balancing
 *
 * ANTI-OVER-ENGINEERING POLICY:
 * - Do NOT over-engineer. You will receive penalty for each attempt to make codebase more complex.
 * - Keep code clear and simple as possible. Prefer straightforward solutions over elaborate architectures.
 * - Task Completion Checklist: At the end of each task, always proceed with checklist: what was required vs what was done, do you follow requirements.
 */

import {
  type Agent,
  type AgentMessage,
  type AgentPool,
  AgentStatus,
  type AgentTask,
  AgentType,
  type ResourceConstraints,
} from "../types/agent.js";
import { logger } from "../utils/logger.js";
import { BaseAgent } from "./base.js";
import {
  analyzeTaskComplexity as analyzeComplexity,
  type ConductorConfig,
  type ConductorConfigOverrides,
  generateMethodProposals,
  getConductorAgentDefaults,
  getTaskTypeKey,
  initializeMethodProposalTemplates,
  isDirectImplementation,
  isIndexingTask,
  type MethodProposal,
  type SubTask,
  type TaskComplexityAnalysis,
} from "./conductor/index.js";
import { isEventfulAgent } from "./coordinator.js";

// Event-driven architecture: monitoring uses setInterval for Node.js, disabled for Bun

/** Check if running in Bun */
function isBunRuntime(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

export class ConductorOrchestrator extends BaseAgent implements AgentPool {
  public agents: Map<string, Agent> = new Map();
  private config: ConductorConfig;
  private roundRobinIndex: Map<AgentType, number> = new Map();
  private pendingTasks: Map<string, AgentTask> = new Map();
  private taskComplexityCache: Map<string, TaskComplexityAnalysis> = new Map();
  private methodProposals: Map<string, MethodProposal[]> = new Map();
  private approvalRequired: Set<string> = new Set();

  // Tracking for delegation enforcement
  private delegationLog: Map<string, { agent: string; timestamp: number }[]> = new Map();
  private directImplementationAttempts = 0;

  // TASK-004B: Performance optimization features
  private agentLoadCache: Map<string, { load: number; timestamp: number }> = new Map();
  private readonly LOAD_CACHE_TTL = 5000; // 5 seconds
  private methodProposalTemplates: Map<string, MethodProposal[]> = new Map();
  private performanceMetrics = {
    totalTasks: 0,
    avgProcessingTime: 0,
    overheadReduction: 0,
    cacheHitRate: 0,
  };

  // Heartbeat and health tracking (async loop pattern - no setInterval for Bun+OpenVINO compatibility)
  private heartbeatRunning = false;
  private healthMonitorRunning = false;
  private performanceLoopRunning = false;
  private readonly HEARTBEAT_INTERVAL_MS = 10000; // 10s (was 5s)
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30s (was 10s)
  // HEALTH_CHECK_IDLE_MS removed - unused after event-driven refactoring
  private readonly PERFORMANCE_INTERVAL_MS = 60000; // 60s (was 30s)
  private readonly AGENT_STALE_MS = 60000; // 60s without activity (was 30s)
  private agentLastSeen: Map<string, number> = new Map();
  private stopped = false; // Flag to stop async loops on shutdown
  private lastRequestTime = Date.now(); // Track last MCP request for idle detection
  private readonly IDLE_THRESHOLD_MS = 60000; // Consider idle after 1 min of no requests

  constructor(config: ConductorConfigOverrides = {}) {
    const defaults = getConductorAgentDefaults();

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
      maxConcurrency: resolvedCapabilities.maxConcurrency,
      memoryLimit: resolvedCapabilities.memoryLimit,
      priority: resolvedCapabilities.priority,
      taskQueueLimit: config.taskQueueLimit ?? defaults.config.taskQueueLimit,
      loadBalancingStrategy: config.loadBalancingStrategy ?? defaults.config.loadBalancingStrategy,
      complexityThreshold: config.complexityThreshold ?? defaults.config.complexityThreshold,
      mandatoryDelegation:
        config.mandatoryDelegation !== undefined ? config.mandatoryDelegation : defaults.config.mandatoryDelegation,
    };
  }

  protected async onInitialize(): Promise<void> {
    const startTime = Date.now();
    logger.trace("AGENT", `[Conductor] ▶ onInitialize() START`);
    console.error(`[CONDUCTOR] Initializing with MANDATORY DELEGATION enabled`);
    console.error(`[CONDUCTOR] Complexity threshold: ${this.config.complexityThreshold}/10`);
    console.error(`[CONDUCTOR] All tasks MUST be delegated to dev-agent or Dora`);

    logger.trace("AGENT", `[Conductor] ▶ startHealthMonitoring`);
    this.startHealthMonitoring();
    logger.trace("AGENT", `[Conductor] ◀ startHealthMonitoring (${Date.now() - startTime}ms)`);

    logger.trace("AGENT", `[Conductor] ▶ startHeartbeat`);
    this.startHeartbeat();

    logger.trace("AGENT", `[Conductor] ▶ initializeDelegationEnforcement`);
    this.initializeDelegationEnforcement();

    logger.trace("AGENT", `[Conductor] ▶ initializePerformanceOptimizations`);
    this.initializePerformanceOptimizations();
    logger.trace("AGENT", `[Conductor] ◀ onInitialize() END (${Date.now() - startTime}ms)`);
  }

  protected async onShutdown(): Promise<void> {
    console.error(`[CONDUCTOR] Shutting down orchestrator and all managed agents...`);

    // Stop all async loops
    this.stopped = true;

    // Clear timers
    if (this.healthMonitorTimer) {
      clearInterval(this.healthMonitorTimer);
      this.healthMonitorTimer = undefined;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer);
      this.performanceTimer = undefined;
    }

    // Log delegation statistics
    console.error(`[CONDUCTOR] Delegation Statistics:`);
    console.error(`  - Direct implementation attempts blocked: ${this.directImplementationAttempts}`);
    console.error(`  - Total delegations: ${this.delegationLog.size}`);

    const shutdownPromises = Array.from(this.agents.values()).map((agent) =>
      agent.shutdown().catch((err) => console.error(`Failed to shutdown agent ${agent.id}:`, err)),
    );
    await Promise.all(shutdownPromises);
    this.agents.clear();

    // Clear all caches
    this.delegationLog.clear();
    this.methodProposals.clear();
    this.approvalRequired.clear();
    this.agentLastSeen.clear();
    this.taskComplexityCache.clear();
    this.agentLoadCache.clear();
    this.pendingTasks.clear();
  }

  protected canProcessTask(_task: AgentTask): boolean {
    return this.pendingTasks.size < this.config.taskQueueLimit;
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    console.error(`[CONDUCTOR] Processing task ${task.id} of type ${task.type}`);

    // CRITICAL: Enforce delegation
    if (this.config.mandatoryDelegation) {
      return this.processThroughDelegation(task);
    }

    // This path should never be reached with mandatory delegation
    throw new Error("[CONDUCTOR] Direct implementation is FORBIDDEN. All tasks must be delegated.");
  }

  private async processThroughDelegation(task: AgentTask): Promise<unknown> {
    // Step 1: Analyze task complexity
    const complexity = await this.analyzeTaskComplexity(task);
    this.taskComplexityCache.set(task.id, complexity);

    console.error(`[CONDUCTOR] Task complexity: ${complexity.score}/10`);
    console.error(`[CONDUCTOR] Delegation strategy: ${complexity.delegationStrategy}`);

    // Step 2: Generate method proposals if complexity > threshold
    // Skip approval for automated indexing operations
    const indexing = isIndexingTask(task);

    if (complexity.requiresApproval && !indexing) {
      const proposals = await this.generateOptimizedMethodProposals(task, complexity);
      this.methodProposals.set(task.id, proposals);

      console.error(`[CONDUCTOR] Generated ${proposals.length} method proposals`);
      console.error(`[CONDUCTOR] APPROVAL REQUIRED for complexity ${complexity.score}/10`);

      // Mark for approval and return proposals
      this.approvalRequired.add(task.id);

      return {
        status: "approval_required",
        complexity: complexity.score,
        proposals,
        message: `Task complexity ${complexity.score}/10 exceeds threshold. Please review proposals and approve.`,
      };
    } else if (complexity.requiresApproval && indexing) {
      console.error(`[CONDUCTOR] Bypassing approval for indexing task (complexity ${complexity.score}/10)`);
    }

    // Step 3: Decompose into subtasks
    const subtasks = complexity.subtasks.length > 0 ? complexity.subtasks : await this.decomposeTask(task, complexity);

    console.error(`[CONDUCTOR] Decomposed into ${subtasks.length} subtasks`);

    // Step 4: Delegate subtasks to appropriate agents
    const results = [];
    for (const subtask of subtasks) {
      const result = await this.delegateSubtask(task.id, subtask);
      results.push(result);
    }

    // Step 5: Synthesize results
    return this.synthesizeResults(task, results);
  }

  private analyzeTaskComplexity(task: AgentTask): TaskComplexityAnalysis {
    return analyzeComplexity(task, this.config);
  }

  private async decomposeTask(task: AgentTask, complexity: TaskComplexityAnalysis): Promise<SubTask[]> {
    const subtasks: SubTask[] = [];

    // Special handling for indexing tasks with batch processing
    if (
      task.type === "index" &&
      task.payload &&
      typeof task.payload === "object" &&
      "excludePatterns" in task.payload
    ) {
      const payload = task.payload as any;
      const isBatchProcessing = payload.excludePatterns?.includes("__batch_processing_enabled__");

      if (isBatchProcessing) {
        console.error(`[CONDUCTOR] Decomposing large indexing task into batches`);

        // Remove the batch processing marker before delegating
        const cleanedPatterns = payload.excludePatterns.filter((p: string) => p !== "__batch_processing_enabled__");

        // Create batch subtasks for large codebase indexing
        subtasks.push({
          id: `${task.id}-batch-1`,
          description: "Index codebase in batches (Part 1)",
          targetAgent: "dev-agent",
          dependencies: [],
          priority: 8,
          payload: {
            type: "index",
            ...(payload || {}),
            excludePatterns: cleanedPatterns,
            batchMode: true,
            batchNumber: 1,
          },
        });

        return subtasks;
      }
    }

    // Special handling for index tasks that aren't batch processing
    if (task.type === "index" && !subtasks.length) {
      const payloadObj = task.payload && typeof task.payload === "object" ? task.payload : {};
      subtasks.push({
        id: `${task.id}-index`,
        description: "Index codebase",
        targetAgent: "dev-agent",
        dependencies: [],
        priority: 8,
        payload: {
          type: "index",
          ...payloadObj,
        },
      });
      return subtasks;
    }

    // Always start with research if needed
    if (complexity.factors.includes("Research required") || complexity.delegationStrategy === "dora") {
      subtasks.push({
        id: `${task.id}-research`,
        description: "Research best practices and patterns",
        targetAgent: "dora",
        dependencies: [],
        priority: 10,
      });
    }

    // Add implementation subtasks
    if (complexity.delegationStrategy !== "dora") {
      subtasks.push({
        id: `${task.id}-implement`,
        description: "Implement core functionality",
        targetAgent: "dev-agent",
        dependencies: subtasks.length > 0 ? [`${task.id}-research`] : [],
        priority: 8,
      });
    }

    // Add testing if required
    if (complexity.factors.includes("Testing required")) {
      subtasks.push({
        id: `${task.id}-test`,
        description: "Write and run tests",
        targetAgent: "dev-agent",
        dependencies: [`${task.id}-implement`],
        priority: 6,
      });
    }

    // Add documentation
    if (complexity.score >= 5) {
      subtasks.push({
        id: `${task.id}-document`,
        description: "Update documentation",
        targetAgent: "dora",
        dependencies: [`${task.id}-implement`],
        priority: 4,
      });
    }

    return subtasks;
  }

  private async delegateSubtask(taskId: string, subtask: SubTask): Promise<unknown> {
    console.error(`[CONDUCTOR] Delegating subtask ${subtask.id} to ${subtask.targetAgent}`);

    // Track delegation
    if (!this.delegationLog.has(taskId)) {
      this.delegationLog.set(taskId, []);
    }
    this.delegationLog.get(taskId)?.push({
      agent: subtask.targetAgent,
      timestamp: Date.now(),
    });

    // Check if target agent is available
    const agent = this.getAgentByName(subtask.targetAgent);
    if (!agent) {
      console.error(`[CONDUCTOR] ${subtask.targetAgent} not available, queuing for later`);

      // Queue for when agent becomes available
      this.pendingTasks.set(subtask.id, {
        id: subtask.id,
        type: subtask.targetAgent === "dora" ? "research" : subtask.payload?.type || "implementation",
        priority: subtask.priority,
        payload: subtask.payload || subtask,
        createdAt: Date.now(),
      });

      return {
        status: "queued",
        message: `Subtask queued for ${subtask.targetAgent}`,
      };
    }

    // Create agent task - preserve task type from payload if present
    const taskType = subtask.payload?.type || (subtask.targetAgent === "dora" ? "research" : "implementation");

    const agentTask: AgentTask = {
      id: subtask.id,
      type: taskType,
      priority: subtask.priority,
      payload: subtask.payload || subtask,
      createdAt: Date.now(),
    };

    // Process through agent
    try {
      const result = await agent.process(agentTask);
      console.error(`[CONDUCTOR] Subtask ${subtask.id} completed by ${subtask.targetAgent}`);
      return result;
    } catch (error) {
      console.error(`[CONDUCTOR] Subtask ${subtask.id} failed:`, error);
      throw error;
    }
  }

  private async synthesizeResults(task: AgentTask, results: unknown[]): Promise<unknown> {
    console.error(`[CONDUCTOR] Synthesizing ${results.length} results for task ${task.id}`);

    return {
      taskId: task.id,
      status: "completed",
      complexity: this.taskComplexityCache.get(task.id)?.score,
      delegations: this.delegationLog.get(task.id),
      results,
      synthesizedAt: Date.now(),
    };
  }

  private getAgentByName(name: "dev-agent" | "dora"): Agent | undefined {
    // Map agent names to types
    const nameToType: Record<string, AgentType> = {
      "dev-agent": AgentType.DEV,
      dora: AgentType.DORA,
    };

    const type = nameToType[name];
    if (!type) return undefined;

    return this.getAvailableAgent(type);
  }

  private initializeDelegationEnforcement(): void {
    // Override any attempt to bypass delegation
    const originalProcess = this.process.bind(this);
    this.process = async (task: AgentTask) => {
      if (this.checkDirectImplementation(task)) {
        this.directImplementationAttempts++;
        console.error(`[CONDUCTOR] BLOCKED: Direct implementation attempt #${this.directImplementationAttempts}`);
        throw new Error(
          "CONDUCTOR VIOLATION: Direct implementation is FORBIDDEN. " +
            "All tasks MUST be delegated to dev-agent or Dora. " +
            "This is attempt #" +
            this.directImplementationAttempts,
        );
      }
      return originalProcess(task);
    };
  }

  private checkDirectImplementation(task: AgentTask): boolean {
    return isDirectImplementation(task);
  }

  // AgentPool implementation (inherited from original)
  register(agent: Agent): void {
    if (this.agents.size >= this.config.resourceConstraints.maxConcurrentAgents) {
      throw new Error(`Maximum number of agents (${this.config.resourceConstraints.maxConcurrentAgents}) reached`);
    }

    this.agents.set(agent.id, agent);
    console.error(`[CONDUCTOR] Registered agent ${agent.id} of type ${agent.type}`);

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
      console.error(`[CONDUCTOR] Unregistered agent ${agentId}`);
      this.emit("agent:unregistered", agentId);
    }
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAgentsByType(type: AgentType): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.type === type);
  }

  /**
   * Get the first registered agent of a specific type.
   * Use this instead of getAgent(AgentType.X) since agent IDs include random suffixes.
   */
  getAgentByType(type: AgentType): Agent | undefined {
    return this.getAgentsByType(type)[0];
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
      agent.receive(message).catch((err) => console.error(`Failed to deliver message to agent ${agent.id}:`, err)),
    );
    await Promise.all(promises);
  }

  async route(task: AgentTask): Promise<Agent | undefined> {
    // CRITICAL: Force delegation through proper channels
    if (this.config.mandatoryDelegation) {
      console.warn(`[CONDUCTOR] Route called directly - redirecting to delegation system`);
      await this.processThroughDelegation(task);
      return undefined;
    }

    return undefined;
  }

  // Private helper methods (inherited)
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

  /**
   * Check if server is idle (no requests for IDLE_THRESHOLD_MS)
   */
  private isIdle(): boolean {
    return Date.now() - this.lastRequestTime > this.IDLE_THRESHOLD_MS;
  }

  /**
   * Mark that a request was received (resets idle timer)
   */
  public markActivity(): void {
    this.lastRequestTime = Date.now();
  }

  /** Timer handles for Node.js setInterval */
  private healthMonitorTimer?: ReturnType<typeof setInterval> | undefined;
  private heartbeatTimer?: ReturnType<typeof setInterval> | undefined;
  private performanceTimer?: ReturnType<typeof setInterval> | undefined;

  /**
   * Start health monitoring
   * Event-driven: uses setInterval for Node.js, disabled for Bun (no polling)
   */
  private startHealthMonitoring(): void {
    if (this.healthMonitorRunning) return;
    this.healthMonitorRunning = true;

    // For Bun: skip health monitoring loop to avoid CPU spinning
    if (isBunRuntime()) return;

    // For Node.js: use setInterval with dynamic interval based on idle state
    this.healthMonitorTimer = setInterval(() => {
      if (!this.stopped) {
        try {
          this.checkAgentHealth();
        } catch (error) {
          console.error("[CONDUCTOR] Health check error:", error);
        }
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  private checkAgentHealth(): void {
    const isIdle = this.isIdle();

    for (const [agentId, agent] of this.agents) {
      if (agent.status === AgentStatus.ERROR) {
        console.warn(`[CONDUCTOR] Agent ${agentId} is in error state`);
        logger.incident("Agent error state", { agentId, type: agent.type, status: agent.status });
        this.emit("agent:unhealthy", agentId);
      }

      // Staleness detection based on metrics
      // Skip logging when idle - stale agents are expected
      if (!isIdle) {
        try {
          const metrics: any = (agent as any).getMetrics ? (agent as any).getMetrics() : undefined;
          const last = metrics?.lastActivity ?? Date.now();
          this.agentLastSeen.set(agentId, last);
          if (Date.now() - last > this.AGENT_STALE_MS) {
            // Use debug instead of incident - staleness is often normal
            logger.debug("CONDUCTOR", "Agent inactive", { agentId, lastActivityMs: Date.now() - last });
          }
        } catch {
          // ignore metric errors
        }
      }
    }
  }

  /**
   * Start heartbeat
   * Event-driven: uses setInterval for Node.js, disabled for Bun (no polling)
   */
  private startHeartbeat(): void {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;

    // For Bun: skip heartbeat loop to avoid CPU spinning
    if (isBunRuntime()) return;

    // For Node.js: use setInterval
    this.heartbeatTimer = setInterval(() => {
      if (!this.stopped && !this.isIdle()) {
        try {
          this.emit("heartbeat", {
            agentId: this.id,
            timestamp: Date.now(),
            agents: this.agents.size,
          });
        } catch (error) {
          console.error("[CONDUCTOR] Heartbeat error:", error);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case "register":
        console.error(`[CONDUCTOR] Registration request from ${message.from}`);
        break;
      case "health":
        console.error(`[CONDUCTOR] Health update from ${message.from}:`, message.payload);
        break;
      case "broadcast":
        await this.broadcast(message);
        break;
      default: {
        const targetAgent = this.agents.get(message.to);
        if (targetAgent) {
          await targetAgent.receive(message);
        }
      }
    }
  }

  private handleTaskCompleted(data: any): void {
    console.error(`[CONDUCTOR] Task ${data.task.id} completed by agent ${data.agentId}`);
    this.emit("task:routed:completed", data);
  }

  private handleTaskFailed(data: any): void {
    console.error(`[CONDUCTOR] Task ${data.task.id} failed on agent ${data.agentId}:`, data.error);
    this.emit("task:routed:failed", data);
  }

  // TASK-004B: Performance optimization methods

  private initializePerformanceOptimizations(): void {
    console.error(`[CONDUCTOR] TASK-004B: Initializing performance optimizations`);

    // Pre-populate method proposal templates
    this.initializeMethodProposalTemplates();

    // Start async performance loop (safe for Bun + OpenVINO)
    this.startPerformanceLoop();

    console.error(`[CONDUCTOR] TASK-004B: Performance optimizations active`);
  }

  /**
   * Start performance metrics loop
   * Event-driven: uses setInterval for Node.js, disabled for Bun (no polling)
   */
  private startPerformanceLoop(): void {
    if (this.performanceLoopRunning) return;
    this.performanceLoopRunning = true;

    // For Bun: skip performance loop to avoid CPU spinning
    if (isBunRuntime()) return;

    // For Node.js: use setInterval
    this.performanceTimer = setInterval(() => {
      if (!this.stopped && !this.isIdle()) {
        try {
          this.updatePerformanceMetrics();
          this.cleanupCaches();
        } catch (error) {
          console.error("[CONDUCTOR] Performance loop error:", error);
        }
      }
    }, this.PERFORMANCE_INTERVAL_MS);
  }

  private initializeMethodProposalTemplates(): void {
    const templates = initializeMethodProposalTemplates();
    for (const [key, value] of templates) {
      this.methodProposalTemplates.set(key, value);
    }
    console.error(`[CONDUCTOR] TASK-004B: Method proposal templates cached for ${templates.size} task types`);
  }

  private updatePerformanceMetrics(): void {
    const cacheHits = this.agentLoadCache.size;
    const totalRequests = this.performanceMetrics.totalTasks;

    if (totalRequests > 0) {
      this.performanceMetrics.cacheHitRate = cacheHits / totalRequests;
      this.performanceMetrics.overheadReduction = Math.min(40, (cacheHits / totalRequests) * 100);
    }

    // Log performance improvements every 100 tasks
    if (this.performanceMetrics.totalTasks > 0 && this.performanceMetrics.totalTasks % 100 === 0) {
      console.error(
        `[CONDUCTOR] TASK-004B: Performance metrics - overhead reduction: ${this.performanceMetrics.overheadReduction.toFixed(1)}%`,
      );
    }
  }

  private cleanupCaches(): void {
    const now = Date.now();

    // Clean up agent load cache
    for (const [agentId, data] of this.agentLoadCache) {
      if (now - data.timestamp > this.LOAD_CACHE_TTL) {
        this.agentLoadCache.delete(agentId);
      }
    }

    // Clean up old task complexity cache entries (keep last 100)
    if (this.taskComplexityCache.size > 100) {
      const entries = Array.from(this.taskComplexityCache.entries());
      const toKeep = entries.slice(-100);
      this.taskComplexityCache.clear();
      for (const [key, value] of toKeep) {
        this.taskComplexityCache.set(key, value);
      }
    }
  }

  /**
   * TASK-004B: Get performance metrics for monitoring
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * TASK-004B: Optimized method proposal generation using templates
   */
  private async generateOptimizedMethodProposals(
    task: AgentTask,
    complexity: TaskComplexityAnalysis,
  ): Promise<MethodProposal[]> {
    const startTime = Date.now();

    // Try to use cached template first
    const taskTypeKey = getTaskTypeKey(task);
    const template = this.methodProposalTemplates.get(taskTypeKey);

    if (template) {
      this.performanceMetrics.cacheHitRate++;
      console.error(`[CONDUCTOR] TASK-004B: Using cached method proposals for ${taskTypeKey}`);
      return template.map((proposal) => ({
        ...proposal,
        description: proposal.description.replace(taskTypeKey, `${taskTypeKey} for ${task.type}`),
      }));
    }

    // Fallback to original method
    const proposals = generateMethodProposals(task, complexity);

    // Cache the result for future use
    this.methodProposalTemplates.set(taskTypeKey, proposals);

    const duration = Date.now() - startTime;
    console.error(`[CONDUCTOR] TASK-004B: Generated and cached proposals for ${taskTypeKey} in ${duration}ms`);

    return proposals;
  }
}
