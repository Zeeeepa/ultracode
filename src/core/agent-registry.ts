/**
 * Agent Registry
 *
 * Automatic registration of all agents in DI container.
 * Uses configuration to determine capabilities and dependencies.
 */

import { getSQLiteManager } from "../storage/sqlite-manager.js";
import { AgentType } from "../types/agent.js";
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
  console.log(`[AgentRegistry] Registering all agents...`);

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

  // IndexerAgent - requires SQLiteManager
  container.registerAgent(AgentType.INDEXER, async (_c) => {
    const { IndexerAgent } = await import("../agents/indexer-agent.js");
    const sqliteManager = getSQLiteManager();
    return new IndexerAgent(sqliteManager);
  });

  // QueryAgent
  container.registerAgent(AgentType.QUERY, async (_c) => {
    const { QueryAgent } = await import("../agents/query-agent.js");
    return new QueryAgent();
  });

  console.log(`[AgentRegistry] All agents registered with DI Container`);
}

/**
 * Register agent with conductor orchestrator
 */
export async function registerAgentWithConductor(
  container: DIContainer,
  conductor: any,
  agentType: AgentType,
): Promise<void> {
  // Check if agent already registered in conductor
  const existing = conductor.getAgentsByType(agentType);
  if (existing.length > 0) {
    console.log(`[AgentRegistry] ${agentType} already registered with conductor`);
    return;
  }

  // Resolve agent from container
  const agent = await container.resolveAgent(agentType);

  // Register with conductor
  conductor.register(agent);
  console.log(`[AgentRegistry] ${agentType} registered with conductor`);
}

/**
 * Get or create agent through DI container
 */
export async function getOrCreateAgent(container: DIContainer, conductor: any, agentType: AgentType): Promise<any> {
  // Check if agent exists in conductor
  const existing = conductor.getAgentsByType(agentType);
  if (existing.length > 0) {
    return existing[0];
  }

  // Check if agent is registered in container
  if (!container.hasAgent(agentType)) {
    throw new Error(`Agent ${agentType} is not registered in DI container`);
  }

  // Resolve from container (this creates the agent but doesn't initialize it)
  const agent = await container.resolveAgent(agentType);

  // Initialize agent AFTER resolving (avoids circular dependency)
  await agent.initialize();
  console.log(`[AgentRegistry] ${agentType} initialized`);

  // Register with conductor
  conductor.register(agent);

  return agent;
}
