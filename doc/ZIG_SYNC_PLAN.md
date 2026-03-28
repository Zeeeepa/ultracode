# План синхронизации: ultracode.zig → ultracode (TS)

> Дата: 2026-03-28
> Источники: AUDIT_ZIG_VS_TS.md, GLOBAL_TODO.md, GRAPH_OPTIMIZATION_PLAN.md, models.json, CDN
> TS-проект: 211K LOC, 818 файлов, 73K entities в графе
> Zig-проект: ~47K LOC, 230 файлов, 87 MCP tools
>
> **Принцип: Zig — эталон, TS подстраивается. Далее — синхрон��ое развитие.**
> Миграции не нужны — БД пересоздаются при изменении фор��ата.

---

## Краткая сводка

Zig-версия UltraCode развивается параллельно и содержит ряд алгоритмических решений,
которых нет в TS-версии. Данный документ описывает **что стоит портировать в TS**,
**как использовать готовые скомпилированные модели из CDN**, и **порядок работ**.

### Категории изменений

| Категория | Кол-во | Эффект |
|-----------|--------|--------|
| **A. Алгоритмы для порта** | 9 | Качество анализа +30-40% |
| **B. Граф-оптимизации** | 4 | Скорость impact/tracing 5-50x |
| **C. NLP-модуль** | 3 | Качество поиска +15-20% |
| **D. CDN/Inference интеграция** | 3 | Нативные эмбеддинги без внешних сервисов |
| **E. Мелкие улучшения** | 5 | Полнота и надёжность |

---

## A. Алгоритмы для порта в TS

### A1. Control Flow Graph (CFG) Builder — ВЫСОКИЙ приоритет

**Источник:** `src/graph/cfg.zig` (~300 LOC)

**Что делает:** Строит CFG из tree-sitter AST для функций/методов. Классифицирует
узлы (entry, exit, branch_true, branch_false, loop_header, merge, return, throw)
и рёбра (sequential, branch, back_edge, exception).

**Зачем в TS:** CFG — основа для reaching definitions, condition analysis, и точного
data flow. Без него tracing работает только на уровне call-графа (межпроцедурно),
но не видит внутреннюю логику функций.

**Реализация в TS:**
- Новый файл `src/tracing/cfg-builder.ts`
- Использовать существующий tree-sitter через `node-tree-sitter`
- Классификация узлов по `node.type` (аналогично `classifyNode` в Zig)
- Типы: `CfgNode`, `CfgEdge`, `MethodCfg`
- ~250-300 LOC TypeScript

**Зависимости:** Нет (self-contained)

---

### A2. Reaching Definitions Analysis — ВЫСОКИЙ приоритет

**Источник:** `src/analysis/reaching_def.zig` (~250 LOC)

**Что делает:** Классический анализ достигающих определений (dataflow analysis).
Для каждой точки в CFG определяет, какие определения переменных (assignment,
parameter, declaration, import) могут достигнуть этой точки.

Использует `DynamicBitSet` для gen/kill множеств и итеративный алгоритм
с фиксированной точкой: `reaching_out[n] = gen[n] ∪ (reaching_in[n] - kill[n])`.

**Зачем в TS:** Необходим для condition analyzer и точного data flow.
Позволяет отвечать на вопросы типа "какие значения может иметь переменная X
в строке Y" — критично для taint analysis.

**Реализация в TS:**
- Новый файл `src/tracing/reaching-definitions.ts`
- Использовать `BitSet` (npm `bitset` или свой на `Uint32Array`)
- Входные данные: CFG от A1
- ~200-250 LOC TypeScript

**Зависимости:** A1 (CFG Builder)

---

### A3. Condition Analyzer — ВЫСОКИЙ приоритет

**Источник:** `src/analysis/condition_analyzer.zig` (~350 LOC)

**Что делает:** Анализирует условия на путях выполнения:
- Собирает условия (`x == null`, `typeof x === 'string'`, `x > 0`)
- Определяет **feasibility** пути (feasible / infeasible / unknown)
- Находит **contradictions** (например `x == null` И `x.length > 0` на одном пути)
- Определяет **dead branches** (ветки, которые никогда не выполнятся)
- **Type narrowing** (`x is string` после `typeof x === 'string'`)

**Зачем в TS:** Уменьшает false positives в tracing на 40-60%.
Текущий `condition-analyzer.ts` в TS существует, но не использует CFG и
reaching definitions — работает на поверхностном уровне.

**Реализация в TS:**
- Расширить существующий `src/tracing/condition-analyzer.ts`
- Интегрировать с CFG и reaching definitions
- Добавить типы: `CondOp`, `Condition`, `PathFeasibility`, `Contradiction`, `NarrowedType`
- ~300-350 LOC новых (частично замена существующего)

**Зависимости:** A1, A2

---

### A4. Taint Semantics Catalog — СРЕДНИЙ приоритет

**Источник:** `src/analysis/taint_semantics.zig` (~200 LOC)

**Что делает:** Comptime-каталог **FlowMapping** для 100+ stdlib-функций:
- Как аргументы перетекают в return value и другие аргументы
- `strcpy(dst, src)` → src перетекает в dst и в return
- `escapeHtml(input)` → sanitizer (очищает taint)
- `readFile(path)` → source (создаёт tainted данные)

**Зачем в TS:** Текущий taint analysis в TS (`taint-flow-analyzer.ts`, `catalogs.ts`)
имеет 200+ паттернов, но **не моделирует перетекание аргументов**. Он определяет
источники и стоки, но не отслеживает как данные трансформируются через вызовы.

