/**
 * Native Vector Index — brute-force cosine similarity with SoA layout.
 *
 * Port of Zig `semantic/vector_index.zig`.
 * Binary-compatible save/load format: vectors.idx works in both Zig and TS.
 *
 * SoA (Structure of Arrays) layout:
 *   - vectors_flat: Float32Array — contiguous [count × dim], cache-friendly
 *   - entity_ids: string[] — parallel to vectors
 *   - norms: Float32Array — pre-computed L2 norms
 *   - hashes: BigUint64Array — LSH hashes for pre-filtering
 *   - tiers: Uint8Array — quantization tier per vector
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 1
 */

import { readFile, writeFile } from "node:fs/promises";

import type { HashFilter } from "./hash-filter.js";
import type { Tier } from "./quantization.js";

// =============================================================================
// Types
// =============================================================================

export interface SearchResult {
  entityId: string;
  score: number;
}

// =============================================================================
// VectorIndex
// =============================================================================

export class NativeVectorIndex {
  readonly dimension: number;

  // SoA parallel arrays
  private entityIds: string[] = [];
  private norms: Float32Array;
  private hashes: BigUint64Array;
  private tiers: Uint8Array;
  private vectorsFlat: Float32Array;
  private vecCount = 0;
  private vecCapacity = 0;

  // Optional pre-filter
  private hashFilter: HashFilter | null = null;

  constructor(dimension: number) {
    this.dimension = dimension;
    this.norms = new Float32Array(0);
    this.hashes = new BigUint64Array(0);
    this.tiers = new Uint8Array(0);
    this.vectorsFlat = new Float32Array(0);
  }

  /** Attach a HashFilter for LSH pre-filtering on large datasets. */
  setHashFilter(hf: HashFilter): void {
    this.hashFilter = hf;
  }

  /** Number of vectors stored. */
  count(): number {
    return this.vecCount;
  }

  /** Add a single vector. */
  add(entityId: string, vector: Float32Array): void {
    if (vector.length !== this.dimension) throw new Error("DimensionMismatch");

    const norm = computeNorm(vector);
    if (!Number.isFinite(norm)) throw new Error("InvalidVector");

    if (this.vecCount >= this.vecCapacity) {
      this.grow();
    }

    const offset = this.vecCount * this.dimension;
    this.vectorsFlat.set(vector, offset);

    this.entityIds.push(entityId);
    this.norms[this.vecCount] = norm;
    this.hashes[this.vecCount] = this.hashFilter ? this.hashFilter.computeHash(vector) : 0n;
    this.tiers[this.vecCount] = 0; // hot

    this.vecCount++;
  }

  /** Add a vector with explicit tier. Tier determines TQ bit width in IVF index. */
  addWithTier(entityId: string, vector: Float32Array, tier: Tier): void {
    this.add(entityId, vector);
    this.tiers[this.vecCount - 1] = tier;
  }

  /** Batch-add vectors. Returns number actually added. */
  addBatch(entityIds: string[], vectors: Float32Array[]): number {
    if (entityIds.length === 0) return 0;
    this.ensureCapacity(this.vecCount + entityIds.length);

    let added = 0;
    for (let i = 0; i < entityIds.length; i++) {
      const vec = vectors[i]!;
      if (vec.length !== this.dimension) continue;
      const norm = computeNorm(vec);
      if (!Number.isFinite(norm)) continue;

      const offset = this.vecCount * this.dimension;
      this.vectorsFlat.set(vec, offset);

      this.entityIds.push(entityIds[i]!);
      this.norms[this.vecCount] = norm;
      this.hashes[this.vecCount] = this.hashFilter ? this.hashFilter.computeHash(vec) : 0n;
      this.tiers[this.vecCount] = 0;

      this.vecCount++;
      added++;
    }
    return added;
  }

  /** Batch-add from contiguous flat buffer. */
  addBatchFlat(entityIds: string[], flatData: Float32Array, count: number): number {
    if (count === 0 || flatData.length < count * this.dimension) return 0;
    this.ensureCapacity(this.vecCount + count);

    let added = 0;
    const dim = this.dimension;
    for (let i = 0; i < count && i < entityIds.length; i++) {
      const vec = flatData.subarray(i * dim, (i + 1) * dim);
      const norm = computeNorm(vec);
      if (!Number.isFinite(norm)) continue;

      const offset = this.vecCount * dim;
      this.vectorsFlat.set(vec, offset);

      this.entityIds.push(entityIds[i]!);
      this.norms[this.vecCount] = norm;
      this.hashes[this.vecCount] = this.hashFilter ? this.hashFilter.computeHash(vec) : 0n;
      this.tiers[this.vecCount] = 0;

      this.vecCount++;
      added++;
    }
    return added;
  }

