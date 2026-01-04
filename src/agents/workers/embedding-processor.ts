/**
 * Embedding Processor for Generic Language Worker
 *
 * Handles embedding generation in worker context:
 * - Initialize lightweight HTTP embedding client
 * - Build embedding text for entities
 * - Generate embeddings in batches with concurrency
 * - Collect and send embeddings via IPC or file dump
 *
 * Extracted from generic-language-worker.ts for better modularity.
 */

import type { ParsedEntity } from "../../types/parser.js";
import type { WorkerEmbeddingConfig } from "../../types/semantic.js";
import {
  addVectorToDump,
  flushVectorDump,
  getVectorDumpDir,
  getVectorDumpTotalWritten,
  initVectorDump,
} from "./vector-dump-writer.js";
import { workerLog } from "./worker-logging.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Collected embeddings for batch transfer to main process
 * Uses ArrayBuffer for binary transfer (zero-copy via transferList)
 */
export interface CollectedEmbedding {
  id: string;
  vectorBuffer: ArrayBuffer; // Binary data for zero-copy transfer
  content: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingProcessorContext {
  postWorkerMessage: (message: any, transferList?: ArrayBuffer[]) => void;
  getWorkerId: () => string;
}

// =============================================================================
// State
// =============================================================================

/**
 * Entity types excluded from embedding generation.
 * Low-value (import/export) or duplicates (method/property already in class embedding)
 */
const EMBEDDING_EXCLUDE_ENTITY_TYPES = new Set([
  "import",
  "export",
  "module",
  "constant",
  "variable",
  "method",
  "property",
  "async_function",
]);

/** Lightweight embedding client instance */
let embeddingClient: import("./worker-embedding-client.js").WorkerEmbeddingClient | null = null;
let embeddingClientInitPromise: Promise<void> | null = null;

/** Worker embedding configuration received from main process */
let embeddingConfig: WorkerEmbeddingConfig | null = null;

/** Local deduplication: track entity IDs already processed in this worker session */
const generatedEntityIds = new Set<string>();

/** Collected embeddings for IPC transfer */
const collectedEmbeddings: CollectedEmbedding[] = [];

// =============================================================================
// Client Initialization
// =============================================================================

/**
 * Get current embedding config
 */
export function getEmbeddingConfig(): WorkerEmbeddingConfig | null {
  return embeddingConfig;
}

/**
 * Set embedding config
 */
export function setEmbeddingConfig(config: WorkerEmbeddingConfig): void {
  embeddingConfig = config;
}

/**
 * Get embedding client
 */
export function getEmbeddingClient(): any {
  return embeddingClient;
}

/**
 * Initialize lightweight embedding client with config from main process
 */
export async function initEmbeddingClient(config: WorkerEmbeddingConfig): Promise<void> {
  if (!config.enabled) {
    workerLog("INFO", "Embeddings disabled in worker config");
    return;
  }

  // Initialize vector dump for direct file writing (bypasses IPC)
  initVectorDump(config);

  if (embeddingClientInitPromise) {
    await embeddingClientInitPromise;
    return;
  }

  embeddingClientInitPromise = (async () => {
    try {
      workerLog("INFO", `Initializing WorkerEmbeddingClient`, { provider: config.provider, model: config.modelName });

      // Use lightweight HTTP-only client (no heavy dependencies)
      const { WorkerEmbeddingClient } = await import("./worker-embedding-client.js");
      embeddingClient = new WorkerEmbeddingClient(config);
      await embeddingClient.initialize();

      workerLog("INFO", `WorkerEmbeddingClient initialized successfully`);
    } catch (error) {
      workerLog("ERROR", `Failed to init WorkerEmbeddingClient: ${(error as Error).message}`);
      workerLog("ERROR", `Stack: ${(error as Error).stack}`);
      embeddingClient = null;
    }
  })();

  await embeddingClientInitPromise;
}

/**
 * Clear embedding client (for shutdown)
 */
export function clearEmbeddingClient(): void {
  embeddingClient = null;
}

// =============================================================================
// Text Building
// =============================================================================

/**
 * Build embedding text for an entity.
 * Includes: name, type, signature, code snippet (truncated to maxTokens).
 */
export function buildEmbeddingText(entity: ParsedEntity, fileContent: string, maxTokens: number): string {
  const parts: string[] = [];

  // Header: name + type + signature
  const header = `${entity.name ?? ""} ${entity.type ?? ""} ${entity.signature ?? ""}`.trim();
  parts.push(header);

  // Extract code snippet from file content using location
  // Use ~2.0 chars per token for code (very conservative for safety)
  const charsPerToken = 2.0;
  if (entity.location) {
    try {
      const { start, end } = entity.location;
      if (typeof start?.index === "number" && typeof end?.index === "number") {
        const maxLen = Math.min(Math.floor(maxTokens * charsPerToken), 10000);
        const code = fileContent.slice(start.index, Math.min(end.index, start.index + maxLen));
        parts.push(code);
      } else if (typeof start?.line === "number" && typeof end?.line === "number") {
        const lines = fileContent.split("\n");
        const startLine = Math.max(0, start.line - 1);
        const endLine = Math.min(lines.length, end.line);
        const code = lines
          .slice(startLine, endLine)
          .join("\n")
          .slice(0, Math.floor(maxTokens * charsPerToken));
        parts.push(code);
      }
    } catch {
      // Ignore extraction errors
    }
  }

  // Add documentation if available
  if ((entity as any).documentation?.description) {
    parts.push(`description: ${(entity as any).documentation.description}`);
  }

  // Add return type
  if (entity.returnType) {
    parts.push(`returns: ${entity.returnType}`);
  }

  // Combine and truncate
  const text = parts.join("\n").trim();
  // Very conservative truncation: ~2.0 chars per token for code
  return text.slice(0, Math.floor(maxTokens * 2.0));
}

// =============================================================================
// Embedding Generation
// =============================================================================

/**
 * Generate embeddings for entities and collect them for batch transfer
 * For subprocess mode: embeddings are collected and sent separately via embeddings.ready message
 * For backward compatibility: also attaches Base64 encoded embeddings to entities
 */
export async function generateEmbeddingsForEntities(
  entities: ParsedEntity[],
  fileContent: string,
  filePath: string,
): Promise<number> {
  if (!embeddingClient || !embeddingConfig?.enabled) {
    return 0;
  }

  // Use contextTokens (model limit) for truncation, fallback to maxTokens
  const contextTokens = embeddingConfig.contextTokens || embeddingConfig.maxTokens || 512;
  const batchSize = embeddingConfig.batchSize || 32;
  const concurrency = 3; // Process up to 3 batches in parallel

  // Filter out low-value entity types before embedding generation
  const filteredEntities = entities.filter((e) => !EMBEDDING_EXCLUDE_ENTITY_TYPES.has(e.type));

  // Build texts for filtered entities, with local deduplication
  const entityTexts: { entity: ParsedEntity; text: string; entityId: string }[] = [];
  let skippedDuplicates = 0;

  for (const entity of filteredEntities) {
    // Pre-compute entity ID for deduplication
    const rawEntityId = (entity as any).id || `${filePath}:${entity.type}:${entity.name}`;
    const entityId = `ent:${rawEntityId}`;

    // Skip if already generated in this worker session
    if (generatedEntityIds.has(entityId)) {
      skippedDuplicates++;
      continue;
    }

    const text = buildEmbeddingText(entity, fileContent, contextTokens);
    if (text.length > 0) {
      entityTexts.push({ entity, text, entityId });
    }
  }

  if (skippedDuplicates > 0) {
    workerLog("DEBUG", `Skipped ${skippedDuplicates} duplicate entities (local dedup)`);
  }

  if (entityTexts.length === 0) {
    return 0;
  }

  // Split into batches
  const batches: (typeof entityTexts)[] = [];
  for (let i = 0; i < entityTexts.length; i += batchSize) {
    batches.push(entityTexts.slice(i, i + batchSize));
  }

  let generatedCount = 0;

  // Process batches in waves of 'concurrency' size
  // Each wave runs in parallel, then we start next wave
  const processBatch = async (batch: typeof entityTexts, idx: number): Promise<void> => {
    const texts = batch.map((et) => et.text);
    try {
      const embeddings = await embeddingClient!.generateBatch(texts);

      // Process embeddings - write to file dump or collect for IPC
      for (let j = 0; j < batch.length; j++) {
        const et = batch[j]!;
        const embedding = embeddings[j];
        if (embedding) {
          // Use pre-computed entityId from deduplication phase
          const { entityId } = et;

          // Mark as generated for local deduplication
          generatedEntityIds.add(entityId);

          // PRIMARY PATH: Write directly to file dump (bypasses IPC entirely)
          if (getVectorDumpDir()) {
            addVectorToDump(entityId, embedding);
          } else {
            // FALLBACK: Collect for IPC transfer (legacy path)
            const vectorBuffer = embedding.buffer.slice(
              embedding.byteOffset,
              embedding.byteOffset + embedding.byteLength,
            ) as ArrayBuffer;

            const rawEntityId = (et.entity as any).id || `${filePath}:${et.entity.type}:${et.entity.name}`;
            collectedEmbeddings.push({
              id: entityId,
              vectorBuffer,
              content: et.text.slice(0, 500),
              metadata: {
                entityId: rawEntityId,
                entityType: et.entity.type,
                entityName: et.entity.name,
                path: filePath,
                filePath,
                line: et.entity.location?.start?.line,
                start: et.entity.location?.start?.index,
                end: et.entity.location?.end?.index,
              },
            });
          }

          // Store embedding text for search result display
          et.entity.embeddingText = et.text.slice(0, 200);

          generatedCount++;
        }
      }
    } catch (error) {
      workerLog("WARN", `Embedding batch failed: ${(error as Error).message}`, { batchIdx: idx });
    }
  };

  // Process in waves - run 'concurrency' batches in parallel, wait, repeat
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    await Promise.all(wave.map((batch, j) => processBatch(batch, i + j)));
  }

