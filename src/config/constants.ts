/**
 * Application Constants
 *
 * Central location for all magic numbers and configuration constants
 * Replaces duplicated constants across the codebase
 *
 * Benefits:
 * - Single source of truth
 * - Type-safe with 'as const'
 * - Easy to modify and test
 * - Self-documenting
 */

// =============================================================================
// CACHE CONSTANTS
// =============================================================================

/**
 * Cache configuration constants
 *
 * Used in:
 * - src/semantic/embedding-generator.ts
 * - src/types/semantic.ts
 * - src/semantic/semantic-cache.ts
 */
export const CACHE_CONSTANTS = {
  /**
   * Maximum number of entries in LRU caches
   * Duplicated in: embedding-generator.ts, semantic.ts
   */
  MAX_CACHE_ENTRIES: 5000,

  /**
   * Cache time-to-live in milliseconds (1 hour)
   */
  CACHE_TTL_MS: 3600000,

  /** Default embedding batch size — 1024 (synced with Zig, was 16) */
  EMBEDDING_BATCH_SIZE: 1024,

  /**
   * Vector store batch size for bulk operations
   */
  VECTOR_STORE_BATCH_SIZE: 100,
} as const;

// =============================================================================
// DATABASE CONSTANTS
// =============================================================================

/**
 * SQLite database configuration constants
 *
 * Used in: src/storage/sqlite-manager.ts
 */
export const DATABASE_CONSTANTS = {
  /** Page size — 8KB optimal for CBOR BLOBs (synced with Zig constants.zig) */
  PAGE_SIZE: 8192,
  /** Cache size — 256MB negative=bytes (synced with Zig) */
  CACHE_SIZE: -262144,
  /** Memory-mapped I/O — 256MB */
  MMAP_SIZE: 268_435_456,
  /** Busy timeout ms */
  BUSY_TIMEOUT: 5000,
  /** Versioning.db busy timeout (longer for WAL checkpoints) */
  VERSIONING_BUSY_TIMEOUT: 30_000,
  /** WAL auto-checkpoint threshold (pages) */
  WAL_AUTOCHECKPOINT: 1000,
} as const;

// =============================================================================
// PARSER CONSTANTS
// =============================================================================

/**
 * Parser circuit breaker limits
 *
 * Used in: go-analyzer.ts, java-analyzer.ts, base-parser-utils.ts
 */
export const PARSER_CONSTANTS = {
  /** Maximum recursion depth to prevent stack overflow */
  MAX_RECURSION_DEPTH: 100,
  /** Parse timeout ms */
  PARSE_TIMEOUT_MS: 5000,
  /** Complexity threshold for circuit breaker */
  COMPLEXITY_THRESHOLD: 100,
  /** Maximum file size to parse — 5MB (synced with Zig, was 10MB) */
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
} as const;

// =============================================================================
// AGENT CONSTANTS
// =============================================================================

/**
 * Multi-agent system configuration
 *
 * Used in: conductor-orchestrator.ts, resource-manager.ts
 */
export const AGENT_CONSTANTS = {
  /**
   * Maximum concurrent agents
   */
  MAX_CONCURRENT_AGENTS: 10,

  /**
   * Default agent timeout in milliseconds
   */
  DEFAULT_AGENT_TIMEOUT: 30000,

  /**
   * Task complexity threshold for delegation
   */
  COMPLEXITY_THRESHOLD: 8,

  /**
   * Maximum retries for failed tasks
   */
  MAX_RETRIES: 3,

  /**
   * Backoff multiplier for retries
   */
  RETRY_BACKOFF_MULTIPLIER: 2,
} as const;

// =============================================================================
// RESOURCE MANAGEMENT CONSTANTS
// =============================================================================

/**
 * Resource allocation limits
 *
 * Used in: resource-manager.ts
 */
export const RESOURCE_CONSTANTS = {
  /**
   * Default memory limit in MB
   */
  DEFAULT_MEMORY_LIMIT_MB: 1024,

  /**
   * Maximum memory limit in MB
   */
  MAX_MEMORY_LIMIT_MB: 8192,

  /**
   * CPU usage threshold (percentage)
   */
  CPU_THRESHOLD_PERCENT: 80,

  /**
   * Memory check interval in milliseconds
   */
  MEMORY_CHECK_INTERVAL_MS: 5000,
} as const;

// =============================================================================
// INDEXING CONSTANTS
// =============================================================================

/**
 * Indexing configuration
 *
 * Used in: dev-agent.ts, indexer-agent.ts
 */
export const INDEXING_CONSTANTS = {
  /** Default batch size — 1000 (synced with Zig) */
  DEFAULT_BATCH_SIZE: 1000,
  /** Generation GC limit */
  GENERATION_GC_LIMIT: 10_000,
  /** Large codebase threshold (files) */
  LARGE_CODEBASE_THRESHOLD: 2000,
  /** Very large codebase threshold (files) */
  VERY_LARGE_CODEBASE_THRESHOLD: 5000,
  /** Maximum entities per batch */
  MAX_ENTITIES_PER_BATCH: 1000,
  /** Name token minimum length */
  NAME_TOKEN_MIN_LENGTH: 2,
} as const;

