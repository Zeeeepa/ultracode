# Utils

*Last updated: 2026-01-18*

Утилиты для работы с Java AST ANTLR — обход и извлечение данных из узлов

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `determineCallTarget` | function | Разбирает выражение и определяет цель и имя вызова метода | [→ ast-helpers.ts:292] |
| `extractBaseTypeName` | function | Удаляет обобщения и скобки массивов из типа данных | [→ ast-helpers.ts:161-167] |
| `extractGenericArguments` | function | Разбирает и извлекает аргументы обобщенных типов из строки | [→ ast-helpers.ts:172-197] |
| `findAllDescendants` | function | Находит все потомки узла, удовлетворяющие предикату поиска | [→ ast-helpers.ts:88-108] |
| `findAncestor` | function | Поиск первого предка узла, соответствующего условию предиката | [→ ast-helpers.ts:113-125] |
| `getIdentifierText` | function | Безопасно извлекает текст идентификатора из узла | [→ ast-helpers.ts:148-152] |
| `getLocation` | function | Извлекает информацию о позиции узла AST в исходном коде | [→ ast-helpers.ts:18-35] |
| `getTerminalLocation` | function | Получает координаты терминального узла ANTLR парсера | [→ ast-helpers.ts:40-57] |
| `getText` | function | Безопасно получает текст контекста или пустую строку | [→ ast-helpers.ts:134-136] |
| `getTextTrimmed` | function | Получает текст контекста с удаленными пробельными символами | [→ ast-helpers.ts:141-143] |
| `isJavaKeyword` | function | Проверяет, является ли строка зарезервированным словом Java | [→ ast-helpers.ts:274-276] |
| `isJavaPrimitive` | function | Проверяет, соответствует ли тип примитивному типу Java | [→ ast-helpers.ts:281-283] |
| `isStaticCall` | function | Проверяет, является ли вызов статическим методом класса | [→ ast-helpers.ts:313-316] |
| `isSuperCall` | function | Проверяет, является ли вызов обращением к методу родительского класса | [→ ast-helpers.ts:321-323] |
| `isThisCall` | function | Проверяет, является ли вызов методом текущего экземпляра класса | [→ ast-helpers.ts:328-330] |
| `JAVA_KEYWORDS` | const | Набор зарезервированных слов языка Java для проверок | [→ ast-helpers.ts:206-276] |
| `JAVA_PRIMITIVES` | const | Набор примитивных типов данных языка Java | [→ ast-helpers.ts:259-276] |
| `visitChildren` | function | Рекурсивно посещает и обрабатывает дочерние узлы контекста | [→ ast-helpers.ts:66-83] |

## Files

- **ast-helpers.ts** — Основной файл модуля с вспомогательными функциями для парсера Java