  return generatedCount;
}

// =============================================================================
// Embedding Collection and Transfer
// =============================================================================

/**
 * Send collected embeddings to main process
 * PRIMARY PATH: If vectorDumpDir is set, just flush remaining buffer and notify
 * FALLBACK: Uses binary IPC transfer for legacy path
 */
export function sendCollectedEmbeddings(ctx: EmbeddingProcessorContext): void {
  // PRIMARY PATH: File dump mode - flush and notify
  const dumpDir = getVectorDumpDir();
  if (dumpDir) {
    // Flush any remaining buffered vectors to disk
    flushVectorDump();

    // Notify main process that vectors were written to files
    // Main will read files and load into FAISS at end of indexing
    const totalWritten = getVectorDumpTotalWritten();
    if (totalWritten > 0) {
      ctx.postWorkerMessage({
        type: "vectors.written",
        count: totalWritten,
        dumpDir,
        workerId: ctx.getWorkerId(),
      });

      workerLog("INFO", `Vectors written to files (no IPC)`, {
        count: totalWritten,
        dir: dumpDir,
      });
    }
    return;
  }

  // FALLBACK: IPC transfer mode (legacy)
  if (collectedEmbeddings.length === 0) {
    return;
  }

  const transferList: ArrayBuffer[] = collectedEmbeddings.map((e) => e.vectorBuffer);

  ctx.postWorkerMessage(
    {
      type: "embeddings.ready",
      count: collectedEmbeddings.length,
      embeddings: collectedEmbeddings,
    },
    transferList,
  );

  workerLog("INFO", `Sent embeddings to main process (binary transfer)`, {
    count: collectedEmbeddings.length,
    totalBytes: transferList.reduce((sum, buf) => sum + buf.byteLength, 0),
  });

  collectedEmbeddings.length = 0;
}
