/**
 * Conductor Configuration
 *
 * Default configuration and configuration resolution for Conductor orchestrator.
 */

import { getConfig } from "../../config/yaml-config.js";
import type { ResourceConstraints } from "../../types/agent.js";
import type { ConductorConfig, ConductorConfigOverrides } from "./types.js";

export const DEFAULT_RESOURCE_CONSTRAINTS: ResourceConstraints = {
  maxMemoryMB: 1024,
  maxCpuPercent: 80,
  maxConcurrentAgents: 10,
  maxTaskQueueSize: 100,
};

export const DEFAULT_CONDUCTOR_CONFIG: ConductorConfig = {
  resourceConstraints: DEFAULT_RESOURCE_CONSTRAINTS,
  taskQueueLimit: 100,
  loadBalancingStrategy: "least-loaded",
  complexityThreshold: 8,
  mandatoryDelegation: true,
  maxConcurrency: 100,
  memoryLimit: 128,
  priority: 10,
};

export function getConductorAgentDefaults(): {
  capabilities: { maxConcurrency: number; memoryLimit: number; priority: number };
  config: ConductorConfig;
} {
  const appConfig = getConfig();
  const conductorOverrides = (appConfig.conductor ?? {}) as ConductorConfigOverrides;
  const fallbackConcurrentAgents =
    conductorOverrides.resourceConstraints?.maxConcurrentAgents ??
    appConfig.mcp.agents?.maxConcurrent ??
    DEFAULT_RESOURCE_CONSTRAINTS.maxConcurrentAgents;

  const resourceConstraints: ResourceConstraints = {
    maxMemoryMB: conductorOverrides.resourceConstraints?.maxMemoryMB ?? DEFAULT_RESOURCE_CONSTRAINTS.maxMemoryMB,
    maxCpuPercent: conductorOverrides.resourceConstraints?.maxCpuPercent ?? DEFAULT_RESOURCE_CONSTRAINTS.maxCpuPercent,
    maxConcurrentAgents: fallbackConcurrentAgents,
    maxTaskQueueSize:
      conductorOverrides.resourceConstraints?.maxTaskQueueSize ?? DEFAULT_RESOURCE_CONSTRAINTS.maxTaskQueueSize,
  };

  const maxConcurrency = conductorOverrides.maxConcurrency ?? DEFAULT_CONDUCTOR_CONFIG.maxConcurrency;
  const memoryLimit = conductorOverrides.memoryLimit ?? DEFAULT_CONDUCTOR_CONFIG.memoryLimit;
  const priority = conductorOverrides.priority ?? DEFAULT_CONDUCTOR_CONFIG.priority;

  const config: ConductorConfig = {
    resourceConstraints,
    taskQueueLimit: conductorOverrides.taskQueueLimit ?? DEFAULT_CONDUCTOR_CONFIG.taskQueueLimit,
    loadBalancingStrategy: conductorOverrides.loadBalancingStrategy ?? DEFAULT_CONDUCTOR_CONFIG.loadBalancingStrategy,
    complexityThreshold: conductorOverrides.complexityThreshold ?? DEFAULT_CONDUCTOR_CONFIG.complexityThreshold,
    mandatoryDelegation: conductorOverrides.mandatoryDelegation ?? DEFAULT_CONDUCTOR_CONFIG.mandatoryDelegation,
    maxConcurrency,
    memoryLimit,
    priority,
  };

  return {
    capabilities: { maxConcurrency, memoryLimit, priority },
    config,
  };
}