**Реализация в TS:**
- ��овый файл `src/analysis/taint/flow-semantics.ts`
- Тип `FlowMapping: { src: number, dst: number }` (−1 = return)
- Тип `FlowSemantic: { method: string, mappings: FlowMapping[], isSanitizer?, isSource?, isSink? }`
- Статический каталог + интеграция с существующим `taint-flow-analyzer.ts`
- ~200 LOC

**Зависимости:** Нет

---

### A5. Porter Stemmer — СРЕДНИЙ приоритет

**Источник:** `src/nlp/stemmer.zig` (~200 LOC)

**Что делает:** Классический Porter Stemmer для английского языка.
Zero-allocation реализация: работает in-place на мутабельном буфере.
Steps 1a-5 по оригинальному алгоритму Портера (1980).

**Зачем в TS:** В TS **нет стемминга вообще**. Поиск "handling" не найдёт
"handle", "handlers" не найдёт "handle". Это 15-20% потери качества
на текстовом поиске.

**Реализация в TS:**
- Новый файл `src/search/stemmer.ts` или использовать npm `stemmer` (0.3KB)
- Интегрировать в `semantic_search` для query expansion
- ~150 LOC (или 1 строка с npm)

**Зависимости:** Нет

---

### A6. BM25 Scoring — СРЕДНИЙ приоритет

**Источник:** `src/nlp/tfidf.zig` (BM25 normalization)

**Что делает:** Okapi BM25 — улучшение TF-IDF с нормализацией по длине документа:
`score = IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))`

Параметры: k1=1.2, b=0.75 (стандартные). Zig-версия использует это в hybrid search.

**Зачем в TS:** Текущий TS использует сырой TF-IDF без нормализации по длине.
Большие файлы получают непропорционально высокие score, маленькие utility-функции
теряются. BM25 даёт +10-15% к precision на code search.

**Реализация в TS:**
- Расширить scoring в `src/search/` или `src/semantic/`
- Формула BM25 — ~50 LOC
- Нужен `avgdl` (средняя длина документа) — считается при индексации

**Зависимости:** Нет

---

### A7. File Merkle Index — НИЗКИЙ приоритет

**Источник:** `src/graph/file_merkle.zig` (~150 LOC)

**Что делает:** Per-file structural hash для инкрементального обнаружения изменений.
XOR Zobrist ключей сущностей + FNV64 cross-file рёбер. Позволяет за O(1)
определить, изменилась ли структура файла (не содержимое, а граф сущностей).

**Зачем в TS:** Оптимизация инкрементальной индексации. Сейчас TS пересчитывает
diff по content hash — это ловит изменения содержимого, но пропускает
структурные рефакторинги (переименование без изменения файла-зависимости).

**Реализация в TS:**
- Новый файл `src/graph/file-merkle.ts`
- Использовать xxhash (уже есть в проекте) вместо FNV64
- ~120 LOC

**Зависимости:** Нет

---

### A8. PackedNodeState — НИЗКИЙ приоритет (для очень больших графов)

**Источник:** `src/graph/packed_state.zig` (~120 LOC)

**Что делает:** Упаковка метаданных узла в 64 бита:
entity_type(6), language(5), complexity(10), fan_in(10), fan_out(10),
flags(4), reserved(19). Позволяет SoA-хранение вместо HashMaps.

**Зачем в TS:** В Zig это критично (кэш-линии, zero-copy). В TS/JS эффект
меньше из-за GC и object model. **Рекомендуется только для проектов >50K entities**
через `Uint32Array` / `BigUint64Array` backing store.

**Реализация в TS:**
- Опционально: `src/graph/packed-node-state.ts`
- Использовать `DataView` + `BigUint64Array` для битовых полей
- ~100 LOC, но требует рефакторинг graph storage
- **Отложить до реальной необходимости**

**��ависимости:** Рефакторинг graph storage

---

### A9. Basin Index + Bloom Reach — НИЗКИЙ приоритет

**И��точник:** `src/graph/basin_index.zig` (~200 LOC), `src/graph/bloom_reach.zig` (~150 LOC)

**Что делает:**
- **BasinIndex**: группирует узлы по "бассейнам" (к какому стоку они ведут).
  Узлы из разных бассейнов гарантированно недостижимы друг от друга → O(1) отсев.
- **BloomReach**: Bloom filter для k-hop достижимости. Для top-N горячих
  узлов предвычисляет bloom filter достижимых узлов → O(1) проверка.

**Зачем в TS:** Ускорение `analyze_code_impact` и `trace_flow` на больших графах.
На графе 50K+ узлов отсекает ~90% кандидатов до BFS. В TS BloomFilter уже есть
(`src/utils/bloom-filter.ts`), но он не используется для графовой оптимизации.

**Реализация в TS:**
- Новый `src/graph/basin-index.ts` (~150 LOC)
- Расширить существующий `BloomFilter` для графовой достижимости
- Интегрировать в impact analyzer и trace engine
- ~250-300 LOC суммарно

**Зависимости:** Нет (но нужен рефакторинг trace engine для интеграции)

---

## B. Граф-оптимизации (иерархический отсев)

Zig-проект реализовал **5-уровневую систему отсева** для графовых запросов
(doc/GRAPH_OPTIMIZATION_PLAN.md). Порядок фильтрации:

```
L2: Zobrist fingerprint  → O(1) "изменился ли подграф?"     → отсев ~90%
L3: Basin check          → O(1) "тот же бассейн?"           → отсев ещё ~50%
L5: Bloom jump tables    → O(1) "в пределах k хопов?"       → для top-N нод
L4: File Merkle diff     → O(log F) "какие файлы затронуты"
BFS (как сейчас)         → O(E_subset) по подграфу кандидатов
```

### Рекомендация для TS

**Портировать B1 (Basin) и B2 (Bloom Reach) — вместе дают 80% выигрыша.**
Zobrist и PackedState — оптимизации для Zig-специфичной модели памяти.

