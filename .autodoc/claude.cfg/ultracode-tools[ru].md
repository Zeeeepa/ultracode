# UltraCode — Полная документация

Детальное описание всех 50 инструментов с параметрами.

---

## Индексация и поиск

### `index`
Индексирует кодовую базу для анализа. **Выполнить один раз перед использованием других инструментов.**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `directory` | string | текущая | Директория для индексации |
| `incremental` | boolean | false | Инкрементальная индексация (только изменённые файлы) |
| `reset` | boolean | false | Очистить граф перед индексацией |
| `excludePatterns` | string[] | node_modules, .git, dist... | Паттерны исключения |
| `fullScan` | boolean | false | Полное сканирование без кеша |

```
index directory="/path/to/project" incremental=true
```

### `semantic_search`
**Семантический поиск по смыслу кода.** Понимает естественный язык. Возвращает расширенные метаданные: сложность, control flow, вызовы, документация.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `query` | string | **обязательный** | Поисковый запрос на естественном языке |
| `limit` | number | 10 | Максимум результатов |
| `branch` | string | main | Ветка для поиска |
| `projectPath` | string | текущий | **Кросс-проектный поиск:** путь к другому проекту |
| `minCyclomatic` | number | - | Фильтр: минимальная цикломатическая сложность |
| `maxCyclomatic` | number | - | Фильтр: максимальная цикломатическая сложность |
| `hasExceptions` | boolean | - | Фильтр: должен иметь try-catch блоки |
| `hasLoops` | boolean | - | Фильтр: должен иметь циклы |
| `hasAwaits` | boolean | - | Фильтр: должен иметь await (async код) |
| `hasDocumentation` | boolean | - | Фильтр: должен иметь документацию |
| `isDeprecated` | boolean | - | Фильтр: только deprecated сущности |
| `minCallCount` | number | - | Фильтр: минимум вызовов функций |

**Расширенный вывод включает:**
- `complexity`: cyclomatic, cognitive, linesOfCode, nestingDepth
- `controlFlow`: hasBranches, hasLoops, hasExceptions, hasAwaits, counts
- `calls`: count, hasAsync
- `documentation`: hasDocumentation, hasParams, hasExamples, isDeprecated

```
semantic_search query="функции валидации email" limit=5
semantic_search query="data processing" minCyclomatic=10
semantic_search query="API calls" hasAwaits=true hasExceptions=false
semantic_search query="public API" hasDocumentation=false
```

### `query`
Запрос на естественном языке о коде.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `query` | string | **обязательный** | Запрос |
| `limit` | number | 10 | Максимум результатов |
| `branch` | string | main | Ветка |

### `pattern_search`
Продвинутый поиск с несколькими режимами.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `pattern` | string | **обязательный** | Regex паттерн или семантический запрос |
| `mode` | enum | **обязательный** | `entity` / `content` / `semantic` / `hybrid` |
| `entityTypes` | string[] | все | Типы сущностей (function, class, interface...) |
| `files` | string[] | все | Фильтр по файлам |
| `frameworks` | string[] | все | Фильтр по фреймворкам (React, Vue...) |
| `contentContains` | string | - | Содержимое должно содержать строку |
| `contentRegex` | string | - | Regex для содержимого |
| `semanticQuery` | string | - | Семантический запрос для содержимого |

```
pattern_search pattern="handle.*Error" mode="hybrid" entityTypes=["function"]
```

### `find_similar_code`
Поиск семантически похожего кода.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `code` | string | **обязательный** | Фрагмент кода для поиска похожих |
| `threshold` | number | 0.5 | Порог схожести (0-1) |
| `limit` | number | 10 | Максимум результатов |

```
find_similar_code code="function validate(email) { return email.includes('@') }" threshold=0.7
```

### `cross_language_search`
Поиск по нескольким языкам программирования.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `query` | string | **обязательный** | Поисковый запрос |
| `languages` | string[] | все | Языки для поиска (ts, js, py, go...) |

### `find_related_concepts`
Поиск связанных концепций для сущности.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | **обязательный** | ID сущности |
| `limit` | number | 10 | Максимум результатов |

---

## Анализ сущностей

