# UltraScript Tools MCP — Backlog

> Консолидированный список всех задач проекта.
> Обновлено: 2025-11-28 (v4)

---

## 🔴 CRITICAL — Блокирует функциональность

### 1. ~~Semantic Merge~~ ✅ DONE

**Документация:** [SEMANTIC_MERGE_ROADMAP.md](./features/SEMANTIC_MERGE_ROADMAP.md)

| Фаза | Название | Срок | Статус |
|------|----------|------|--------|
| 1 | Foundation — модели, нормализация | 2-3 дня | ✅ DONE |
| 2 | Fast Path — структурное сопоставление | 2-3 дня | ✅ DONE |
| 3 | Semantic Matching — векторный поиск | 3-4 дня | ✅ DONE |
| 4 | Multi-Version Indexing | 2-3 дня | ✅ DONE |
| 5 | Merge Engine — ядро логики | 4-5 дней | ✅ DONE |
| 6 | MergeAgent Integration | 2-3 дня | ✅ DONE |
| 7 | MCP Tools | 2-3 дня | ✅ DONE |

**Выполнено:**
- [x] 35+ файлов в `src/merge/` — полная реализация
- [x] `MergeAgent` (`src/agents/merge-agent.ts`) — интеграция с multi-agent архитектурой
- [x] 4 MCP tools: `semantic_merge`, `analyze_merge_conflicts`, `get_merge_suggestions`, `get_semantic_merge_info`
- [x] Tool handlers (`src/tools/handlers/merge-tool-handlers.ts`)
- [x] Регистрация в DI Container (`src/core/agent-registry.ts`)

**Ключевые компоненты:**
```
src/merge/
├── indexing/
│   ├── content-normalizer.ts       ✅
│   ├── structural-normalizer.ts    ✅
│   ├── signature-generator.ts      ✅
│   ├── lazy-embedding-cache.ts     ✅
│   └── multi-version-indexer.ts    ✅
├── matching/
│   ├── fast-path-matcher.ts        ✅
│   ├── semantic-matcher.ts         ✅
│   └── movement-detector.ts        ✅
├── analysis/
│   ├── intent-classifier.ts        ✅
│   └── conflict-detector.ts        ✅
├── engine/
│   ├── three-way-merger.ts         ✅
│   ├── conflict-resolver.ts        ✅
│   └── ai-conflict-resolver.ts     ✅
├── resolution/                      ✅
└── integration/
    └── git-integration.ts          ✅
```

---

### 2. ~~Embedding Updates~~ ✅ DONE

~~При модификации кода embeddings не обновляются в vector store.~~

**Выполнено:**
- [x] `src/modification/code-modifier.ts` — реализовано обновление embeddings через `EmbeddingGenerator` + `VectorStore.update()`
- [x] `src/search/pattern-search.ts` — semantic search теперь использует реальный vector search вместо fallback
- [x] `computeSemanticSimilarity()` — использует SIMD-accelerated cosine similarity

---

### 3. ~~Layer 2 Indexing~~ ✅ DONE