| Оптимизация | Эффект в TS | Сложность | Рекомендация |
|-------------|-------------|-----------|--------------|
| BasinIndex | 5-10x на impact | Средняя | **Портировать** (Phase 2) |
| BloomReach | 2-5x на trace | Средняя | **Портировать** (Phase 2) |
| Zobrist | Малый в JS | Высокая | Пропустить |
| PackedState | Малый в JS | Высокая | Пропустить |
| FileMerkle | 2x на reindex | Низкая | Опционально (Phase 3) |

---

## C. NLP-модуль

В Zig создан отдельный NLP-модуль (`src/nlp/`): stemmer, tfidf, tokenizer.
В TS NLP-функциональность **разбросана и неполна**.

### C1. Stemmer (Porter) — см. A5

### C2. Extended Stopwords

**Источник:** Zig NLP модуль

**Текущее состояние TS:** ~56 стоп-слов (базовый набор).
**Рекомендуемо:** 200+ стоп-слов (+ programming-specific: `var`, `const`, `let`, `function`, `return`).

**Реализация:** Расширить массив в `src/search/` — ~20 LOC, массив констант.

### C3. BM25 Normalization — см. A6

---

## D. CDN-модели и интеграция inference

### D0. Обзор CDN ultracode.zig

CDN содержит **предкомпилированные embedding-модели** для 4 бэкендов:

| Бэкенд | Формат | Платформы | Размер (Arctic XS) |
|--------|--------|-----------|---------------------|
| **OpenVINO CPU** | IR (.xml + .bin), INT8 | Win, Linux | 36 MB |
| **OpenVINO iGPU/NPU** | IR (.xml + .bin), FP16 | Win, Linux | 81 MB |
| **TensorRT CUDA** | .engine (sm_86/89/120) | Win, Linux | 30 MB |
| **TVM Vulkan** | .dll/.so (compiled) | Win, Linux | 84 MB |

**10 моделей** (8 активных): Arctic XS, E5 Small, MiniLM, E5 Base, Nomic v1.5,
MxbAI XSmall, GTE ModernBERT, Nomic ModernBERT.

**CDN URL:** `https://github.com/faxenoff/ultracode/releases/download/v.6.0.2-zig/`

**Манифест:** `cdn/models-manifest.json` — SHA256 хеши для каждого архива.

### D1. Использование ONNX Runtime в TS — РЕКОМЕНДУЕМО

**Подход:** Вместо скомпилированных моделей (TVM/TRT/OV), в TS можно использовать
**ONNX Runtime Node.js** (`onnxruntime-node`) для запуска исходных ONNX-моделей.

```
models.json → HuggingFace ONNX → onnxruntime-node → embeddings
```

**Преимущества:**
- Одна зависимость (`onnxruntime-node` ~30 MB)
- Работает на CPU из коробки, GPU через CUDA EP или DirectML EP
- Те же модели что в Zig (общий `models.json`)
- Качество идентично (та же модель, тот же tokenizer)

**Что нужно:**
1. `src/semantic/providers/onnxruntime-provider.ts` (~300 LOC)
2. Скачивание ONNX + tokenizer.json по URL из `models.json` → `hf_repo`
3. Tokenizer — использовать `tokenizers` npm (HuggingFace Rust через NAPI)
4. Batched inference с padding

**Скорость ожидаемая:**
- CPU (AVX2): 100-200 emb/s (vs 44-475 в Zig с OpenVINO, зависит от модели)
- GPU (CUDA EP): 500-2000 emb/s
- DirectML: 200-500 emb/s (Windows Intel/AMD GPU)

### D2. Использование скомпилированных моделей через sidecar — ОПЦИОНАЛЬНО

**Подход:** Запускать `ultracode-embed-worker` (Zig бинарник) как child process,
общаться через stdio/pipe.

```
TS (MCP server) → spawn ultracode-embed-worker → pipe → embeddings
```

**Преимущества:**
- Максимальная скорость (OpenVINO INT8, TensorRT, TVM Vulkan)
- 1300+ emb/s multi-device (CUDA + iGPU + CPU параллельно)
- Готовый бинарник, не нужно компилировать

**Что нужно:**
1. `src/semantic/providers/zig-worker-provider.ts` (~200 LOC)
2. Worker protocol: JSON-RPC через pipe (формат из `src/inference/worker_protocol.zig`)
3. Download `ultracode-embed-worker` из CDN (`dist-manifest.json`)
4. Fallback на ONNX Runtime если worker недоступен

**Когда это оправдано:**
- Проекты >10K файлов (где embedding generation — bottleneck)
- Пользователи с NVIDIA GPU / Intel NPU
- Холодная индексация больших monorepo

### D3. Общий models.json — РЕКОМЕНДУЕМО

**Подход:** Использовать `models.json` из Zig-проекта как единый каталог моделей.

Для TS достаточно полей:
- `id`, `name`, `hf_repo`, `onnx_file`, `tokenizer_file` — для ONNX Runtime
- `dimension`, `max_tokens` — для конфигурации
- `cdn.tokenizer` — прямая ссылка на tokenizer.json

**Реализация:**
- Скопировать `models.json` в TS-проект
- Парсить при setup, предлагать выбор модели
- При выборе скачивать ONNX + tokenizer с HuggingFace (или CDN)

---

## E. Мелкие улучшения

### E1. Расширенные стоп-слова для code search

Добавить programming-specific: `var`, `const`, `let`, `function`, `class`,
`return`, `import`, `export`, `public`, `private`, `static`, `void`, `this`,
`self`, `new`, `true`, `false`, `null`, `undefined`, `None`, `def`, `func`.

### E2. Graph metrics: Betweenness Centrality (Brandes)

