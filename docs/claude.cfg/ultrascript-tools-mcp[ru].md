# UltraScript Tools MCP — Полная документация

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
**Семантический поиск по смыслу кода.** Понимает естественный язык.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `query` | string | **обязательный** | Поисковый запрос на естественном языке |
| `limit` | number | 10 | Максимум результатов |
| `branch` | string | main | Ветка для поиска |

```
semantic_search query="функции валидации email" limit=5
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

### `list_file_entities`
Список всех сущностей в файле (классы, функции, интерфейсы...).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | **обязательный** | Путь к файлу |
| `entityTypes` | string[] | все | Типы сущностей для фильтрации |

```
list_file_entities filePath="src/auth/login.ts" entityTypes=["function", "class"]
```

### `get_members`
Получить члены класса/интерфейса/модуля.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | **обязательный** | ID сущности |

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

### `detect_code_clones`
Семантический поиск дублирующегося кода.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `minSimilarity` | number | 0.8 | Минимальная схожесть (0-1) |
| `scope` | string | "all" | Область: `all` / `file` / `module` |

```
detect_code_clones minSimilarity=0.7 scope="module"
```

### `find_duplicates`
Быстрый поиск дубликатов (хеш-based).

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
**Анализ влияния изменений** — что сломается при изменении сущности.

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

### `modify_entity_code`
Аналогично `modify_code`, но по имени сущности.

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

### `rollback_snapshot`
Откат к снапшоту.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `snapshotId` | string | **обязательный** | ID снапшота |

### `undo`
Отмена последнего изменения.

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
1. detect_code_clones minSimilarity=0.75
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