### `get_members`
Список всех сущностей в файле (классы, функции, интерфейсы...).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | **обязательный** | Путь к файлу |
| `entityTypes` | string[] | все | Типы сущностей для фильтрации |

```
get_members filePath="src/auth/login.ts" entityTypes=["function", "class"]
```

### `list_entity_relationships`
Показать зависимости сущности (кто вызывает, от кого зависит).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | - | ID сущности (предпочтительно) |
| `entityName` | string | - | Имя сущности |
| `filePath` | string | - | Путь к файлу для уточнения |
| `depth` | number | 1 | Глубина обхода зависимостей |
| `relationshipTypes` | string[] | все | Типы связей |

```
list_entity_relationships entityName="UserService" depth=2
```

### `detect_technology_stack`
Определить стек технологий проекта.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `generateContext` | boolean | false | Генерировать контекст для эмбеддингов |

---

## Качество кода

### `find_duplicates`
Семантический поиск дублирующегося кода.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `minSimilarity` | number | 0.8 | Минимальная схожесть (0-1) |
| `scope` | string | "all" | Область: `all` / `file` / `module` |

```
find_duplicates minSimilarity=0.7 scope="module"
```

### `jscpd_detect_clones`
Детектор клонов на базе jscpd.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `paths` | string[] | корень | Пути для сканирования |
| `pattern` | string | "**/*" | Glob-паттерн |
| `ignore` | string[] | - | Паттерны исключения |
| `formats` | string[] | все | Расширения файлов (ts, js, py...) |
| `minLines` | number | - | Минимум строк в клоне |
| `maxLines` | number | - | Максимум строк в клоне |
| `minTokens` | number | - | Минимум токенов |
| `ignoreCase` | boolean | false | Игнорировать регистр |

### `analyze_code_impact`
**Анализ влияния изменений** — что сломается при изменении сущности. Включает секцию `contractImpact` когда затронуты swagger-связанные сущности (producers, consumers, generated types).

