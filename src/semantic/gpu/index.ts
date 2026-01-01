/**
 * GPU Module - Unified GPU operations for vector indexing and similarity
 *
 * Runtime-aware implementation:
 * - Faiss: uses faiss-napi directly (works under both Node.js and Bun)
 * - CUDA: subprocess for Bun (CUDA addon requires Node.js)
 *
 * Architecture:
 * - gpu-worker.ts: Node.js subprocess with faiss-napi + CUDA addon (for Bun CUDA)
 * - gpu-client.ts: Unified client with GpuDirectClient / GpuSubprocessClient
 *
 * Features:
 * - Faiss vector indexing (HNSW, IVF, IVFPQ, Flat)
 * - CUDA similarity operations (cosine, euclidean, normalization)
 * - Automatic runtime detection and optimal execution path
 *
 * Usage:
 *   import { getGpuClient } from './gpu';
 *
 *   // Unified client (auto-detects runtime)
 *   const client = getGpuClient();
 *   await client.start();
 *
 *   // Faiss operations
 *   await client.faissInitialize({ dimensions: 768, indexType: 'hnsw' });
 *   await client.faissAdd(ids, vectors);
 *   const results = await client.faissSearch(queryVector, 10);
 *
 *   // CUDA operations (if available)
 *   if (client.isCudaAvailable()) {
 *     const similarity = await client.cudaCosineSimilarity(vecA, vecB);
 *     const batch = await client.cudaBatchCosineSimilarity(query, database);
 *   }
 */

export * from "./gpu-client.js";
export * from "./types.js";
