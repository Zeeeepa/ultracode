# Детекция паттернов

## detect_patterns

Обнаружение анти-паттернов, лучших практик, code smells и возможностей оптимизации с помощью двухэтапного конвейера: **структурный анализ** (быстрые проверки метаданных/AST) → **семантическая валидация** (сходство эмбеддингов с кураторскими примерами).

Поддерживает **235 правил** для **7 языков**: TypeScript, Python, C#, Java/Kotlin, Go, Zig и языконезависимые общие правила.

### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| projectPath | string? | текущий проект | Путь к директории проекта |
| filePath | string? | - | Сканировать конкретный файл |
| language | string? | автодетект | Фильтр: typescript, python, csharp, java, go, zig |
| category | string? | "all" | anti-pattern, best-pattern, code-smell, optimization, all |
| tags | string[]? | - | Фильтр по тегам: async, performance, memory, security, jit и др. |
| minConfidence | number? | 0.5 | Минимальный combined score (0-1) |
| severity | string? | "all" | critical, high, medium, low, info, all |
| format | string? | "summary" | Формат вывода: summary, detailed, json |
| suppressPatterns | string[]? | - | ID паттернов для пропуска (известные ложные срабатывания) |
| offset | number? | 0 | Смещение для пагинации |
| limit | number? | 50 | Макс. результатов на категорию |
| entityLimit | number? | 50000 | Макс. entity для сканирования из БД |

### Возвращает

Формат summary включает:
- Health score (0-100)
- Количество по категориям
- Топ проблем по severity
- Детали совпадений: имя паттерна, entity, файл:строка, скоры уверенности

Формат detailed дополнительно включает: описание, рекомендацию, Big-O, бенчмарк, список сработавших критериев.

### Примеры

```json
// Найти все анти-паттерны
detect_patterns({category: "anti-pattern"})

// Только оптимизации производительности
detect_patterns({category: "optimization", tags: ["performance"]})

// Проверить конкретный файл с высокой уверенностью
detect_patterns({filePath: "src/services/auth.ts", severity: "high"})

// Детальный вывод для Python pandas проблем
detect_patterns({language: "python", tags: ["pandas"], format: "detailed"})

// Пропустить известные ложные срабатывания
detect_patterns({suppressPatterns: ["cs:empty-interface", "py:no-docstring"]})

// Правила JIT-деоптимизации для JS/TS
detect_patterns({category: "optimization", tags: ["jit"]})
```

## check_entity_patterns

Проверка конкретной entity на совпадение с паттернами с детальным скорингом.

### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| entityId | string | обязательный | ID entity для проверки |
| projectPath | string? | текущий проект | Путь к проекту |
| category | string? | "all" | Фильтр категории |

### Возвращает

Массив найденных паттернов с:
- Деталями паттерна (имя, описание, рекомендация, bigO, бенчмарк)
- Скорами уверенности (structural, semantic, combined)
- Ближайшим совпадением с примером
- Списком сработавших критериев

## Скоринг

- **structuralConfidence** (0-1): качество совпадения по метаданным (поля AST, вызовы, метрики)
- **semanticSimilarity** (0-1): сходство эмбеддингов с кураторскими примерами
- **combinedScore**: structural × 0.4 + semantic × 0.6 (для гибридных правил); 1.0 для чисто структурных
- **healthScore** (0-100): общее здоровье проекта на основе баланса паттернов

---

## Категории

### Anti-Patterns
Плохие практики, которые следует исправить. 103 правила для всех языков.

### Best-Patterns
Хорошие практики, обнаруженные в коде. 18 правил. Severity всегда "info".

### Code Smells
Структурные проблемы, обнаруживаемые по метрикам и AST-анализу. 66 правил.

### Optimization
Возможности оптимизации производительности с Big-O анализом и бенчмарками. 54 правила.

---

## Правила по языкам

### TypeScript / JavaScript — 52 правила