**Источник:** `src/analysis/graph_metrics.zig` — в Zig реализован, в TS — стаб.
Алгоритм Брандеса: O(VE) для невзвешенных графов.
~100-150 LOC TypeScript.

### E3. Hotspot git churn integration

Zig добавил `change_frequency` из `git log` в формулу горячих точек:
`score = complexity * 0.4 + fanIn * 0.3 + fanOut * 0.2 + churn * 0.1`

В TS hotspot анализ не учитывает частоту изменений. ~100 LOC.

### E4. Taint catalogs sync

Zig имеет 162+ паттернов в taint catalogs (7 категорий).
TS имеет 200+ паттернов (6 категорий). Нужен diff-анализ
и синхронизация отсутствующих паттернов в обоих направлениях.

### E5. SQLite PRAGMA sync — ВЫПОЛНЕНО

**Проблема:** TS не имел `locking_mode=EXCLUSIVE` и `page_size=8192`.
Без EXCLUSIVE mode — лишние lock syscalls на каждой операции, а `journal_mode=OFF`
без EXCLUSIVE **опасен** (corruption при concurrent access).

**Исправлено:** `multi-db-manager.ts` обновлён:
- `PRAGMA locking_mode = EXCLUSIVE` — для graph/semantic/cache (как в Zig)
- `PRAGMA page_size = 8192` — для всех БД (как в Zig)
- `PRAGMA auto_vacuum = NONE` — (как в Zig)
- versioning.db отдельно: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000`

**Ожидаемый эффект:** 1.5-2x ускорение batch insert операций.

---

## Порядок реализации (рекомендуемый)

### Phase 1: Основы качества (~800 LOC, 2-3 дня)

| # | Задача | LOC | Источник Zig | Целевой файл TS |
|---|--------|-----|-------------|-----------------|
| 1 | Porter Stemmer | 150 | `nlp/stemmer.zig` | `src/search/stemmer.ts` |
| 2 | BM25 Scoring | 50 | `nlp/tfidf.zig` | `src/search/bm25.ts` |
| 3 | Extended Stopwords | 20 | Zig NLP | `src/search/stopwords.ts` |
| 4 | Taint Flow Semantics | 200 | `analysis/taint_semantics.zig` | `src/analysis/taint/flow-semantics.ts` |
| 5 | Betweenness Centrality | 150 | `analysis/graph_metrics.zig` | `src/analysis/graph-metrics/brandes.ts` |
| 6 | Hotspot git churn | 100 | Zig hotspot | `src/analysis/hotspot/` |
| 7 | Integrate stemmer+BM25 в search | 100 | — | `src/search/hybrid-scoring.ts` |

**Эффект:** +15-20% качество поиска, +10% точность taint analysis, полные graph metrics.

### Phase 2: Intra-procedural analysis (~900 LOC, 3-4 дня)

| # | Задача | LOC | ��сточник Zig | Целевой файл TS |
|---|--------|-----|-------------|-----------------|
| 1 | CFG Builder | 300 | `graph/cfg.zig` | `src/tracing/cfg-builder.ts` |
| 2 | Reaching Definitions | 250 | `analysis/reaching_def.zig` | `src/tracing/reaching-definitions.ts` |
| 3 | Enhanced Condition Analyzer | 350 | `analysis/condition_analyzer.zig` | `src/tracing/condition-analyzer.ts` (расширение) |

**Эффект:** Intra-procedural analysis, path feasibility, -40-60% false positives в tracing.

### Phase 3: Граф-оптимизации (~450 LOC, 2 дня)

| # | Задача | LOC | Источник Zig | Целевой файл TS |
|---|--------|-----|-------------|-----------------|
| 1 | Basin Index | 150 | `graph/basin_index.zig` | `src/graph/basin-index.ts` |
| 2 | Bloom Reach для графа | 200 | `graph/bloom_reach.zig` | `src/graph/bloom-reach.ts` |
| 3 | Интеграция в impact/trace | 100 | — | `src/tracing/`, `src/analysis/` |

**Эффект:** 5-50x ускорение impact analysis и tracing на графах >10K узлов.

### Phase 4: Native Inference (~500 LOC, 2-3 дня)

| # | Задача | LOC | Источник | Целевой файл TS |
|---|--------|-----|---------|-----------------|
| 1 | ONNX Runtime Provider | 300 | models.json | `src/semantic/providers/onnxruntime-provider.ts` |
| 2 | Shared models.json | 50 | CDN | `src/config/models.json` |
| 3 | Zig worker sidecar (опц.) | 200 | worker_protocol.zig | `src/semantic/providers/zig-worker-provider.ts` |

**Эффект:** Offline embedding generation без внешних сервисов.

### Phase 5: Polish (~170 LOC, 1 день)

| # | Задача | LOC |
|---|--------|-----|
| 1 | File Merkle Index | 120 |
| 2 | Taint catalog sync | 50 |

---

## Суммарная оценка

| Фаза | LOC | Время | Эффект |
|------|-----|-------|--------|
| Phase 1: Основы качества | ~800 | 2-3 дня | Поиск +20%, metrics +100% |
| Phase 2: Intra-procedural | ~900 | 3-4 дня | Tracing precision +50% |
| Phase 3: Граф-оптимизации | ~450 | 2 дня | Impact speed 5-50x |
| Phase 4: Inference | ~500 | 2-3 дня | Offline embeddings |
| Phase 5: Polish | ~300 | 1-2 дня | Полнота |
| **ИТОГО** | **~2,950** | **10-14 дней** | **Паритет + нативные эмбеддинги** |

---

## Что НЕ стоит портировать

| Решение Zig | Почему не в TS |
|-------------|----------------|
| PackedNodeState (u64 bitfield) | В JS нет выигрыша от bitpacking из-за object model и GC |
| mmap I/O | Node.js не поддерживает mmap; `fs.readFile` достаточно быстр |
| IOCP Named Pipes | TS использует MCP SDK через stdio — другая архитектура |
| SoA entity storage | JS массивы объектов нормально работают до 100K+ |
| Zobrist fingerprints | Оптимизация для Zig packed state, в JS overhead перевесит выгоду |
| Custom CBOR encoder | npm `cbor-x` работает хорошо, нет смысла переписывать |
| 4-tier allocator | JS имеет GC — управление памятью не применимо |
| Thread pool parsing | Node.js worker_threads + существующий parser-agent |

---

## CDN-модели: подробная спецификация

### Доступные модели

| ID | Размер ONNX | Dim | Max Tokens | Язык | Статус |
|----|-------------|-----|------------|------|--------|
| snowflake-arctic-embed-xs | 90 MB | 384 | 512 | en | Active |
| multilingual-e5-small | 118 MB | 384 | 512 | multi (94) | **Active (default)** |
| all-MiniLM-L6-v2 | 91 MB | 384 | 512 | en | Active |
| multilingual-e5-base | 470 MB | 768 | 512 | multi (94) | Active |
| nomic-embed-text-v1.5 | 548 MB | 768 | 8192 | en | Active |
| mxbai-embed-xsmall-v1 | 23 MB | 384 | 4096 | en | Active |
| gte-modernbert-base | 149 MB | 768 | 8192 | en | Active |
| modernbert-embed-base | 149 MB | 768 | 8192 | en | Active |
| bge-m3 | 1370 MB | 1024 | 8192 | multi | Disabled (split ONNX) |
| Qwen3-Embedding-0.6B | 620 MB | 1024 | 8192 | multi | Disabled (no ONNX) |

### Формат CDN-архивов

```
{model-id}-common.7z          → tokenizer.json, vocab.txt
{model-id}-{os}-{backend}.7z  → compiled model for specific backend
```

### Рекомендуемая модель для TS

**`multilingual-e5-small`** — баланс качество/размер, 94 языка включая русский,
384 dims, 512 tokens. ONNX доступен на HuggingFace (`intfloat/multilingual-e5-small`).

Для больших проектов (Java/C#): **`gte-modernbert-base`** (8K tokens, 768 dims).

---

## Архитектурная диаграмма интеграции

```
                    ┌──────────────────────────────┐
                    │  ultracode TS (MCP server)    ��
                    └──────┬───────────────────────┘
                           │
              ┌────────────┼─────────────┐
              │            │             │
    ┌─────────▼──────┐ ┌──▼──────────┐ ┌▼──────────────────┐
    │ ONNX Runtime   │ │ TEI / OVMS  │ │ Zig embed-worker  │
    │ (onnxruntime-  │ │ (HTTP API)  │ │ (sidecar, pipe)   │
    │  node, local)  │ │             │ │                    │
    │ CPU/CUDA/DML   │ │ GPU server  │ │ OV+TRT+TVM multi  │
    └────────────────┘ └─────────────┘ └────────────────────┘
              │                                │
              └──────── models.json ───────────┘
                    (общий каталог моделей)