Комбинирует **зависимости графа** (прямые связи) с **семантическим сходством** (SIMD/GPU ускорение) для поиска как прямых, так и концептуально связанных сущностей.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entity` | string | **обязательный** | ID или имя сущности |
| `includeSemantic` | boolean | true | Включить семантически связанные сущности (SIMD/GPU ускорение) |
| `semanticLimit` | number | 10 | Максимум семантических совпадений |
| `semanticThreshold` | number | 0.7 | Минимальный порог сходства (0-1) |

**Возвращает:**
```json
{
  "entity": "handleLogin",
  "entityType": "function",
  "filePath": "src/auth/login.ts",
  "dependents": [...],           // Прямые: кто вызывает
  "dependencies": [...],         // Прямые: что вызывается
  "semanticRelated": [           // НОВОЕ: Похожие по смыслу (GPU ускорение)
    { "name": "handleLogout", "similarity": 0.85, "reason": "semantic_similarity" }
  ],
  "impactScore": 5,              // Прямые зависимые
  "semanticImpactScore": 3,      // Семантические совпадения
  "totalImpactScore": 6          // Комбинированный (semantic × 0.5)
}
```

**Производительность:**
- Прямой граф: O(n) SQLite запросы
- Семантика: O(1) векторное сходство с SIMD/CUDA ускорением

```
analyze_code_impact entity="UserManager" includeSemantic=true semanticThreshold=0.8
```

### `suggest_refactoring`
AI-предложения по рефакторингу.

### `analyze_hotspots`
Поиск сложных участков кода.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `metric` | string | "complexity" | Метрика: `complexity` / `changes` / `coupling` |
| `limit` | number | 10 | Максимум результатов |

### `analyze_swagger_impact`
**Анализ влияния Swagger/OpenAPI** — показывает затронутые контроллеры, сгенерированные клиенты и типы при изменении swagger-спецификаций.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `swaggerFile` | string | авто | Путь к swagger-файлу |
| `schemaName` | string | - | Конкретная schema для анализа |
| `endpointPath` | string | - | Конкретный endpoint (`GET /api/users`) |
| `projectPath` | string | текущий | Путь к проекту |

```
analyze_swagger_impact schemaName="User"
analyze_swagger_impact endpointPath="GET /api/users"
```

### `analyze_state_chaos`
Анализ хаоса состояния (мутации, side-effects).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `scope` | enum | **обязательный** | `file` / `module` / `project` |
| `stateIdentifiers` | string[] | - | Идентификаторы состояния (token, userId...) |
| `autoDetect` | boolean | false | Авто-определение паттернов состояния |
| `format` | enum | "summary" | `summary` / `detailed` / `json` |
| `maxDepth` | number | 10 | Максимальная глубина трассировки |

### `validate_file`
Валидация файла (синтаксис, типы).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | **обязательный** | Путь к файлу |

### `validate_directory`
Валидация директории.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `dirPath` | string | **обязательный** | Путь к директории |
| `extensions` | string[] | все | Расширения для валидации |
| `recursive` | boolean | true | Рекурсивно |

---

## Модификация кода

### `modify_code`
Модификация кода сущности.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | **обязательный** | ID сущности |
| `newCode` | string | **обязательный** | Новый код |
| `preserveComments` | boolean | true | Сохранить комментарии |
| `updateImports` | boolean | true | Обновить импорты |
| `preview` | boolean | true | Превью изменений |
| `skipValidation` | boolean | false | Пропустить валидацию |

### `create_file`
Создание нового файла.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | **обязательный** | Абсолютный путь |
| `content` | string | **обязательный** | Содержимое файла |
| `createDirectories` | boolean | true | Создать родительские директории |
| `updateGraph` | boolean | true | Добавить в граф |
| `overwrite` | boolean | false | Перезаписать если существует |

### `copy_file`
Копирование файла.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `source` | string | **обязательный** | Исходный путь |
| `target` | string | **обязательный** | Целевой путь |
| `preview` | boolean | true | Превью |
| `updateGraph` | boolean | true | Обновить граф |

### `rename_file`
Переименование файла.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `oldPath` | string | **обязательный** | Текущий путь |
| `newPath` | string | **обязательный** | Новый путь |
| `preview` | boolean | true | Превью |
| `updateImports` | boolean | true | Обновить импорты в проекте |
| `updateGraph` | boolean | true | Обновить граф |

### `split_file`
Разделение файла на части.

### `synthesize_files`
Объединение нескольких файлов.

### `rename_symbol`
**Переименование символа во всём проекте** (умное переименование).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | - | ID сущности (предпочтительно) |
| `entityName` | string | - | Имя сущности |
| `filePath` | string | - | Путь для уточнения |
| `newName` | string | **обязательный** | Новое имя |
| `updateReferences` | boolean | true | Обновить все ссылки |
| `preview` | boolean | true | Превью изменений |

```
rename_symbol entityName="getUserData" newName="fetchUserProfile" updateReferences=true
```

### `add_member`
Добавление члена в класс/интерфейс.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | - | ID родительской сущности |
| `filePath` | string | **обязательный** | Путь к файлу |
| `memberCode` | string | **обязательный** | Код нового члена |
| `position` | enum | "end" | `start` / `end` / `after` |
| `afterMember` | string | - | После какого члена (для position=after) |
| `preview` | boolean | true | Превью |

---

## Снапшоты и откат

### `create_snapshot`
Создание снапшота состояния.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `description` | string | **обязательный** | Описание снапшота |
| `files` | string[] | все | Файлы для включения |

```
create_snapshot description="Перед рефакторингом UserService"
```

### `undo`
Откат к снапшоту / отмена последнего изменения.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `snapshotId` | string | опциональный | ID снапшота (если не указан, отменяет последнее изменение) |

### `list_snapshots`
Список снапшотов.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `limit` | number | 10 | Максимум снапшотов |

### `cleanup_snapshots`
Очистка старых снапшотов.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `olderThanDays` | number | 30 | Удалить старше N дней |

---

## Git-интеграция

### `list_branches`
Список проиндексированных веток.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `repositoryPath` | string | текущая | Путь к репозиторию |

### `switch_branch`
Переключение на другую ветку.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `branch` | string | **обязательный** | Имя ветки |
| `repositoryPath` | string | текущая | Путь к репозиторию |

```
switch_branch branch="feature/new-auth"
```

### `get_branch_status`
Статус текущей ветки.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `repositoryPath` | string | текущая | Путь к репозиторию |

### `get_changed_files`
Список изменённых файлов между ветками.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `fromBranch` | string | **обязательный** | Исходная ветка |
| `toBranch` | string | **обязательный** | Целевая ветка |

```
get_changed_files fromBranch="main" toBranch="feature/auth"
```

### `cleanup_branches`
Очистка старых веток (LRU).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `keep` | number | из конфига | Сколько веток оставить |

---

## Граф и система

### `get_graph`
Получить граф кода.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `query` | string | - | Поисковый запрос |
| `limit` | number | 100 | Максимум сущностей |

### `get_graph_stats`
Статистика графа (количество сущностей, связей).

### `get_graph_health`
Проверка здоровья графа.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `minEntities` | number | 1 | Минимум сущностей для healthy |
| `minRelationships` | number | 0 | Минимум связей |
| `sample` | number | 1 | Размер выборки для проверки |

### `reset_graph`
Сброс графа (очистка всех данных).

### `clean_index`
Очистка и переиндексация.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `directory` | string | текущая | Директория |
| `excludePatterns` | string[] | [] | Паттерны исключения |
| `fullScan` | boolean | false | Полное сканирование |

### `lerna_project_graph`
Граф Lerna-монорепозитория.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `directory` | string | текущая | Рабочая директория |
| `ingest` | boolean | false | Сохранить в граф |
| `force` | boolean | false | Принудительно обновить |

---

## Архитектурные диаграммы

### `get_architecture_diagram`
Генерация архитектурных диаграмм из графа кода. Поддержка Mermaid, Graphviz DOT, D2.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entryPoint` | string | - | Точка входа (файл, класс, модуль). Без указания — обзор проекта |
| `depth` | number | 2 | 1=файлы, 2=классы, 3=методы, 4+=глубже |
| `dataFlowLevel` | number | 1 | 0=структура, 1=типы, 2=условия, 3=маппинг полей |
| `format` | string | mermaid | `mermaid`, `graphviz`, `d2` |
| `direction` | string | TD | `TD` (сверху вниз) или `LR` (слева направо) |
| `diagramType` | string | авто | `flowchart`, `class`, `component` |