#### Анти-паттерны (20)
- `ts:async-void` — Async Void функция (high)
- `ts:empty-catch` — Пустой блок catch (high)
- `ts:promise-no-catch` — Promise без обработки ошибок (high)
- `ts:async-constructor` — Async конструктор (high)
- `ts:event-listener-leak` — Утечка обработчиков событий (high)
- `ts:unsafe-type-assertion` — Небезопасное приведение типов (high)
- `ts:unsafe-innerhtml` — Небезопасное присвоение innerHTML (critical)
- `ts:redos-vulnerability` — ReDoS уязвимость (critical)
- `ts:circular-dependency` — Циклическая зависимость (high)
- `ts:nested-callbacks` — Вложенные колбэки / Callback Hell (medium)
- `ts:any-type-param` — Параметр типа Any (medium)
- `ts:mutable-export` — Мутабельный экспорт (medium)
- `ts:non-null-assertion-abuse` — Злоупотребление Non-null Assertion (medium)
- `ts:nullish-vs-or-confusion` — Путаница Nullish vs OR (medium)
- `ts:throw-non-error` — Throw не-Error объекта (medium)
- `ts:unsafe-index-access` — Небезопасный доступ по индексу (medium)
- `ts:missing-null-check` — Отсутствие проверки на null (medium)
- `ts:declaration-merging-trap` — Ловушка Declaration Merging (medium)
- `ts:no-error-typing` — Нетипизированная ошибка в catch (low)

#### Лучшие практики (2)
- `ts:proper-error-handling` — Правильная обработка ошибок в async (info)
- `ts:proper-async-await` — Правильное использование async/await (info)

#### Code-smells (13)
- `ts:boolean-trap` — Boolean Trap (medium)
- `ts:inconsistent-return-type` — Несогласованный тип возврата (medium)
- `ts:parameter-mutation` — Мутация параметров (medium)
- `ts:barrel-file` — Barrel File (medium)
- `ts:enum-pitfalls` — Подводные камни Enum (medium)
- `ts:missing-generic-constraint` — Отсутствие ограничения Generic (low)
- `ts:namespace-antipattern` — Namespace декларация (low)
- `ts:conditional-type-abuse` — Злоупотребление Conditional Type (info)
- `ts:any-in-tests` — Any в тестах (low)
- `ts:snapshot-abuse` — Злоупотребление snapshot тестами (low)
- `ts:implementation-testing` — Тестирование реализации (low)
- `ts:stringly-typed-api` — Строковое API (low)
- `ts:missing-readonly` — Отсутствие readonly на свойстве класса (low)
- `ts:missing-input-validation` — Отсутствие валидации входных данных (low)
- `ts:side-effect-import` — Импорт с побочными эффектами (low)

#### Оптимизации (17)
- `ts:jit-eval` — eval() предотвращает JIT-оптимизацию (critical) `[jit]`
- `ts:jit-with-statement` — with деоптимизирует цепочку скоупов (critical) `[jit]`
- `ts:jit-delete-operator` — delete убивает Inline Caching (high) `[jit]`
- `ts:jit-holey-array` — «Дырявый» массив через new Array(n) (medium) `[jit]`
- `ts:jit-arguments-object` — arguments предотвращает оптимизацию (medium) `[jit]`
- `ts:jit-spread-in-hot-path` — Spread оператор в горячем пути (medium) `[jit]`
- `ts:jit-dynamic-property-access` — Динамический доступ к свойствам в цикле (low) `[jit]`
- `ts:jit-megamorphic-interface` — Мегаморфный интерфейс / 5+ реализаций (low) `[jit]`
- `ts:jit-optional-chaining-hot` — Избыточный Optional Chaining (low) `[jit]`
- `ts:rxjs-subscribe-in-loop` — Subscribe в цикле без отписки (high)
- `ts:layout-thrashing` — Layout Thrashing (medium)
- `ts:angular-default-change-detection` — Default Change Detection в Angular (medium)
- `ts:no-trackby-ngfor` — ngFor без trackBy (medium)
- `ts:function-in-template` — Вызов функции в шаблоне (medium)
- `ts:quadratic-array-ops` — Квадратичные операции с массивами (medium)
- `ts:json-deep-clone` — Глубокое клонирование через JSON (medium)
- `ts:accumulating-spread` — Накапливающий Spread в reduce (medium)
- `ts:await-in-loop` — Await в цикле (medium)

