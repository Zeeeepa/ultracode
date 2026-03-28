# Plan: Replace FAISS with native IVF+TurboQuant vector index

## Context

Zig-версия заменила FAISS на нативный IVF (Inverted File) Index с TurboQuant квантизацией.
Результат: быстрее (нет addon overhead), меньше зависимостей, Zig/TS binary-compatible format.
Файл `vectors.idx` совместим между обеими версиями.

**Zig source (2624 LOC):**
- `semantic/vector_index.zig` — 602 LOC — brute-force base index, save/load
- `semantic/ivf_index.zig` — 597 LOC — IVF partitioning, adaptive n_lists
- `semantic/turbo_quant.zig` — 655 LOC — TurboQuant (4-bit product quantization)
- `semantic/kmeans.zig` — 522 LOC — K-Means for IVF centroids
- `semantic/quantization.zig` — 110 LOC — scalar int8 quantization + tier system
- `semantic/hash_filter.zig` — 138 LOC — LSH random projection pre-filter

**TS target estimate: ~1200 LOC** (JS is more concise than Zig for this)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   VectorIndex                        │
│                                                      │
│  Tier System (hot/warm/cold):                       │
│    hot  = f32 vectors  (functions, classes)          │
│    warm = int8 quantized (methods, variables)  4x↓  │
│    cold = LSH hash only (fields, imports)     48x↓  │
│                                                      │
│  Search pipeline:                                    │
│    1. HashFilter pre-filter (popcount) → ~15% pass  │
│    2. IVF partition select (nprobe centroids)       │
│    3. TurboQuant distance in selected lists          │
│    4. Full cosine rerank on top-K candidates        │
│                                                      │
│  File: vectors.idx                                   │
│    [dim:u32][count:u32][entity_ids][vectors_flat]   │
│    Binary compatible with Zig                        │
└─────────────────────────────────────────────────────┘
```

---

## Steps

### Step 1: VectorIndex base (~200 LOC)
**Create:** `src/semantic/native-vector-index.ts`

- SoA layout: `Float32Array` (contiguous), `string[]` (entity_ids), `Float32Array` (norms)
- `add(entityId, vector)` — append + precompute norm
- `remove(entityId)` — swap-remove
- `search(query, topK)` — brute-force cosine similarity
- `save(path)` / `load(path)` — Zig-compatible binary format:
  `[dim:u32 LE][count:u32 LE][id_len:u32 + id_bytes]...[f32 × dim × count]`

**Test:** save in TS → load in Zig (and vice versa)

### Step 2: ScalarQuantization + Tiers (~100 LOC)
**Create:** `src/semantic/quantization.ts`

- `ScalarQuantized { data: Uint8Array, min: f32, scale: f32 }`
- `quantize(vector: Float32Array): ScalarQuantized` — f32→u8 (4x compression)
- `cosineSimilarity(quantized, query, queryNorm): number` — on-the-fly dequant
- `classifyTier(entityType, fanIn): "hot"|"warm"|"cold"` — from Zig
- Tier enum: hot=f32 exact, warm=int8 approx, cold=hash only

### Step 3: HashFilter (~100 LOC)
**Create:** `src/semantic/hash-filter.ts`

- 64-bit LSH via random projection matrix (64 hyperplanes × dim)
- `computeHash(vector): bigint` — sign(hyperplanes @ vector) packed to 64 bits
- `prefilter(queryHash, hashes, threshold): number[]` — popcount filter
- Deterministic PRNG seeded from dim (same hashes across runs)
- Default threshold: 24 (~90% recall at 384-dim)

### Step 4: KMeans (~150 LOC)
**Create:** `src/semantic/kmeans.ts`

- Mini-batch K-Means for IVF centroid training
- `train(vectors: Float32Array[], k: number, maxIter: number): Float32Array[]`
- `assign(vector, centroids): number` — nearest centroid index
- `assignBatch(vectors, centroids): Uint32Array` — batch assignment
- Adaptive k: `computeNLists(n) = clamp(sqrt(n), 4, 256)`

### Step 5: IvfIndex (~250 LOC)
**Create:** `src/semantic/ivf-index.ts`

- K-Means partitions vectors into n_lists clusters
- Each vector TQ-encoded + stored in cluster's inverted list
- `train(vectors)` — KMeans + TurboQuant initialization
- `add(entityId, vector)` — assign to cluster + encode
- `search(query, topK, nprobe)` — find nprobe nearest centroids → scan those lists
- `remove(entityId)` — O(1) via reverse map
- Adaptive n_lists based on dataset size

### Step 6: TurboQuant (~200 LOC)
**Create:** `src/semantic/turbo-quant.ts`

- 4-bit product quantization (sub-vectors of 8 dims)
- `encode(vector, centroids): Uint8Array` — 2 sub-vector indices per byte
- `distance(encoded, query, tables): number` — table lookup distance
- `buildDistanceTables(query, centroids): Float32Array[]` — precompute for batch
- 48 sub-vectors × 16 centroids for 384-dim vectors

### Step 7: Provider integration (~200 LOC)
**Modify:** `src/semantic/` provider layer

- Create `NativeVectorProvider` implementing existing provider interface
- Replace FAISS provider calls with NativeVectorProvider
- File naming: `vectors.idx` (Zig compat) instead of `faiss-{branch}.bin`
- Remove FAISS dependency from package.json
- Integrate with Basin/Bloom pre-filters from Phase 3

### Step 8: Hybrid search integration
**Modify:** `src/semantic/hybrid_search.ts` (or equivalent)

- `score = vector_weight × cosine + text_weight × bm25 + graph_weight × pagerank`
- Use BM25 from Phase 1, PageRank from brandes.ts
- Tier-aware: hot entities get full hybrid, cold get hash-only

---

## Execution Order

```
Step 1 (VectorIndex base)    ████ ~200 LOC   — FOUNDATION
Step 2 (Quantization)        ██ ~100 LOC     — 4x compression
Step 3 (HashFilter)          ██ ~100 LOC     — pre-filter
Step 4 (KMeans)              ███ ~150 LOC    — partitioning
Step 5 (IvfIndex)            █████ ~250 LOC  — IVF search
Step 6 (TurboQuant)          ████ ~200 LOC   — PQ encoding
Step 7 (Provider)            ████ ~200 LOC   — FAISS replacement
Step 8 (Hybrid)              ██ ~100 LOC     — scoring integration
────────────────────────────────────────────
TOTAL:                       ~1300 LOC

