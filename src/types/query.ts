/**
 * Query type definitions for graph operations and traversal.
 *
 * Covers entity filtering, graph path analysis, dependency trees,
 * impact analysis, caching configuration, and streaming support.
 *
 * Related modules:
 *   - src/types/storage.ts (Entity, Relationship base types)
 *   - src/types/agent.ts (Agent coordination types)
 *   - src/storage/graph-storage.ts (runtime graph storage)
 */

import { CACHE_CONSTANTS } from "../config/constants.js";
import type { Entity, EntityType, Relationship, RelationType } from "./storage.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Entity, Relationship } from "./storage.js";

// ---------------------------------------------------------------------------
// Numeric limits and defaults
// ---------------------------------------------------------------------------

export const MAX_QUERY_DEPTH = 10;
export const DEFAULT_QUERY_LIMIT = 100;
export const MAX_CONCURRENT_QUERIES = 10;
export const CACHE_L1_SIZE = 100; // Hot cache
export const CACHE_L2_SIZE = 1000; // Warm cache
export const DEFAULT_TTL_MS = CACHE_CONSTANTS.CACHE_TTL_MS;

// ---------------------------------------------------------------------------
// Entity filtering
// ---------------------------------------------------------------------------

/** Criteria for narrowing entity lookup results. */
export interface EntityFilter {
  type?: EntityType | EntityType[] | undefined;
  name?: string | RegExp;
  namePattern?: string | undefined;
  id?: string | string[];
  filePath?: string | string[];
  hasRelationType?: RelationType;
}

// ---------------------------------------------------------------------------
// Graph traversal primitives
// ---------------------------------------------------------------------------

/** A path between two nodes in the graph. */
export interface Path {
  edges: Relationship[];
  nodes: Entity[];
  length: number;
  cost?: number;
}

/** A rooted sub-graph extracted from the full graph. */
export interface Graph {
  rootId: string;
  depth: number;
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
}

// ---------------------------------------------------------------------------
// Dependency analysis
// ---------------------------------------------------------------------------

/** Top-level dependency tree rooted at a single entity. */
export interface DependencyTree {
  root: Entity;
  cycles: Cycle[];
  dependencies: Map<string, DependencyNode>;
}

/** Single node inside a dependency tree. */
export interface DependencyNode {
  entity: Entity;
  depth: number;
  circular: boolean;
  children: DependencyNode[];
}

/** Represents a detected cyclic dependency. */
export interface Cycle {
  type: "import" | "inheritance" | "reference";
  nodes: Entity[];
  edges: Relationship[];
}

// ---------------------------------------------------------------------------
// Hotspot and impact analysis
// ---------------------------------------------------------------------------

/** A code entity flagged as a hotspot based on combined metrics. */
export interface Hotspot {
  score: number;
  entity: Entity;
  metrics: {
    complexity: number;
    changeFrequency: number;
    incomingRelationships: number;
    outgoingRelationships: number;
  };
}

/** Result of analysing the blast radius when an entity changes. */
export interface ImpactAnalysis {
  sourceEntity: Entity;
  riskLevel: "low" | "medium" | "high" | "critical";
  directImpacts: Entity[];
  indirectImpacts: Entity[];
  impactedEntities: Entity[];
  affectedFiles: string[];
}

// ---------------------------------------------------------------------------
// Change tracking and ripple effects
// ---------------------------------------------------------------------------

/** Describes a single change event on an entity. */
export interface Change {
  entityId: string;
  timestamp: number;
  type: "added" | "modified" | "deleted";
}

/** Aggregated effect of one or more changes on the graph. */
export interface RippleEffect {
  estimatedRisk: number;
  changes: Change[];
  affectedEntities: Map<
    string,
    {
      entity: Entity;
      impactLevel: number;
      reason: string;
    }
  >;
}

// ---------------------------------------------------------------------------
// Query operations contract
// ---------------------------------------------------------------------------

/** High-level interface that a query executor must implement. */
export interface QueryOperations {
  // Entity lookups
  getEntity(id: string): Promise<Entity | null>;
  listEntities(filter: EntityFilter): Promise<Entity[]>;

  // Relationship lookups
  getRelationships(entityId: string, type?: RelationType): Promise<Relationship[]>;
  getRelatedEntities(entityId: string, depth: number): Promise<Entity[]>;

  // Traversal
  findPath(fromId: string, toId: string): Promise<Path | null>;
  getSubgraph(rootId: string, depth: number): Promise<Graph>;

  // Dependency and cycle detection
  findDependencies(entityId: string): Promise<DependencyTree>;
  detectCycles(): Promise<Cycle[]>;
  analyzeHotspots(): Promise<Hotspot[]>;

  // Impact analysis
  getImpactedEntities(entityId: string): Promise<ImpactAnalysis>;
  calculateChangeRipple(changes: Change[]): Promise<RippleEffect>;
}

// ---------------------------------------------------------------------------
// Query representation and results
// ---------------------------------------------------------------------------

/** Internal representation of a graph query before execution. */
export interface GraphQuery {
  id: string;
  hash: string;
  timestamp: number;
  type: "entity" | "relationship" | "traversal" | "analysis";
  operation: string;
  params: Record<string, unknown>;
}

/** Wrapper that pairs a query with its result data and execution metadata. */
export interface QueryResult<T = unknown> {
  data: T;
  query: GraphQuery;
  metadata: {
    fromCache: boolean;
    executionTimeMs: number;
    cacheLevel?: "L1" | "L2" | "L3";
  };
}

/** A query after the optimiser has rewritten it for execution. */
export interface OptimizedQuery {
  sql: string;
  estimatedCost: number;
  params?: unknown[];
  useIndex?: string | undefined;
}

// ---------------------------------------------------------------------------
// Cache statistics
// ---------------------------------------------------------------------------

/** Snapshot of cache tier utilisation and performance. */
export interface CacheStats {
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  memoryUsageMB: number;
  l1Entries: number;
  l2Entries: number;
  l3Entries: number;
}

// ---------------------------------------------------------------------------
// Connection pool settings
// ---------------------------------------------------------------------------

/** Tuning knobs for the database connection pool. */
export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  idleTimeout: number;
  acquireTimeout: number;
  connectionTestInterval: number;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/** Options for streaming large result sets in batches. */
export interface StreamOptions {
  batchSize: number;
  highWaterMark: number;
  encoding?: BufferEncoding;
}

// ---------------------------------------------------------------------------
// Monitoring metrics
// ---------------------------------------------------------------------------

/** Aggregated query performance counters. */
export interface QueryMetrics {
  totalQueries: number;
  slowQueries: number;
  errorRate: number;
  cacheHitRate: number;
  averageResponseTime: number;
  concurrentQueries: number;
}
