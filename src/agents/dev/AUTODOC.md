# Dev

*Last updated: 2026-01-19*

Утилиты для сбора и классификации файлов исходного кода

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `ALL_SUPPORTED_EXTENSIONS` | const | Объединённый массив всех поддерживаемых расширений | [→ file-extensions.ts:63-68] |
| `collectFiles` | function | Рекурсивно собирает файлы с фильтрацией по расширениям | [→ file-collector.ts:137-146] |
| `CollectFilesOptions` | interface | Интерфейс опций сбора файлов из директории | [→ file-collector.ts:112-120] |
| `CollectFilesResult` | interface | Интерфейс результата сбора файлов исходного кода | [→ file-collector.ts:112-120] |
| `createHeuristicEntities` | function | Создаёт сущность модуля для непарсируемых файлов | [→ heuristic-parser.ts:31-71] |
| `isCodeExtension` | function | Проверяет является ли расширение файлом кода | [→ file-extensions.ts:63-68] |
| `isDataExtension` | function | Проверяет является ли расширение файлом данных | [→ file-extensions.ts:63-68] |
| `loadIgnoreFile` | function | Загружает паттерны исключения из файла конфигурации | [→ file-collector.ts:20-63] |
| `SUPPORTED_CODE_EXTENSIONS` | const | Массив расширений файлов с поддержкой AST парсинга | [→ file-extensions.ts:12-68] |
| `SUPPORTED_DATA_EXTENSIONS` | const | Массив расширений файлов без AST парсинга | [→ file-extensions.ts:40-68] |

## Files

- **file-collector.ts** — Рекурсивный сбор файлов с поддержкой паттернов исключения
- **file-extensions.ts** — Конфигурация поддерживаемых расширений файлов
- **heuristic-parser.ts** — Создание сущностей для неподдерживаемых языков
- **index.ts** — Переэкспорт основных утилит модуля
