/**
 * Task Delegation Strategy
 *
 * Strategy pattern for conductor-orchestrator complexity reduction
 * Eliminates large if-else chains with pluggable strategies
 */

import type { AgentTask } from "../../types/agent.js";

export interface Agent {
  id: string;
  type: string;
  capabilities: {
    supportedTaskTypes: string[];
    maxConcurrency: number;
  };
}

/**
 * Strategy interface for task delegation decisions
 */
export interface DelegationStrategy {
  /**
   * Determine if a task should be delegated
   */
  shouldDelegate(task: AgentTask): boolean;

  /**
   * Select the best agent for a task
   */
  selectAgent(task: AgentTask, availableAgents: Agent[]): Agent | null;

  /**
   * Calculate task complexity score
   */
  calculateComplexity(task: AgentTask): number;
}

/**
 * Default delegation strategy based on complexity threshold
 */
export class ComplexityBasedStrategy implements DelegationStrategy {
  constructor(private complexityThreshold: number = 8) {}

  shouldDelegate(task: AgentTask): boolean {
    const complexity = this.calculateComplexity(task);
    return complexity > this.complexityThreshold;
  }

  selectAgent(task: AgentTask, availableAgents: Agent[]): Agent | null {
    // Filter agents that support this task type
    const capableAgents = availableAgents.filter((agent) => agent.capabilities.supportedTaskTypes.includes(task.type));

    if (capableAgents.length === 0) return null;

    // Select agent with highest available concurrency
    return capableAgents.reduce((best, current) =>
      current.capabilities.maxConcurrency > best.capabilities.maxConcurrency ? current : best,
    );
  }

  calculateComplexity(task: AgentTask): number {
    let score = task.priority || 5;

    // Increase complexity based on payload size
    if (task.payload) {
      const payloadSize = JSON.stringify(task.payload).length;
      if (payloadSize > 10000) score += 3;
      else if (payloadSize > 1000) score += 1;
    }

    // Task-specific complexity adjustments
    switch (task.type) {
      case "index":
        score += 2; // Indexing is always complex
        break;
      case "semantic_search":
        score += 1;
        break;
    }

    return Math.min(10, score); // Cap at 10
  }
}

/**
 * Round-robin strategy for load balancing
 */
export class RoundRobinStrategy implements DelegationStrategy {
  private lastSelectedIndex = new Map<string, number>();

  shouldDelegate(_task: AgentTask): boolean {
    return true; // Always delegate in round-robin
  }

  selectAgent(task: AgentTask, availableAgents: Agent[]): Agent | null {
    const capableAgents = availableAgents.filter((agent) => agent.capabilities.supportedTaskTypes.includes(task.type));

    if (capableAgents.length === 0) return null;

    // Get last selected index for this task type
    const lastIndex = this.lastSelectedIndex.get(task.type) || 0;
    const nextIndex = (lastIndex + 1) % capableAgents.length;

    this.lastSelectedIndex.set(task.type, nextIndex);
    return capableAgents[nextIndex] || null;
  }

  calculateComplexity(_task: AgentTask): number {
    return 5; // Always mid-complexity
  }
}

/**
 * Least-loaded strategy
 */
export class LeastLoadedStrategy implements DelegationStrategy {
  constructor(
    private complexityThreshold: number = 8,
    private getAgentLoad: (agentId: string) => number,
  ) {}

  shouldDelegate(task: AgentTask): boolean {
    const complexity = this.calculateComplexity(task);
    return complexity > this.complexityThreshold;
  }

  selectAgent(task: AgentTask, availableAgents: Agent[]): Agent | null {
    const capableAgents = availableAgents.filter((agent) => agent.capabilities.supportedTaskTypes.includes(task.type));

    if (capableAgents.length === 0) return null;

    // Select agent with lowest current load
    return capableAgents.reduce((best, current) => {
      const bestLoad = this.getAgentLoad(best.id);
      const currentLoad = this.getAgentLoad(current.id);
      return currentLoad < bestLoad ? current : best;
    });
  }

  calculateComplexity(task: AgentTask): number {
    // Same as ComplexityBasedStrategy
    let score = task.priority || 5;
    if (task.payload) {
      const payloadSize = JSON.stringify(task.payload).length;
      if (payloadSize > 10000) score += 3;
      else if (payloadSize > 1000) score += 1;
    }
    return Math.min(10, score);
  }
}

/**
 * Usage in conductor-orchestrator.ts:
 *
 * class ConductorOrchestrator {
 *   constructor(private strategy: DelegationStrategy) {}
 *
 *   async processTask(task: AgentTask): Promise<any> {
 *     if (this.strategy.shouldDelegate(task)) {
 *       const agent = this.strategy.selectAgent(task, this.registeredAgents);
 *       if (agent) {
 *         return await this.delegateToAgent(agent, task);
 *       }
 *     }
 *     return await this.executeDirectly(task);
 *   }
 * }
 *
 * // Can easily switch strategies:
 * const conductor = new ConductorOrchestrator(
 *   new LeastLoadedStrategy(8, (id) => agentLoadMap.get(id) || 0)
 * );
 */