Dependency chain: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
Steps 2,3 can be parallel. Step 4,5,6 sequential (IVF needs KMeans needs TQ).
```

---

## Performance Targets

| Metric | FAISS (current) | Native IVF (target) |
|--------|----------------|---------------------|
| 10K search | ~5ms + 200ms addon | ~30ms (brute) / ~10ms (IVF) |
| 100K search | ~40ms | ~50ms (IVF+TQ) |
| Memory 10K×384 | ~15MB + FAISS overhead | ~15MB (hot) / ~4MB (warm) |
| Save/load | 3 files, JSON | 1 file, binary |
| Dependencies | faiss-node (native) | 0 (pure JS) |
| Platforms | x64 only | all (pure JS) |
| Binary compat | no | yes (Zig ↔ TS) |

---

## Verification

1. `npm run build` — no errors
2. Binary compat: save `vectors.idx` in TS → load in Zig (и наоборот)
3. Search quality: cosine similarity results match FAISS within ±0.01
4. Performance: 10K vectors search < 50ms
5. Tier compression: warm tier uses 4x less memory than hot
6. HashFilter: pre-filter eliminates 80%+ candidates

---

## Prompt for next session

```
продолжай план синхронизации zig→ts: IVF+TurboQuant vector index.
План: doc/IVF_VECTOR_INDEX_PLAN.md
Zig source: semantic/vector_index.zig, ivf_index.zig, turbo_quant.zig, kmeans.zig, quantization.zig, hash_filter.zig
Выполняй steps 1-8 последовательно, начни со Step 1 (VectorIndex base).
```