```

---

## F. Trigram Index — порт в TS

### F0. Архитектура в Zig

Zig-версия содержит полноценный **trigram-based code search** — 5 файлов, ~600 LOC:

```
src/search/
├── trigram_types.zig      — бинарный формат, типы, Header/FileEntry/TrigramTableEntry
├── trigram_extract.zig    — извлечение триграм из содержимого файла (O(n))
├── trigram_builder.zig    — построение inverted index, сериализация в .idx
├── trigram_index.zig      — mmap reader, binary search по триграм-таблице
├── trigram_query.zig      — декомпозиция паттерна → пересечение posting lists → верификация
└── varint.zig             — LEB128 delta-кодирование posting lists
```

### F1. Бинарный формат `trigrams.idx`

```
[Header 32B] [FileTable] [StringTable] [TrigramTable] [PostingsSection]

Header (32 bytes):
  magic:              "TGI\x01" (4B)
  version:            u32 = 1
  file_count:         u32
  trigram_count:      u32
  file_table_offset:  u32
  string_table_offset: u32
  trigram_table_offset: u32
  postings_offset:    u32

FileEntry (16 bytes each):
  path_offset:  u32    → offset в StringTable
  path_len:     u16
  _pad:         u16
  content_hash: u64    → FNV-1a хеш содержимого (для staleness check)

TrigramTableEntry (24 bytes each, sorted by trigram для binary search):
  next_mask:      u64  → bloom filter: bit[c%64]=1 если символ c следует за триграмой
  trigram:        u32  → (b0<<16)|(b1<<8)|b2, lower 24 bits
  posting_offset: u32  → offset в PostingsSection
  posting_count:  u32  → кол-во file_ids в posting list
  loc_mask:       u8   → bloom: bit[pos%8]=1 для позиций вхождений
  _pad:           3B

PostingsSection:
  Delta + LEB128 encoded file_ids (sorted, delta-compressed)
```

### F2. Алгоритм поиска

```
1. Decompose pattern → extract trigrams (sliding window of 3)
   - Для regex: извлекает литеральные сегменты между метасимволами
