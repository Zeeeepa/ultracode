/**
 * TASK-002: QueryAgent for Graph Traversal and Relationships
 *
 * High-performance query agent for graph traversal and relationship analysis.
 * Uses GraphStorageLibSQL for all database operations.
 *
 * @task_id TASK-002
 * @coding_standard Adheres to: doc/CODING_STANDARD.md
 */

import pLimit from "p-limit";
import { getConfig } from "../config/yaml-config.js";
import { knowledgeBus } from "../core/knowledge-bus.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import type { GraphStorageLibSQL } from "../storage/graph-storage-libsql.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { Change, Cycle, Hotspot, Path, RippleEffect } from "../types/query.js";
import type { Entity, EntityType, Relationship, RelationType } from "../types/storage.js";

// Simplified local types for QueryAgent
interface EntityFilter {
  name?: string | RegExp;
  type?: EntityType | EntityType[] | undefined;
  filePath?: string | string[];
}

interface GraphQuery {
  type: string;
  params?: Record<string, unknown>;
}

interface SimpleGraph {
  entities: Entity[];
  relationships: Relationship[];
}

interface SimpleDependencyTree {
  root: string;
  children: SimpleDependencyTree[];
}

interface SimpleImpactAnalysis {
  source: string;
  directImpact: string[];
  transitiveImpact: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
}

import { BaseAgent } from "./base.js";

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

function getQueryAgentConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.queryAgent?.maxConcurrency ?? 10,
    memoryLimit: config.queryAgent?.memoryLimit ?? 112,
    priority: config.queryAgent?.priority ?? 9,
    simpleQueryTimeout: config.queryAgent?.simpleQueryTimeout ?? 100,
    complexQueryTimeout: config.queryAgent?.complexQueryTimeout ?? 1000,
    cacheWarmupSize: config.queryAgent?.cacheWarmupSize ?? 100,
  };
}

const QUERY_AGENT_CONFIG = getQueryAgentConfig();

