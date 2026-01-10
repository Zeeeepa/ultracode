# Extractors

*Last updated: 2026-01-10*

Модуль для извлечения информации из Python AST узлов.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CallExtractor` | class | Класс для извлечения информации о вызовах функций | [→ call-extractor.ts:14-103] |
| `ControlFlowExtractor` | class | Класс для анализа ветвлений, циклов и исключений | [→ controlflow-extractor.ts:14-181] |
| `DocstringParser` | class | Класс для разбора документационных строк Python | [→ docstring-parser.ts:14-263] |
| `TypeExtractor` | class | Класс для извлечения сложных аннотаций типов параметров | [→ type-extractor.ts:14-104] |

## Files

- **call-extractor.ts** — Извлекает вызовы функций и методов из Python кода
- **controlflow-extractor.ts** — Извлекает структуры управления потоком выполнения
- **docstring-parser.ts** — Анализирует Python docstring в различных форматах
- **index.ts** — Переэкспортирует все классы-экстракторы модуля
- **type-extractor.ts** — Извлекает аннотации типов и параметры функций