2. Binary search каждого триграма в TrigramTable
3. Intersect posting lists (smallest-first) → candidate file_ids
4. Apply glob filter (если указан file_pattern)
5. Verify matches: mmap каждого файла-кандидата, regex/literal match
6. Collect: line content + context_before/context_after
```

### F3. Bloom-оптимизации

- **next_mask** (u64): "какой символ может следовать за этой триграмой?"
  → Быстрый отсев 4-грамм без обращения к posting lists
- **loc_mask** (u8): "в каких позициях (mod 8) встречается триграма?"
  → Дополнительная фильтрация для коротких файлов

### F4. Delta + LEB128 кодирование posting lists

File IDs отсортированы → вместо абсолютных значений хранятся дельты:
`[3, 7, 15, 100]` → `[3, 4, 8, 85]` → LEB128 encode каждую дельту.

LEB128: 7 бит данных на байт, MSB = continuation flag.
Типичный file_id дельта: 1-2 байта (вместо 4 байт на u32).
**Экономия:** 50-75% размера posting lists.

### F5. Реализация в TS — РЕКОМЕНДУЕМО

**Подход:** Порт алгоритмов, но с адаптацией к JS:
- Вместо mmap — `fs.readFileSync` + `Buffer`
- Вместо бинарного файла — тот же формат через `DataView`
- Вместо arena allocator — обычный GC

**Файлы:**
```
src/search/
├── trigram-types.ts       — типы, константы формата (~50 LOC)
├── trigram-extract.ts     — extractTrigrams(content: Buffer) (~60 LOC)
├── trigram-builder.ts     — TrigramBuilder, build() → Buffer/File (~150 LOC)
├── trigram-index.ts       — TrigramIndex.open(), lookupTrigram(), readPostings() (~120 LOC)
├── trigram-query.ts       — executeSearch(), decomposePattern() (~150 LOC)
└── varint.ts              — LEB128 encode/decode/delta (~60 LOC)
```

**Суммарно: ~590 LOC TypeScript**

**Совместимость формата:** Если TS пишет тот же бинарный формат (Header, FileEntry,
TrigramTableEntry, LEB128 postings) — файл `trigrams.idx` будет **читаем обеими версиями**.
Все типы extern struct с фи��сированными размерами (32B, 16B, 24B) и little-endian.

**Интеграция:**
- `grep_index` tool использует trigram для ускорения текстового поиска
- Строится при индексации (параллельно с entity extraction)
- Обновляется инкрементально: `content_hash` в FileEntry определяет staleness

---

## G. Совместимость форматов баз и каталогов

### G0. Текущие различи��

| Аспект | TS (`UltraCode`) | Zig (`ultracode.zig`) | Совместимость |
|--------|------|-----|--------------|
| **Глобальный каталог** | `%LOCALAPPDATA%\UltraCode\` | `%LOCALAPPDATA%\ultracode.zig\` | **Разные** |
| **Имя приложения** | `UltraCode` (CamelCase) | `ultracode.zig` (lowercase+suffix) | **Разные** |
| **Расположение БД** | Глобальное: `UltraCode/graph.db` | Per-project: `projects/{hash}/graph.db` | **Разное** |
| **Project hash** | xxHash32 (8 hex chars) | SHA256 (16 hex chars) | **Разный** |
| **Конфиг** | YAML + JSON | JSON only | Частично совместим |
| **Vector index** | FAISS (.bin + .idmap.json) | Custom SoA (.vec + .ivf) | **Несовместим** |
| **Trigram index** | Отсутствует | trigrams.idx (binary) | N/A → портируем |
| **CBOR metadata** | cbor-x (full keys) | Custom (compact keys "p","r","dc") | **Несовместим** |

### G1. Рекомендуемая стратегия: Общий каталог `ultracode/`

**Цель:** Пользователь ставит Zig-версию → переключается на TS (или наоборо��)
→ данные не теряются, переиндексация не нужна.

#### G1.1 Единое имя каталога

```
Текущее:
  TS:  %LOCALAPPDATA%\UltraCode\
  Zig: %LOCALAPPDATA%\ultracode.zig\

Предлагаемое:
  Оба: %LOCALAPPDATA%\ultracode\        ← lowercase, без суффикса
```

**Действия:**
- TS: изменить `APP_NAME` в `storage-paths.ts`: `"UltraCode"` → `"ultracode"`
- Zig: изменить `APP_NAME` в `storage_paths.zig`: `"ultracode.zig"` → `"ultracode"`
- При первом запуске: проверить legacy paths, предложить миграцию (или игнор)

#### G1.2 Единый project hash алгоритм

Предлагаемо: **xxHash32** (как в TS) — быстрее, 8 hex chars, достаточно уникален.

```
normalized = path.toLower().replace('\\', '/').trimEnd('/')
hash = xxHash32(normalized) → 8 hex chars
```

Или: если проект — git repo, используется `xxHash32(git-common-dir)` (как TS).

**Действия:**
- Zig: заменить SHA256 на xxHash32 (уже есть xxHash через `std.hash.XxHash32`)
- TS: оставить как есть

#### G1.3 Расположение баз — per-project (как Zig)

TS сейчас хранит 4 БД **глобально** с composite keys `(project_hash, branch_name)`.
Zig хранит **per-project** — 4 БД в `projects/{hash}/`.

**Рекомендация: per-project** (как Zig):

| Преимущество per-project | Почему |
|--------------------------|--------|
| Проще удалить один проект | `rm -rf projects/{hash}` вместо DELETE WHERE |
| Нет блокировок между проектами | EXCLUSIVE mode безопасен |
| Меньше размер каждой БД | Меньше B-tree depth, быстрее seek |
| Нет composite key overhead | PRIMARY KEY (id) вместо (id, project_hash, branch_name) |
| Совместимость с Zig | Тот же layout |

**Действия для TS (при пересоздании БД):**
- `getMultiDbPaths()` → возвращает пути внутри `projects/{hash}/`
- Composite keys `(id, project_hash, branch_name)` → `(id, branch_name)` (project_hash убирается из ключа, он уже в пут��)
- При открытии проекта: открывать 4 БД из `projects/{hash}/`

### G2. Ед��ная схема SQLite

Поскольку БД пересоздаются — можно выбрать **общую схему**. Ниже — рекомендуемая
единая схема, принимающая лучшее и�� обоих версий:

#### graph.db — Единая схема

```sql
-- Лучшее из обоих: explicit boolean columns (Zig) + embedding columns (TS)
CREATE TABLE IF NOT EXISTS entities (
    id TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    metadata BLOB,                    -- CBOR (единый формат)
    hash TEXT NOT NULL DEFAULT '',
    complexity INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    is_async INTEGER NOT NULL DEFAULT 0,     -- из Zig
    is_exported INTEGER NOT NULL DEFAULT 0,  -- из Zig
    is_test INTEGER NOT NULL DEFAULT 0,      -- из Zig
    has_docs INTEGER NOT NULL DEFAULT 0,     -- из Zig
    file_gen INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, branch_name)
);