~~Дельта-индексирование между ветками — ~15 TODO в layered/*.ts~~

**Выполнено:**
- [x] `src/layered/layered-graph-index.ts` — подключены GitDeltaComputer, LayeredCacheManager, типизация
- [x] `src/layered/layered-vector-store.ts` — подключены VectorCacheManager, EmbeddingGenerator, реализованы addVector/addVectorsBatch
- [x] Layer 2 working deltas — полностью реализованы
- [x] Было 23 TODO → осталось 4 (мелкие оптимизации)

---

## 🟡 HIGH — Важные оптимизации

### 4. ~~Bun Runtime Optimization~~ ✅ DONE

**Документация:** [bun-optimization-plan.md](./development/bun-optimization-plan.md)

**Выполнено:**
- [x] `src/utils/runtime.ts` — полная реализация runtime detection + feature flags
- [x] `src/utils/file-ops.ts` — optimized Bun.file/Bun.write + Node fallbacks
- [x] `src/utils/shell.ts` — Bun.spawn + child_process fallback
- [x] `src/utils/glob.ts` — Bun.Glob + minimatch fallback
- [x] SQLite: `src/storage/sqlite-adapter.ts` уже поддерживает bun:sqlite

---

### 5. ~~Tool Registry~~ ✅ DONE

~~**Файл:** `src/tools/tool-registry.ts:60`~~

**Выполнено:**
- [x] Создано 45 tool handlers в 10 файлах:
  - `graph-tool-handlers.ts` — 5 handlers
  - `entity-tool-handlers.ts` — 3 handlers
  - `semantic-tool-handlers.ts` — 6 handlers
  - `analysis-tool-handlers.ts` — 7 handlers
  - `branch-tool-handlers.ts` — 5 handlers
  - `snapshot-tool-handlers.ts` — 4 handlers
  - `file-tool-handlers.ts` — 8 handlers
  - `validation-tool-handlers.ts` — 2 handlers
  - `metrics-tool-handlers.ts` — 5 handlers
- [x] Все handlers зарегистрированы в `tool-registry.ts`
- [x] Добавлены alias'ы для совместимости с UltrasharpTools

---

### 6. ~~CUDA Backend~~ ✅ DONE

**Выполнено:**
- [x] `external-tools/native/cuda/src/binding.cpp` — N-API bindings для CUDA kernels
- [x] `external-tools/native/cuda/src/addon.cpp` — Module entry point
- [x] `external-tools/native/cuda/CMakeLists.txt` — Build configuration
- [x] `src/gpu/backends/cuda-backend.ts` — TypeScript wrapper синхронизирован с C++ API
- [x] `src/semantic/vector-store.ts` — GPU-ускоренный batch similarity search
- [x] `scripts/build-cuda.ps1` — Build script для Windows
- [x] npm scripts: `build:cuda`, `build:cuda:debug`, `build:cuda:clean`

**CUDA Kernels реализованы:**
- `cuda_cosine_similarity` — single pair
- `cuda_batch_cosine_similarity` — batch with warp shuffle
- `cuda_euclidean_distance` — L2 distance
- `cuda_normalize_vectors` — batch normalization

**Требования для сборки:**
- CUDA Toolkit 11.x+
- cmake-js (`npm install -g cmake-js`)
- NVIDIA GPU (GTX 16xx+)

---

## 🟢 MEDIUM — Улучшения

### 7. ~~Multi-Version Indexer Integration~~ ✅ DONE

**Файл:** `src/merge/indexing/multi-version-indexer.ts`
- [x] Line 196: Integrate with actual indexing pipeline
- [x] Line 213: Populate index from DevAgent result
- [x] Line 245: Implement loading from SQLite
- [x] Line 290: Track relationships

**Выполнено:** Интеграция с DevAgent через `getOrCreateAgent()`, методы `entityToCodeUnit()`, `addUnitToIndex()`, `populateIndexFromStorage()`

---

### 8. Git Delta & Incremental Indexing

- [ ] `src/layered/delta-maintenance-service.ts:348` — Add getAllBranches() to BranchManager
- [ ] `src/layered/git-delta-computer.ts:414` — getEntitiesByFilePath method
- [ ] `src/layered/incremental-update-queue.ts:248` — Trigger full rebuild

---

### 9. Parser Improvements

- [ ] `src/parsers/swift-analyzer.ts:150` — Create import relationships
- [ ] `src/agents/workers/worker-pool-manager.ts:305` — Restart worker if needed

---

### 10. Tool Parity (UltraSharp ↔ UltraScript)

**Документация:** [tool-naming.md](./development/tool-naming.md)

| Tool | UltraSharp | UltraScript |
|------|------------|-------------|
| `clean_index` | ✅ | ⏳ TODO |
| `add_member` | ✅ | ⏳ TODO |
| `rename_symbol` | ✅ | ⏳ TODO |
| `find_and_replace` | ✅ | ⏳ TODO |
| `create_file` | ✅ | ⏳ TODO |
| `format_code` | ✅ | ⏳ TODO |
| `analyze_code_impact` | ⏳ TODO | ✅ |
| `copy_file` | ⏳ TODO | ✅ |
| `rename_file` | ⏳ TODO | ✅ |
| `analyze_hotspots` | ⏳ TODO | ✅ |
| `suggest_refactoring` | ⏳ TODO | ✅ |
| `validate_file` | ⏳ TODO | ✅ |

---

### 11. Multi-Process Architecture

**Документация:** [MULTIPROCESS_ARCHITECTURE.md](./MULTIPROCESS_ARCHITECTURE.md)

- [ ] Move embeddings to worker thread
- [ ] Testing with multiple VS Code windows

---

### 12. AI Conflict Resolver

**Файл:** `src/merge/engine/ai-conflict-resolver.ts:258`
- [ ] Более продвинутые эвристики для разрешения конфликтов

---

## Метрики успеха

| Метрика | Целевое значение |
|---------|------------------|
| Fast Path coverage | >90% |
| Semantic matching accuracy | >80% |
| Auto-merge rate | >60% |
| Indexing speed | <10 sec / 1000 methods |
| Total merge time | <30 sec / 100K LOC |
| False positive conflicts | <5% |
| Missed conflicts | <2% |

---

## Порядок выполнения

1. ~~**Semantic Merge**~~ ✅ DONE — все 7 фаз реализованы
2. ~~**Embedding Updates**~~ ✅ DONE
3. ~~**Layer 2 Indexing**~~ ✅ DONE
4. ~~**Bun Optimization**~~ ✅ DONE
5. ~~**Tool Registry**~~ ✅ DONE
6. ~~**CUDA Backend**~~ ✅ DONE
7. ~~**Multi-Version Indexer Integration**~~ ✅ DONE
8. Остальное по мере необходимости