// =============================================================================
// VECTOR SEARCH CONSTANTS
// =============================================================================

/**
 * Vector similarity search configuration
 *
 * Used in: vector-store.ts, semantic-agent.ts
 */
export const VECTOR_CONSTANTS = {
  /**
   * Default embedding dimensions (Granite model)
   */
  DEFAULT_EMBEDDING_DIMENSIONS: 384,

  /**
   * Alias for DEFAULT_EMBEDDING_DIMENSIONS (for consistency)
   */
  DEFAULT_VECTOR_DIMENSIONS: 384,

  /**
   * Minimum similarity threshold for search results
   */
  MIN_SIMILARITY_THRESHOLD: 0.7,

  /**
   * Default similarity threshold (for consistency)
   */
  DEFAULT_SIMILARITY_THRESHOLD: 0.7,

  /**
   * Default number of search results
   */
  DEFAULT_SEARCH_LIMIT: 10,

  /**
   * Maximum number of search results
   */
  MAX_SEARCH_LIMIT: 100,

  /**
   * Maximum batch size for vector operations
   */
  MAX_BATCH_SIZE: 8,
} as const;

// =============================================================================
// EXPORTS
// =============================================================================

// =============================================================================
// TRACING CONSTANTS (synced with Zig constants.zig)
// =============================================================================

export const TRACING_CONSTANTS = {
  /** Maximum trace depth */
  MAX_DEPTH: 20,
  /** Maximum paths to return */
  MAX_PATHS: 10,
  /** Maximum callers to analyze */
  MAX_CALLERS: 100,
  /** BFS timeout ms */
  BFS_TIMEOUT_MS: 5000,
} as const;

// =============================================================================
// ANALYSIS CONSTANTS (synced with Zig constants.zig)
// =============================================================================

export const ANALYSIS_CONSTANTS = {
  MAX_TAINT_SOURCES: 100,
  MAX_TAINT_SINKS: 150,
  TAINT_TIMEOUT_MS: 25_000,
  MAX_HOTSPOTS: 50,
  MAX_DUPLICATES: 100,
  PAGERANK_ALPHA: 0.85,
  PAGERANK_MAX_ITERATIONS: 100,
  BETWEENNESS_MAX_SOURCES: 500,
} as const;

// =============================================================================
// WATCH CONSTANTS (synced with Zig constants.zig)
// =============================================================================

export const WATCH_CONSTANTS = {
  /** File watcher debounce — 100ms (Zig: 100, was 60000 in TS) */
  DEBOUNCE_MS: 100,
  MAX_BATCH_SIZE: 500,
  FALLBACK_POLL_INTERVAL_MS: 10_000,
  WIN32_BUFFER_SIZE: 65_536,
} as const;

// =============================================================================
// QUERY/MESSAGE LIMITS (synced with Zig constants.zig)
// =============================================================================

export const LIMIT_CONSTANTS = {
  MAX_ENTITIES_PER_QUERY: 2000,
  MAX_MESSAGE_SIZE: 65_536,
  READ_BUFFER_SIZE: 65_536,
} as const;

// =============================================================================
// EXCLUDED DIRECTORIES (synced with Zig constants.zig — 22 entries)
// =============================================================================

export const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".mypy_cache",
  "target",
  "vendor",
  ".zig-cache",
  "zig-out",
  ".cache",
  "output",
  "third_party",
  ".tmp",
  ".build",
  "coverage",
  ".venv",
  "venv",
  ".tox",
  ".eggs",
  "bower_components",
]);

// =============================================================================
// EMBEDDING CONSTANTS (synced with Zig constants.zig)
// =============================================================================

export const EMBEDDING_CONSTANTS = {
  DEFAULT_DIMENSION: 384,
  BATCH_SIZE: 1024,
  DEFAULT_MODEL: "multilingual-e5-small",
  /** Hybrid search weights */
  VECTOR_WEIGHT: 0.6,
  TEXT_WEIGHT: 0.3,
  GRAPH_WEIGHT: 0.1,
} as const;

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * All constants exported as a single object for convenience
 */
export const CONSTANTS = {
  CACHE: CACHE_CONSTANTS,
  DATABASE: DATABASE_CONSTANTS,
  PARSER: PARSER_CONSTANTS,
  AGENT: AGENT_CONSTANTS,
  RESOURCE: RESOURCE_CONSTANTS,
  INDEXING: INDEXING_CONSTANTS,
  VECTOR: VECTOR_CONSTANTS,
  TRACING: TRACING_CONSTANTS,
  ANALYSIS: ANALYSIS_CONSTANTS,
  WATCH: WATCH_CONSTANTS,
  LIMITS: LIMIT_CONSTANTS,
  EMBEDDING: EMBEDDING_CONSTANTS,
  EXCLUDED_DIRS,
} as const;

/**
 * Type-safe constant access
 *
 * Usage:
 * import { CACHE_CONSTANTS } from './config/constants.js';
 * const maxEntries = CACHE_CONSTANTS.MAX_CACHE_ENTRIES; // Type: 5000
 */