CREATE TABLE IF NOT EXISTS relationships (
    id TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',  -- из Zig
    weight REAL NOT NULL DEFAULT 1.0,
    metadata BLOB,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,  -- из Zig
    PRIMARY KEY (id, branch_name)
);

CREATE TABLE IF NOT EXISTS files (
    path TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    hash TEXT NOT NULL DEFAULT '',
    last_indexed INTEGER NOT NULL DEFAULT 0,
    entity_count INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,       -- из Zig
    language TEXT NOT NULL DEFAULT '',      -- из Zig
    PRIMARY KEY (path, branch_name)
);

CREATE TABLE IF NOT EXISTS project_metadata (
    branch_name TEXT NOT NULL DEFAULT 'main',
    entity_count INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    relationship_count INTEGER NOT NULL DEFAULT 0,  -- из Zig
    last_indexed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_name)
);

CREATE TABLE IF NOT EXISTS tombstones (
    entity_id TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    entity_type TEXT NOT NULL DEFAULT 'entity',
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_id, branch_name, entity_type)
);

CREATE TABLE IF NOT EXISTS file_generations (
    file_path TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    active_gen INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (file_path, branch_name)
);

CREATE TABLE IF NOT EXISTS name_tokens (
    token TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    source TEXT NOT NULL DEFAULT 'name',    -- из Zig
    PRIMARY KEY (token, entity_id, branch_name)
);

-- FTS5 (опционально, graceful fallback)
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
    entity_id UNINDEXED, name, file_path
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path, branch_name);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name, branch_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, branch_name);
CREATE INDEX IF NOT EXISTS idx_entities_gen ON entities(file_gen, file_path, branch_name);
CREATE INDEX IF NOT EXISTS idx_rels_from ON relationships(from_id, branch_name);
CREATE INDEX IF NOT EXISTS idx_rels_to ON relationships(to_id, branch_name);
CREATE INDEX IF NOT EXISTS idx_rels_file ON relationships(file_path, branch_name);
CREATE INDEX IF NOT EXISTS idx_tokens_lookup ON name_tokens(token, branch_name, source);
CREATE INDEX IF NOT EXISTS idx_tokens_entity ON name_tokens(entity_id, branch_name);
CREATE INDEX IF NOT EXISTS idx_tombstones_lookup ON tombstones(branch_name, entity_type);
```

**Ключевые решения:**
- `project_hash` убран из composite keys (он уже в пути к БД)
- `is_async/is_exported/is_test/has_docs` — explicit columns (из Zig, быстрее фильтрация)
- `file_path` в relationships (из Zig, нужен для file-level impact)
- `source` в name_tokens (из Zig, различает name/path/type токены)
- `FTS5` (из Zig, ускоряет текстовый поиск)

#### semantic.db — Единая схема

```sql
CREATE TABLE IF NOT EXISTS cooccurrence (
    term1 TEXT NOT NULL,
    term2 TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (term1, term2, branch_name)
);

-- Per-entity term frequency (из Zig — точнее чем агрегированный)
CREATE TABLE IF NOT EXISTS term_frequency (
    term TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT 'main',
    frequency REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (term, entity_id, branch_name)
);

