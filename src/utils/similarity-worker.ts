/**
 * Similarity Worker - Processes cosine similarity calculations in parallel
 *
 * This worker receives batches of vectors and computes cosine similarity
 * against a query vector. Uses SIMD-optimized operations.
 */

import { parentPort } from "node:worker_threads";
import { cosineSimilarity } from "./simd-vector-ops.js";

interface WorkerMessage {
  type: "compute";
  query: Float32Array;
  database: Float32Array[];
  startIdx: number;
}

interface WorkerResult {
  type: "result";
  similarities: Float32Array;
  startIdx: number;
}

// Worker initialization
if (!parentPort) {
  throw new Error("This file must be run as a worker thread");
}

const port = parentPort;

port.on("message", (message: WorkerMessage) => {
  if (message.type === "compute") {
    const { query, database, startIdx } = message;
    const results = new Float32Array(database.length);

    // Compute cosine similarity for each vector in the batch
    for (let i = 0; i < database.length; i++) {
      const vec = database[i];
      if (vec) {
        results[i] = cosineSimilarity(query, vec);
      }
    }

    const result: WorkerResult = {
      type: "result",
      similarities: results,
      startIdx,
    };

    port.postMessage(result);
  }
});

// Signal ready
port.postMessage({ type: "ready" });
