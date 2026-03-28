/**
 * IVF (Inverted File) Index with TurboQuant quantization.
 *
 * Port of Zig `semantic/ivf_index.zig`.
 *
 * Architecture:
 *   1. K-Means partitions vectors into n_lists clusters
 *   2. Each vector is TQ-encoded and stored in its cluster's inverted list
 *   3. Search: find nprobe nearest centroids → scan only those lists
 *
 * Reverse map: masterIdx → (listIdx, position) for O(1) remove.
 * Binary format: "IVTQ" magic + KMeans centroids + TQ params + inverted lists.
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 5
 */

import { readFile, writeFile } from "node:fs/promises";

import { KMeans } from "./kmeans.js";
import { computeDot, computeNorm } from "./native-vector-index.js";
import { TurboQuant } from "./turbo-quant.js";

// =============================================================================
// Types
// =============================================================================

export interface IvfConfig {
  dimension: number;
  nprobe?: number;
  trainingThreshold?: number;
  tqBits?: number;
  maxIter?: number;
  seed?: bigint;
}

export interface IvfResult {
  masterIdx: number;
  score: number;
}

interface ListPos {
  list: number;
  pos: number;
}

// =============================================================================
// InvertedList
// =============================================================================

class InvertedList {
  encodedData: Uint8Array[] = [];
  masterIndices: number[] = [];
  count = 0;

  append(encoded: Uint8Array, masterIdx: number): number {
    this.encodedData.push(new Uint8Array(encoded));
    this.masterIndices.push(masterIdx);
    return this.count++;
  }

  /** Swap-remove at position. Returns swapped element's masterIdx (if any). */
  swapRemove(pos: number): number | null {
    if (this.count === 0) return null;
    const last = this.count - 1;

    if (pos !== last) {
      this.encodedData[pos] = this.encodedData[last]!;
      this.masterIndices[pos] = this.masterIndices[last]!;
    }

    this.encodedData.pop();
    this.masterIndices.pop();
    this.count--;

    return pos !== last ? this.masterIndices[pos]! : null;
  }

  /** Get contiguous encoded data for batch scanning. */
  getPackedData(encodedSize: number): Uint8Array {
    const packed = new Uint8Array(this.count * encodedSize);
    for (let i = 0; i < this.count; i++) {
      packed.set(this.encodedData[i]!, i * encodedSize);
    }
    return packed;
  }
}

// =============================================================================
// IvfIndex
// =============================================================================

export class IvfIndex {
  private readonly config: Required<IvfConfig>;
  private kmeans: KMeans | null = null;
  private tq: TurboQuant | null = null;
  private lists: InvertedList[] = [];
  private nLists = 0;
  private reverseMap = new Map<number, ListPos>();
  trained = false;
  totalEncoded = 0;

  constructor(config: IvfConfig) {
    this.config = {
      dimension: config.dimension,
      nprobe: config.nprobe ?? 16,
      trainingThreshold: config.trainingThreshold ?? 9984,
      tqBits: config.tqBits ?? 4,
      maxIter: config.maxIter ?? 20,
      seed: config.seed ?? 42n,
    };
  }

  /**
   * Train IVF on raw vectors and encode all into inverted lists.
   * vectorsFlat: [n × dim] contiguous f32.
   */
  trainAndBuild(vectorsFlat: Float32Array, n: number): void {
    const dim = this.config.dimension;
    if (vectorsFlat.length < n * dim) throw new Error("InsufficientData");

    // Adaptive n_lists
    this.nLists = KMeans.computeNLists(n);

    // 1. Train K-Means
    const km = new KMeans(this.nLists, dim);
    km.train(vectorsFlat, n, this.config.maxIter);
    this.kmeans = km;

    // 2. Init TurboQuant
    const tq = new TurboQuant(dim, this.config.tqBits, this.config.seed);
    this.tq = tq;

    // 3. Allocate inverted lists
    this.lists = Array.from({ length: this.nLists }, () => new InvertedList());

    // 4. Encode and assign all vectors
    this.reverseMap.clear();
    for (let i = 0; i < n; i++) {
      const vec = vectorsFlat.subarray(i * dim, (i + 1) * dim);
      const centroidIdx = km.assign(vec);
      const encoded = tq.encode(vec);
      const pos = this.lists[centroidIdx]!.append(encoded, i);
      this.reverseMap.set(i, { list: centroidIdx, pos });
    }

    this.totalEncoded = n;
    this.trained = true;
  }