---

## Метрики и отладка

### `get_metrics`
Метрики системы.

### `get_version`
Версия сервера.

### `get_agent_metrics`
Метрики агентов (время выполнения, использование памяти).

### `get_bus_stats`
Статистика шины сообщений.

### `clear_bus_topic`
Очистка топика шины.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `topic` | string | **обязательный** | Имя топика |

---

## Примеры использования

### Анализ нового проекта
```
1. index directory="/path/to/project"
2. detect_technology_stack
3. get_graph_stats
4. analyze_hotspots metric="complexity" limit=20
```

### Поиск и рефакторинг
```
1. semantic_search query="обработка ошибок аутентификации"
2. list_entity_relationships entityName="AuthService" depth=2
3. analyze_code_impact entityId="AuthService.login"
4. create_snapshot description="Перед рефакторингом auth"
5. modify_code entityId="AuthService.login" newCode="..." preview=true
6. modify_code entityId="AuthService.login" newCode="..." preview=false
```

### Поиск дубликатов
```
1. find_duplicates minSimilarity=0.75
2. find_similar_code code="<фрагмент>" threshold=0.6
3. suggest_refactoring
```

### Работа с ветками
```
1. list_branches
2. switch_branch branch="feature/new-api"
3. get_changed_files fromBranch="main" toBranch="feature/new-api"
4. index incremental=true
```

### Поиск сложного кода для рефакторинга (NEW)
```
1. semantic_search query="data processing" minCyclomatic=10
2. semantic_search query="validation" hasExceptions=true hasLoops=true
3. analyze_code_impact entityId="complexFunction"
4. suggest_refactoring
```

### Поиск недокументированного кода (NEW)
```
1. semantic_search query="public API" hasDocumentation=false
2. semantic_search query="exported functions" hasDocumentation=false limit=50
3. Добавить документацию к найденным сущностям
```

### Поиск async кода без обработки ошибок (NEW)
```
1. semantic_search query="database operations" hasAwaits=true
2. semantic_search query="API calls" hasAwaits=true hasExceptions=false
3. Проверить отсутствие error handling в async коде
```

