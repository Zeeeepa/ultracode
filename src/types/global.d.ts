/// <reference types="@types/bun" />

declare global {
  var testDb: any | undefined; // bun:sqlite Database for tests

  namespace NodeJS {
    interface ProcessEnv {
      // System
      NODE_ENV?: string;
      DEBUG?: string;
      HOME?: string;
      PATH?: string;
      APPDATA?: string;
      LOCALAPPDATA?: string;
      USERPROFILE?: string;
      XDG_DATA_HOME?: string;
      BUNDLED?: string;

      // MCP Core
      MCP_DEBUG?: string;
      MCP_DEBUG_MODE?: string;
      MCP_DEBUG_DISABLE_SEMANTIC?: string;
      MCP_QUIET_MODE?: string;
      MCP_USE_PARSER?: string;
      MCP_SERVER_HOST?: string;
      MCP_SERVER_PORT?: string;
      MCP_SERVER_TIMEOUT?: string;
      MCP_AGENT_TIMEOUT?: string;
      MCP_MAX_CONCURRENT_AGENTS?: string;
      MCP_DEV_INDEX_BATCH?: string;
      MCP_SEMANTIC_WARMUP_LIMIT?: string;
      MCP_SEMANTIC_WARMUP_TOPIC?: string;

      // Embedding
      MCP_EMBEDDING_ENABLED?: string;
      MCP_EMBEDDING_PROVIDER?: string;
      MCP_EMBEDDING_MODEL?: string;
      MCP_EMBEDDING_API_KEY?: string;
      MCP_EMBEDDING_FALLBACK?: string;
      MCP_EMBEDDING_TWO_PHASE?: string;
      EMBEDDING_DEBUG?: string;

      // Ollama
      OLLAMA_BASE_URL?: string;
      OLLAMA_TIMEOUT_MS?: string;
      OLLAMA_CONCURRENCY?: string;
      OLLAMA_AUTO_PULL?: string;
      OLLAMA_WARMUP_TEXT?: string;
      OLLAMA_CHECK_SERVER?: string;
      OLLAMA_PULL_TIMEOUT_MS?: string;

      // OpenAI
      OPENAI_BASE_URL?: string;
      OPENAI_API_KEY?: string;
      OPENAI_TIMEOUT_MS?: string;
      OPENAI_CONCURRENCY?: string;
      OPENAI_MAX_BATCH_SIZE?: string;

      // CloudRU
      CLOUDRU_BASE_URL?: string;
      CLOUDRU_API_KEY?: string;
      CLOUDRU_TIMEOUT_MS?: string;
      CLOUDRU_CONCURRENCY?: string;
      CLOUDRU_MAX_BATCH_SIZE?: string;

      // HuggingFace
      HUGGINGFACE_BASE_URL?: string;
      HUGGINGFACE_API_KEY?: string;
      HUGGINGFACE_TIMEOUT_MS?: string;
      HUGGINGFACE_CONCURRENCY?: string;
      HUGGINGFACE_WARMUP_TEXT?: string;
      HF_TOKEN?: string;
      HF_API_TOKEN?: string;
      HUGGING_FACE_HUB_TOKEN?: string;

      // TEI
      TEI_BASE_URL?: string;
      TEI_TIMEOUT_MS?: string;
      TEI_CONCURRENCY?: string;
      TEI_CHECK_SERVER?: string;

      // Database
      DATABASE_PATH?: string;
      DATABASE_MODE?: string;
      DATABASE_CACHE_SIZE?: string;
      DATABASE_MMAP_SIZE?: string;
      DATABASE_SYNCHRONOUS?: string;
      DATABASE_TEMP_STORE?: string;
      SQLITE_LIB_PATH?: string;

      // LibSQL Vector
      LIBSQL_METRIC?: string;
      LIBSQL_COMPRESSION?: string;
      LIBSQL_SEARCH_L?: string;
      LIBSQL_INSERT_L?: string;

      // Logging
      LOG_LEVEL?: string;
      LOG_FORMAT?: string;
      LOG_FILE?: string;
      LOG_MAX_FILE_SIZE?: string;
      LOG_MAX_FILES?: string;
      LOG_ENABLE_CONSOLE?: string;

      // Git
      GIT_ENABLED?: string;
      GIT_AUTO_REINDEX?: string;
      GIT_POLL_INTERVAL_MS?: string;
      GIT_WATCH_BRANCH_CHANGES?: string;
      GIT_WATCH_UNCOMMITTED?: string;
      GIT_UNCOMMITTED_POLL_INTERVAL_MS?: string;
      GIT_INCLUDE_UNTRACKED?: string;

      // Indexing
      INDEXING_BRANCH_AWARE?: string;
      INDEXING_AUTO_SWITCH?: string;
      INDEXING_DATA_DIR?: string;
      INDEXING_MAX_BRANCHES_PER_REPO?: string;
      INDEXING_MAX_TOTAL_BRANCHES?: string;
      INDEXING_CLEANUP_INTERVAL_MS?: string;
      INDEXING_INCREMENTAL_THRESHOLD?: string;

      // Parser
      PARSER_TIMEOUT?: string;
      PARSER_MAX_FILE_SIZE?: string;
      PARSER_BUFFER_SIZE?: string;
      PARSER_CACHE_SIZE?: string;
      PARSER_CACHE_TTL?: string;
      PARSER_DISABLE_CACHE?: string;
      PARSER_TREE_SITTER_ENABLED?: string;
      PARSER_INCREMENTAL_ENABLED?: string;
      PARSER_LANGUAGES?: string;
      PARSER_USE_WORKERS?: string;
      PARSING_WORKER_ID?: string;

      // Parser Agent
      PARSER_AGENT_MAX_CONCURRENCY?: string;
      PARSER_AGENT_MEMORY_LIMIT?: string;
      PARSER_AGENT_PRIORITY?: string;
      PARSER_AGENT_BATCH_SIZE?: string;
      PARSER_AGENT_CACHE_SIZE?: string;
      PARSER_AGENT_WORKER_POOL_SIZE?: string;

      // Semantic Agent
      SEMANTIC_AGENT_MAX_CONCURRENCY?: string;
      SEMANTIC_AGENT_MEMORY_LIMIT?: string;
      SEMANTIC_AGENT_PRIORITY?: string;
      SEMANTIC_AGENT_BATCH_SIZE?: string;
      SEMANTIC_AGENT_MODEL_PATH?: string;

      // Query Agent
      QUERY_AGENT_MAX_CONCURRENCY?: string;
      QUERY_AGENT_MEMORY_LIMIT?: string;
      QUERY_AGENT_PRIORITY?: string;
      QUERY_AGENT_SIMPLE_TIMEOUT?: string;
      QUERY_AGENT_COMPLEX_TIMEOUT?: string;
      QUERY_AGENT_CACHE_WARMUP?: string;

      // Indexer Agent
      INDEXER_AGENT_MAX_CONCURRENCY?: string;
      INDEXER_AGENT_MEMORY_LIMIT?: string;
      INDEXER_AGENT_PRIORITY?: string;
      INDEXER_AGENT_BATCH_SIZE?: string;
      INDEXER_AGENT_CACHE_SIZE?: string;
      INDEXER_AGENT_CACHE_TTL?: string;

      // Dev Agent
      DEV_AGENT_MAX_CONCURRENCY?: string;
      DEV_AGENT_MEMORY_LIMIT?: string;
      DEV_AGENT_PRIORITY?: string;

      // Dora Agent
      DORA_AGENT_MAX_CONCURRENCY?: string;
      DORA_AGENT_MEMORY_LIMIT?: string;
      DORA_AGENT_PRIORITY?: string;

      // Conductor
      CONDUCTOR_MAX_CONCURRENCY?: string;
      CONDUCTOR_MEMORY_LIMIT?: string;
      CONDUCTOR_PRIORITY?: string;
      CONDUCTOR_TASK_QUEUE_LIMIT?: string;
      CONDUCTOR_MAX_CONCURRENT_AGENTS?: string;
      CONDUCTOR_MAX_TASK_QUEUE_SIZE?: string;
      CONDUCTOR_MAX_MEMORY_MB?: string;
      CONDUCTOR_MAX_CPU_PERCENT?: string;
      CONDUCTOR_LOAD_BALANCING_STRATEGY?: string;
      CONDUCTOR_MANDATORY_DELEGATION?: string;
      CONDUCTOR_COMPLEXITY_THRESHOLD?: string;

      // Coordinator
      COORDINATOR_MAX_CONCURRENCY?: string;
      COORDINATOR_MEMORY_LIMIT?: string;
      COORDINATOR_PRIORITY?: string;
      COORDINATOR_TASK_QUEUE_LIMIT?: string;
      COORDINATOR_MAX_CONCURRENT_AGENTS?: string;
      COORDINATOR_MAX_TASK_QUEUE_SIZE?: string;
      COORDINATOR_MAX_MEMORY_MB?: string;
      COORDINATOR_MAX_CPU_PERCENT?: string;
      COORDINATOR_LOAD_BALANCING_STRATEGY?: string;

      // GPU/Hardware
      CUDA_FORCE_DISABLE?: string;
      WEBGPU_FORCE_ENABLE?: string;
      WEBGPU_FORCE_DISABLE?: string;

      // Vector Store
      VECTOR_STORE_DEBUG?: string;

      // Misc
      ULTRASCRIPT_NO_SUBPROCESS?: string;
      ADAPTIVE_DEBUG?: string;
      OV_DEBUG?: string;
    }
  }

  /**
   * Bun global object (undefined when running under Node.js)
   * Types from @types/bun package
   */
  var Bun: typeof import("bun") | undefined;

  /**
   * ReadableStream with getReader method
   */
  interface ReadableStream<R = unknown> {
    readonly locked: boolean;
    cancel(reason?: unknown): Promise<void>;
    getReader(): ReadableStreamDefaultReader<R>;
    pipeThrough<T>(transform: ReadableWritablePair<T, R>, options?: StreamPipeOptions): ReadableStream<T>;
    pipeTo(destination: WritableStream<R>, options?: StreamPipeOptions): Promise<void>;
    tee(): [ReadableStream<R>, ReadableStream<R>];
  }

  interface ReadableStreamDefaultReader<R = unknown> {
    readonly closed: Promise<undefined>;
    cancel(reason?: unknown): Promise<void>;
    read(): Promise<ReadableStreamReadResult<R>>;
    releaseLock(): void;
  }

  interface ReadableStreamReadResult<T> {
    done: boolean;
    value?: T;
  }

  /**
   * Global fetch API types (Node.js 18+ / Bun)
   * Explicitly declared to avoid conflicts between @types/node and @types/bun
   */
  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly body: ReadableStream<Uint8Array> | null;
    readonly bodyUsed: boolean;
    readonly url: string;
    readonly type: ResponseType;
    readonly redirected: boolean;
    json<T = unknown>(): Promise<T>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    formData(): Promise<FormData>;
    clone(): Response;
  }

  interface RequestInit {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    mode?: RequestMode;
    credentials?: RequestCredentials;
    cache?: RequestCache;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
    integrity?: string;
    keepalive?: boolean;
    signal?: AbortSignal | null | undefined;
  }

  function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
