/**
 * Python Specialized Worker Thread
 *
 * Dedicated worker for Python files with optimized 4-layer architecture.
 * Handles Python-specific parsing with Layer 1-4 analysis in isolated thread.
 *
 * Performance Target: 3.4x speedup for Python files (266ms → 78ms per file)
 * Architecture: TASK-003B 4-layer enhancement
 */

import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { log } from "../../logging/index.js";
import type { ParseResult, ParserOptions } from "../../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface WorkerTask {
  id: string;
  files: string[];
  options?: ParserOptions | undefined;
}

interface WorkerResult {
  taskId: string;
  results: ParseResult[];
  errors?: Array<{ file: string; message: string }>;
  stats: {
    filesProcessed: number;
    totalTime: number;
    avgTimePerFile: number;
    layer1Time: number;
    layer2Time: number;
    layer3Time: number;
    layer4Time: number;
  };
}

/**
 * Worker message types
 */
type WorkerMessage = { type: "init" } | { type: "task"; task: WorkerTask } | { type: "shutdown" } | { type: "ping" };

/**
 * Python parser interface (from python-native-parser.ts)
 * Uses CLI script that supports relationship extraction
 */
interface PythonParser {
  initialize(): Promise<void>;
  parse(filePath: string, content: string, contentHash: string): Promise<ParseResult>;
}

// =============================================================================
// PYTHON-SPECIFIC PARSER INITIALIZATION
// =============================================================================

let pythonParser: PythonParser | null = null;
let isInitialized = false;

async function initializePythonParser(): Promise<void> {
  if (isInitialized) return;

  try {
    // Use PythonNativeParser which calls python-ast-cli.py for relationship extraction
    const { PythonNativeParser } = await import("../../parsers/python-native-parser.js");

    // Create Python parser with CLI script support
    pythonParser = new PythonNativeParser() as unknown as PythonParser;
    await pythonParser.initialize();
    isInitialized = true;

    if (parentPort) {
      parentPort.postMessage({
        type: "initialized",
        workerId: workerData?.workerId || "python-worker",
        features: "CLI script with relationships",
      });
    }
  } catch (error) {
    if (parentPort) {
      parentPort.postMessage({
        type: "error",
        error: `Failed to initialize Python parser: ${(error as Error).message}`,
      });
    }
    throw error;
  }
}

// =============================================================================
// TASK PROCESSING WITH 4-LAYER TIMING
// =============================================================================

async function processTask(task: WorkerTask): Promise<WorkerResult> {
  if (!pythonParser || !isInitialized) {
    await initializePythonParser();
  }

  const startTime = Date.now();
  const results: ParseResult[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  let totalLayer1 = 0;
  let totalLayer2 = 0;
  let totalLayer3 = 0;
  let totalLayer4 = 0;

  for (const file of task.files) {
    try {
      // Verify it's a Python file
      if (!file.endsWith(".py") && !file.endsWith(".pyi") && !file.endsWith(".pyw")) {
        errors.push({
          file,
          message: "Not a Python file - python-worker only handles .py/.pyi/.pyw",
        });
        continue;
      }

      const fileStart = Date.now();

      // Read file content
      const content = readFileSync(file, "utf-8");

      // Generate simple content hash
      const contentHash = `${content.length}-${content
        .slice(0, 100)
        .split("")
        .reduce((a, c) => a + c.charCodeAt(0), 0)}`;

      // Parse using PythonNativeParser (with CLI script for relationship extraction)
      const layer1Start = Date.now();
      const parseResult = await pythonParser!.parse(file, content, contentHash);
      const layer1Time = Date.now() - layer1Start;
      totalLayer1 += layer1Time;

      // Layer timing from PythonNativeParser
      const resultWithMetadata = parseResult as ParseResult & {
        metadata?: { layerTiming?: { layer2?: number; layer3?: number; layer4?: number } };
      };
      if (resultWithMetadata.metadata?.layerTiming) {
        totalLayer2 += resultWithMetadata.metadata.layerTiming.layer2 || 0;
        totalLayer3 += resultWithMetadata.metadata.layerTiming.layer3 || 0;
        totalLayer4 += resultWithMetadata.metadata.layerTiming.layer4 || 0;
      }

      results.push(parseResult);

      const fileDuration = Date.now() - fileStart;

      // Log slow files for monitoring
      if (fileDuration > 500) {
        log.w("PYTHONWORKER", "slow_parse", { file, dur: fileDuration });
      }
    } catch (error) {
      errors.push({
        file,
        message: (error as Error).message,
      });
    }
  }

  const totalTime = Date.now() - startTime;

  return {
    taskId: task.id,
    results,
    ...(errors.length > 0 && { errors: errors }),
    stats: {
      filesProcessed: task.files.length,
      totalTime,
      avgTimePerFile: totalTime / task.files.length,
      layer1Time: totalLayer1,
      layer2Time: totalLayer2,
      layer3Time: totalLayer3,
      layer4Time: totalLayer4,
    },
  };
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

if (parentPort) {
  parentPort.on("message", async (message: WorkerMessage) => {
    try {
      if (message.type === "init") {
        await initializePythonParser();
        return;
      }

      if (message.type === "shutdown") {
        // Cleanup and exit
        pythonParser = null;
        process.exit(0);
      }

      if (message.type === "task") {
        const task = message.task;
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
        const taskId = message.type === "task" ? message.task.id : undefined;
        parentPort.postMessage({
          type: "error",
          taskId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    }
  });

  // Signal ready
  parentPort.postMessage({
    type: "ready",
    workerId: workerData?.workerId || "python-worker",
    specialization: "Python 4-layer analysis (TASK-003B)",
  });
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

process.on("uncaughtException", (error) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Uncaught exception in python-worker: ${error.message}`,
      stack: error.stack,
    });
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Unhandled rejection in python-worker: ${reason}`,
    });
  }
  process.exit(1);
});
