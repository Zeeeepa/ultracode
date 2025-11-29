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

  /**
   * Default embedding batch size
   */
  EMBEDDING_BATCH_SIZE: 16,

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
  /**
   * Default database path
   */
  DEFAULT_DB_PATH: "", // Empty = use centralized storage via getProjectPaths()

  /**
   * Page size in bytes (optimal for most systems)
   */
  PAGE_SIZE: 4096,

  /**
   * Cache size in KB (64MB)
   */
  CACHE_SIZE_KB: 65536,

  /**
   * Memory-mapped I/O size (268MB)
   */
  MMAP_SIZE: 268435456,

  /**
   * WAL auto-checkpoint threshold (pages)
   */
  WAL_AUTOCHECKPOINT: 1000,

  /**
   * Busy timeout in milliseconds
   */
  BUSY_TIMEOUT: 5000,

  /**
   * Connection pool size
   */
  CONNECTION_POOL_SIZE: 5,
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
  /**
   * Maximum recursion depth to prevent stack overflow
   */
  MAX_RECURSION_DEPTH: 100,

  /**
   * Parse timeout in milliseconds (5 seconds for individual parsers)
   */
  PARSE_TIMEOUT_MS: 5000,

  /**
   * Complexity threshold for circuit breaker
   */
  COMPLEXITY_THRESHOLD: 100,

  /**
   * Maximum file size to parse (10MB)
   */
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
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
  /**
   * Default batch size for entity indexing
   */
  DEFAULT_BATCH_SIZE: 100,

  /**
   * Large codebase threshold (files)
   */
  LARGE_CODEBASE_THRESHOLD: 2000,

  /**
   * Very large codebase threshold (files)
   */
  VERY_LARGE_CODEBASE_THRESHOLD: 5000,

  /**
   * Maximum entities per batch
   */
  MAX_ENTITIES_PER_BATCH: 1000,
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
} as const;

/**
 * Type-safe constant access
 *
 * Usage:
 * import { CACHE_CONSTANTS } from './config/constants.js';
 * const maxEntries = CACHE_CONSTANTS.MAX_CACHE_ENTRIES; // Type: 5000
 */