// Simple in-memory cache
class SimpleCache {
  private cache = new Map<string, { value: unknown; expiry: number }>();
  private readonly ttlMs = 30000; // 30 seconds

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// QUERY AGENT IMPLEMENTATION
// =============================================================================

export class QueryAgent extends BaseAgent {
  private storage: GraphStorageLibSQL | null = null;
  private cache = new SimpleCache();
  private concurrencyLimiter = pLimit(QUERY_AGENT_CONFIG.maxConcurrency);
  private queryMetrics = {
    totalQueries: 0,
    totalTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor() {
    super(AgentType.QUERY, {
      maxConcurrency: QUERY_AGENT_CONFIG.maxConcurrency,
      memoryLimit: QUERY_AGENT_CONFIG.memoryLimit,
      priority: QUERY_AGENT_CONFIG.priority,
    });
  }

  // Implement abstract handleMessage from BaseAgent
  protected async handleMessage(_message: AgentMessage): Promise<void> {
    // QueryAgent doesn't process direct messages, only tasks
  }

  // =============================================================================
  // LIFECYCLE METHODS
  // =============================================================================

  protected async onInitialize(): Promise<void> {
    console.error(`[${this.id}] Initializing QueryAgent...`);
    this.storage = await getGraphStorage();
    this.subscribeToKnowledgeBus();
    console.error(`[${this.id}] QueryAgent initialized successfully`);
  }

  protected async onShutdown(): Promise<void> {
    console.error(`[${this.id}] Shutting down QueryAgent...`);
    this.cache.clear();
    console.error(`[${this.id}] QueryAgent shutdown complete`);
  }

  // =============================================================================
  // TASK PROCESSING
  // =============================================================================

  protected canProcessTask(task: AgentTask): boolean {
    return task.type.startsWith("query:");
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    const startTime = Date.now();

    try {
      const result = await this.concurrencyLimiter(async () => {
        switch (task.type) {
          case "query:entities":
            return this.findEntities(task.payload as EntityFilter);
          case "query:relationships":
            return this.findRelationships(
              (task.payload as { entityId: string; type?: RelationType }).entityId,
              (task.payload as { entityId: string; type?: RelationType }).type,
            );
          case "query:graph":
            return this.getGraph(task.payload as GraphQuery);
          case "query:dependencies":
            return this.analyzeDependencies((task.payload as { entityId: string }).entityId);
          case "query:impact":
            return this.analyzeImpact((task.payload as { entityId: string }).entityId);
          default:
            throw new Error(`Unknown query type: ${task.type}`);
        }
      });

      this.queryMetrics.totalQueries++;
      this.queryMetrics.totalTime += Date.now() - startTime;

      return result;
    } catch (error) {
      console.error(`[${this.id}] Query failed:`, error);
      throw error;
    }
  }

  // =============================================================================
  // QUERY OPERATIONS (implements QueryOperations interface)
  // =============================================================================

  async findEntities(filter: EntityFilter): Promise<Entity[]> {
    if (!this.storage) return [];

    const cacheKey = `entities:${JSON.stringify(filter)}`;
    const cached = this.cache.get<Entity[]>(cacheKey);
    if (cached) {
      this.queryMetrics.cacheHits++;
      return cached;
    }

    this.queryMetrics.cacheMisses++;
    // Convert complex filter to storage-compatible format
    const namePattern = typeof filter.name === "string" ? filter.name : filter.name?.source;
    const types = Array.isArray(filter.type) ? filter.type : filter.type ? [filter.type] : undefined;
    const filePath = Array.isArray(filter.filePath) ? filter.filePath[0] : filter.filePath;

    const results = await this.storage.searchEntities({
      namePattern,
      types,
      filePath,
      limit: 100,
    });

    this.cache.set(cacheKey, results);
    return results;
  }

  async findRelationships(entityId: string, type?: RelationType): Promise<Relationship[]> {
    if (!this.storage) return [];

    const cacheKey = `rels:${entityId}:${type ?? "all"}`;
    const cached = this.cache.get<Relationship[]>(cacheKey);
    if (cached) {
      this.queryMetrics.cacheHits++;
      return cached;
    }

    this.queryMetrics.cacheMisses++;
    const results = await this.storage.getRelationshipsForEntity(entityId, type);
    this.cache.set(cacheKey, results);
    return results;
  }

  async getGraph(query: { type: string; params?: Record<string, unknown> }): Promise<SimpleGraph> {
    if (!this.storage) {
      return { entities: [], relationships: [] };
    }

    const result = await this.storage.executeQuery(query as any);
    return {
      entities: result.entities,
      relationships: result.relationships,
    };
  }

  async analyzeDependencies(entityId: string): Promise<SimpleDependencyTree> {
    if (!this.storage) {
      return { root: entityId, children: [] };
    }

    const relationships = await this.storage.getRelationshipsForEntity(entityId);
    const children: SimpleDependencyTree[] = [];

    for (const rel of relationships) {
      if (rel.fromId === entityId) {
        children.push({
          root: rel.toId,
          children: [],
        });
      }
    }

    return { root: entityId, children };
  }

  async analyzeImpact(entityId: string): Promise<SimpleImpactAnalysis> {
    if (!this.storage) {
      return {
        source: entityId,
        directImpact: [],
        transitiveImpact: [],
        riskLevel: "low",
      };
    }

    const relationships = await this.storage.getRelationshipsForEntity(entityId);
    const directImpact: string[] = [];
    const transitiveImpact: string[] = [];

    for (const rel of relationships) {
      if (rel.toId === entityId) {
        directImpact.push(rel.fromId);
      }
    }

    // Get transitive impact (2nd degree)
    for (const impactedId of directImpact) {
      const transitiveRels = await this.storage.getRelationshipsForEntity(impactedId);
      for (const rel of transitiveRels) {
        if (rel.toId === impactedId && !directImpact.includes(rel.fromId) && rel.fromId !== entityId) {
          transitiveImpact.push(rel.fromId);
        }
      }
    }

    const totalImpact = directImpact.length + transitiveImpact.length;
    const riskLevel = totalImpact > 50 ? "critical" : totalImpact > 20 ? "high" : totalImpact > 5 ? "medium" : "low";

    return {
      source: entityId,
      directImpact,
      transitiveImpact,
      riskLevel,
    };
  }

  // Additional interface methods with stub implementations
  async findPaths(_source: string, _target: string, _maxDepth?: number): Promise<Path[]> {
    return [];
  }

  async findCycles(_entityId: string, _maxDepth?: number): Promise<Cycle[]> {
    return [];
  }

  async analyzeHotspots(_filter?: EntityFilter): Promise<Hotspot[]> {
    return [];
  }

  async analyzeRippleEffects(_changeSet: Change[]): Promise<RippleEffect[]> {
    return [];
  }

  // =============================================================================
  // KNOWLEDGE BUS INTEGRATION
  // =============================================================================

  private subscribeToKnowledgeBus(): void {
    knowledgeBus.subscribe(this.id, "graph:updated", () => {
      console.error(`[${this.id}] Graph updated, clearing cache`);
      this.cache.clear();
    });

    knowledgeBus.subscribe(this.id, "index:complete", () => {
      console.error(`[${this.id}] Index complete, clearing cache`);
      this.cache.clear();
    });
  }

  // =============================================================================
  // METRICS
  // =============================================================================

  getQueryMetrics() {
    return {
      ...this.queryMetrics,
      avgQueryTime:
        this.queryMetrics.totalQueries > 0
          ? Math.round(this.queryMetrics.totalTime / this.queryMetrics.totalQueries)
          : 0,
      cacheHitRate:
        this.queryMetrics.totalQueries > 0
          ? Math.round(
              (this.queryMetrics.cacheHits / (this.queryMetrics.cacheHits + this.queryMetrics.cacheMisses)) * 100,
            )
          : 0,
    };
  }
}