---

### Python — 75 правил

#### Анти-паттерны (30)
- `py:bare-except` — Голый except без типа исключения (high)
- `py:mutable-default-arg` — Мутабельный аргумент по умолчанию (high)
- `py:swallowed-exception` — Проглоченное исключение / except:pass (high)
- `py:open-without-with` — open() без контекстного менеджера (high)
- `py:async-no-await` — Async функция без await (high)
- `py:re-raise-different` — Перевыброс другого типа исключения (high)
- `py:pd-append-in-loop` — DataFrame.append() в цикле, O(n²) (high)
- `py:pd-concat-in-loop` — pd.concat() в цикле, O(n²) (high)
- `py:pd-chained-indexing` — Цепочечная индексация с присвоением (high)
- `py:pd-inplace-true` — Параметр inplace=True (medium)
- `py:pd-missing-copy` — Срез DataFrame без .copy() (medium)
- `py:pd-nan-comparison` — Сравнение NaN через == (critical)
- `py:np-append-in-loop` — np.append() в цикле (high)
- `py:np-float-cmp` — Сравнение float через == (high)
- `py:np-deprecated-alias` — Устаревший алиас типа NumPy (medium)
- `py:np-matrix` — Использование np.matrix (medium)
- `py:sk-data-leakage` — Утечка данных: fit_transform до split (critical)
- `py:sk-cv-leakage` — Утечка при кросс-валидации (critical)
- `py:sk-predict-no-fit` — predict() без fit() (high)
- `py:eval-exec` — Использование eval/exec (critical)
- `py:subprocess-shell` — subprocess с shell=True (critical)
- `py:sql-injection` — SQL строковая интерполяция (critical)
- `py:pickle-load` — pickle.load() ненадёжных данных (critical)
- `py:yaml-load-unsafe` — yaml.load() без SafeLoader (critical)
- `py:asyncio-run-in-loop` — asyncio.run() внутри async функции (critical)
- `py:plt-no-close` — Figure без plt.close() (medium)
- `py:plt-state-confusion` — Смешивание pyplot/OO API (medium)
- `py:star-import` — Звёздочный импорт (medium)
- `py:global-state` — Глобальное мутабельное состояние (medium)
- `py:generic-raise` — Выброс generic Exception (medium)
- `py:del-finalizer` — Финализатор __del__ (medium)
- `py:gil-thread` — ThreadPoolExecutor для CPU-bound задач (high)
- `py:test-float-eq` — Сравнение float через == в тестах (high)

#### Лучшие практики (3)
- `py:context-manager` — Использование контекстного менеджера (info)
- `py:type-annotations` — Полностью типизированная функция (info)
- `py:generator-pattern` — Паттерн генератора (info)

#### Code-smells (24)
- `py:god-class` — God Class / >20 методов (high)
- `py:high-complexity` — Высокая цикломатическая сложность / CC>10 (high)
- `py:deep-nesting` — Глубокая вложенность / >4 уровней (high)
- `py:too-many-returns` — Слишком много return / >5 (medium)
- `py:isinstance-chain` — Цепочка isinstance / >3 проверок (medium)
- `py:init-too-complex` — __init__ делает слишком много / >10 вызовов (medium)
- `py:wide-try` — Широкий блок try (medium)
- `py:any-abuse` — Злоупотребление типом Any (medium)
- `py:many-pos-args` — Слишком много позиционных аргументов (medium)
- `py:bool-trap` — Boolean Trap (medium)
- `py:asyncio-run` — Использование asyncio.run() (medium)
- `py:threadpool-no-max` — ThreadPoolExecutor без max_workers (medium)
- `py:no-seed` — random без seed (medium)
- `py:pd-merge-no-validate` — merge() без validate (medium)
- `py:sk-no-pipeline` — Множественные fit_transform без Pipeline (medium)
- `py:sk-no-random-state` — sklearn без random_state (medium)
- `py:sk-accuracy` — accuracy_score на несбалансированных данных (medium)
- `py:no-type-hints` — Отсутствие аннотаций типов (low)
- `py:no-docstring` — Отсутствие docstring (low)
- `py:type-ignore-no-code` — Голый type: ignore без [code] (low)
- `py:pd-dot-values` — Использование DataFrame.values (low)
- `py:pd-csv-no-dtype` — read_csv без dtype (low)
- `py:open-no-encoding` — open() без encoding (low)
- `py:missing-repr` — Класс без __repr__ (low)
- `py:property-no-setter` — Read-only @property без документации (info)

