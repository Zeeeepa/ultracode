# Schemas

*Last updated: 2026-01-18*

Модуль содержит схемы валидации Zod для всех инструментов MCP.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `JscpdCloneDetectionSchema` | const | Валидация параметров поиска дублирующегося кода в проекте | [→ analysis-schemas.ts:8-24] |
| `SuggestRefactoringSchema` | const | Валидация входных данных для анализа возможностей рефакторинга | [→ analysis-schemas.ts:26-33] |
| `AnalyzeHotspotsSchema` | const | Валидация параметров анализа критических точек в коде | [→ analysis-schemas.ts:44-51] |
| `AnalyzeStateChaosSchema` | const | Валидация настроек анализа состояния и его влияния | [→ analysis-schemas.ts:53-67] |
| `AutoDocInitSchema` | const | Валидация инициализации системы автоматической документации | [→ autodoc-schemas.ts:8-12] |
| `AutoDocSaveSchema` | const | Валидация сохранения документов в markdown-формате | [→ autodoc-schemas.ts:14-22] |
| `AutoDocGetSchema` | const | Валидация получения документов по ID или пути файла | [→ autodoc-schemas.ts:24-27] |
| `AutoDocSearchSchema` | const | Валидация поиска документации текстом или семантикой | [→ autodoc-schemas.ts:24-27] |
| `AutoDocValidateSchema` | const | Валидация проверки ссылок в документации | [→ autodoc-schemas.ts:39-42] |
| `AutoDocStatusSchema` | const | Валидация запроса статуса автодокументации без параметров | [→ autodoc-schemas.ts:44] |
| `AutoDocSyncSchema` | const | Валидация синхронизации документов между диском и базой | [→ autodoc-schemas.ts:39-42] |
| `AutoDocGenerateSchema` | const | Валидация генерации документации с помощью LLM | [→ autodoc-schemas.ts:61-87] |
| `AutoDocChangelogSchema` | const | Валидация получения истории изменений документации | [→ autodoc-schemas.ts:89-93] |
| `AutoDocInstallHooksSchema` | const | Валидация установки/удаления git-хуков документации | [→ autodoc-schemas.ts:95-101] |
| `AutoDocDetectLanguageSchema` | const | Валидация определения языка документации автоматически | [→ autodoc-schemas.ts:103-110] |
| `ListEntitiesToolSchema` | const | Валидация получения списка сущностей из файла | [→ entity-schemas.ts:8-11] |
| `ListRelationshipsToolSchema` | const | Валидация получения связей между сущностями проекта | [→ entity-schemas.ts:8-11] |
| `QueryToolSchema` | const | Валидация естественного языкового запроса к графу знаний | [→ entity-schemas.ts:26-30] |
| `GetGraphSchema` | const | Валидация получения сущностей из графа с поиском | [→ graph-schemas.ts:8-11] |
| `GetGraphStatsSchema` | const | Валидация получения статистики графа знаний без параметров | [→ graph-schemas.ts:13] |
| `GetGraphHealthSchema` | const | Валидация проверки здоровья графа кода | [→ graph-schemas.ts:8-11] |
| `GetBusStatsSchema` | const | Валидация получения статистики шины знаний без параметров | [→ graph-schemas.ts:21] |
| `ClearBusTopicSchema` | const | Валидация очистки тематического раздела шины знаний | [→ graph-schemas.ts:21-21] |
| `DEFAULT_EXCLUDE_PATTERNS` | const | Стандартные паттерны исключения файлов при индексировании | [→ index-schemas.ts:9-60] |
| `IndexToolSchema` | const | Валидация параметров индексирования директорий проекта | [→ index-schemas.ts:54-60] |
| `CleanIndexSchema` | const | Валидация очистки и переиндексирования графа знаний | [→ index-schemas.ts:62-66] |
| `GetAgentMetricsSchema` | const | Валидация получения метрик работы агентов без параметров | [→ index-schemas.ts:68] |
| `SemanticMergeSchema` | const | Валидация семантического слияния веток с разрешением конфликтов | [→ merge-schemas.ts:8-21] |
| `AnalyzeMergeConflictsSchema` | const | Валидация анализа конфликтов между двумя ветками | [→ merge-schemas.ts:23-26] |
| `GetMergeSuggestionsSchema` | const | Валидация получения AI-рекомендаций по разрешению конфликтов | [→ merge-schemas.ts:23-26] |
| `GetSemanticMergeInfoSchema` | const | Валидация получения информации о слиянии без параметров | [→ merge-schemas.ts:34] |
| `ModifyEntityCodeSchema` | const | Валидация изменения кода отдельной сущности проекта | [→ modification-schemas.ts:8-15] |
| `CopyFileSchema` | const | Валидация копирования файлов или директорий проекта | [→ modification-schemas.ts:17-22] |
| `RenameFileSchema` | const | Валидация переименования файла с обновлением импортов | [→ modification-schemas.ts:24-30] |
| `SplitFileSchema` | const | Валидация разделения файла на несколько отдельных файлов | [→ modification-schemas.ts:32-37] |
| `SynthesizeFilesSchema` | const | Валидация объединения нескольких файлов в один файл | [→ modification-schemas.ts:39-45] |
| `CreateFileSchema` | const | Валидация создания нового файла с содержимым | [→ modification-schemas.ts:47-53] |
| `RenameSymbolSchema` | const | Валидация переименования переменной или функции в коде | [→ modification-schemas.ts:55-62] |
| `AddMemberSchema` | const | Валидация добавления нового метода или свойства в класс | [→ modification-schemas.ts:64-72] |
| `SemanticSearchSchema` | const | Валидация семантического поиска на естественном языке | [→ semantic-schemas.ts:8-13] |
| `FindSimilarCodeSchema` | const | Валидация поиска аналогичного кода по фрагменту | [→ semantic-schemas.ts:15-20] |
| `AnalyzeCodeImpactSchema` | const | Валидация анализа влияния изменений на остальной код | [→ semantic-schemas.ts:22-27] |
| `DetectCodeClonesSchema` | const | Валидация обнаружения семантически похожих блоков кода | [→ semantic-schemas.ts:29-32] |
| `FindRelatedConceptsSchema` | const | Валидация поиска связанных с сущностью концепций | [→ semantic-schemas.ts:29-32] |
| `CrossLanguageSearchSchema` | const | Валидация поиска кода в нескольких языках программирования | [→ semantic-schemas.ts:29-32] |
| `PatternSearchSchema` | const | Валидация поиска по регулярным выражениям и шаблонам | [→ semantic-schemas.ts:29-32] |
| `CreateSnapshotSchema` | const | Валидация создания снимка состояния кода в момент времени | [→ snapshot-schemas.ts:8-11] |
| `RollbackSnapshotSchema` | const | Валидация отката кода к предыдущему снимку состояния | [→ snapshot-schemas.ts:8-11] |
| `ListSnapshotsSchema` | const | Валидация получения списка доступных снимков состояния | [→ snapshot-schemas.ts:8-11] |
| `CleanupSnapshotsSchema` | const | Валидация удаления старых снимков состояния проекта | [→ snapshot-schemas.ts:8-11] |
| `ValidateFileSchema` | const | Валидация проверки синтаксиса одного файла программы | [→ validation-schemas.ts:8-11] |
| `ValidateDirectorySchema` | const | Валидация проверки синтаксиса файлов в директории | [→ validation-schemas.ts:8-11] |
| `DetectTechnologyStackSchema` | const | Валидация определения используемых технологий в коде | [→ validation-schemas.ts:19-21] |

## Files

- **analysis-schemas.ts** — Схемы для анализа кода, обнаружения клонов и горячих точек
- **autodoc-schemas.ts** — Схемы для автоматической генерации и управления документацией
- **entity-schemas.ts** — Схемы для работы с сущностями, запросами и связями
- **graph-schemas.ts** — Схемы для операций с графом знаний и шиной данных
- **index-schemas.ts** — Схемы для индексирования и управления графом кода
- **index.ts** — Центральный экспорт всех схем валидации инструментов
- **merge-schemas.ts** — Схемы для семантического слияния и разрешения конфликтов
- **modification-schemas.ts** — Схемы для модификации кода и операций с файлами
- **semantic-schemas.ts** — Схемы для семантического поиска и анализа кода
- **snapshot-schemas.ts** — Схемы для управления версиями и снимками состояния
- **validation-schemas.ts** — Схемы для валидации кода и определения технологий