-- Metadata key-value store
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooc_term1 ON cooccurrence(term1, branch_name);
CREATE INDEX IF NOT EXISTS idx_tf_term ON term_frequency(term, branch_name);
```

**Выбор:** Per-entity TF (из Zig) вместо агрегированного (TS) — позволяет BM25
с нормализацией по длине документа.

#### cache.db — Единая схема

```sql
CREATE TABLE IF NOT EXISTS embedding_cache (
    key TEXT PRIMARY KEY,              -- content hash
    model TEXT NOT NULL DEFAULT '',
    embedding BLOB NOT NULL,           -- Float32Array binary
    created_at INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS query_cache (
    query_hash TEXT PRIMARY KEY,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS git_churn_cache (   -- из Zig, для hotspot analysis
    file_path TEXT NOT NULL,
    commit_hash TEXT NOT NULL DEFAULT '',
    churn_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (file_path)
);
```

### G3. PRAGMA — единый набор

```sql
-- Для graph.db, semantic.db, cache.db (hot path):
PRAGMA page_size = 8192;
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA locking_mode = EXCLUSIVE;
PRAGMA cache_size = -262144;       -- 256MB
PRAGMA mmap_size = 268435456;      -- 256MB
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 5000;

-- Для versioning.db (concurrent readers):
PRAGMA page_size = 8192;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -65536;        -- 64MB
PRAGMA mmap_size = 268435456;
PRAGMA busy_timeout = 30000;
```

### G4. CBOR metadata — единый формат

Рекомендуется **compact keys** из Zig (экономия ~40% на metadata BLOB):

```json
{
  "p": [{"n": "param1", "t": "string", "d": "null", "v": false}],
  "r": "Promise<User>",
  "dc": [{"n": "deprecated", "a": "use X instead"}],
  "vs": 1,
  "doc": "/** Summary */",
  "gn": ["generic_T"]
}
```

| Key | Full Name | Type |
|-----|-----------|------|
| `p` | params | `{n: name, t: type, d: default, v: variadic}[]` |
| `r` | return_type | `string` |
| `dc` | decorators | `{n: name, a: args}[]` |
| `vs` | visibility | `0=public, 1=private, 2=protected, 3=internal, 4=package` |
| `doc` | doc_comment | `string` |
| `gn` | generic_names | `string[]` |
| `fl` | fields | `{n: name, t: type}[]` |

**Действия для TS:**
- В `cbor-utils.ts`: при encode — использовать compact keys
- При decode: поддерживать и compact, и full keys (обратная совместимость)

### G5. Vector index — НЕ совместим (и не нужно)

TS использует FAISS (C library через NAPI), Zig — custom brute-force SoA.

**Рекомендация:** Не пытаться унифицировать. Пересоздаётся при реиндексации.
Каждая версия генерирует свой формат. Совместимость обеспечивается на уровне
модели (те же dimension/model_id через общий models.json).

### G6. Config — базовая часть общая

**Файл:** `config/semantic-config.json`

Общая базовая структура:

```json
{
  "version": 2,
  "embedding": {
    "enabled": false,
    "model": "multilingual-e5-small",
    "dimension": 384
  },
  "llm": {
    "platform": "claude_cli",
    "model": "claude-haiku-4-5-20251001"
  },
  "doc_language": "en",

  "_ts": {
    "providers": { ... },
    "agents": { ... }
  },

  "_zig": {
    "inference": { ... },
    "devices": { ... }
  }
}
```

**Принцип:** Базовые настройки (`embedding`, `llm`, `doc_language`) — общие.
Специфичные — в namespace `_ts` / `_zig`. При чтении: каждая версия читает
базовые + свои, игнорирует чужие.

### G7. Итоговый layout каталога (общий)

```
%LOCALAPPDATA%/ultracode/               ← единый каталог
├── config/
│   └── semantic-config.json            ← общий ��онфиг (§G6)
├── logs/
├── models/                             ← скачанные модели (общие)
│   ├── multilingual-e5-small/
│   │   ├── model.onnx                  ← для TS (ONNX Runtime)
│   │   └── tokenizer.json              ← общий
│   └── ...
├── projects/
│   └── {xxhash32}/                     ← единый hash алгоритм (§G1.2)
│       ├── graph.db                    ← единая схема (§G2)
│       ├── semantic.db
│       ├── versioning.db
│       ├── cache.db
│       ├── trigrams.idx                ← общий формат (§F1)
│       ├── faiss-main.bin              ← TS only (FAISS)
│       ├── faiss-main.idmap.json       ← TS only
│       ├── brute_force.vec             ← Zig only (SoA)
│       └── brute_force.vec.ivf         ← Zig only (IVF)
��── models.json                         ← каталог моделей (общий)
```

### G8. Что менять для совместимости

| Компонент | TS (что менять) | Zig (что менять) | Сложность |
|-----------|-----------------|-------------------|-----------|
| App name | `"UltraCode"` → `"ultracode"` | `"ultracode.zig"` → `"ultracode"` | Trivial |
| DB location | Global → per-project | Без изменений | **Средняя** |
| Project hash | Без изменений (xxHash32) | SHA256 → xxHash32 | Низкая |
| Schema | Добавить explicit bool columns, file_path в rels, source в tokens, FTS5 | Без изменений | **Средняя** |
| CBOR keys | Full → compact (`p`, `r`, `dc`, `vs`, `doc`) | Без изменений | Низкая |
| PRAGMAs | Добавить `locking_mode=EXCLUSIVE`, `page_size=8192` | Без изменений | Trivial |
| Config | Вынести TS-specific в `_ts` namespace | Вынести Zig-specific в `_zig` | Низкая |
| Trigram index | **Портировать** (§F5) | Без изменений | **Средняя** |
| Vector index | Без изменений (оба хранят свой формат) | Без изменений | — |

**Общая оценка:** ~1200 LOC изменений в TS + 100 LOC в Zig.

---

## Обновлённая суммарная оценка (с учётом §F и §G)

| Фаза | LOC | Время | Эффект |
|------|-----|-------|--------|
| Phase 1: Основы качества | ~800 | 2-3 дня | Поиск +20%, metrics +100% |
| Phase 2: Intra-procedural | ~900 | 3-4 дня | Tracing precision +50% |
| Phase 3: Граф-оптимизации | ~450 | 2 дня | Impact speed 5-50x |
| Phase 4: Inference | ~500 | 2-3 дня | Offline embeddings |
| Phase 5: Trigram Index | ~590 | 2-3 дня | grep_index 10-100x быстрее |
| Phase 6: Storage compat | ~1200 | 3-4 дня | Единый каталог, общие БД |
| **ИТОГО** | **~4,440** | **14-20 дней** | **Полная совместимость + все алгоритмы** |

---

## Ссылки

- Zig аудит: `D:\github\ultracode.zig\doc\AUDIT_ZIG_VS_TS.md`
- Zig TODO: `D:\github\ultracode.zig\doc\GLOBAL_TODO.md`
- Граф-оптимизации: `D:\github\ultracode.zig\doc\GRAPH_OPTIMIZATION_PLAN.md`
- Embedding модели: `D:\github\ultracode.zig\doc\EMB_MODELS-2025.md`
- CDN манифест: `D:\github\ultracode.zig\cdn\models-manifest.json`
- Dist манифест: `D:\github\ultracode.zig\cdn\dist-manifest.json`