#### Оптимизации (18)
- `py:pd-iterrows` — DataFrame.iterrows(), O(n²) (high)
- `py:np-loop` — Python цикл по NumPy массиву (high)
- `py:string-concat-in-loop` — Конкатенация строк в цикле, O(n²) (medium)
- `py:string-concat-loop-hint` — Конкатенация строк в цикле (обнаружено парсером) (medium)
- `py:pd-apply` — DataFrame.apply() анти-паттерн (medium)
- `py:pd-groupby-apply` — groupby().apply() паттерн (medium)
- `py:plt-show-loop` — plt.show() в цикле (medium)
- `py:re-compile-loop` — Компиляция regex в цикле (medium)
- `py:sorted-loop` — sorted() в цикле (medium)
- `py:missing-slots` — Класс без __slots__ (medium)
- `py:list-comprehension-over-loop` — Цикл вместо comprehension (low)
- `py:pd-itertuples` — Использование DataFrame.itertuples() (low)
- `py:date-parse-loop` — Парсинг дат в цикле (low)

---

### C# — 63 правила

#### Анти-паттерны (38)
- `cs:mutable-static` — Мутабельное статическое поле (critical)
- `cs:ef-dbcontext-singleton` — DbContext зарегистрирован как Singleton (critical)
- `cs:async-sync-over-async` — Sync-over-Async / .Result / .Wait() (critical)
- `cs:mem-httpclient-new` — new HttpClient() — исчерпание сокетов (critical)
- `cs:conc-lock-on-this` — lock(this) или lock(typeof(...)) (critical)
- `cs:err-swallowed-exception` — Проглоченное исключение / пустой catch (critical)
- `cs:aspnet-wildcard-cors` — Wildcard CORS / AllowAnyOrigin (critical)
- `cs:grpc-channel-per-call` — Новый gRPC канал на каждый вызов (critical)
- `cs:async-lock-with-await` — lock() с await внутри (critical)
- `cs:ef-raw-sql-injection` — SQL-инъекция в FromSqlRaw (critical)
- `cs:ef-load-entire-table` — EF Core загрузка всей таблицы (critical)
- `cs:async-void` — Async Void метод (high)
- `cs:singleton-mutable-state` — Мутабельное состояние Singleton (high)
- `cs:ef-n-plus-one` — EF Core N+1 запрос (high)
- `cs:err-throw-ex` — throw ex — потеря стек-трейса (high)
- `cs:aspnet-pii-in-logs` — PII в логах (high)
- `cs:mem-missing-dispose` — IDisposable без using/Dispose (high)
- `cs:conc-dict-check-then-act` — Dictionary TOCTOU (high)
- `cs:aspnet-captive-dependency` — Captive Dependency / Singleton→Scoped (high)
- `cs:async-parallel-foreach-async` — Parallel.ForEach с async делегатом (high)
- `cs:ef-find-in-loop` — EF запрос в цикле (high)
- `cs:ef-client-side-eval` — EF Core Client-Side Evaluation (high)
- `cs:hardcoded-connection` — Захардкоженная строка подключения (high)
- `cs:mixed-async-sync` — Смешивание async и sync-over-async (high)
- `cs:missing-cancellation` — Отсутствие CancellationToken (medium)
- `cs:ef-cartesian-explosion` — EF Core Cartesian Explosion (medium)
- `cs:ef-entity-as-api-response` — EF Entity в API Response (medium)
- `cs:async-fire-and-forget` — Fire-and-Forget async вызов (medium)
- `cs:async-task-run-in-aspnet` — Task.Run в ASP.NET контроллере (medium)
- `cs:di-service-locator` — Service Locator анти-паттерн (medium)
- `cs:mem-static-collection-leak` — Утечка памяти: статическая коллекция (medium)
- `cs:minimal-api-no-validation` — Minimal API без валидации (medium)
- `cs:grpc-missing-deadline` — gRPC вызов без Deadline (medium)
- `cs:ef-savechanges-no-transaction` — Множественные SaveChanges без транзакции (medium)
- `cs:err-catch-generic` — catch(Exception) без специфичных перехватов (medium)
- `cs:err-exception-flow-control` — Exception как управление потоком (medium)
- `cs:mem-event-handler-leak` — Обработчик событий без отписки (medium)
- `cs:regex-no-timeout` — Regex без таймаута (medium)

