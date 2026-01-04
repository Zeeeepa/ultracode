/**
 * Method Proposals
 *
 * Generation of method proposals for task execution strategies.
 */

import type { AgentTask } from "../../types/agent.js";
import type { MethodProposal, TaskComplexityAnalysis } from "./types.js";

/**
 * Generate method proposals for a task based on complexity analysis.
 * Always generates 5 proposals as per specification.
 */
export function generateMethodProposals(_task: AgentTask, complexity: TaskComplexityAnalysis): MethodProposal[] {
  const proposals: MethodProposal[] = [];

  proposals.push({
    id: "method-1",
    name: "Incremental Implementation",
    description: "Gradually implement changes with continuous validation",
    pros: ["Lower risk", "Continuous testing", "Easy rollback"],
    cons: ["Slower completion", "Potential inconsistencies during transition"],
    timeline: "1-2 weeks",
    riskLevel: "low",
    recommended: complexity.score <= 6,
  });

  proposals.push({
    id: "method-2",
    name: "Parallel Development",
    description: "Multiple agents work on independent components simultaneously",
    pros: ["Faster completion", "Efficient resource usage"],
    cons: ["Coordination complexity", "Integration challenges"],
    timeline: "3-5 days",
    riskLevel: "medium",
    recommended: complexity.delegationStrategy === "multi-agent",
  });

  proposals.push({
    id: "method-3",
    name: "Research-First Approach",
    description: "Dora conducts comprehensive research before implementation",
    pros: ["Well-informed decisions", "Best practices applied"],
    cons: ["Longer initial phase", "Potential over-engineering"],
    timeline: "1 week",
    riskLevel: "low",
    recommended: complexity.factors.includes("Research required"),
  });

  proposals.push({
    id: "method-4",
    name: "Rapid Prototyping",
    description: "Quick implementation followed by iterative refinement",
    pros: ["Fast initial results", "Early feedback"],
    cons: ["Technical debt", "Requires refactoring"],
    timeline: "2-3 days",
    riskLevel: "medium",
    recommended: false,
  });

  proposals.push({
    id: "method-5",
    name: "Comprehensive Refactor",
    description: "Complete restructuring with modern patterns",
    pros: ["Optimal final architecture", "Long-term maintainability"],
    cons: ["High complexity", "Risk of breaking changes"],
    timeline: "2-3 weeks",
    riskLevel: "high",
    recommended: complexity.score >= 8,
  });

  return proposals;
}

/**
 * Create a method proposal template based on task type.
 */
export function createMethodProposalTemplate(taskType: string): MethodProposal[] {
  return [
    {
      id: "method-1",
      name: "Incremental Approach",
      description: `Incremental ${taskType} with continuous validation`,
      pros: ["Lower risk", "Continuous feedback", "Easy rollback"],
      cons: ["Slower completion", "Multiple validation steps"],
      timeline: "1-2 weeks",
      riskLevel: "low",
      recommended: true,
    },
    {
      id: "method-2",
      name: "Parallel Processing",
      description: `Parallel ${taskType} with independent components`,
      pros: ["Faster completion", "Efficient resource usage"],
      cons: ["Coordination complexity", "Integration challenges"],
      timeline: "3-5 days",
      riskLevel: "medium",
      recommended: false,
    },
  ];
}

/**
 * Get task type key for template lookup.
 */
export function getTaskTypeKey(task: AgentTask): string {
  const payload = task.payload as any;
  if (payload?.requiresResearch) return "analysis";
  if (task.type.includes("refactor")) return "refactor";
  if (task.type.includes("implement")) return "implementation";
  if (task.type.includes("optimize")) return "optimization";
  if (task.type.includes("debug") || task.type.includes("fix")) return "debugging";
  return "implementation";
}

/**
 * Initialize method proposal templates for common task types.
 */
export function initializeMethodProposalTemplates(): Map<string, MethodProposal[]> {
  const templates = new Map<string, MethodProposal[]>();
  const templateTypes = ["refactor", "implementation", "analysis", "optimization", "debugging"];

  for (const type of templateTypes) {
    templates.set(type, createMethodProposalTemplate(type));
  }

  return templates;
}
