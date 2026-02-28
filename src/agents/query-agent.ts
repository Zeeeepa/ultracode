import pLimit from "p-limit";
import { getConfig } from "../config/yaml-config.js";
import { knowledgeBus } from "../core/knowledge-bus.js";
import { log } from "../logging/index.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import type { GraphStorageLibSQL } from "../storage/graph-storage-libsql.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { Change, Cycle, Hotspot, Path, RippleEffect } from "../types/query.js";
import type { Entity, EntityType, GraphQuery, Relationship, RelationType } from "../types/storage.js";
import { BaseAgent } from "./base.js";

interface EntityFilter {
  name?: string | RegExp;
  type?: EntityType | EntityType[] | undefined;
  filePath?: string | string[];
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

export class QueryAgent extends BaseAgent {
  private storage: GraphStorageLibSQL | null = null;
  private ttlCache = new Map<string, { value: unknown; expiry: number }>();
  private readonly cacheTtlMs = 30000;
  private concurrencyLimiter: ReturnType<typeof pLimit>;
  private stats = { queries: 0, totalMs: 0, hits: 0, misses: 0 };

  private taskDispatch = new Map<string, (payload: unknown) => Promise<unknown>>([
    ["query:entities", (p) => this.findEntities(p as EntityFilter)],
    [
      "query:relationships",
      (p) => {
        const { entityId, type } = p as { entityId: string; type?: RelationType };
        return this.findRelationships(entityId, type);
      },
    ],
    ["query:graph", (p) => this.getGraph(p as GraphQuery)],
    ["query:dependencies", (p) => this.analyzeDependencies((p as { entityId: string }).entityId)],
    ["query:impact", (p) => this.analyzeImpact((p as { entityId: string }).entityId)],
  ]);

  constructor() {
    const cfg = getConfig();
    const qa = cfg.queryAgent;
    const maxConcurrency = qa?.maxConcurrency ?? 10;
    super(AgentType.QUERY, {
      maxConcurrency,
      memoryLimit: qa?.memoryLimit ?? 112,
      priority: qa?.priority ?? 9,
    });
    this.concurrencyLimiter = pLimit(maxConcurrency);
  }

  protected async handleMessage(_message: AgentMessage): Promise<void> {}

  protected async onInitialize(): Promise<void> {
    log.i("QUERYAGENT", "init_start", { id: this.id });
    this.storage = await getGraphStorage();
    knowledgeBus.subscribe(this.id, "graph:updated", () => {
      log.d("QUERYAGENT", "graph_updated", { id: this.id });
      this.ttlCache.clear();
    });
    knowledgeBus.subscribe(this.id, "index:complete", () => {
      log.d("QUERYAGENT", "index_complete", { id: this.id });
      this.ttlCache.clear();
    });
    log.i("QUERYAGENT", "init_done", { id: this.id });
  }

  protected async onShutdown(): Promise<void> {
    log.i("QUERYAGENT", "shutdown_start", { id: this.id });
    this.ttlCache.clear();
    log.i("QUERYAGENT", "shutdown_done", { id: this.id });
  }

  protected canProcessTask(task: AgentTask): boolean {
    return task.type.startsWith("query:");
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    const startTime = Date.now();
    try {
      const handler = this.taskDispatch.get(task.type);
      if (!handler) throw new Error(`Unknown query type: ${task.type}`);
      const result = await this.concurrencyLimiter(() => handler(task.payload));
      this.stats.queries++;
      this.stats.totalMs += Date.now() - startTime;
      return result;
    } catch (error) {
      log.e("QUERYAGENT", "query_fail", { id: this.id, err: String(error) });
      throw error;
    }
  }

  private cacheGet<T>(key: string): T | null {
    const entry = this.ttlCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.ttlCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private cacheSet(key: string, value: unknown): void {
    this.ttlCache.set(key, { value, expiry: Date.now() + this.cacheTtlMs });
  }

  async findEntities(filter: EntityFilter): Promise<Entity[]> {
    if (!this.storage) return [];
    const cacheKey = `entities:${JSON.stringify(filter)}`;
    const cached = this.cacheGet<Entity[]>(cacheKey);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    const results = await this.storage.searchEntities({
      namePattern: typeof filter.name === "string" ? filter.name : filter.name?.source,
      types: Array.isArray(filter.type) ? filter.type : filter.type ? [filter.type] : undefined,
      filePath: Array.isArray(filter.filePath) ? filter.filePath[0] : filter.filePath,
      limit: 100,
    });
    this.cacheSet(cacheKey, results);
    return results;
  }

  async findRelationships(entityId: string, type?: RelationType): Promise<Relationship[]> {
    if (!this.storage) return [];
    const cacheKey = `rels:${entityId}:${type ?? "all"}`;
    const cached = this.cacheGet<Relationship[]>(cacheKey);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    const results = await this.storage.getRelationshipsForEntity(entityId, type);
    this.cacheSet(cacheKey, results);
    return results;
  }

  async getGraph(query: GraphQuery): Promise<SimpleGraph> {
    if (!this.storage) return { entities: [], relationships: [] };
    const result = await this.storage.executeQuery(query);
    return { entities: result.entities, relationships: result.relationships };
  }

  async analyzeDependencies(entityId: string): Promise<SimpleDependencyTree> {
    if (!this.storage) return { root: entityId, children: [] };
    const rels = await this.storage.getRelationshipsForEntity(entityId);
    return {
      root: entityId,
      children: rels.filter((r) => r.fromId === entityId).map((r) => ({ root: r.toId, children: [] })),
    };
  }

  async analyzeImpact(entityId: string): Promise<SimpleImpactAnalysis> {
    if (!this.storage) return { source: entityId, directImpact: [], transitiveImpact: [], riskLevel: "low" };
    const rels = await this.storage.getRelationshipsForEntity(entityId);
    const directImpact = rels.filter((r) => r.toId === entityId).map((r) => r.fromId);
    const transitiveImpact: string[] = [];
    for (const id of directImpact) {
      const tRels = await this.storage.getRelationshipsForEntity(id);
      for (const r of tRels) {
        if (r.toId === id && !directImpact.includes(r.fromId) && r.fromId !== entityId) {
          transitiveImpact.push(r.fromId);
        }
      }
    }
    const total = directImpact.length + transitiveImpact.length;
    const riskLevel = total > 50 ? "critical" : total > 20 ? "high" : total > 5 ? "medium" : "low";
    return { source: entityId, directImpact, transitiveImpact, riskLevel };
  }

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

  getQueryMetrics() {
    const { queries, totalMs, hits, misses } = this.stats;
    const total = hits + misses;
    return {
      totalQueries: queries,
      totalTime: totalMs,
      cacheHits: hits,
      cacheMisses: misses,
      avgQueryTime: queries > 0 ? Math.round(totalMs / queries) : 0,
      cacheHitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
    };
  }
}