#### Лучшие практики (3)
- `cs:proper-di` — Правильная инъекция зависимостей (info)
- `cs:cancellation-propagation` — Пробрасывание CancellationToken (info)

#### Code-smells (12)
- `cs:god-service` — God Service (medium)
- `cs:deep-nesting` — Чрезмерная вложенность (medium)
- `cs:boolean-blindness` — Boolean Blindness / 3+ bool параметра (medium)
- `cs:minimal-api-fat-lambda` — Толстая лямбда в Minimal API (medium)
- `cs:empty-interface` — Пустой интерфейс (low)
- `cs:di-too-many-deps` — Слишком много зависимостей конструктора (low)
- `cs:minimal-api-results-not-typed` — Minimal API: Results вместо TypedResults (low)
- `cs:large-try-block` — Слишком большой блок try (low)
- `cs:catch-rethrow-only` — Catch только для rethrow (low)
- `cs:no-configureawait` — Отсутствие ConfigureAwait в библиотечном коде (low)

#### Оптимизации (9)
- `cs:string-concat-in-loop` — Конкатенация строк в цикле (medium)
- `cs:linq-in-hotpath` — LINQ в горячем пути (medium)
- `cs:no-asnotracking` — EF запрос без AsNoTracking (medium)
- `cs:no-arraypool` — Временный буфер без ArrayPool (medium)
- `cs:linq-premature-materialization` — Преждевременная материализация LINQ (medium)
- `cs:string-interpolation-in-log` — Строковая интерполяция в логгере (low)

---

### Java / Kotlin — 12 правил

#### Анти-паттерны (3)
- `java:raw-types` — Использование Raw Types (medium)
- `java:empty-catch` — Пустой блок catch (high)
- `java:mutable-static-field` — Мутабельное статическое поле (high)

#### Лучшие практики (2)
- `java:builder-pattern` — Паттерн Builder (info)
- `java:proper-resource-handling` — Try-With-Resources (info)

#### Code-smells (1)
- `java:god-class` — God Class (high)

#### Оптимизации (6)
- `java:string-concat-in-loop` — Конкатенация строк в цикле (medium)
- `java:regex-in-loop` — Компиляция Regex в цикле (medium)
- `java:reflection-in-hotpath` — Reflection в горячем пути (high)
- `java:list-no-capacity` — ArrayList без начальной ёмкости (low)
- `kotlin:boxing-nullable-primitives` — Боксинг через Nullable примитивы (medium)
- `kotlin:sequence-for-large-collections` — Цепочка без Sequence (low)

---

### Go — 9 правил

#### Анти-паттерны (2)
- `go:ignored-error` — Проигнорированная ошибка (high)
- `go:goroutine-leak` — Утечка горутины (high)

#### Лучшие практики (3)
- `go:error-wrapping` — Оборачивание ошибок (info)
- `go:context-propagation` — Пробрасывание Context (info)
- `go:interface-segregation` — Маленький интерфейс (info)

#### Code-smells (2)
- `go:naked-return` — Naked Return в длинной функции (low)
- `go:too-many-returns` — Слишком много return (medium)