  /** Add a single vector online (post-training). */
  addEncoded(vector: Float32Array, masterIdx: number): void {
    if (!this.kmeans || !this.tq) throw new Error("NotTrained");

    const centroidIdx = this.kmeans.assign(vector);
    const encoded = this.tq.encode(vector);
    const pos = this.lists[centroidIdx]!.append(encoded, masterIdx);
    this.reverseMap.set(masterIdx, { list: centroidIdx, pos });
    this.totalEncoded++;
  }

  /** Remove vector by master index. */
  remove(masterIdx: number): boolean {
    const entry = this.reverseMap.get(masterIdx);
    if (!entry) return false;

    const swappedMaster = this.lists[entry.list]!.swapRemove(entry.pos);
    if (swappedMaster !== null) {
      // Update reverse map for swapped element
      const swapEntry = this.reverseMap.get(swappedMaster);
      if (swapEntry) swapEntry.pos = entry.pos;
    }
    this.reverseMap.delete(masterIdx);
    this.totalEncoded--;
    return true;
  }

  /** Search: find topK most similar vectors. */
  search(query: Float32Array, topK: number): IvfResult[] {
    if (!this.tq || !this.kmeans) return [];
    if (this.totalEncoded === 0) return [];

    const tq = this.tq;
    const km = this.kmeans;

    // 1. Rotate query once
    const rotated = tq.rotateQuery(query);
    const queryNorm = computeNorm(query);
    if (queryNorm < 1e-10) return [];

    // 2. Find nprobe nearest centroids
    const nprobe = Math.min(this.config.nprobe, this.nLists);
    const probeIndices = this.findNearestCentroids(km, query, nprobe);

    // 3. Scan lists, collect results
    const results: IvfResult[] = [];
    for (const listIdx of probeIndices) {
      const list = this.lists[listIdx]!;
      if (list.count === 0) continue;

      for (let i = 0; i < list.count; i++) {
        const enc = list.encodedData[i]!;
        const score = tq.asymmetricCosine(rotated, queryNorm, enc);
        results.push({ masterIdx: list.masterIndices[i]!, score });
      }
    }

    // 4. Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Check if retrain is needed. */
  needsRetrain(currentTotal: number): boolean {
    if (!this.trained) return currentTotal >= this.config.trainingThreshold;
    return currentTotal > this.totalEncoded * 1.5;
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  async save(path: string): Promise<void> {
    if (!this.tq || !this.kmeans) throw new Error("NotTrained");

    const tq = this.tq;
    const km = this.kmeans;
    const esize = tq.encodedSize();

    // Calculate total size
    const tqBuf = tq.saveToBuffer();
    const kmBuf = km.saveToBuffer();

    // Header: "IVTQ" + version + dimension + n_lists + total_encoded = 4+4+4+4+4 = 20
    let totalSize = 20 + tqBuf.length + kmBuf.length;

    // Inverted lists: [count:u32][esize:u32] + encoded_data + master_indices
    for (let li = 0; li < this.nLists; li++) {
      const list = this.lists[li]!;
      totalSize += 8; // header
      if (list.count > 0) {
        totalSize += list.count * esize; // encoded
        totalSize += list.count * 4; // master indices
      }
    }

    const buf = Buffer.alloc(totalSize);
    let pos = 0;

    // Header
    buf.write("IVTQ", 0, "ascii");
    pos = 4;
    buf.writeUInt32LE(1, pos);
    pos += 4; // version
    buf.writeUInt32LE(this.config.dimension, pos);
    pos += 4;
    buf.writeUInt32LE(this.nLists, pos);
    pos += 4;
    buf.writeUInt32LE(this.totalEncoded, pos);
    pos += 4;

    // TQ params
    tqBuf.copy(buf, pos);
    pos += tqBuf.length;

    // KMeans centroids
    kmBuf.copy(buf, pos);
    pos += kmBuf.length;

    // Inverted lists
    for (let li = 0; li < this.nLists; li++) {
      const list = this.lists[li]!;
      buf.writeUInt32LE(list.count, pos);
      buf.writeUInt32LE(esize, pos + 4);
      pos += 8;

      if (list.count > 0) {
        // Encoded data (pack contiguous)
        for (let i = 0; i < list.count; i++) {
          const enc = list.encodedData[i]!;
          enc.forEach((b, j) => {
            buf[pos + i * esize + j] = b;
          });
        }
        pos += list.count * esize;

        // Master indices
        for (let i = 0; i < list.count; i++) {
          buf.writeUInt32LE(list.masterIndices[i]!, pos);
          pos += 4;
        }
      }
    }

    await writeFile(path, buf);
  }

  static async load(path: string, config: IvfConfig): Promise<IvfIndex> {
    const data = await readFile(path);

    let pos = 0;

    // Header
    const magic = data.subarray(0, 4).toString("ascii");
    if (magic !== "IVTQ") throw new Error("InvalidMagic");
    pos = 4;

    const version = data.readUInt32LE(pos);
    pos += 4;
    if (version !== 1) throw new Error("UnsupportedVersion");

    const dimension = data.readUInt32LE(pos);
    pos += 4;
    if (dimension !== config.dimension) throw new Error("DimensionMismatch");

    const nLists = data.readUInt32LE(pos);
    pos += 4;
    const totalEncoded = data.readUInt32LE(pos);
    pos += 4;

    // TQ params
    const { tq, bytesRead: tqBytes } = TurboQuant.loadFromBuffer(data as unknown as Buffer, pos);
    pos += tqBytes;

    // KMeans centroids
    const { kmeans: km, bytesRead: kmBytes } = KMeans.loadFromBuffer(data as unknown as Buffer, pos);
    pos += kmBytes;

    // Inverted lists
    const lists: InvertedList[] = Array.from({ length: nLists }, () => new InvertedList());
    const reverseMap = new Map<number, ListPos>();

    for (let li = 0; li < nLists; li++) {
      const count = data.readUInt32LE(pos);
      const esize = data.readUInt32LE(pos + 4);
      pos += 8;

      if (count === 0) continue;

      const dataBytes = count * esize;
      const idxBytes = count * 4;

      for (let i = 0; i < count; i++) {
        const enc = new Uint8Array(data.subarray(pos + i * esize, pos + i * esize + esize));
        const masterIdx = data.readUInt32LE(pos + dataBytes + i * 4);
        lists[li]!.append(enc, masterIdx);
        reverseMap.set(masterIdx, { list: li, pos: i });
      }
      pos += dataBytes + idxBytes;
    }

    const ivf = new IvfIndex(config);
    ivf.kmeans = km;
    ivf.tq = tq;
    ivf.lists = lists;
    ivf.nLists = nLists;
    ivf.reverseMap = reverseMap;
    ivf.trained = true;
    ivf.totalEncoded = totalEncoded;

    return ivf;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private findNearestCentroids(km: KMeans, query: Float32Array, nprobe: number): number[] {
    const probeCount = Math.min(nprobe, 64);

    interface Scored {
      idx: number;
      sim: number;
    }

    const best: Scored[] = Array.from({ length: probeCount }, () => ({ idx: 0, sim: -Infinity }));

    for (let c = 0; c < km.k; c++) {
      const centroid = km.centroids.subarray(c * km.dim, (c + 1) * km.dim);
      const sim = computeDot(query, centroid);

      if (sim > best[probeCount - 1]!.sim) {
        best[probeCount - 1] = { idx: c, sim };
        // Bubble up
        let j = probeCount - 1;
        while (j > 0 && best[j]!.sim > best[j - 1]!.sim) {
          const tmp = best[j]!;
          best[j] = best[j - 1]!;
          best[j - 1] = tmp;
          j--;
        }
      }
    }

    return best.map((b) => b.idx);
  }
}
