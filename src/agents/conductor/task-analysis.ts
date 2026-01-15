/**
 * Task Analysis
 *
 * Analyze task complexity and determine delegation strategy.
 */

import type { AgentTask } from "../../types/agent.js";
import type { ConductorConfig, TaskComplexityAnalysis } from "./types.js";

/**
 * Task payload interface for complexity analysis
 */
interface TaskPayload {
  fileCount?: number;
  requiresResearch?: boolean;
  requiresTesting?: boolean;
  directImplementation?: boolean;
  bypassDelegation?: boolean;
  [key: string]: unknown;
}

/**
 * Analyze task complexity and determine delegation strategy.
 */
export function analyzeTaskComplexity(task: AgentTask, config: ConductorConfig): TaskComplexityAnalysis {
  const factors: string[] = [];
  let score = 1;

  // Analyze based on task type
  if (task.type === "refactor" || task.type === "architecture") {
    score += 3;
    factors.push("Architectural changes required");
  }

  if (task.type === "multi-file" || task.type === "cross-module") {
    score += 2;
    factors.push("Multiple files affected");
  }

  if (task.payload && typeof task.payload === "object") {
    const payload = task.payload as TaskPayload;

    if (payload.fileCount && payload.fileCount > 10) {
      score += 2;
      factors.push(`Large scope: ${payload.fileCount} files`);
    }

    if (payload.requiresResearch) {
      score += 1;
      factors.push("Research required");
    }

    if (payload.requiresTesting) {
      score += 1;
      factors.push("Testing required");
    }
  }

  // Determine delegation strategy
  let delegationStrategy: "dev-agent" | "dora" | "multi-agent" = "dev-agent";

  if (task.type === "research" || task.type === "analysis") {
    delegationStrategy = "dora";
  } else if (score >= 7) {
    delegationStrategy = "multi-agent";
  }

  return {
    score: Math.min(10, score),
    factors,
    requiresApproval: score > config.complexityThreshold,
    delegationStrategy,
    subtasks: [],
  };
}

/**
 * Check if a task is an indexing operation (automated, no approval needed).
 */
export function isIndexingTask(task: AgentTask): boolean {
  return (
    task.type === "index" ||
    task.type === "semantic" ||
    !!(task.payload && typeof task.payload === "object" && "directory" in task.payload)
  );
}

/**
 * Check if task is trying to bypass delegation.
 */
export function isDirectImplementation(task: AgentTask): boolean {
  if (!task.payload || typeof task.payload !== "object") {
    return task.type === "direct";
  }
  const payload = task.payload as TaskPayload;
  return payload.directImplementation === true || payload.bypassDelegation === true || task.type === "direct";
}
