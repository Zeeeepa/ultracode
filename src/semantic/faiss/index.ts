/**
 * Faiss Module - High-performance vector indexing
 *
 * Uses faiss-napi which works directly under both Node.js and Bun.
 * No subprocess needed - NAPI bindings are runtime-agnostic.
 *
 * Architecture:
 * - faiss-client.ts: Unified FaissNapiClient for all runtimes
 * - faiss-provider.ts: Hybrid hot/cold index integration
 *
 * Usage:
 *   import { getFaissClient, initializeFaissProvider } from './faiss';
 *
 *   // Low-level client
 *   const client = getFaissClient();
 *   await client.start();
 *   await client.initialize({ dimensions: 768, indexType: 'hnsw' });
 *
 *   // High-level provider (hybrid hot/cold)
 *   const provider = await initializeFaissProvider({ dimensions: 768 });
 *   await provider.addBatch(embeddings);
 *   const results = await provider.search(queryVector, 10);
 */

export * from "./faiss-client.js";
export * from "./faiss-provider.js";
export * from "./types.js";