### Анализ качества по сложности (NEW)
```
1. semantic_search query="" minCyclomatic=15  # Очень сложный код
2. semantic_search query="" maxCyclomatic=3   # Простой код
3. analyze_hotspots metric="complexity" limit=20
```

---

## Трассировка (статический анализ потока) — NEW

### `trace_flow`
**Трассировка выполнения от точки A к B.** Находит все возможные пути, анализирует изменения состояния, условия и async-границы.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `from` | string | **обязательный** | Начальная точка (имя функции или семантический запрос) |
| `to` | string | **обязательный** | Конечная точка |
| `format` | enum | "sequence" | Формат: `sequence` / `tree` / `graph` / `mermaid` |
| `maxDepth` | number | 15 | Максимальная глубина обхода |
| `trackStates` | boolean | true | Отслеживать изменения состояния |
| `trackConditions` | boolean | true | Отслеживать условия/ветвления |

```
trace_flow from="handleLogin" to="sendEmail" format="mermaid"
```

### `trace_backwards`
**Обратная трассировка** — почему метод может не вызываться.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `target` | string | **обязательный** | Целевой метод для анализа |
| `question` | enum | **обязательный** | `why_not_called` / `what_affects` / `dependencies` |
| `depth` | number | 15 | Глубина обратного обхода |
| `includeStates` | boolean | true | Включить зависимости состояния |
| `includeEffects` | boolean | true | Включить побочные эффекты |

```
trace_backwards target="sendNotification" question="why_not_called"
```

### `trace_data_flow`
**Трассировка потока данных** — как данные влияют на целевое состояние.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entryPoint` | string | **обязательный** | Точка входа |
| `targetState` | string | **обязательный** | Целевое состояние |
| `dataSources` | string[] | авто | Источники данных |
| `trackTransformations` | boolean | true | Отслеживать трансформации данных |

```
trace_data_flow entryPoint="processOrder" targetState="orderTotal"
```

### `analyze_state_impact`
**Анализ влияния состояния** — как состояние влияет на разные сценарии.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `state` | string | **обязательный** | Переменная состояния |
| `scenarios` | object[] | **обязательный** | Сценарии: `[{value: ..., label: "..."}]` |
| `scope` | string | - | Область анализа |

```
analyze_state_impact state="isAuthenticated" scenarios=[{value: true, label: "Авторизован"}, {value: false, label: "Гость"}]
```

### `find_decision_points`
**Поиск точек принятия решений** в потоке выполнения сценария.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `scenario` | string | **обязательный** | Сценарий для анализа |
| `groupBy` | enum | "impact" | `impact` / `location` / `type` |
| `includeGuards` | boolean | true | Включить guard-условия |
| `includeEffects` | boolean | true | Включить побочные эффекты |

**Типы точек:** validation, api_response, state_mutation, guard, loop, error_handling, feature_flag

```
find_decision_points scenario="регистрация пользователя" groupBy="type"
```

---

## Кросс-проектная поддержка — NEW

### Работа с несколькими проектами

MCP сервер поддерживает работу с **несколькими проектами**, каждый со своими изолированными базами данных:

```
# Переключение контекста через index
index directory="D:\\другой\\проект"

# Или поиск в другом проекте напрямую через projectPath
semantic_search query="аутентификация" projectPath="D:\\другой\\проект"
```

### Расположение хранилища

Каждый проект имеет изолированные базы данных:
```
%LOCALAPPDATA%\UltraCode\projects\{hash}\
├── graph.db      # Граф сущностей
├── vectors.db    # Эмбеддинги
└── meta.json     # Метаданные
```

### Пример workflow

```
# 1. Индексируем основной проект
index directory="D:\\work\\main-project"
# → Контекст: main-project, 8000 entities

# 2. Переключаемся на другой проект для анализа
index directory="D:\\work\\other-project"
# → Контекст: other-project, 50000 entities

# 3. Ищем в other-project
semantic_search query="newsletter"
# → Результаты из other-project

# 4. Возвращаемся к основному проекту
index directory="D:\\work\\main-project" incremental=true
# → Контекст: main-project, данные сохранены
```
