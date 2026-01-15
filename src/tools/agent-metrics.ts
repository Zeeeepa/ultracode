import type { ConductorOrchestrator } from "../agents/conductor-orchestrator.js";
import type { KnowledgeBus } from "../core/knowledge-bus.js";
import type { ResourceManager } from "../core/resource-manager.js";
import type { Agent, AgentMetrics, AgentStatus, AgentType, ResourceConstraints } from "../types/agent.js";

/**
 * Extended interface for Agent with optional runtime methods
 */
interface AgentWithMetrics extends Agent {
  currentTask?: {
    type: string;
    [key: string]: unknown;
  };
}

/**
 * Performance metrics from Conductor
 */
interface ConductorPerformanceMetrics {
  totalTasks?: number;
  avgProcessingTime?: number;
  overheadReduction?: number;
  cacheHitRate?: number;
}

/**
 * Extended interface for ConductorOrchestrator with internal state
 * Note: Accessing private properties via type assertion (runtime hack)
 */
interface ConductorInternalAccess {
  agents: Map<string, Agent>;
  getPerformanceMetrics?(): ConductorPerformanceMetrics;
  pendingTasks?: Map<string, unknown> | Set<unknown>;
  approvalRequired?: Map<string, unknown> | Set<unknown>;
  directImplementationAttempts?: number;
}

interface AgentSummary {
  id: string;
  type: AgentType;
  status: AgentStatus;
  queueLength: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  capabilities: {
    maxConcurrency: number;
    memoryLimitMB: number;
    priority: number;
  };
  metrics: AgentMetrics;
  currentTaskType?: string;
  lastActivity: number;
}

interface ResourceSummary {
  throttled: boolean;
  constraints: ResourceConstraints;
  currentUsage?: ReturnType<ResourceManager["getCurrentUsage"]>;
}

interface KnowledgeBusSummary {
  topicCount: number;
  entryCount: number;
  subscriptionCount: number;
  messageQueueSize: number;
}

export interface AgentMetricsSnapshot {
  timestamp: string;
  conductor: {
    registeredAgents: number;
    totalTasks: number;
    averageProcessingTime: number;
    overheadReduction: number;
    cacheHitRate: number;
    pendingTasks: number;
    approvalsPending: number;
    directImplementationAttempts: number;
  };
  agents: AgentSummary[];
  resources: ResourceSummary;
  knowledgeBus: KnowledgeBusSummary;
}

function normalizeAgent(agent: Agent): AgentSummary {
  const metrics = agent.getMetrics();
  return {
    id: agent.id,
    type: agent.type,
    status: agent.status,
    queueLength: agent.getTaskQueue().length,
    memoryUsageMB: agent.getMemoryUsage(),
    cpuUsagePercent: agent.getCpuUsage(),
    capabilities: {
      maxConcurrency: agent.capabilities.maxConcurrency,
      memoryLimitMB: agent.capabilities.memoryLimit,
      priority: agent.capabilities.priority,
    },
    metrics,
    currentTaskType: (agent as AgentWithMetrics).currentTask?.type,
    lastActivity: metrics.lastActivity,
  };
}

export async function collectAgentMetrics(options: {
  conductor: ConductorOrchestrator;
  resourceManager: ResourceManager;
  knowledgeBus: KnowledgeBus;
}): Promise<AgentMetricsSnapshot> {
  const { conductor, resourceManager, knowledgeBus } = options;

  const conductorInternal = conductor as unknown as ConductorInternalAccess;
  const agentCollection = conductorInternal.agents instanceof Map ? conductorInternal.agents.values() : ([] as Agent[]);
  const agentMap: Agent[] = Array.from(agentCollection);
  const conductorMetrics =
    typeof conductorInternal.getPerformanceMetrics === "function"
      ? conductorInternal.getPerformanceMetrics()
      : {
          totalTasks: 0,
          avgProcessingTime: 0,
          overheadReduction: 0,
          cacheHitRate: 0,
        };

  const resources: ResourceSummary = {
    throttled: resourceManager.isSystemThrottled(),
    constraints: resourceManager.getConstraints(),
  };

  const usage = resourceManager.getCurrentUsage();
  if (usage) {
    resources.currentUsage = usage;
  }

  const knowledgeStats = knowledgeBus.getStats();

  return {
    timestamp: new Date().toISOString(),
    conductor: {
      registeredAgents: agentMap.length,
      totalTasks: conductorMetrics.totalTasks ?? 0,
      averageProcessingTime: conductorMetrics.avgProcessingTime ?? 0,
      overheadReduction: conductorMetrics.overheadReduction ?? 0,
      cacheHitRate: conductorMetrics.cacheHitRate ?? 0,
      pendingTasks: conductorInternal.pendingTasks?.size ?? 0,
      approvalsPending: conductorInternal.approvalRequired?.size ?? 0,
      directImplementationAttempts: conductorInternal.directImplementationAttempts ?? 0,
    },
    agents: agentMap.map(normalizeAgent),
    resources,
    knowledgeBus: {
      topicCount: knowledgeStats.topicCount,
      entryCount: knowledgeStats.entryCount,
      subscriptionCount: knowledgeStats.subscriptionCount,
      messageQueueSize: knowledgeStats.messageQueueSize,
    },
  };
}
