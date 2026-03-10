/**
 * Agent Registry
 *
 * Automatic registration of all agents in DI container.
 * Uses configuration to determine capabilities and dependencies.
 */

import type { ConductorOrchestrator } from "../agents/conductor-orchestrator.js";
import { log } from "../logging/index.js";
import type { Agent } from "../types/agent.js";
import { AgentType } from "../types/agent.js";
import type { BranchManager } from "./branch-manager.js";
import type { DIContainer } from "./di-container.js";

// =============================================================================
// AGENT REGISTRATION
// =============================================================================

/**
 * Register all agents in DI container with lazy initialization
 */
export async function registerAllAgents(
  container: DIContainer,
  // config parameter reserved for future use (agent-specific configurations)
): Promise<void> {
  log.i("AGENTREG", "registering_all");

  // DevAgent
  container.registerAgent(AgentType.DEV, async (_c) => {
    const { DevAgent } = await import("../agents/dev-agent.js");
    return new DevAgent();
  });

  // SemanticAgent
  container.registerAgent(AgentType.SEMANTIC, async (_c) => {
    const { SemanticAgent } = await import("../agents/semantic-agent.js");
    return new SemanticAgent();
  });

  // DoraAgent
  container.registerAgent(AgentType.DORA, async (_c) => {
    const { DoraAgent } = await import("../agents/dora-agent.js");
    return new DoraAgent();
  });

  // ParserAgent
  container.registerAgent(AgentType.PARSER, async (_c) => {
    const { ParserAgent } = await import("../agents/parser-agent.js");
    return new ParserAgent();
  });

  // IndexerAgent - uses libsql via GraphStorage (no SQLiteManager needed)
  container.registerAgent(AgentType.INDEXER, async (_c) => {
    const { IndexerAgent } = await import("../agents/indexer-agent.js");
    const agent = new IndexerAgent();
    await agent.initialize(); // Initialize to setup BranchManager
    return agent;
  });

  // QueryAgent
  container.registerAgent(AgentType.QUERY, async (_c) => {
    const { QueryAgent } = await import("../agents/query-agent.js");
    return new QueryAgent();
  });

  // MergeAgent - requires config with optional branchManager
  container.registerAgent(AgentType.MERGE, async (_c) => {
    const { MergeAgent } = await import("../agents/merge-agent.js");
    // Try to resolve config from container, fallback to defaults
    let repoPath = process.cwd();
    let branchManager: BranchManager | undefined;
    try {
      const config = await _c.resolve<{ directory?: string }>("Config");
      if (config?.directory) {
        repoPath = config.directory;
      }
    } catch {
      // Config not registered, use defaults
    }
    // Get BranchManager from IndexerAgent (via DevAgent) — it's the canonical source.
    // BranchManager is never registered as a standalone service in the DI container.
    try {
      const { IndexerAgent } = await import("../agents/indexer-agent.js");
      const indexerAgent = await _c.resolveAgent(AgentType.INDEXER);
      if (indexerAgent instanceof IndexerAgent) {
        branchManager = indexerAgent.getBranchManager() ?? undefined;
      }
    } catch {
      // IndexerAgent not available yet
    }
    // Fallback: try DI resolve (in case someone registers BranchManager explicitly)
    if (!branchManager) {
      try {
        branchManager = await _c.resolve<BranchManager>("BranchManager");
      } catch {
        // BranchManager not registered
      }
    }
    return new MergeAgent({
      repoPath,
      fastPathEnabled: true,
      semanticMatchingEnabled: true,
      semanticThreshold: 0.7,
      autoResolveConflicts: false,
      branchManager,
    });
  });

  log.i("AGENTREG", "all_registered");
}

/**
 * Register agent with conductor orchestrator
 */
export async function registerAgentWithConductor(
  container: DIContainer,
  conductor: ConductorOrchestrator,
  agentType: AgentType,
): Promise<void> {
  // Check if agent already registered in conductor
  const existing = conductor.getAgentsByType(agentType);
  if (existing.length > 0) {
    log.d("AGENTREG", "already_registered", { type: agentType });
    return;
  }

  // Resolve agent from container
  const agent = await container.resolveAgent(agentType);

  // Register with conductor
  conductor.register(agent);
  log.i("AGENTREG", "registered_conductor", { type: agentType });
}

/**
 * Get or create agent through DI container
 */
export async function getOrCreateAgent(
  container: DIContainer,
  conductor: ConductorOrchestrator,
  agentType: AgentType,
): Promise<Agent> {
  // Check if agent exists in conductor
  const existing = conductor.getAgentsByType(agentType);
  if (existing.length > 0) {
    return existing[0] as Agent;
  }

  // Check if agent is registered in container
  if (!container.hasAgent(agentType)) {
    throw new Error(`Agent ${agentType} is not registered in DI container`);
  }

  // Resolve from container (this creates the agent but doesn't initialize it)
  const agent = await container.resolveAgent(agentType);

  // Initialize agent AFTER resolving (avoids circular dependency)
  await agent.initialize();
  log.i("AGENTREG", "agent_init", { type: agentType });

  // Register with conductor
  conductor.register(agent);

  return agent;
}
