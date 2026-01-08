/**
 * Subprocess Pool Types
 *
 * Type definitions for the parsing subprocess pool.
 */

import type { ChildProcess } from "node:child_process";
import type { ParseResult, ParserOptions } from "../../../types/parser.js";
import type { WorkerEmbeddingConfig } from "../../../types/semantic.js";

// =============================================================================
// PROCESS TYPES
// =============================================================================

/**
 * Bun process interface (compatible with ChildProcess for common operations)
 */
export interface BunProcess {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  pid: number;
  kill(): void;
  exited: Promise<number>;
}

/**
 * State of a subprocess worker
 */
export interface SubprocessState {
  id: number;
  process: ChildProcess | BunProcess | null;
  busy: boolean;
  tasksProcessed: number;
  totalProcessingTime: number;
  memoryUsage: number;
  pendingResolve: ((results: ParseResult[]) => void) | null;
  pendingReject: ((error: Error) => void) | null;
  // For ready signal
  readyResolve: (() => void) | null;
  readyReject: ((error: Error) => void) | null;
  // For ping/pong memory check
  pendingPingResolve: ((memoryMB: number) => void) | null;
  // Flag to distinguish intentional kill from crash
  intentionalKill: boolean;
}

// =============================================================================
// IPC MESSAGE TYPES
// =============================================================================

/**
 * Parse request sent to subprocess
 */
export interface ParseRequest {
  type: "parse";
  id: string;
  files: string[];
  language: string;
  options?: ParserOptions | undefined;
  streamingMode?: boolean; // If true, worker sends streaming_result after each file
}

/**
 * Response from subprocess
 */
export interface ParseResponse {
  type: "result" | "error" | "ready" | "pong" | "streaming_result";
  id?: string | undefined;
  results?: ParseResult[];
  error?: string;
  stats?: {
    filesProcessed: number;
    totalTime: number;
    memoryUsed: number;
  };
  // Pong response fields
  memoryMB?: number;
  rssMB?: number;
  // Streaming result fields (when type === "streaming_result")
  taskId?: string;
  result?: ParseResult;
  fileIndex?: number;
  totalFiles?: number;
}

// =============================================================================
// POOL TYPES
// =============================================================================

/**
 * Statistics for the subprocess pool
 */
export interface SubprocessPoolStats {
  language: string;
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTime: number;
  filesProcessed: number;
  processRestarts: number;
}

/**
 * Binary embedding received from worker via IPC
 */
export interface BinaryEmbedding {
  id: string;
  vectorBuffer: ArrayBuffer;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Callback for receiving embeddings from workers
 */
export type EmbeddingsCallback = (embeddings: BinaryEmbedding[]) => void;

/**
 * Text item for centralized embedding generation
 * Workers send texts to Main, Main generates embeddings via gRPC
 */
export interface EmbeddingTextItem {
  /** Entity ID for the embedding */
  id: string;
  /** Text content to embed */
  text: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Callback for receiving embedding texts from workers (centralized mode)
 * Main process generates embeddings using EmbeddingGenerator with gRPC
 */
export type EmbeddingTextsCallback = (texts: EmbeddingTextItem[]) => void;

/**
 * Callback for streaming parse results (called after each file is parsed)
 */
export type StreamingResultCallback = (
  result: ParseResult,
  taskId: string,
  fileIndex: number,
  totalFiles: number,
) => void;

/**
 * Options for creating a subprocess pool
 */
export interface SubprocessPoolOptions {
  poolSize?: number;
  taskTimeout?: number;
  memoryLimitMB?: number; // Kill and restart process if memory exceeds this
  killAfterBatch?: boolean; // Kill process after each batch to release memory
  maxFilesPerChunk?: number; // Max files per worker batch (default: 100, prevents memory bloat)
  /**
   * Keepalive mode: keep one worker alive for fast incremental processing.
   * After bulk indexing, worker 0 stays alive instead of being killed.
   * Worker is restarted if memory exceeds keepaliveMemoryLimitMB.
   */
  keepaliveMode?: boolean;
  /** Memory limit for keepalive worker (default: 500MB). Worker is restarted if exceeded. */
  keepaliveMemoryLimitMB?: number;
  /** Embedding configuration for workers. If provided, workers generate embeddings. */
  embeddingConfig?: WorkerEmbeddingConfig;
  /** Callback for binary embeddings from workers (distributed mode) */
  onEmbeddings?: EmbeddingsCallback;
  /**
   * Callback for embedding texts from workers (centralized mode).
   * When set, workers send texts instead of embeddings.
   * Main process generates embeddings via EmbeddingGenerator (gRPC).
   */
  onEmbeddingTexts?: EmbeddingTextsCallback;
  /**
   * Enable streaming mode: workers send results after each file via IPC.
   * Use with onStreamingResult callback to process results as they arrive.
   */
  streamingMode?: boolean;
  /** Callback for streaming parse results (called after each file is parsed) */
  onStreamingResult?: StreamingResultCallback;
}

/**
 * Task queued for processing
 */
export interface QueuedTask {
  id: string;
  files: string[];
  options?: ParserOptions | undefined;
  resolve: (results: ParseResult[]) => void;
  reject: (error: Error) => void;
}
