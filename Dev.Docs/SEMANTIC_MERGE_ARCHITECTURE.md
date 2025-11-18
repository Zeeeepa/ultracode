# Semantic Merge Architecture для UltraScript Tools MCP

## 🎯 Цель

Реализовать систему интеллектуального слияния Git-веток на основе семантического анализа кода, используя существующую инфраструктуру ultrascript-tools-mcp.

## 📊 Анализ существующей инфраструктуры

### Что уже есть ✅

1. **Multi-Agent Architecture**
   - `ConductorOrchestrator` - координация агентов
   - `BaseAgent` - базовый класс для всех агентов
   - `DIContainer` - dependency injection
   - `KnowledgeBus` - pub/sub для межагентного взаимодействия
   - `AgentRegistry` - автоматическая регистрация агентов

2. **Semantic Infrastructure**
   - `SemanticAgent` - embedding и семантический анализ
   - `EmbeddingGenerator` - генерация embeddings (TEI, Ollama, OpenAI, CloudRu)
   - `VectorStore` - хранение и поиск векторов (sqlite-vec, vectorlite)
   - `AdaptiveVectorBackend` - адаптивный выбор backend

3. **Storage & Graph**
   - `GraphStorage` - entities/relationships в SQLite
   - `BatchOperations` - батчинг для массовых операций
   - `ConnectionPool` - пул соединений
   - `SchemaMigrations` - миграции схемы

4. **Parser Infrastructure**
   - 10 языков: TypeScript, JavaScript, Python, C, C++, C#, Rust, Go, Java, VBA
   - Tree-sitter анализаторы
   - AST parsing и структурный анализ
   - Worker pools для параллельного парсинга

5. **Git Integration**
   - `BranchManager` - управление ветками
   - `GitWatcher` - отслеживание изменений
   - Multi-branch database support

6. **GPU Acceleration (NEW!)**
   - CUDA backend (100-200x speedup)
   - WASM SIMD backend (4-8x speedup)
   - WebGPU backend (50-100x speedup)
   - Auto-detection и fallback

### Что нужно добавить 🆕

