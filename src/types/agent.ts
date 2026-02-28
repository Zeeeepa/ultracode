export enum AgentType {
  PARSER = "parser",
  INDEXER = "indexer",
  QUERY = "query",
  SEMANTIC = "semantic",
  COORDINATOR = "coordinator",
  DEV = "dev",
  DORA = "dora",
  MERGE = "merge",
}

export enum AgentStatus {
  IDLE = "idle",
  BUSY = "busy",
  ERROR = "error",
  SHUTDOWN = "shutdown",
}

export interface AgentCapabilities {
  priority: number;
  maxConcurrency: number;
  memoryLimit: number;
  cpuAffinity?: number[];
}

export interface ResourceConstraints {
  maxMemoryMB: number;
  maxConcurrentAgents: number;
  maxCpuPercent: number;
  maxTaskQueueSize: number;
}

export interface AgentMessage<T = unknown> {
  id: string;
  type: string;
  from: string;
  to: string;
  timestamp: number;
  payload: T;
  correlationId?: string;
}

export interface AgentTask {
  id: string;
  type: string;
  priority: number;
  createdAt: number;
  payload: unknown;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: Error;
}

export interface Agent {
  id: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: AgentCapabilities;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  canHandle(task: AgentTask): boolean;
  process(task: AgentTask): Promise<unknown>;
  send(message: AgentMessage): Promise<void>;
  receive(message: AgentMessage): Promise<void>;
  getMemoryUsage(): number;
  getCpuUsage(): number;
  getTaskQueue(): AgentTask[];
  getMetrics(): AgentMetrics;
}

export interface AgentPool {
  agents: Map<string, Agent>;
  register(agent: Agent): void;
  unregister(agentId: string): void;
  getAgent(id: string): Agent | undefined;
  getAgentsByType(type: AgentType): Agent[];
  getAvailableAgent(type: AgentType): Agent | undefined;
  broadcast(message: AgentMessage): Promise<void>;
  route(task: AgentTask): Promise<Agent | undefined>;
}

export interface AgentMetrics {
  agentId: string;
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageProcessingTime: number;
  currentMemoryMB: number;
  currentCpuPercent: number;
  lastActivity: number;
}