#### Оптимизации (2)
- `go:string-concat-in-loop` — Конкатенация строк в цикле (medium)
- `go:slice-no-capacity` — Slice без предаллокации (low)

---

### Zig — 16 правил

#### Анти-паттерны (7)
- `zig:missing-defer-free` — Отсутствие defer free (high)
- `zig:missing-errdefer` — Отсутствие errdefer (high)
- `zig:empty-catch` — Пустой Catch (high)
- `zig:unsafe-cast-abuse` — Злоупотребление unsafe cast (high)
- `zig:alloc-without-free` — Аллокация без free (high)
- `zig:hardcoded-allocator` — Захардкоженный аллокатор (medium)
- `zig:mutex-not-deferred` — Mutex без defer (medium)

#### Лучшие практики (3)
- `zig:has-deinit` — Наличие deinit (info)
- `zig:allocator-param` — Параметр-аллокатор (info)
- `zig:proper-error-handling` — Правильная обработка ошибок (info)

#### Code-smells (4)
- `zig:unreachable-abuse` — Злоупотребление unreachable (medium)
- `zig:swallowed-error` — Проглоченная ошибка (medium)
- `zig:unsafe-optional-unwrap` — Небезопасный unwrap Optional (medium)
- `zig:wrong-naming-convention` — Нарушение именования (low)

#### Оптимизации (2)
- `zig:allocation-in-loop` — Аллокация в цикле (medium)
- `zig:string-concat-in-loop` — Конкатенация строк в цикле (medium)

---

### Common (языконезависимые) — 9 правил

#### Лучшие практики (2)
- `common:small-focused-function` — Маленькая сфокусированная функция (info)
- `common:documented-public-api` — Документированное публичное API (info)

#### Code-smells (7)
- `common:god-function` — God Function (high)
- `common:large-class` — Большой класс (high)
- `common:deep-nesting` — Глубокая вложенность (medium)
- `common:too-many-params` — Слишком много параметров (medium)
- `common:feature-envy` — Feature Envy (medium)
- `common:shotgun-surgery` — Shotgun Surgery (medium)
- `common:no-documentation` — Недокументированное публичное API (low)

---

## Сводка

| Язык | Всего | Анти-паттерн | Лучшая практика | Code-smell | Оптимизация |
|------|-------|-------------|----------------|-----------|-------------|
| TypeScript/JS | 52 | 20 | 2 | 13 | 17 |
| Python | 75 | 30 | 3 | 24 | 18 |
| C# | 63 | 38 | 3 | 12 | 9 |
| Java/Kotlin | 12 | 3 | 2 | 1 | 6 |
| Go | 9 | 2 | 3 | 2 | 2 |
| Zig | 16 | 7 | 3 | 4 | 2 |
| Common | 9 | 0 | 2 | 7 | 0 |
| **Итого** | **235** | **103** | **18** | **63** | **54** |

### Конвейер детекции

1. **Структурная фильтрация** — быстрые проверки метаданных (тип entity, вызовы, controlFlow, hints, метрики)
2. **Кастомные детекторы** — языкоспецифичные TypeScript-функции с AST/regex анализом
3. **Семантическая валидация** — сходство эмбеддингов с кураторскими примерами кода
4. **Скоринг** — комбинированная уверенность из структурного + семантического этапов

### Источники данных по языкам

| Язык | Парсер | Поля метаданных |
|------|--------|----------------|
| TypeScript/JS | TypeScript Compiler API | jitHints, antipatternHints, calls, controlFlow |
| Python | python-ast-cli.py (нативный AST) | pythonHints, classMeta, controlFlow (расширенный), calls с kwargs |
| C# | Roslyn .NET анализатор | csharpHints, calls, controlFlow |
| Java/Kotlin | ANTLR4 грамматика | calls, controlFlow, metrics |
| Go | go-ast-cli.go (нативный AST) | calls, controlFlow |
| Zig | zigOps экстрактор | zigOps (forceUnwrap, unsafeCast, unreachable) |