1. **MergeAgent** - новый агент для semantic merge операций
2. **CodeUnit** модель - универсальная единица кода (адаптация из C#)
3. **FastPathMatcher** - O(1) hash/signature matching
4. **ContentNormalizer** - encoding/BOM/line endings нормализация
5. **SemanticMatcher** - embedding-based code similarity
6. **IntentClassifier** - определение намерений изменений
7. **ThreeWayMerger** - 3-way merge алгоритм
8. **MultiVersionIndexer** - индексация 4 версий (base, branchA, branchB, merged)
9. **MCP Tools** - API для merge операций

## 🏗️ Архитектура (4 слоя)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: NORMALIZATION (preprocessing)                     │
│  ├─ ContentNormalizer (encoding, BOM, line endings)         │
│  ├─ StructuralNormalizer (AST без whitespace/comments)      │
│  └─ SignatureGenerator (FQN + params для functions)         │
│  Result: Unified format для всех файлов                     │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: FAST PATH (90% случаев)                           │
│  ├─ Hash matching (SHA256 content) - O(1)                   │
│  ├─ Structural hash (AST fingerprint) - O(1)                │
│  ├─ Signature matching (FQN + params) - O(1)                │
│  └─ ID matching (stable IDs across renames) - O(1)          │
│  Result: 90% сопоставлений мгновенно                        │
└─────────────────────────────────────────────────────────────┘
                    ↓ (10% unmatched)
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: SLOW PATH (10% случаев)                           │
│  ├─ Embedding generation (lazy, только для unmatched)       │
│  ├─ Vector search (VectorStore + GPU acceleration)          │
│  ├─ Structural similarity (AST tree edit distance)          │
│  └─ CFG comparison (control flow equivalence)               │
│  Result: Находит перемещённый/рефакторенный код             │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: INTELLIGENT MERGE                                 │
│  ├─ Intent classification (BugFix, Refactoring, Feature)    │
│  ├─ Conflict detection (overlapping changes)                │
│  ├─ Compatibility check (can changes be combined?)          │
│  └─ Merge action generation (create/update/move/delete)     │
│  Result: Auto-merge compatible changes, report conflicts    │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Структура проекта

```
src/
├─ agents/
│  └─ merge-agent.ts                   # 🆕 Новый MergeAgent
│
├─ merge/                              # 🆕 Новая подсистема
│  ├─ models/
│  │  ├─ code-unit.ts                  # Универсальная единица кода
│  │  ├─ versioned-index.ts            # Индекс для одной версии
│  │  ├─ merge-result.ts               # Результат мерджа
│  │  ├─ semantic-conflict.ts          # Конфликт
│  │  └─ change-intent.ts              # Намерение изменения
│  │
│  ├─ indexing/
│  │  ├─ content-normalizer.ts         # Нормализация encoding/BOM/LF
│  │  ├─ structural-normalizer.ts      # AST normalization
│  │  ├─ signature-generator.ts        # FQN + params
│  │  ├─ multi-version-indexer.ts      # Индексация 4 версий
│  │  └─ lazy-embedding-cache.ts       # Кэш embeddings
│  │
│  ├─ matching/
│  │  ├─ fast-path-matcher.ts          # Hash/signature matching
│  │  ├─ semantic-matcher.ts           # Embedding-based matching
│  │  ├─ movement-detector.ts          # Обнаружение перемещений
│  │  └─ structural-aligner.ts         # Нормализация порядка
│  │
│  ├─ analysis/
│  │  ├─ intent-classifier.ts          # Определение intent
│  │  ├─ conflict-detector.ts          # Поиск конфликтов
│  │  └─ compatibility-checker.ts      # Проверка совместимости
│  │
│  ├─ engine/
│  │  ├─ three-way-merger.ts           # 3-way merge алгоритм
│  │  ├─ conflict-resolver.ts          # Предложения по разрешению
│  │  └─ merge-orchestrator.ts         # Главный оркестратор
│  │
│  └─ integration/
│     ├─ parser-integration.ts         # Интеграция с ParserAgent
│     ├─ semantic-integration.ts       # Интеграция с SemanticAgent
│     └─ git-integration.ts            # Интеграция с BranchManager
│
└─ tools/
   └─ semantic-merge-tools.ts          # 🆕 MCP tools для merge
```

## 🔧 Ключевые компоненты

### 1. CodeUnit - Универсальная единица кода

```typescript
/**
 * Универсальная единица кода для semantic merge.
 * Может представлять: файл, класс, функцию, блок, JSON object.
 */
export interface CodeUnit {
  // Identity
  id: string;                    // Стабильный ID (SHA256 от FQN)
  type: CodeUnitType;            // File, Class, Function, Block, etc.

  // Location
  filePath: string;              // Относительный путь
  name: string;                  // Простое имя
  fullyQualifiedName: string;    // Полный путь (namespace.class.method)
  startLine: number;             // Начальная строка (1-based)
  endLine: number;               // Конечная строка (1-based)

  // Content
  content: string;               // Исходный код
  contentHash: string;           // SHA256 hash контента (для Fast Path)
  structuralHash: string;        // AST hash (игнорирует whitespace)
  signature?: string;            // Сигнатура (для функций: FQN + params)

  // Semantic (lazy)
  embedding?: Float32Array;      // Вектор (генерируется лениво)

  // Structure
  structure?: CodeStructure;     // AST metadata

  // Hierarchy
  parentId?: string;             // ID родителя
  childIds: string[];            // IDs детей

  // Metadata
  language: string;              // TypeScript, Python, etc.
  metadata: Record<string, any>; // Дополнительная информация
}

export enum CodeUnitType {
  File = 'file',
  Module = 'module',
  Class = 'class',
  Interface = 'interface',
  Function = 'function',
  Method = 'method',
  Property = 'property',
  Block = 'block',
  Statement = 'statement',
  // JSON/YAML
  JsonObject = 'json_object',
  JsonArray = 'json_array',
  JsonProperty = 'json_property',
  YamlNode = 'yaml_node',
}

export interface CodeStructure {
  normalizedAst: string;         // Нормализованный AST
  identifiers: Set<string>;      // Все идентификаторы
  imports: Set<string>;          // Все импорты
  exports: Set<string>;          // Все экспорты
  complexityMetrics?: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    branchCount: number;
    loopCount: number;
  };
}
```

### 2. FastPathMatcher - Быстрое сопоставление

```typescript
/**
 * Fast Path matching: O(1) lookup по hash/signature.
 * Обрабатывает 90% случаев без embeddings.
 */
export class FastPathMatcher {
  /**
   * Попытка быстрого сопоставления двух CodeUnit.
   * Returns null если Fast Path не сработал.
   */
  tryMatch(unitA: CodeUnit, unitB: CodeUnit): FastPathMatchResult | null {
    // Level 1: Exact content match (100%)
    if (unitA.contentHash === unitB.contentHash) {
      return {
        unitA,
        unitB,
        matchType: 'exact_content',
        confidence: 1.0,
      };
    }

    // Level 2: Structural match (95%)
    if (unitA.structuralHash === unitB.structuralHash) {
      return {
        unitA,
        unitB,
        matchType: 'structural_same',
        confidence: 0.95,
      };
    }

    // Level 3: Signature match (85%)
    if (unitA.signature && unitB.signature &&
        unitA.signature === unitB.signature) {
      return {
        unitA,
        unitB,
        matchType: 'signature_match',
        confidence: 0.85,
      };
    }

    // Level 4: ID match (70%)
    if (unitA.id === unitB.id) {
      return {
        unitA,
        unitB,
        matchType: 'id_match',
        confidence: 0.7,
      };
    }

    return null; // Slow Path needed
  }

  /**
   * Bulk matching для всех units - O(n) через hash lookups.
   */
  async bulkMatch(
    baseVersion: VersionedIndex,
    targetVersion: VersionedIndex,
  ): Promise<Map<string, FastPathMatchResult>> {
    const matches = new Map<string, FastPathMatchResult>();

    // Создать O(1) lookup таблицы
    const hashMap = new Map<string, CodeUnit[]>();
    const structHashMap = new Map<string, CodeUnit[]>();
    const signatureMap = new Map<string, CodeUnit[]>();

    for (const unit of targetVersion.units.values()) {
      // Index by content hash
      if (!hashMap.has(unit.contentHash)) {
        hashMap.set(unit.contentHash, []);
      }
      hashMap.get(unit.contentHash)!.push(unit);

      // Index by structural hash
      if (!structHashMap.has(unit.structuralHash)) {
        structHashMap.set(unit.structuralHash, []);
      }
      structHashMap.get(unit.structuralHash)!.push(unit);

      // Index by signature
      if (unit.signature) {
        if (!signatureMap.has(unit.signature)) {
          signatureMap.set(unit.signature, []);
        }
        signatureMap.get(unit.signature)!.push(unit);
      }
    }

    // Match base units
    for (const baseUnit of baseVersion.units.values()) {
      const match = this.tryMatchWithMaps(
        baseUnit,
        hashMap,
        structHashMap,
        signatureMap,
        targetVersion,
      );

      if (match) {
        matches.set(baseUnit.id, match);
      }
    }

    this.logger.info(
      `Fast Path matched ${matches.size}/${baseVersion.units.size} units ` +
      `(${((matches.size / baseVersion.units.size) * 100).toFixed(1)}%)`,
    );

    return matches;
  }
}
```

### 3. ContentNormalizer - Нормализация файлов

```typescript
/**
 * Нормализует encoding, BOM, line endings перед сравнением.
 * КРИТИЧНО для корректного Fast Path matching.
 */
export class ContentNormalizer {
  /**
   * Нормализовать содержимое файла.
   */
  async normalize(filePath: string): Promise<NormalizedContent> {
    // 1. Прочитать raw bytes
    const rawBytes = await fs.readFile(filePath);

    // 2. Определить encoding и BOM
    const { encoding, hasBom } = this.detectEncoding(rawBytes);

    // 3. Декодировать в string
    let content = rawBytes.toString(encoding);

    // 4. Удалить BOM если есть
    if (hasBom && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    // 5. Нормализовать line endings: CRLF/CR → LF
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 6. Trim trailing whitespace на каждой строке
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      lines[i] = lines[i].replace(/[ \t]+$/, '');
    }
    content = lines.join('\n');

    // 7. Удалить trailing empty lines
    content = content.replace(/\n+$/, '\n');

    return {
      content,
      originalEncoding: encoding,
      hadBom: hasBom,
      normalized: true,
    };
  }

  /**
   * Вычислить content hash нормализованного контента.
   */
  computeContentHash(normalizedContent: string): string {
    return createHash('sha256')
      .update(normalizedContent, 'utf8')
      .digest('hex');
  }

  /**
   * Определить encoding через BOM detection.
   */
  private detectEncoding(bytes: Buffer): { encoding: string; hasBom: boolean } {
    // UTF-8 BOM: EF BB BF
    if (bytes.length >= 3 &&
        bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { encoding: 'utf8', hasBom: true };
    }

    // UTF-16 LE BOM: FF FE
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { encoding: 'utf16le', hasBom: true };
    }

    // UTF-16 BE BOM: FE FF
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { encoding: 'utf16le', hasBom: true }; // Node.js doesn't have utf16be
    }

    // Default: UTF-8 no BOM
    return { encoding: 'utf8', hasBom: false };
  }
}
```

### 4. MergeAgent - Новый агент

```typescript
/**
 * MergeAgent координирует semantic merge операции.
 * Использует Fast Path + Slow Path для сопоставления кода.
 */
export class MergeAgent extends BaseAgent {
  private readonly fastPathMatcher: FastPathMatcher;
  private readonly semanticMatcher: SemanticMatcher;
  private readonly contentNormalizer: ContentNormalizer;
  private readonly threeWayMerger: ThreeWayMerger;
  private readonly multiVersionIndexer: MultiVersionIndexer;

  constructor(
    conductor: ConductorOrchestrator,
    config: MergeAgentConfig,
  ) {
    super(conductor, AgentType.MERGE, config);

    this.fastPathMatcher = new FastPathMatcher(this.logger);
    this.semanticMatcher = new SemanticMatcher(
      conductor.getAgent(AgentType.SEMANTIC),
      this.logger,
    );
    this.contentNormalizer = new ContentNormalizer(config.normalizer);
    this.threeWayMerger = new ThreeWayMerger(
      this.fastPathMatcher,
      this.semanticMatcher,
      this.logger,
    );
    this.multiVersionIndexer = new MultiVersionIndexer(
      conductor.getAgent(AgentType.PARSER),
      this.contentNormalizer,
      this.logger,
    );
  }

  /**
   * Выполнить semantic merge веток.
   */
  async performSemanticMerge(
    baseBranch: string,
    branchA: string,
    branchB: string,
    options?: MergeOptions,
  ): Promise<MergeResult> {
    this.logger.info(
      `Starting semantic merge: ${baseBranch} + ${branchA} + ${branchB}`,
    );

    // 1. Индексация 4 версий
    const [baseIndex, indexA, indexB] = await Promise.all([
      this.multiVersionIndexer.indexBranch(baseBranch),
      this.multiVersionIndexer.indexBranch(branchA),
      this.multiVersionIndexer.indexBranch(branchB),
    ]);

    this.logger.info(
      `Indexed: base=${baseIndex.units.size}, ` +
      `A=${indexA.units.size}, B=${indexB.units.size}`,
    );

    // 2. Three-way merge
    const mergeResult = await this.threeWayMerger.merge(
      baseIndex,
      indexA,
      indexB,
      options,
    );

    this.logger.info(
      `Merge complete: ${mergeResult.actions.length} actions, ` +
      `${mergeResult.conflicts.length} conflicts`,
    );

    // 3. Publish результаты через KnowledgeBus
    await this.conductor.knowledgeBus.publish('merge.completed', {
      baseBranch,
      branchA,
      branchB,
      result: mergeResult,
    });

    return mergeResult;
  }

  /**
   * Анализ конфликтов без выполнения merge.
   */
  async analyzeMergeConflicts(
    baseBranch: string,
    branchA: string,
    branchB: string,
  ): Promise<ConflictAnalysis> {
    const result = await this.performSemanticMerge(
      baseBranch,
      branchA,
      branchB,
      { dryRun: true },
    );

    return {
      conflicts: result.conflicts,
      statistics: result.statistics,
      suggestions: this.generateResolutionSuggestions(result.conflicts),
    };
  }
}
```

### 5. ThreeWayMerger - Основной алгоритм

```typescript
/**
 * Three-way merge: base + branchA + branchB → merged.
 */
export class ThreeWayMerger {
  /**
   * Выполнить 3-way merge.
   */
  async merge(
    baseIndex: VersionedIndex,
    indexA: VersionedIndex,
    indexB: VersionedIndex,
    options?: MergeOptions,
  ): Promise<MergeResult> {
    // Phase 1: Detect changes (Fast Path)
    this.logger.info('Phase 1: Fast Path matching...');
    const [matchesA, matchesB] = await Promise.all([
      this.fastPathMatcher.bulkMatch(baseIndex, indexA),
      this.fastPathMatcher.bulkMatch(baseIndex, indexB),
    ]);

    // Phase 2: Semantic matching для unmatched (Slow Path)
    this.logger.info('Phase 2: Semantic matching...');
    const unmatchedA = this.findUnmatched(indexA, matchesA);
    const unmatchedB = this.findUnmatched(indexB, matchesB);

    const [semanticMatchesA, semanticMatchesB] = await Promise.all([
      this.semanticMatcher.findMatches(unmatchedA, baseIndex),
      this.semanticMatcher.findMatches(unmatchedB, baseIndex),
    ]);

    // Combine matches
    const allMatchesA = new Map([...matchesA, ...semanticMatchesA]);
    const allMatchesB = new Map([...matchesB, ...semanticMatchesB]);

    this.logger.info(
      `Matched: A=${allMatchesA.size}/${indexA.units.size}, ` +
      `B=${allMatchesB.size}/${indexB.units.size}`,
    );

    // Phase 3: Detect changes and intents
    const changesA = this.detectChanges(baseIndex, indexA, allMatchesA);
    const changesB = this.detectChanges(baseIndex, indexB, allMatchesB);

    // Phase 4: Classify intents
    const intentsA = await this.classifyIntents(changesA);
    const intentsB = await this.classifyIntents(changesB);

    // Phase 5: Find conflicts
    const conflicts = this.findConflicts(changesA, changesB, intentsA, intentsB);

    // Phase 6: Generate merge actions
    const actions = this.generateMergeActions(
      changesA,
      changesB,
      conflicts,
      options,
    );

    return {
      actions,
      conflicts,
      statistics: {
        totalUnits: baseIndex.units.size,
        matchedA: allMatchesA.size,
        matchedB: allMatchesB.size,
        fastPathCoverage: (matchesA.size + matchesB.size) /
                          (indexA.units.size + indexB.units.size),
        semanticMatchCount: semanticMatchesA.size + semanticMatchesB.size,
        conflictCount: conflicts.length,
        autoMergedCount: actions.filter(a => a.autoMerged).length,
      },
    };
  }
}
```

## 🚀 План реализации (7 фаз)

### Phase 1: Foundation (2-3 дня)

**Цель**: Базовые модели и infrastructure

**Задачи**:
- [ ] Создать директорию `src/merge/`
- [ ] Реализовать `CodeUnit` interface и types
- [ ] Реализовать `VersionedIndex` модель
- [ ] Реализовать `MergeResult`, `MergeAction`, `SemanticConflict` models
- [ ] Реализовать `ContentNormalizer` (encoding, BOM, line endings)
- [ ] Unit tests для нормализации

**Критерии готовности**:
- ✅ Все модели определены с TypeScript types
- ✅ ContentNormalizer корректно обрабатывает UTF-8, UTF-16, BOM
- ✅ Tests покрывают edge cases (empty files, binary files)

### Phase 2: Fast Path Matching (2-3 дня)

**Цель**: Реализовать O(1) hash/signature matching

**Задачи**:
- [ ] Реализовать `StructuralNormalizer` (AST без whitespace)
- [ ] Реализовать `SignatureGenerator` (FQN + params)
- [ ] Реализовать `FastPathMatcher` с 4 уровнями
- [ ] Интеграция с `ParserAgent` для AST
- [ ] Benchmarks для Fast Path

**Критерии готовности**:
- ✅ Fast Path находит >90% exact matches
- ✅ Performance: O(1) lookup через Map/Set
- ✅ Structural hash игнорирует comments/whitespace

### Phase 3: Semantic Matching (3-4 дня)

**Цель**: Slow Path через embeddings

**Задачи**:
- [ ] Реализовать `SemanticMatcher`
- [ ] Интеграция с `SemanticAgent` для embeddings
- [ ] Реализовать `LazyEmbeddingCache` (генерация только для unmatched)
- [ ] Интеграция с `VectorStore` для similarity search
- [ ] GPU acceleration через CUDA/WASM backend
- [ ] Реализовать `MovementDetector` (file/class/function moves)

**Критерии готовности**:
- ✅ Semantic search находит перемещённый код (>80% accuracy)
- ✅ Lazy generation - embeddings только для 10% units
- ✅ GPU acceleration работает (CUDA/WASM fallback)

### Phase 4: Multi-Version Indexing (2-3 дня)

**Цель**: Индексация 4 версий кода

**Задачи**:
- [ ] Реализовать `MultiVersionIndexer`
- [ ] Интеграция с `BranchManager` для checkout веток
- [ ] Incremental indexing (только changed files)
- [ ] Caching индексов на диск
- [ ] Parallel indexing для разных веток

**Критерии готовности**:
- ✅ Можем индексировать base, branchA, branchB одновременно
- ✅ Incremental updates работают
- ✅ Cache сохраняется между запусками

### Phase 5: Merge Engine (4-5 дней)

**Цель**: 3-way merge algorithm

**Задачи**:
- [ ] Реализовать `IntentClassifier` (BugFix, Refactoring, Feature)
- [ ] Реализовать `ConflictDetector` (overlapping changes)
- [ ] Реализовать `CompatibilityChecker` (can merge?)
- [ ] Реализовать `ThreeWayMerger` (главный алгоритм)
- [ ] Реализовать `ConflictResolver` (suggestions)
- [ ] Integration tests для merge scenarios

**Критерии готовности**:
- ✅ Auto-merge совместимых изменений
- ✅ Правильное обнаружение конфликтов
- ✅ Качественные suggestions для разрешения

### Phase 6: MergeAgent Integration (2-3 дня)

**Цель**: Интеграция с multi-agent architecture

**Задачи**:
- [ ] Реализовать `MergeAgent` class
- [ ] Регистрация в `AgentRegistry`
- [ ] DI registration в `DIContainer`
- [ ] KnowledgeBus integration (events)
- [ ] Error handling и retry logic
- [ ] Metrics и logging

**Критерии готовности**:
- ✅ MergeAgent зарегистрирован и доступен через conductor
- ✅ Работает через KnowledgeBus pub/sub
- ✅ Metrics собираются корректно

### Phase 7: MCP Tools & Polish (2-3 дня)

**Цель**: API для использования

**Задачи**:
- [ ] Реализовать `semantic_merge` MCP tool
- [ ] Реализовать `analyze_merge_conflicts` MCP tool
- [ ] Реализовать `resolve_conflict` MCP tool
- [ ] Реализовать `get_merge_suggestions` MCP tool
- [ ] Documentation и examples
- [ ] Performance optimization

**Критерии готовности**:
- ✅ Все MCP tools работают через Claude Code
- ✅ Documentation готова
- ✅ Performance: <30 сек для 100K LOC проекта

## 📊 Performance Targets

### Fast Path Coverage
- **Target**: >90% units matched через Fast Path
- **Optimization**: O(1) hash lookups через Map/Set
- **Measurement**: `fastPathCoverage` metric

### Embedding Generation
- **Target**: <50ms/unit с TEI (768-dim)
- **Optimization**: Lazy generation (только unmatched)
- **Measurement**: `embeddingGenerationTime` metric

### Vector Search
- **Target**: <10ms для 10K vectors
- **Optimization**: sqlite-vec + GPU acceleration (CUDA 100x, WASM 4x)
- **Measurement**: `vectorSearchTime` metric

### Total Merge Time
- **Target**: <30 сек для 100K LOC
- **Breakdown**:
  - Indexing: 10-15 сек
  - Fast Path: 1-2 сек
  - Slow Path: 5-10 сек
  - Merge logic: 2-3 сек

## 🎯 MCP API

### 1. semantic_merge

Выполнить semantic merge трёх веток.

```typescript
{
  name: 'semantic_merge',
  description: 'Perform semantic merge of branches using AI',
  inputSchema: {
    type: 'object',
    properties: {
      baseBranch: {
        type: 'string',
        description: 'Base branch (common ancestor)',
      },
      branchA: {
        type: 'string',
        description: 'First branch to merge',
      },
      branchB: {
        type: 'string',
        description: 'Second branch to merge',
      },
      options: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          autoResolve: { type: 'boolean' },
          strategy: {
            type: 'string',
            enum: ['intent_preserving', 'conservative', 'aggressive'],
          },
        },
      },
    },
    required: ['baseBranch', 'branchA', 'branchB'],
  },
}
```

**Output**:
```typescript
{
  success: true,
  result: {
    actions: [
      {
        type: 'update',
        filePath: 'src/auth.ts',
        unitId: 'auth.validateUser',
        description: 'Merged validation from both branches',
        autoMerged: true,
      },
      // ...
    ],
    conflicts: [
      {
        type: 'semantic',
        filePath: 'src/api.ts',
        unitId: 'api.handleRequest',
        description: 'Both branches modified same logic',
        suggestions: [
          { priority: 1, description: 'Keep both changes (sequential)' },
          { priority: 2, description: 'Prefer branch A (has validation)' },
        ],
      },
    ],
    statistics: {
      totalUnits: 1250,
      matchedA: 1200,
      matchedB: 1180,
      fastPathCoverage: 0.92,
      conflictCount: 3,
      autoMergedCount: 45,
    },
  },
}
```

### 2. analyze_merge_conflicts

Проанализировать потенциальные конфликты без выполнения merge.

```typescript
{
  name: 'analyze_merge_conflicts',
  description: 'Analyze potential merge conflicts between branches',
  inputSchema: {
    type: 'object',
    properties: {
      baseBranch: { type: 'string' },
      branchA: { type: 'string' },
      branchB: { type: 'string' },
    },
    required: ['baseBranch', 'branchA', 'branchB'],
  },
}
```

### 3. resolve_conflict

Разрешить конфликт с выбранной стратегией.

```typescript
{
  name: 'resolve_conflict',
  description: 'Resolve a specific merge conflict',
  inputSchema: {
    type: 'object',
    properties: {
      conflictId: { type: 'string' },
      resolution: {
        type: 'string',
        enum: ['keep_a', 'keep_b', 'combine_both', 'manual'],
      },
      manualContent: { type: 'string' },
    },
    required: ['conflictId', 'resolution'],
  },
}
```

### 4. get_merge_suggestions

Получить AI-generated suggestions для разрешения конфликтов.

```typescript
{
  name: 'get_merge_suggestions',
  description: 'Get AI suggestions for conflict resolution',
  inputSchema: {
    type: 'object',
    properties: {
      conflictId: { type: 'string' },
      context: {
        type: 'object',
        properties: {
          includeTests: { type: 'boolean' },
          includeDocs: { type: 'boolean' },
        },
      },
    },
    required: ['conflictId'],
  },
}
```

## 🔗 Интеграция с существующей инфраструктурой

### Использование ParserAgent

```typescript
// В MultiVersionIndexer
async indexFile(filePath: string): Promise<CodeUnit[]> {
  // 1. Нормализовать контент
  const normalized = await this.contentNormalizer.normalize(filePath);

  // 2. Парсить через ParserAgent
  const parseResult = await this.conductor
    .getAgent(AgentType.PARSER)
    .parseFile(filePath, normalized.content);

  // 3. Конвертировать entities в CodeUnits
  const units: CodeUnit[] = [];
  for (const entity of parseResult.entities) {
    const unit: CodeUnit = {
      id: entity.id,
      type: this.mapEntityType(entity.type),
      filePath: entity.filePath,
      name: entity.name,
      fullyQualifiedName: entity.id, // Entity ID = FQN
      startLine: entity.startLine,
      endLine: entity.endLine,
      content: this.extractContent(normalized.content, entity),
      contentHash: this.computeHash(normalized.content),
      structuralHash: await this.computeStructuralHash(entity),
      signature: this.generateSignature(entity),
      language: parseResult.language,
      parentId: entity.parentId,
      childIds: [],
      metadata: entity.metadata,
    };
    units.push(unit);
  }

  return units;
}
```

### Использование SemanticAgent

```typescript
// В SemanticMatcher
async findMatches(
  unmatchedUnits: CodeUnit[],
  targetIndex: VersionedIndex,
): Promise<Map<string, SemanticMatchResult>> {
  const matches = new Map<string, SemanticMatchResult>();

  for (const unit of unmatchedUnits) {
    // 1. Генерировать embedding через SemanticAgent
    if (!unit.embedding) {
      unit.embedding = await this.conductor
        .getAgent(AgentType.SEMANTIC)
        .generateEmbedding(unit.content);
    }

    // 2. Поиск через VectorStore
    const searchResults = await this.vectorStore.search({
      vector: unit.embedding,
      limit: 5,
      minSimilarity: 0.7,
    });

    // 3. Выбрать лучший match
    for (const result of searchResults) {
      const targetUnit = targetIndex.units.get(result.id);
      if (targetUnit && this.areCompatible(unit, targetUnit)) {
        matches.set(unit.id, {
          queryUnit: unit,
          matchedUnit: targetUnit,
          similarity: result.similarity,
          matchType: 'semantic',
        });
        break;
      }
    }
  }

  return matches;
}
```

### Использование GPU Acceleration

```typescript
// В VectorStore integration
import { BackendSelector } from '../gpu/backend-selector';

class SemanticMatcher {
  private gpuBackend: any;

  async initialize() {
    // Использовать GPU backend для vector operations
    this.gpuBackend = BackendSelector.selectBest();
    this.logger.info(
      `Using GPU backend: ${this.gpuBackend.type} ` +
      `(${this.gpuBackend.expectedSpeedup}x speedup)`,
    );
  }

  async computeSimilarity(
    queryEmbedding: Float32Array,
    databaseEmbeddings: Float32Array,
  ): Promise<Float32Array> {
    // Batch cosine similarity через CUDA/WASM/WebGPU
    return this.gpuBackend.batchCosineSimilarity(
      queryEmbedding,
      databaseEmbeddings,
    );
  }
}
```

## 💡 Ключевые преимущества

### 1. Меньше конфликтов (50-70% reduction)
- Semantic matching находит перемещённый код
- Intent-based resolution автоматически мержит совместимые изменения

### 2. Понимание намерений
- BugFix + BugFix = auto-merge
- BugFix + APIChange = conflict (требует review)
- Refactoring + FeatureAddition = auto-merge (если не overlap)

### 3. Fast Performance
- 90% через Fast Path (мгновенно)
- GPU acceleration для Slow Path (CUDA 100x, WASM 4x)
- Lazy embeddings (только для unmatched units)

### 4. Multi-Language Support
- Работает с 10 языками (TypeScript, Python, C++, Rust, Go, Java, etc.)
- Единый подход через CodeUnit abstraction

### 5. Полная интеграция
- Использует существующую multi-agent architecture
- KnowledgeBus для событий
- Git integration через BranchManager
- MCP tools для использования в Claude Code

## 📝 Итоговая оценка

### Трудозатраты
- **Phase 1-2**: 4-6 дней (Foundation + Fast Path)
- **Phase 3**: 3-4 дня (Semantic Matching)
- **Phase 4**: 2-3 дня (Multi-Version Indexing)
- **Phase 5**: 4-5 дней (Merge Engine)
- **Phase 6**: 2-3 дня (Agent Integration)
- **Phase 7**: 2-3 дня (MCP Tools)

**Итого**: ~20-27 дней для полной реализации

### Риски
1. **Fast Path Coverage**: Может быть <90% для сильно рефакторенного кода
   - Mitigation: Улучшить Semantic Matching
2. **Performance**: Slow Path может быть медленным для больших проектов
   - Mitigation: GPU acceleration, batch processing
3. **Accuracy**: Могут быть false positives в conflict detection
   - Mitigation: Добавить confidence scores, user review

### Зависимости
- ✅ Multi-agent architecture (уже есть)
- ✅ SemanticAgent (уже есть)
- ✅ VectorStore (уже есть)
- ✅ ParserAgent для 10 языков (уже есть)
- ✅ BranchManager (уже есть)
- ✅ GPU backends (CUDA, WASM, WebGPU - уже есть!)
- 🆕 MergeAgent (нужно реализовать)
- 🆕 Merge subsystem в `src/merge/` (нужно реализовать)

## 🎓 Научная база

### Алгоритмы
- **3-Way Merge**: Классический алгоритм (Khanna et al.)
- **Tree Edit Distance**: Zhang-Shasha для AST comparison
- **Vector Similarity**: Cosine similarity на embeddings
- **Control Flow**: Graph equivalence через CFG metrics

### ML/AI
- **Embeddings**: TEI, Ollama, OpenAI (768-dim)
- **Intent Classification**: Heuristics + pattern matching
- **Conflict Resolution**: Rule-based с confidence scores

---

**Следующий шаг**: Начать с Phase 1 (Foundation) - создать базовые модели и ContentNormalizer.
