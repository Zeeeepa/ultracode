/**
 * Parser Worker Thread
 *
 * Executes tree-sitter parsing in a separate thread to avoid blocking main thread.
 * Handles batch parsing of multiple files with isolated parser instance.
 */

import { parentPort, workerData } from "node:worker_threads";
import { IncrementalParser } from "../../parsers/incremental-parser.js";
import type { ParseResult, ParserOptions } from "../../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface WorkerTask {
  id: string;
  files: string[];
  options?: ParserOptions;
}

interface WorkerResult {
  taskId: string;
  results: ParseResult[];
  errors?: Array<{ file: string; message: string }>;
  stats: {
    filesProcessed: number;
    totalTime: number;
    avgTimePerFile: number;
  };
}

// =============================================================================
// WORKER INITIALIZATION
// =============================================================================

let parser: IncrementalParser | null = null;
let isInitialized = false;

async function initializeParser(): Promise<void> {
  if (isInitialized) return;

  try {
    // Initialize with 100MB cache
    parser = new IncrementalParser(100 * 1024 * 1024);
    await parser.initialize();
    isInitialized = true;

    if (parentPort) {
      parentPort.postMessage({
        type: "initialized",
        workerId: workerData?.workerId || "unknown",
      });
    }
  } catch (error) {
    if (parentPort) {
      parentPort.postMessage({
        type: "error",
        error: `Failed to initialize parser: ${(error as Error).message}`,
      });
    }
    throw error;
  }
}

// =============================================================================
// TASK PROCESSING
// =============================================================================

async function processTask(task: WorkerTask): Promise<WorkerResult> {
  if (!parser || !isInitialized) {
    await initializeParser();
  }

  const startTime = Date.now();
  const results: ParseResult[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  for (const file of task.files) {
    try {
      const result = await parser!.parseFile(file, undefined, task.options);
      results.push(result);
    } catch (error) {
      errors.push({
        file,
        message: (error as Error).message,
      });
      // Don't add empty result - errors array tracks failures
    }
  }

  const totalTime = Date.now() - startTime;

  return {
    taskId: task.id,
    results,
    errors: errors.length > 0 ? errors : undefined,
    stats: {
      filesProcessed: task.files.length,
      totalTime,
      avgTimePerFile: totalTime / task.files.length,
    },
  };
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

if (parentPort) {
  parentPort.on("message", async (message: any) => {
    try {
      if (message.type === "init") {
        await initializeParser();
        return;
      }

      if (message.type === "shutdown") {
        // Cleanup and exit
        if (parser) {
          parser.clearCache();
        }
        process.exit(0);
      }

      if (message.type === "task") {
        const task = message.payload as WorkerTask;
        const result = await processTask(task);

        if (parentPort) {
          parentPort.postMessage({
            type: "result",
            payload: result,
          });
        }
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: "error",
          taskId: message.payload?.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    }
  });

  // Signal ready
  parentPort.postMessage({
    type: "ready",
    workerId: workerData?.workerId || "unknown",
  });
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

process.on("uncaughtException", (error) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Uncaught exception: ${error.message}`,
      stack: error.stack,
    });
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Unhandled rejection: ${reason}`,
    });
  }
  process.exit(1);
});
