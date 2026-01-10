# Rust

*Last updated: 2026-01-10*

Утилиты для анализа AST и паттернов Rust кода

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `findNodes` | function | Находит все узлы AST определённого типа рекурсивно | [→ ast-helpers.ts:18-31] |
| `getNodeText` | function | Возвращает текстовое содержимое узла AST | [→ ast-helpers.ts:36-38] |
| `extractVisibility` | function | Извлекает модификатор видимости из объявления | [→ ast-helpers.ts:47-50] |
| `hasModifier` | function | Проверяет наличие конкретного модификатора в узле | [→ ast-helpers.ts:55-63] |
| `extractGenerics` | function | Извлекает параметры обобщений из определения | [→ ast-helpers.ts:72-87] |
| `extractLifetimes` | function | Извлекает параметры времени жизни типа | [→ ast-helpers.ts:94-101] |
| `extractDerives` | function | Извлекает список выведенных трейтов из атрибута | [→ ast-helpers.ts:113-130] |
| `extractAttributes` | function | Извлекает все атрибуты из узла кода | [→ ast-helpers.ts:136-141] |
| `getAttributeName` | function | Возвращает имя атрибута из узла | [→ ast-helpers.ts:149-152] |
| `isTupleStruct` | function | Проверяет является ли структура кортежной | [→ ast-helpers.ts:161-164] |
| `hasBody` | function | Проверяет наличие тела у функции или блока | [→ ast-helpers.ts:169-171] |
| `countNestedItems` | function | Подсчитывает вложенные элементы в контейнере | [→ ast-helpers.ts:176-195] |
| `extractTraitBounds` | function | Извлекает ограничения трейтов параметра | [→ ast-helpers.ts:204-216] |
| `extractSupertraits` | function | Извлекает суперчерты из определения трейта | [→ ast-helpers.ts:221-233] |
| `extractTypeBounds` | function | Извлекает границы типа из генерика | [→ ast-helpers.ts:239-244] |
| `extractFunctionParameters` | function | Извлекает параметры функции из подписи | [→ ast-helpers.ts:256] |
| `extractReturnType` | function | Извлекает тип возврата из определения функции | [→ ast-helpers.ts:299-302] |
| `extractFieldType` | function | Извлекает тип данных поля структуры | [→ ast-helpers.ts:311-314] |
| `extractAliasedType` | function | Извлекает переименованный тип из алиаса | [→ ast-helpers.ts:319-322] |
| `extractConstType` | function | Извлекает тип константы из объявления | [→ ast-helpers.ts:327-330] |
| `extractStaticType` | function | Извлекает тип статической переменной | [→ ast-helpers.ts:336-356] |
| `extractDiscriminant` | function | Извлекает значение дискриминанта перечисления | [→ ast-helpers.ts:345-358] |
| `extractMacroRules` | function | Извлекает правила из определения макроса | [→ ast-helpers.ts:365-372] |
| `extractUseTree` | function | Извлекает дерево импортов из use выражения | [→ ast-helpers.ts:384-426] |
| `resolveName` | function | Разрешает полное имя идентификатора в контексте | [→ ast-helpers.ts:438-462] |
| `identifyPatterns` | function | Анализирует код на наличие паттернов Rust | [→ pattern-identifier.ts:19-50] |
| `identifyBuilderPattern` | function | Обнаруживает использование паттерна Builder | [→ pattern-identifier.ts:59-81] |
| `identifyIteratorPattern` | function | Обнаруживает реализации Iterator трейта | [→ pattern-identifier.ts:86-116] |
| `identifyErrorHandlingPatterns` | function | Находит паттерны обработки ошибок | [→ pattern-identifier.ts:125-156] |
| `identifyOwnershipPatterns` | function | Выявляет паттерны владения памятью | [→ pattern-identifier.ts:161-192] |
| `identifyUnsafePatterns` | function | Обнаруживает блоки небезопасного кода | [→ pattern-identifier.ts:211-233] |

## Files

- **ast-helpers.ts** — Помощники для обхода и извлечения данных из AST
- **index.ts** — Переэкспорт всех модулей парсера Rust
- **pattern-identifier.ts** — Определение проектных и языковых паттернов Rust
