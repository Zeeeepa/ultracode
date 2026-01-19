# Utils

*Last updated: 2026-01-19*

Утилиты парсера ANTLR с оптимизациями производительности

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `AwaitInfo` | interface | Информация об асинхронном ожидании выполнения | [→ parser-utils.ts:232-235] |
| `BranchInfo` | interface | Информация о условных ветвлениях и выборе | [→ parser-utils.ts:197-201] |
| `CALL_RELEVANT_NODE_TYPES` | const | Множество типов узлов содержащих вызовы | [→ parser-utils.ts:453-475] |
| `CallInfo` | interface | Информация о вызове метода или конструктора | [→ parser-utils.ts:170-181] |
| `canContainCalls` | function | Проверяет, может ли узел содержать вызовы | [→ parser-utils.ts:473-475] |
| `ComplexityMetrics` | interface | Метрики сложности циклических и когнитивных | [→ parser-utils.ts:248-256] |
| `ControlFlowInfo` | interface | Информация о управлении потоком кода | [→ parser-utils.ts:186-192] |
| `ExceptionInfo` | interface | Информация об обработке исключений | [→ parser-utils.ts:214-218] |
| `LocationInfo` | interface | Информация о позиции в исходном коде | [→ parser-utils.ts:240-243] |
| `logParserPerformance` | function | Логирует медленные операции парсирования | [→ parser-utils.ts:480-488] |
| `LoopInfo` | interface | Информация о циклах в исходном коде | [→ parser-utils.ts:206-209] |
| `NodeTypeChecker` | interface | Интерфейс для проверки типов узлов | [→ parser-utils.ts:261-269] |
| `ObjectPool` | class | Пул объектов для переиспользования экземпляров | [→ parser-utils.ts:93-152] |
| `parseWithSLLFallback` | function | Парсирует код в режиме SLL с откатом на ALL | [→ parser-utils.ts:36-71] |
| `ReturnInfo` | interface | Информация о возврате из функции | [→ parser-utils.ts:223-227] |
| `unifiedExtract` | function | Единая функция извлечения данных из AST | [→ parser-utils.ts:274-417] |
| `UnifiedExtractionResult` | interface | Результат единого извлечения информации | [→ parser-utils.ts:161-165] |

## Files

- **parser-utils.ts** — Основной файл модуля с экспортами парсера
