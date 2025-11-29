/**
 * Dependency Injection Container
 *
 * Centralized service management for agent lifecycle and dependencies.
 * Provides type-safe service registration, resolution, and lifecycle management.
 *
 * Features:
 * - Singleton and Transient service lifetimes
 * - Dependency graph tracking
 * - Circular dependency detection
 * - Type-safe agent resolution
 * - Automatic disposal on shutdown
 * - Child containers (scoping)
 */

import type { AppConfig } from "../config/yaml-config.js";
import type { Agent, AgentCapabilities, AgentType } from "../types/agent.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Service lifetime determines how instances are created and cached
 */
export enum ServiceLifetime {
  /** Single instance shared across all resolutions */
  SINGLETON = "singleton",
  /** New instance created for each resolution */
  TRANSIENT = "transient",
}

/**
 * Service descriptor with factory and metadata
 */
export interface ServiceDescriptor<T = any> {
  /** Unique service name/identifier */
  name: string;
  /** Factory function to create instances */
  factory: (container: DIContainer) => T | Promise<T>;
  /** Service lifetime strategy */
  lifetime: ServiceLifetime;
  /** Optional dependencies for graph tracking */
  dependencies?: string[];
  /** Cached singleton instance (if applicable) */
  instance?: T;
}

/**
 * Agent factory configuration
 */
export interface AgentFactoryConfig {
  /** Agent type */
  type: AgentType;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Optional configuration override */
  config?: any;
}

/**
 * Disposable resource interface
 */
export interface Disposable {
  dispose(): Promise<void> | void;
}

// =============================================================================
// DI CONTAINER
// =============================================================================

export class DIContainer {
  private services: Map<string, ServiceDescriptor> = new Map();
  private resolutionStack: Set<string> = new Set();
  private disposed = false;

  constructor() {
    // Register self for dependency injection scenarios
    this.registerInstance("DIContainer", this);
  }

  /**
   * Register a service with factory function
   */
  register<T>(
    name: string,
    factory: (container: DIContainer) => T | Promise<T>,
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
    dependencies: string[] = [],
  ): void {
    this.ensureNotDisposed();

    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    const descriptor: ServiceDescriptor<T> = {
      name,
      factory,
      lifetime,
      dependencies,
    };

    this.services.set(name, descriptor);
    console.error(`[DIContainer] Registered service: ${name} (${lifetime})`);
  }

  /**
   * Register a singleton service (convenience method)
   */
  registerSingleton<T>(
    name: string,
    factory: (container: DIContainer) => T | Promise<T>,
    dependencies: string[] = [],
  ): void {
    this.register(name, factory, ServiceLifetime.SINGLETON, dependencies);
  }

  /**
   * Register a transient service (convenience method)
   */
  registerTransient<T>(
    name: string,
    factory: (container: DIContainer) => T | Promise<T>,
    dependencies: string[] = [],
  ): void {
    this.register(name, factory, ServiceLifetime.TRANSIENT, dependencies);
  }

  /**
   * Register an existing instance as singleton
   */
  registerInstance<T>(name: string, instance: T): void {
    this.ensureNotDisposed();

    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    const descriptor: ServiceDescriptor<T> = {
      name,
      factory: () => instance,
      lifetime: ServiceLifetime.SINGLETON,
      instance,
    };

    this.services.set(name, descriptor);
    console.error(`[DIContainer] Registered instance: ${name}`);
  }

  /**
   * Register an agent factory
   */
  registerAgent(
    agentType: AgentType,
    factory: (container: DIContainer) => Agent | Promise<Agent>,
    dependencies: string[] = [],
  ): void {
    const serviceName = `Agent:${agentType}`;
    this.register(serviceName, factory, ServiceLifetime.SINGLETON, dependencies);
  }

