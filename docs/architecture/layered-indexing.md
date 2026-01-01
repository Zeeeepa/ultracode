# Layered Indexing Implementation Plan for UltraScript Tools MCP

**Дата создания:** 2025-01-17
**Версия:** 1.0
**Статус:** Ready for Implementation
**Источник:** Адаптировано из [ultrasharp-tools-mcp](https://github.com/faxg/ultrasharp-tools-mcp)

> **Note:** Этот документ описывает планируемую трёхслойную архитектуру индексации.
> Текущая архитектура embedding pipeline описана в [embedding-pipeline.md](./embedding-pipeline.md).
> Worker-based генерация embeddings описана в [worker-threads.md](./worker-threads.md).

---

## 🎯 Цели проекта

Реализовать **трёхслойную архитектуру индексации с инкрементальными обновлениями** для UltraScript Tools MCP Server, адаптированную из успешной реализации в ultrasharp-tools-mcp (.NET).

### Основные задачи

#### Для локальной разработки (MCP Server)
- ✅ **Быстрое переключение веток** (без полной перестройки индекса)
- ✅ **Инкрементные обновления** (изменения сразу видны)
- ✅ **Branch-aware индексация** (каждая ветка имеет свой слой)
- ✅ **Персистентность** (быстрая загрузка после перезапуска)

#### Для векторного поиска
- ✅ **Интеграция embeddings** (семантический поиск)
- ✅ **Layered vector storage** (векторы для каждого слоя)
- ✅ **Incremental vector updates** (пересчёт только изменённых)
- ✅ **Cache efficiency** (LRU кэш векторов)

---

## 🏗️ Текущая архитектура ultrascript-tools-mcp

### Существующие компоненты

| Компонент | Статус | Описание |
|-----------|--------|----------|
| **BranchManager** | ✅ Реализован | Per-branch databases, LRU eviction |
| **VectorStore** | ✅ Реализован | SQLite-vec хранилище, SIMD оптимизации |
| **GraphStorage** | ✅ Реализован | Graph indexing, entities & relationships |
| **GitWatcher** | ✅ Реализован | Файловый мониторинг Git изменений |
| **SQLiteAdapter** | ✅ Реализован | Универсальный адаптер Node.js/Bun |

### Текущие ограничения

| Проблема | Impact | Severity |
|----------|--------|----------|
| **Нет multi-layer architecture** | Полная пересборка при изменении ветки | 🔴 High |
| **Нет incremental indexing** | Медленные обновления после изменений | 🔴 High |
| **Per-branch full databases** | Избыточное потребление дискового пространства | 🟡 Medium |
| **Векторы не layered** | Дублирование embeddings между ветками | 🟡 Medium |

---

## 📊 Целевая архитектура: Три уровня

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 0: Base Index (main branch, shared, read-only)          │
│  - Code entities & relationships (shared)                       │
│  - Vector embeddings (base, shared)                             │
│  - SQLite storage (persistent)                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Branch Deltas (per-branch, shared, mostly read-only) │
│  - Added/Modified/Deleted entities                              │
│  - Vector delta embeddings                                      │
│  - SQLite per-branch cache                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Working Directory (per-client, mutable) [FUTURE]     │
│  - Uncommitted changes (not yet indexed)                        │
│  - Vector working delta                                         │
│  - In-memory only (optional persistence)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Query Composition

```typescript
// Entity search
Result = Layer0.query(pattern)
       ∪ Layer1.applyDelta(branch)
       ∪ Layer2.applyDelta(clientId)  // FUTURE
       - DeletedEntities

// Vector search
VectorResult = Layer0.searchVectors(queryEmbedding, topK)
             ∪ Layer1.searchVectors(branch, queryEmbedding)
             ∪ Layer2.searchVectors(clientId, queryEmbedding)  // FUTURE
             - DeletedVectors
```

---

## 📋 План реализации (Поэтапный)

### 🎯 MVP (Минимальный жизнеспособный продукт) - 12-16 дней

Сфокусируемся на **Layer 0 + Layer 1 + Incremental Updates** без Layer 2 (uncommitted changes).

---

### Фаза 0: Подготовка инфраструктуры (2-3 дня)

**Цель:** Подготовить существующий код к расширению

#### Задачи

1. ✅ **Создать типы для layered architecture**
   ```typescript
   // src/types/layered.ts
   export interface EntityDelta {
     added: Map<string, Entity>;
     modified: Map<string, Entity>;
     deleted: Set<string>;
   }

   export interface BranchDelta {
     branchName: string;
     baseCommitSha: string;
     entityDelta: EntityDelta;
     lastModified: number;
   }

   export interface LayeredIndexConfig {
     maxBranchDeltas: number;          // LRU cache size
     enablePersistence: boolean;       // SQLite caching
     enableVectorDeltas: boolean;      // Vector layering
   }
   ```

2. ✅ **Создать интерфейс ILayeredIndex**
   ```typescript
   // src/core/layered-index.ts
   export interface ILayeredIndex {
     // Build base index
     buildFromDirectory(directory: string): Promise<void>;

     // Query with layers
     queryEntities(
       branch: string | null,
       pattern: string
     ): Promise<Entity[]>;

     // Delta management
     ensureBranchDelta(branch: string): Promise<BranchDelta>;
     getBranchDelta(branch: string): BranchDelta | null;
   }
   ```

3. ✅ **Рефакторинг GraphStorage для расширения**
   - Вынести методы построения lookup structures
   - Добавить методы для работы с subset entities
   - Подготовить к incremental updates

**Файлы:**
- `src/types/layered.ts` (новый)
- `src/core/layered-index.ts` (новый - интерфейс)
- `src/storage/graph-storage.ts` (модификация)

**Результат:**
- Чистая кодовая база готова к расширению
- Интерфейсы определены
- Тесты для существующего функционала проходят

---

### Фаза 1: Layer 0 + Layer 1 (Branch Deltas) (6-8 дней)

**Цель:** Реализовать двухуровневую систему (Base + Branch)

#### 1.1 Core Data Structures (2-3 дня)

**Файлы:**
- `src/layered/branch-delta.ts` (новый)
- `src/layered/layered-graph-index.ts` (новый)

**Задачи:**

1. Реализовать `BranchDelta` class:
   ```typescript
   export class BranchDelta {
     branchName: string;
     baseCommitSha: string;

     // Entity changes
     addedEntities: Map<string, Entity>;
     modifiedEntities: Map<string, Entity>;
     deletedEntityIds: Set<string>;

     lastModified: number;

     // Apply delta to base results
     apply(baseResults: Entity[]): Entity[] {
       return baseResults
         .filter(e => !this.deletedEntityIds.has(e.id))
         .map(e => this.modifiedEntities.get(e.id) || e)
         .concat(Array.from(this.addedEntities.values()));
     }

     // Merge another delta
     mergeWith(other: BranchDelta, newCommitSha?: string): void {
       // Merge logic
     }
   }
   ```

2. Реализовать `LayeredGraphIndex` class:
   ```typescript
   export class LayeredGraphIndex implements ILayeredIndex {
     private baseIndex: GraphStorageImpl;      // Layer 0
     private branchDeltas: Map<string, BranchDelta>;  // Layer 1
     private branchDeltaCache: LRUCache<string, BranchDelta>;
     private config: LayeredIndexConfig;

     async buildFromDirectory(directory: string): Promise<void> {
       // Build base index
       await this.baseIndex.clearAll();
       // ... index files
     }

     async queryEntities(
       branch: string | null,
       pattern: string
     ): Promise<Entity[]> {
       // Layer 0: Query base
       const layer0 = await this.baseIndex.queryEntities(pattern);

       // Layer 1: Apply branch delta
       if (branch && branch !== 'main') {
         const delta = await this.getOrLoadBranchDelta(branch);
         if (delta) {
           return delta.apply(layer0);
         }
       }

       return layer0;
     }
   }
   ```

#### 1.2 Git Integration (2-3 дня)

**Файлы:**
- `src/layered/git-delta-computer.ts` (новый)

**Задачи:**

1. Реализовать `GitDeltaComputer`:
   ```typescript
   export class GitDeltaComputer {
     constructor(
       private branchManager: BranchManager,
       private baseIndex: GraphStorageImpl
     ) {}

     async computeDeltaFromGitDiff(
       branch: string,
       baseBranch: string = 'main'
     ): Promise<BranchDelta> {
       // 1. Get git diff
       const changedFiles = await this.getChangedFiles(branch, baseBranch);

       // 2. Extract entities from changed files only
       const delta = new BranchDelta({ branchName: branch });

       for (const file of changedFiles) {
         if (file.status === 'added' || file.status === 'modified') {
           const entities = await this.extractEntitiesFromFile(file.path);
           // Classify as Added or Modified by comparing with base
           this.classifyEntities(entities, delta);
         } else if (file.status === 'deleted') {
           const oldEntities = await this.baseIndex.getEntitiesByFile(file.path);
           oldEntities.forEach(e => delta.deletedEntityIds.add(e.id));
         }
       }

       return delta;
     }

     private async getChangedFiles(
       branch: string,
       baseBranch: string
     ): Promise<FileChange[]> {
       // Use git diff or libgit2 (simple-git package)
       const git = simpleGit();
       const diff = await git.diff([`${baseBranch}...${branch}`, '--name-status']);
       return this.parseDiff(diff);
     }
   }
   ```

2. Интегрировать с `BranchManager`:
   - Добавить метод `getChangedFilesSinceMain(branch: string)`
   - Использовать существующие git methods

#### 1.3 SQLite Persistence (2 дня)

**Файлы:**
- `src/layered/layered-cache-manager.ts` (новый)

**Задачи:**

1. Создать SQLite schema для branch deltas:
   ```sql
   -- .ultrascript/layered/deltas.db
   CREATE TABLE IF NOT EXISTS branch_deltas (
     branch_name TEXT PRIMARY KEY,
     base_commit_sha TEXT NOT NULL,
     last_modified INTEGER NOT NULL,
     added_entities TEXT NOT NULL,     -- JSON
     modified_entities TEXT NOT NULL,  -- JSON
     deleted_entity_ids TEXT NOT NULL, -- JSON array
     metadata TEXT                     -- JSON
   );

   CREATE INDEX idx_branch_modified ON branch_deltas(last_modified);
   ```

2. Реализовать `LayeredCacheManager`:
   ```typescript
   export class LayeredCacheManager {
     private db: SQLiteDatabase;
     private dbPath: string;

     constructor(workingDirectory: string) {
       this.dbPath = join(workingDirectory, '.ultrascript', 'layered', 'deltas.db');
       this.db = new (loadSQLiteModule())(this.dbPath);
       this.initializeSchema();
     }

     async saveBranchDelta(delta: BranchDelta): Promise<void> {
       const stmt = this.db.prepare(`
         INSERT OR REPLACE INTO branch_deltas
         (branch_name, base_commit_sha, last_modified,
          added_entities, modified_entities, deleted_entity_ids)
         VALUES (?, ?, ?, ?, ?, ?)
       `);

       stmt.run(
         delta.branchName,
         delta.baseCommitSha,
         delta.lastModified,
         JSON.stringify(Array.from(delta.addedEntities.entries())),
         JSON.stringify(Array.from(delta.modifiedEntities.entries())),
         JSON.stringify(Array.from(delta.deletedEntityIds))
       );
     }

     async loadBranchDelta(branch: string): Promise<BranchDelta | null> {
       const row = this.db.prepare(`
         SELECT * FROM branch_deltas WHERE branch_name = ?
       `).get(branch);

       if (!row) return null;

       return this.deserializeDelta(row);
     }
   }
   ```

3. Интегрировать с LRU cache:
   ```typescript
   class LayeredGraphIndex {
     private branchDeltaCache: LRUCache<string, BranchDelta>;

     constructor() {
       this.branchDeltaCache = new LRUCache({
         max: 20,
         dispose: (branch, delta) => {
           // Auto-save on eviction
           this.cacheManager.saveBranchDelta(delta);
         }
       });
     }
   }
   ```

**Результат Фазы 1:**
- ✅ Branch-aware поиск работает
- ✅ Git diff integration готов
- ✅ Persistent cache сохраняет/загружает deltas
- ✅ LRU cache для memory efficiency

---

### Фаза 2: Incremental Updates (4-5 дней)

**Цель:** Добавить автоматические инкрементальные обновления индекса

#### 2.1 Incremental Update Queue (2 дня)

**Файлы:**
- `src/layered/incremental-update-queue.ts` (новый)

**Задачи:**

1. Реализовать batching queue:
   ```typescript
   export class IncrementalUpdateQueue {
     private queue: FileUpdate[] = [];
     private debounceTimer: NodeJS.Timeout | null = null;
     private readonly DEBOUNCE_MS = 300;
     private readonly MAX_BATCH_SIZE = 50;

     enqueue(update: FileUpdate): void {
       this.queue.push(update);

       // Debounce processing
       if (this.debounceTimer) {
         clearTimeout(this.debounceTimer);
       }

       this.debounceTimer = setTimeout(() => {
         this.processBatch();
       }, this.DEBOUNCE_MS);
     }

     private async processBatch(): Promise<void> {
       if (this.queue.length === 0) return;

       // Deduplicate by file path (keep latest)
       const uniqueUpdates = this.deduplicateByFilePath(this.queue);
       this.queue = [];

       // Fallback to full rebuild if too many files
       if (uniqueUpdates.length > 100) {
         console.warn(`Large batch (${uniqueUpdates.length} files), falling back to full rebuild`);
         await this.layeredIndex.buildFromDirectory(this.workingDir);
         return;
       }

       // Process incrementally
       for (const update of uniqueUpdates) {
         await this.processFileUpdate(update);
       }
     }

     private async processFileUpdate(update: FileUpdate): Promise<void> {
       switch (update.type) {
         case 'added':
         case 'modified':
           await this.updateEntitiesFromFile(update.filePath);
           break;
         case 'deleted':
           await this.removeEntitiesFromFile(update.filePath);
           break;
       }
     }
   }
   ```

#### 2.2 File System Watcher Integration (2-3 дня)

**Файлы:**
- `src/core/git-watcher.ts` (модификация)
- `src/layered/file-change-handler.ts` (новый)

**Задачи:**

1. Расширить `GitWatcher` для incremental updates:
   ```typescript
   class GitWatcher {
     private incrementalQueue: IncrementalUpdateQueue;

     private handleFileChange(filePath: string, eventType: string): void {
       // Existing logic...

       // NEW: Enqueue incremental update
       if (this.incrementalQueue) {
         this.incrementalQueue.enqueue({
           type: eventType === 'unlink' ? 'deleted' : 'modified',
           filePath: filePath,
           timestamp: Date.now()
         });
       }
     }
   }
   ```

2. Реализовать `FileChangeHandler`:
   ```typescript
   export class FileChangeHandler {
     constructor(
       private baseIndex: GraphStorageImpl,
       private layeredIndex: LayeredGraphIndex
     ) {}

     async updateEntitiesFromFile(filePath: string): Promise<void> {
       // 1. Extract new entities
       const newEntities = await this.extractEntities(filePath);

       // 2. Find old entities for this file
       const oldEntities = await this.baseIndex.getEntitiesByFile(filePath);

       // 3. Update base index
       await this.baseIndex.transaction(async () => {
         // Remove old
         for (const old of oldEntities) {
           await this.baseIndex.deleteEntity(old.id);
         }

         // Add new
         for (const newEntity of newEntities) {
           await this.baseIndex.storeEntity(newEntity);
         }
       });
     }
   }
   ```

**Результат Фазы 2:**
- ✅ Изменения файлов автоматически обновляют индекс
- ✅ Batching оптимизирует множественные изменения
- ✅ Fallback to full rebuild при больших изменениях
- ✅ Performance: 100-500ms для 1 файла (vs полная пересборка)

---

### Фаза 3: Vector Integration (5-6 дней)

**Цель:** Интегрировать embeddings с layered architecture

#### 3.1 Vector Delta Model (2 дня)

**Файлы:**
- `src/layered/vector-delta.ts` (новый)
- `src/layered/layered-vector-store.ts` (новый)

**Задачи:**

1. Реализовать `VectorDelta`:
   ```typescript
   export class VectorDelta {
     branchName: string;
     baseCommitSha: string;

     // Vector changes
     addedEmbeddings: Map<string, Float32Array>;      // entityId → embedding
     modifiedEmbeddings: Map<string, Float32Array>;
     deletedEmbeddingIds: Set<string>;

     lastModified: number;

     // Apply delta to base vector results
     apply(
       baseResults: SimilarityResult[],
       queryEmbedding: Float32Array,
       topK: number
     ): SimilarityResult[] {
       // 1. Filter deleted
       const filtered = baseResults.filter(
         r => !this.deletedEmbeddingIds.has(r.id)
       );

       // 2. Add new embeddings
       const newResults: SimilarityResult[] = [];

       for (const [id, embedding] of this.addedEmbeddings) {
         const similarity = cosineSimilarity(queryEmbedding, embedding);
         newResults.push({ id, similarity });
       }

       for (const [id, embedding] of this.modifiedEmbeddings) {
         const similarity = cosineSimilarity(queryEmbedding, embedding);
         newResults.push({ id, similarity });
       }

       // 3. Merge and re-rank
       const merged = [...filtered, ...newResults];
       merged.sort((a, b) => b.similarity - a.similarity);

       return merged.slice(0, topK);
     }
   }
   ```

2. Реализовать `LayeredVectorStore`:
   ```typescript
   export class LayeredVectorStore {
     private baseVectorStore: VectorStore;     // Layer 0
     private vectorDeltas: Map<string, VectorDelta>;  // Layer 1
     private vectorDeltaCache: LRUCache<string, VectorDelta>;

     async searchSimilar(
       branch: string | null,
       queryEmbedding: Float32Array,
       topK: number
     ): Promise<SimilarityResult[]> {
       // Layer 0: Search base
       const baseResults = await this.baseVectorStore.searchSimilar(
         queryEmbedding,
         topK * 2  // Fetch more to account for deltas
       );

       // Layer 1: Apply vector delta
       if (branch && branch !== 'main') {
         const vectorDelta = await this.getOrLoadVectorDelta(branch);
         if (vectorDelta) {
           return vectorDelta.apply(baseResults, queryEmbedding, topK);
         }
       }

       return baseResults.slice(0, topK);
     }
   }
   ```

#### 3.2 Vector Delta Persistence (2 дня)

**Файлы:**
- `src/layered/vector-cache-manager.ts` (новый)

**Задачи:**

1. Создать SQLite schema для vector deltas:
   ```sql
   -- .ultrascript/layered/vector_deltas.db
   CREATE TABLE IF NOT EXISTS vector_deltas (
     branch_name TEXT PRIMARY KEY,
     base_commit_sha TEXT NOT NULL,
     last_modified INTEGER NOT NULL,
     dimension INTEGER NOT NULL,
     added_embeddings TEXT NOT NULL,      -- JSON: {id: base64_embedding}
     modified_embeddings TEXT NOT NULL,   -- JSON: {id: base64_embedding}
     deleted_embedding_ids TEXT NOT NULL, -- JSON array
     metadata TEXT
   );
   ```

2. Реализовать serialization:
   ```typescript
   export class VectorCacheManager {
     private serializeEmbedding(embedding: Float32Array): string {
       const buffer = Buffer.from(embedding.buffer);
       return buffer.toString('base64');
     }

     private deserializeEmbedding(base64: string): Float32Array {
       const buffer = Buffer.from(base64, 'base64');
       return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
     }

     async saveVectorDelta(delta: VectorDelta): Promise<void> {
       const addedEmbeddingsJson = JSON.stringify(
         Object.fromEntries(
           Array.from(delta.addedEmbeddings.entries()).map(
             ([id, emb]) => [id, this.serializeEmbedding(emb)]
           )
         )
       );

       // Similar for modified...

       this.db.prepare(`
         INSERT OR REPLACE INTO vector_deltas
         (branch_name, base_commit_sha, last_modified, dimension,
          added_embeddings, modified_embeddings, deleted_embedding_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       `).run(
         delta.branchName,
         delta.baseCommitSha,
         delta.lastModified,
         384,  // dimension
         addedEmbeddingsJson,
         modifiedEmbeddingsJson,
         JSON.stringify(Array.from(delta.deletedEmbeddingIds))
       );
     }
   }
   ```

#### 3.3 Lazy Embedding Generation (1-2 дня)

**Задачи:**

1. Генерировать embeddings только для изменённых entities:
   ```typescript
   class LayeredVectorStore {
     async generateDeltaEmbeddings(
       entityDelta: EntityDelta,
       vectorDelta: VectorDelta
     ): Promise<void> {
       // Generate only for added entities
       for (const [id, entity] of entityDelta.added) {
         const embedding = await this.embeddingGenerator.generate(entity.content);
         vectorDelta.addedEmbeddings.set(id, embedding);
       }

       // Generate for modified entities
       for (const [id, entity] of entityDelta.modified) {
         const embedding = await this.embeddingGenerator.generate(entity.content);
         vectorDelta.modifiedEmbeddings.set(id, embedding);
       }
     }
   }
   ```

2. Background generation (не блокировать основной поток):
   ```typescript
   async ensureVectorDelta(branch: string): Promise<void> {
     const entityDelta = await this.getEntityDelta(branch);
     const vectorDelta = await this.getVectorDelta(branch);

     // Background generation
     this.generateDeltaEmbeddings(entityDelta, vectorDelta)
       .catch(err => console.error('Vector generation failed:', err));
   }
   ```

**Результат Фазы 3:**
- ✅ Semantic search работает с layered architecture
- ✅ Vector deltas генерируются лениво
- ✅ Persistent cache для векторов
- ✅ SIMD optimizations (уже есть в simd-vector-ops.ts)

---

### Фаза 4: Optimization & Caching (3-4 дня)

**Цель:** Оптимизация памяти и производительности

#### 4.1 Delta Compaction (1-2 дня)

**Файлы:**
- `src/layered/delta-compaction-service.ts` (новый)

**Задачи:**

1. Реализовать compaction для больших дельт:
   ```typescript
   export class DeltaCompactionService {
     private readonly COMPACTION_THRESHOLD = 1000;

     async compactDelta(branch: string): Promise<void> {
       const delta = await this.layeredIndex.getBranchDelta(branch);

       if (!delta || delta.totalChanges < this.COMPACTION_THRESHOLD) {
         return;
       }

       console.log(`Compacting large delta for branch ${branch} (${delta.totalChanges} changes)`);

       // Recompute delta from current git diff
       const newDelta = await this.gitDeltaComputer.computeDeltaFromGitDiff(branch, 'main');

       // Replace old delta
       await this.layeredIndex.setBranchDelta(branch, newDelta);
     }
   }
   ```

#### 4.2 Orphaned Delta Cleanup (1 день)

**Файлы:**
- `src/layered/orphaned-delta-cleanup.ts` (новый)

**Задачи:**

1. Периодический cleanup:
   ```typescript
   export class OrphanedDeltaCleanup {
     async cleanupOrphanedDeltas(): Promise<number> {
       const gitBranches = await this.branchManager.getActiveBranches();
       const cachedBranches = await this.cacheManager.getCachedBranches();

       const orphaned = cachedBranches.filter(
         cached => !gitBranches.some(git => git.name === cached)
       );

       for (const branch of orphaned) {
         console.log(`Deleting orphaned delta for branch: ${branch}`);
         await this.cacheManager.deleteBranchDelta(branch);
       }

       return orphaned.length;
     }
   }
   ```

#### 4.3 Background Scheduler (1 день)

**Файлы:**
- `src/layered/background-scheduler.ts` (новый)

**Задачи:**

1. Периодические задачи:
   ```typescript
   export class BackgroundScheduler {
     private compactionInterval: NodeJS.Timeout | null = null;
     private cleanupInterval: NodeJS.Timeout | null = null;

     start(): void {
       // Compaction every 30 minutes
       this.compactionInterval = setInterval(
         () => this.compactionService.compactAllLargeDeltas(),
         30 * 60 * 1000
       );

       // Cleanup every 60 minutes
       this.cleanupInterval = setInterval(
         () => this.cleanupService.cleanupOrphanedDeltas(),
         60 * 60 * 1000
       );
     }

     stop(): void {
       if (this.compactionInterval) clearInterval(this.compactionInterval);
       if (this.cleanupInterval) clearInterval(this.cleanupInterval);
     }
   }
   ```

**Результат Фазы 4:**
- ✅ Delta compaction предотвращает memory bloat
- ✅ Orphaned cleanup предотвращает storage leaks
- ✅ Background scheduler автоматизирует maintenance

---

## 📊 Ожидаемые результаты MVP

### Performance Targets

| Метрика | До | После | Улучшение |
|---------|-----|-------|-----------|
| **Branch switch** | Full rebuild (~10-30s) | Load delta (<100ms) | **100-300x faster** |
| **Incremental update (1 file)** | Full rebuild (~10-30s) | 100-500ms | **20-300x faster** |
| **Memory (10 branches)** | 10 × full index | Base + 10 deltas | **~60-80% reduction** |
| **Disk space (10 branches)** | 10 × full DB | Base + 10 small deltas | **~70-85% reduction** |

### Memory Breakdown (10 branches, example)

```
Before (Per-Branch Databases):
  main.db:             50 MB
  feature-auth.db:     52 MB  (mostly duplicates main)
  feature-payment.db:  51 MB  (mostly duplicates main)
  ... (7 more branches)
  Total: ~510 MB

After (Layered Architecture):
  Layer 0 (base.db):   50 MB  (shared)
  Layer 1 deltas:
    feature-auth:       5 MB  (only changes)
    feature-payment:    4 MB  (only changes)
    ... (7 more)
  Total: ~95 MB (81% reduction)
```

---

## 🚦 Стратегия запуска

### Рекомендуется: MVP First

**Week 1-2:** Фаза 0 + Фаза 1.1-1.2
- Базовая layered architecture
- Branch deltas
- Git integration

**Week 3:** Фаза 1.3 + Фаза 2
- SQLite persistence
- Incremental updates

**Week 4:** Фаза 3 + Фаза 4
- Vector integration
- Optimization

**Результат:**
- Production-ready MVP
- Значительный performance boost
- Основа для Layer 2 (future)

---

## 🔍 Риски и митигации

### Риск 1: TypeScript/JavaScript специфика

**Проблема:** C# имеет ConcurrentDictionary, TypeScript - нет
**Митигация:** Использовать Map с async locks (semaphore pattern)

### Риск 2: Git integration сложность

**Проблема:** Парсинг git diff может быть сложным
**Митигация:** Использовать проверенную библиотеку `simple-git`

### Риск 3: Vector serialization overhead

**Проблема:** JSON serialization Float32Array может быть медленной
**Митигация:** Base64 encoding + Buffer (уже есть в VectorStore)

---

## ✅ Success Criteria

### Функциональные:
- [ ] Branch isolation работает (разные ветки → разные результаты поиска)
- [ ] Incremental updates работают (изменения видны <500ms)
- [ ] Git operations работают (branch switch сохраняет consistency)
- [ ] Vector search работает с layering

### Performance:
- [ ] Branch switch: <100ms
- [ ] Incremental update (1 file): <500ms
- [ ] Memory usage (10 branches): <150 MB (vs ~500 MB)
- [ ] No regressions в существующих операциях

---

## 📚 Ссылки

- **Исходная реализация:** [ultrasharp-tools-mcp](https://github.com/faxg/ultrasharp-tools-mcp)
- **Документация C#:** `D:\_mcp\ultrasharp-tools-mcp\Dev.Docs\Development\`
- **simple-git:** https://github.com/steveukx/git-js
- **lru-cache:** https://github.com/isaacs/node-lru-cache

---

## ✅ СТАТУС РЕАЛИЗАЦИИ

**Дата завершения:** 2025-01-17
**Версия:** 1.0 MVP

### Реализованные компоненты:

#### Фаза 1: Foundation & Schema ✅
- ✅ `src/types/layered.ts` - все типы и интерфейсы
- ✅ `src/core/layered-index.ts` - ILayeredIndex интерфейс
- ✅ `src/layered/branch-delta.ts` - BranchDelta класс
- ✅ `src/layered/layered-graph-index.ts` - LayeredGraphIndex реализация
- ✅ `src/layered/git-delta-computer.ts` - GitDeltaComputer для git diff
- ✅ `src/layered/layered-cache-manager.ts` - SQLite persistence для entity deltas

#### Фаза 2: Incremental Updates ✅
- ✅ `src/layered/incremental-update-queue.ts` - IncrementalUpdateQueue для батчинга
- ✅ `src/layered/file-change-integration.ts` - FileChangeIntegration с GitWatcher

#### Фаза 3: Vector Integration ✅
- ✅ `src/layered/vector-delta.ts` - VectorDelta класс
- ✅ `src/layered/layered-vector-store.ts` - LayeredVectorStore для семантического поиска
- ✅ `src/layered/vector-cache-manager.ts` - SQLite persistence для vector deltas

#### Фаза 4: Optimization & Caching ✅
- ✅ `src/layered/delta-maintenance-service.ts` - DeltaMaintenanceService
- ✅ `src/layered/layered-index-manager.ts` - LayeredIndexManager (главный фасад)
- ✅ `src/layered/index.ts` - Public API exports

### Созданные файлы (11):

1. `src/types/layered.ts` (~350 строк)
2. `src/core/layered-index.ts` (~290 строк)
3. `src/layered/branch-delta.ts` (~314 строк)
4. `src/layered/layered-graph-index.ts` (~442 строк)
5. `src/layered/git-delta-computer.ts` (~415 строк)
6. `src/layered/layered-cache-manager.ts` (~367 строк)
7. `src/layered/incremental-update-queue.ts` (~364 строк)
8. `src/layered/file-change-integration.ts` (~322 строк)
9. `src/layered/vector-delta.ts` (~360 строк)
10. `src/layered/layered-vector-store.ts` (~455 строк)
11. `src/layered/vector-cache-manager.ts` (~427 строк)
12. `src/layered/delta-maintenance-service.ts` (~431 строк)
13. `src/layered/layered-index-manager.ts` (~420 строк)
14. `src/layered/index.ts` (~120 строк)

**Всего:** ~4,900 строк кода

### Ключевые особенности реализации:

#### ✅ Трехслойная архитектура
- Layer 0 (Base): Main branch, SQLite storage
- Layer 1 (Branch Deltas): Per-branch changes, LRU cache + SQLite persistence
- Layer 2 (Working Deltas): Stubs для будущей реализации

#### ✅ Адаптивный выбор векторного бэкенда
- <10K файлов → fallback (in-memory)
- 10K-50K файлов → sqlite-vec
- \>50K файлов → vectorlite

#### ✅ Оптимизации
- LRU cache для branch deltas (по умолчанию: 10 веток)
- Батчинг изменений файлов (debounce: 300ms)
- Автоматическая компакция больших delta (threshold: 1000 изменений)
- Фоновое обслуживание (cleanup, vacuum) каждый час

#### ✅ Git интеграция
- Автоматическое отслеживание branch changes
- Автоматическое отслеживание commit changes
- Автоматическое отслеживание file changes
- Инкрементальные обновления через GitWatcher

#### ✅ Персистентность
- SQLite для entity deltas: `.ultrascript/layered/deltas.db`
- SQLite для vector deltas: `.ultrascript/layered/vector-deltas.db`
- JSON сериализация для Maps/Sets
- Binary BLOB для векторных эмбеддингов (Float32Array)

### Следующие шаги (не входят в MVP):

1. **Интеграция с существующим кодом:**
   - Подключить LayeredIndexManager в main MCP server
   - Интегрировать с существующими MCP tools
   - Добавить CLI команды для управления

2. **Layer 2 (Working Deltas):**
   - Полная реализация per-client uncommitted changes
   - File system watcher для real-time updates
   - WebSocket/SSE для push-уведомлений

3. **Тестирование:**
   - Unit тесты для всех компонентов
   - Интеграционные тесты
   - Performance benchmarks
   - Нагрузочное тестирование

4. **Документация:**
   - API документация
   - Руководство пользователя
   - Migration guide

---

**Последнее обновление:** 2025-01-17
**Версия плана:** 1.0
**Статус:** ✅ MVP Completed 🎉