  /** Remove by entityId (swap-remove). Returns true if found. */
  remove(entityId: string): boolean {
    for (let i = 0; i < this.vecCount; i++) {
      if (this.entityIds[i] === entityId) {
        const last = this.vecCount - 1;
        if (i !== last) {
          // Swap with last
          this.entityIds[i] = this.entityIds[last]!;
          this.norms[i] = this.norms[last]!;
          this.hashes[i] = this.hashes[last]!;
          this.tiers[i] = this.tiers[last]!;

          const dim = this.dimension;
          this.vectorsFlat.copyWithin(i * dim, last * dim, last * dim + dim);
        }
        this.entityIds.pop();
        this.vecCount--;
        return true;
      }
    }
    return false;
  }

  /** Check if entity exists. */
  hasEntity(entityId: string): boolean {
    for (let i = 0; i < this.vecCount; i++) {
      if (this.entityIds[i] === entityId) return true;
    }
    return false;
  }

  /** Get entityId by internal index. */
  getEntityId(idx: number): string | null {
    return idx < this.vecCount ? (this.entityIds[idx] ?? null) : null;
  }

  /** Get raw flat vector data for IVF training. */
  getVectorsFlat(): Float32Array {
    return this.vectorsFlat.subarray(0, this.vecCount * this.dimension);
  }

