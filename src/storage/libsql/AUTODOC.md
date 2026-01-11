# Libsql

*Last updated: 2026-01-11*

Адаптер хранилища граф-данных для LibSQL с поддержкой векторных вычислений и кэширования.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `VectorToStringFn` | type | Функция преобразования Float32Array в SQL-совместимую строку | [→ cache-ops.ts:18] |
| `CacheOperations` | class | Класс для управления глобальным кэшем встраиваний по хешу | [→ cache-ops.ts:24-160] |
| `RowToEntityMapper` | type | Тип-делегат преобразования строки БД в сущность | [→ entity-ops.ts:18] |
| `EntityOperations` | class | Класс для операций CRUD сущностей проекта | [→ entity-ops.ts:24-381] |
| `MetadataOperations` | class | Класс для операций метаданных файлов и проектов | [→ metadata-ops.ts:16-449] |
| `RowToRelationshipMapper` | type | Тип-делегат преобразования строки БД в связь | [→ relationship-ops.ts:18] |
| `RelationshipOperations` | class | Класс для операций CRUD связей между сущностями | [→ relationship-ops.ts:24-205] |
| `LibSQLGraphConfig` | interface | Интерфейс конфигурации адаптера с параметрами векторов | [→ types.ts:15-28] |
| `DEFAULT_CONFIG` | const | Конфигурация по умолчанию с оптимизированными параметрами | [→ types.ts:30-37] |
| `SUPPORTED_DIMENSIONS` | const | Массив поддерживаемых размерностей встраиваний | [→ types.ts:44-56] |
| `SupportedDimension` | type | Тип размерности встраивания из списка поддерживаемых | [→ types.ts:45] |
| `getEmbeddingColumn` | function | Функция получения имени столбца по размерности | [→ types.ts:51-56] |
| `normalizeToSupportedDimension` | function | Функция нормализации размерности к ближайшей поддерживаемой | [→ types.ts:62-67] |
| `ProjectContext` | interface | Интерфейс контекста проекта с хешем и веткой | [→ types.ts:73-80] |
| `DEFAULT_PROJECT_CONTEXT` | const | Контекст по умолчанию для легаси-проектов | [→ types.ts:82-85] |
| `CACHE_CONFIG` | const | Конфигурация LRU-кэшей встраиваний и поисков | [→ types.ts:91-109] |
| `DatabaseCorruptionError` | class | Исключение для обнаружения повреждения БД | [→ types.ts:116-127] |
| `isCorruptionError` | function | Функция проверки типа ошибки повреждения БД | [→ types.ts:132-140] |
| `ClientGetter` | type | Тип-делегат получения клиента LibSQL или null | [→ types.ts:149] |
| `ContextGetter` | type | Тип-делегат получения контекста проекта | [→ types.ts:154] |
| `MetadataEncoder` | type | Функция кодирования метаданных в двоичный формат | [→ types.ts:159] |
| `MetadataDecoder` | type | Функция декодирования метаданных из двоичного формата | [→ types.ts:164] |
| `VectorOpsContext` | interface | Интерфейс контекста для операций с векторами | [→ vector-ops.ts:29-42] |
| `VectorOperations` | class | Класс для операций встраиваний поиска и индексирования | [→ vector-ops.ts:48-549] |

## Files

- **cache-ops.ts** — Операции кэширования встраиваний с индексацией по хешу контента
- **entity-ops.ts** — Операции CRUD для сущностей проекта с пакетной оптимизацией
- **index.ts** — Переэкспорт всех операций и типов модуля
- **metadata-ops.ts** — Операции метаданных файлов и проектов с отслеживанием индексации
- **relationship-ops.ts** — Операции CRUD для связей между сущностями с деоптимизацией
- **types.ts** — Конфигурация, интерфейсы, константы и утилиты модуля
- **vector-ops.ts** — Операции встраиваний с поиском сходства и управлением индексами
