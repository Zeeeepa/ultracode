# Utils

*Last updated: 2026-01-10*

Утилиты для анализа циклических зависимостей и вспомогательные функции Python парсера.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CycleInfo` | interface | Информация о пути циклической зависимости и её рёбрах. | [→ cycle-detector.ts:13-16] |
| `CycleAnalysisResult` | interface | Результат анализа цикла с типом, серьёзностью и предложением. | [→ cycle-detector.ts:18-24] |
| `CycleDetector` | class | Класс для обнаружения и анализа циклических зависимостей импортов. | [→ cycle-detector.ts:30-376] |
| `MAGIC_METHOD_TYPES` | const | Словарь отображения специальных методов Python на типы. | [→ helpers.ts:17-59] |
| `BUILTIN_DECORATORS` | const | Список встроенных декораторов Python для идентификации. | [→ helpers.ts:64-97] |
| `convertPosition` | function | Преобразует позицию узла tree-sitter в стандартный формат. | [→ helpers.ts:84-97] |
| `getNodeText` | function | Извлекает текстовое содержимое из AST узла исходного кода. | [→ helpers.ts:102-104] |
| `isMagicMethod` | function | Проверяет является ли имя специальным методом Python. | [→ helpers.ts:109-111] |
| `isBuiltinDecorator` | function | Проверяет входит ли имя в список встроенных декораторов. | [→ helpers.ts:116-118] |
| `withPerformanceMonitoring` | function | Обёртка для мониторинга производительности выполнения функций. | [→ helpers.ts:123-145] |
| `hasYieldExpression` | function | Проверяет наличие выражения yield в узле AST. | [→ helpers.ts:150-162] |

## Files

- **cycle-detector.ts** — Детектор и анализ циклических зависимостей в импортах Python.
- **helpers.ts** — Константы магических методов, декораторы и функции преобразования AST узлов.
- **index.ts** — Переэкспорт всех утилит и типов из подмодулей.