  /** Brute-force cosine similarity search. */
  search(query: Float32Array, topK: number): SearchResult[] {
    if (query.length !== this.dimension) throw new Error("DimensionMismatch");

    const queryNorm = computeNorm(query);
    if (queryNorm < 1e-10 || !Number.isFinite(queryNorm)) return [];

    const n = this.vecCount;
    if (n === 0) return [];

    const dim = this.dimension;
    const results: SearchResult[] = [];

    // Hash pre-filter for large datasets (>256 vectors)
    if (n > 256 && this.hashFilter) {
      const queryHash = this.hashFilter.computeHash(query);
      const candidates = this.hashFilter.prefilter(queryHash, this.hashes, n);

      if (candidates.length > 0 && candidates.length < n) {
        for (const ci of candidates) {
          const norm = this.norms[ci]!;
          if (norm < 1e-10 || !Number.isFinite(norm)) continue;
          const vec = this.vectorsFlat.subarray(ci * dim, ci * dim + dim);
          const dot = computeDot(query, vec);
          const cosine = dot / (queryNorm * norm);
          results.push({ entityId: this.entityIds[ci]!, score: cosine });
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
      }
    }

    // Full scan fallback
    for (let i = 0; i < n; i++) {
      const norm = this.norms[i]!;
      if (norm < 1e-10 || !Number.isFinite(norm)) continue;
      const vec = this.vectorsFlat.subarray(i * dim, i * dim + dim);
      const dot = computeDot(query, vec);
      const cosine = dot / (queryNorm * norm);
      results.push({ entityId: this.entityIds[i]!, score: cosine });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  // ===========================================================================
  // Persistence — Zig-compatible binary format
  // ===========================================================================

  /**
   * Save to binary file.
   * Format: [dim:u32 LE][count:u32 LE][id_len:u32 + id_bytes]...[f32 × dim × count]
   */
  async save(path: string): Promise<void> {
    const n = this.vecCount;
    const dim = this.dimension;
    const vecBytes = n * dim * 4;

    // Calculate total size
    let idsTotal = 0;
    for (let i = 0; i < n; i++) {
      idsTotal += 4 + Buffer.byteLength(this.entityIds[i]!, "utf8");
    }
    const totalSize = 8 + idsTotal + vecBytes;

    const buf = Buffer.alloc(totalSize);
    let pos = 0;

    // Header
    buf.writeUInt32LE(dim, 0);
    buf.writeUInt32LE(n, 4);
    pos = 8;

    // Entity IDs block
    for (let i = 0; i < n; i++) {
      const id = this.entityIds[i]!;
      const idBuf = Buffer.from(id, "utf8");
      buf.writeUInt32LE(idBuf.length, pos);
      pos += 4;
      idBuf.copy(buf, pos);
      pos += idBuf.length;
    }

    // Vectors block — copy from Float32Array
    const vecSrc = Buffer.from(this.vectorsFlat.buffer, this.vectorsFlat.byteOffset, vecBytes);
    vecSrc.copy(buf, pos);

    await writeFile(path, buf);
  }

  /**
   * Load from binary file. Returns new NativeVectorIndex.
   */
  static async load(path: string): Promise<NativeVectorIndex> {
    const data = await readFile(path);
    if (data.length < 8) throw new Error("UnexpectedEof");

    const dimension = data.readUInt32LE(0);
    const entryCount = data.readUInt32LE(4);

    const idx = new NativeVectorIndex(dimension);

    const vecBytesPerEntry = dimension * 4;

    // Try SoA format: IDs block then vectors block
    let pos = 8;
    const ids: string[] = [];
    let soaOk = true;

    for (let i = 0; i < entryCount; i++) {
      if (pos + 4 > data.length) {
        soaOk = false;
        break;
      }
      const idLen = data.readUInt32LE(pos);
      pos += 4;
      if (pos + idLen > data.length) {
        soaOk = false;
        break;
      }
      ids.push(data.subarray(pos, pos + idLen).toString("utf8"));
      pos += idLen;
    }

    const expectedVecBytes = entryCount * vecBytesPerEntry;
    if (soaOk && pos + expectedVecBytes <= data.length) {
      // SoA format — bulk load
      idx.ensureCapacity(entryCount);
      idx.entityIds = ids;

      // Copy vectors into flat buffer (must copy — Buffer offset may not be 4-byte aligned)
      const vecBuf = data.subarray(pos, pos + expectedVecBytes);
      const aligned = new Uint8Array(expectedVecBytes);
      aligned.set(vecBuf);
      const f32 = new Float32Array(aligned.buffer, 0, entryCount * dimension);
      idx.vectorsFlat.set(f32);

      // Compute norms and hashes
      for (let i = 0; i < entryCount; i++) {
        const vec = idx.vectorsFlat.subarray(i * dimension, (i + 1) * dimension);
        idx.norms[i] = computeNorm(vec);
        idx.hashes[i] = idx.hashFilter ? idx.hashFilter.computeHash(vec) : 0n;
        idx.tiers[i] = 0; // hot default
      }
      idx.vecCount = entryCount;
    } else {
      // Legacy interleaved format
      pos = 8;
      for (let i = 0; i < entryCount; i++) {
        if (pos + 4 > data.length) throw new Error("UnexpectedEof");
        const idLen = data.readUInt32LE(pos);
        pos += 4;
        if (pos + idLen + vecBytesPerEntry > data.length) throw new Error("UnexpectedEof");
        const id = data.subarray(pos, pos + idLen).toString("utf8");
        pos += idLen;
        const vecRaw = data.subarray(pos, pos + vecBytesPerEntry);
        pos += vecBytesPerEntry;
        const vecAligned = new Uint8Array(vecBytesPerEntry);
        vecAligned.set(vecRaw);
        const vec = new Float32Array(vecAligned.buffer, 0, dimension);
        idx.add(id, vec);
      }
    }

    return idx;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private ensureCapacity(minCap: number): void {
    if (minCap <= this.vecCapacity) return;
    const newCap = Math.max(minCap, this.vecCapacity === 0 ? 256 : this.vecCapacity * 2);

    const newFlat = new Float32Array(newCap * this.dimension);
    if (this.vecCount > 0) {
      newFlat.set(this.vectorsFlat.subarray(0, this.vecCount * this.dimension));
    }
    this.vectorsFlat = newFlat;

    const newNorms = new Float32Array(newCap);
    if (this.vecCount > 0) newNorms.set(this.norms.subarray(0, this.vecCount));
    this.norms = newNorms;

    const newHashes = new BigUint64Array(newCap);
    if (this.vecCount > 0) newHashes.set(this.hashes.subarray(0, this.vecCount));
    this.hashes = newHashes;

    const newTiers = new Uint8Array(newCap);
    if (this.vecCount > 0) newTiers.set(this.tiers.subarray(0, this.vecCount));
    this.tiers = newTiers;

    this.vecCapacity = newCap;
  }

  private grow(): void {
    const newCap = this.vecCapacity === 0 ? 256 : this.vecCapacity * 2;
    this.ensureCapacity(newCap);
  }
}

// =============================================================================
// Math helpers
// =============================================================================

/** Dot product of two Float32Arrays. */
export function computeDot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

/** L2 norm of a Float32Array. */
export function computeNorm(v: Float32Array): number {
  return Math.sqrt(computeDot(v, v));
}