  /**
   * Resolve a service by name with circular dependency detection
   */
  async resolve<T>(name: string): Promise<T> {
    this.ensureNotDisposed();

    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Check for circular dependencies
    if (this.resolutionStack.has(name)) {
      const cycle = Array.from(this.resolutionStack).join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle} -> ${name}`);
    }

    // Return cached singleton instance
    if (descriptor.lifetime === ServiceLifetime.SINGLETON && descriptor.instance !== undefined) {
      return descriptor.instance as T;
    }

    // Track resolution for circular dependency detection
    this.resolutionStack.add(name);

    try {
      // Create new instance
      const instance = await descriptor.factory(this);

      // Cache singleton instance
      if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
        descriptor.instance = instance;
      }

      return instance as T;
    } finally {
      this.resolutionStack.delete(name);
    }
  }

  /**
   * Resolve an agent by type
   */
  async resolveAgent(agentType: AgentType): Promise<Agent> {
    const serviceName = `Agent:${agentType}`;
    return this.resolve<Agent>(serviceName);
  }

  /**
   * Check if service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Check if agent is registered
   */
  hasAgent(agentType: AgentType): boolean {
    return this.has(`Agent:${agentType}`);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get all registered agent types
   */
  getAgentTypes(): AgentType[] {
    const agentTypes: AgentType[] = [];
    for (const name of this.services.keys()) {
      if (name.startsWith("Agent:")) {
        agentTypes.push(name.slice(6) as AgentType);
      }
    }
    return agentTypes;
  }

  /**
   * Get dependency graph for a service
   */
  getDependencyGraph(name: string): string[] {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      return [];
    }
    return descriptor.dependencies || [];
  }

  /**
   * Clear all transient instances (keep singletons)
   */
  clearTransients(): void {
    for (const descriptor of this.services.values()) {
      if (descriptor.lifetime === ServiceLifetime.TRANSIENT) {
        delete descriptor.instance;
      }
    }
    console.error(`[DIContainer] Cleared transient instances`);
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.resolutionStack.clear();
    this.disposed = false;
    console.error(`[DIContainer] Container cleared`);
  }

  /**
   * Dispose all services and clear container
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    console.error(`[DIContainer] Disposing container...`);
    this.disposed = true;

    // Dispose singleton instances in reverse registration order
    const descriptors = Array.from(this.services.values()).reverse();

    for (const descriptor of descriptors) {
      if (descriptor.instance && this.isDisposable(descriptor.instance)) {
        try {
          await descriptor.instance.dispose();
          console.error(`[DIContainer] Disposed: ${descriptor.name}`);
        } catch (error) {
          console.error(`[DIContainer] Failed to dispose ${descriptor.name}:`, error);
        }
      }
    }

    this.services.clear();
    this.resolutionStack.clear();
    console.error(`[DIContainer] Container disposed`);
  }

  /**
   * Check if object implements Disposable interface
   */
  private isDisposable(obj: any): obj is Disposable {
    return obj && typeof obj.dispose === "function";
  }

  /**
   * Ensure container is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("DIContainer has been disposed");
    }
  }

  /**
   * Create a child container (scoped)
   */
  createScope(): DIContainer {
    const scope = new DIContainer();

    // Copy singleton registrations (not instances)
    for (const [name, descriptor] of this.services) {
      if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
        scope.services.set(name, { ...descriptor, instance: undefined });
      }
    }

    return scope;
  }
}

// =============================================================================
// AGENT FACTORY HELPERS
// =============================================================================

/**
 * Create agent factory function with configuration injection
 */
export function createAgentFactory<T extends Agent>(
  agentClass: new (...args: any[]) => T,
  configFactory?: (container: DIContainer) => any | Promise<any>,
): (container: DIContainer) => Promise<T> {
  return async (container: DIContainer) => {
    // Resolve configuration if factory provided
    const config = configFactory ? await configFactory(container) : undefined;

    // Create agent instance
    const agent = config ? new agentClass(config) : new agentClass();

    // Initialize agent
    await agent.initialize();

    return agent;
  };
}

/**
 * Resolve agent capabilities from config
 */
export function resolveAgentCapabilities(config: AppConfig, agentType: AgentType): AgentCapabilities {
  // Map agent type to config section
  const agentConfigMap: Record<string, any> = {
    dev: config.devAgent,
    parser: config.parser.agent, // Parser has .agent section
    indexer: config.indexer, // Direct config (AgentRuntimeConfig-like)
    semantic: config.semanticAgent,
    query: config.queryAgent,
    dora: config.doraAgent,
    coordinator: config.conductor,
  };

  const agentConfig = agentConfigMap[agentType] || {};

  return {
    maxConcurrency: agentConfig.maxConcurrency || config.mcp.agents?.maxConcurrent || 5,
    memoryLimit: agentConfig.memoryLimit || 512,
    priority: agentConfig.priority || 5,
  };
}

// =============================================================================
// GLOBAL CONTAINER INSTANCE
// =============================================================================

let globalContainer: DIContainer | null = null;

/**
 * Get or create global DI container instance
 */
export function getGlobalContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
  }
  return globalContainer;
}

/**
 * Reset global container (for testing)
 */
export function resetGlobalContainer(): void {
  if (globalContainer) {
    globalContainer.clear();
  }
  globalContainer = null;
}

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/**
 * Example Setup (src/index.ts):
 *
 * ```typescript
 * import { getGlobalContainer, createAgentFactory, resolveAgentCapabilities } from "./core/di-container.js";
 * import { DevAgent } from "./agents/dev-agent.js";
 * import { SemanticAgent } from "./agents/semantic-agent.js";
 *
 * const container = getGlobalContainer();
 * const config = initializeConfig();
 *
 * // Register shared services
 * container.registerInstance("Config", config);
 * container.registerSingleton("SQLiteManager", async (c) => {
 *   const cfg = await c.resolve<AppConfig>("Config");
 *   return getSQLiteManager(cfg.database);
 * });
 *
 * // Register agents with configuration injection
 * container.registerAgent("dev", createAgentFactory(DevAgent, async (c) => {
 *   const cfg = await c.resolve<AppConfig>("Config");
 *   return resolveAgentCapabilities(cfg, "dev");
 * }));
 *
 * container.registerAgent("semantic", createAgentFactory(SemanticAgent, async (c) => {
 *   const cfg = await c.resolve<AppConfig>("Config");
 *   return resolveAgentCapabilities(cfg, "semantic");
 * }));
 *
 * // Usage
 * const devAgent = await container.resolveAgent("dev");
 * const semanticAgent = await container.resolveAgent("semantic");
 * ```
 *
 * Example Testing:
 *
 * ```typescript
 * import { DIContainer } from "./core/di-container.js";
 *
 * const testContainer = new DIContainer();
 * testContainer.registerInstance("SQLiteManager", mockSQLiteManager);
 * testContainer.registerAgent("dev", () => mockDevAgent);
 *
 * const agent = await testContainer.resolveAgent("dev");
 * ```
 */
