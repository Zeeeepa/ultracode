# Extractors

*Last updated: 2026-01-18*

Модуль извлечения метаданных из Kotlin AST для анализа кода

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `calculateClassComplexity` | function | Анализирует сложность класса целиком | [→ complexity-analyzer.ts:361-365] |
| `calculateCognitiveComplexity` | function | Вычисляет когнитивную сложность в стиле Sonar | [→ complexity-analyzer.ts:116-181] |
| `calculateCommentDensity` | function | Вычисляет процент строк с комментариями | [→ complexity-analyzer.ts:252-289] |
| `calculateComplexity` | function | Вычисляет все метрики сложности кода функции | [→ complexity-analyzer.ts:28-62] |
| `calculateCyclomaticComplexity` | function | Считает циклическую сложность по McCabe методу | [→ complexity-analyzer.ts:72] |
| `calculateKotlinSpecificComplexity` | function | Вычисляет сложность специфичную для Kotlin | [→ complexity-analyzer.ts:413-418] |
| `calculateLinesOfCode` | function | Подсчитывает строки логического кода функции | [→ complexity-analyzer.ts:209-240] |
| `calculateNestingDepth` | function | Определяет максимальную глубину вложенности кода | [→ complexity-analyzer.ts:298-314] |
| `calculatePhysicalLines` | function | Считает физические строки включая пустые комментарии | [→ complexity-analyzer.ts:245-247] |
| `COMPLEXITY_THRESHOLDS` | const | Пороги оценки уровней сложности кода | [→ complexity-analyzer.ts:455-476] |
| `exceedsThresholds` | function | Проверяет превышение допустимых порогов сложности | [→ complexity-analyzer.ts:578-585] |
| `extractCalls` | function | Извлекает все вызовы функций из тела функции Kotlin | [→ call-extractor.ts:37-46] |
| `extractCallsDetailed` | const | Извлекает детальную информацию о вызовах функций | [→ call-extractor.ts:62-91] |
| `extractCallsSimple` | function | Возвращает имена вызовов в виде массива строк | [→ call-extractor.ts:51-57] |
| `extractControlFlow` | function | Извлекает информацию о потоке управления из функции | [→ control-flow-extractor.ts:30-44] |
| `extractKDoc` | function | Извлекает и парсит KDoc комментарий перед декларацией | [→ doc-extractor.ts:30-41] |
| `extractKDocFromSource` | function | Извлекает KDoc из исходного кода Kotlin | [→ doc-extractor.ts:344-393] |
| `formatComplexityMetrics` | function | Форматирует метрики сложности для отображения | [→ complexity-analyzer.ts:565-573] |
| `getCaughtExceptionTypes` | function | Извлекает типы перехватываемых исключений | [→ control-flow-extractor.ts:406-408] |
| `getComplexityRating` | function | Определяет рейтинг качества по метрикам сложности | [→ complexity-analyzer.ts:481-510] |
| `getControlFlowStats` | function | Получает статистику элементов потока управления | [→ control-flow-extractor.ts:376-384] |
| `getRefactoringSuggestions` | function | Предлагает рекомендации по рефакторингу кода | [→ complexity-analyzer.ts:515-556] |
| `hasExceptionHandling` | function | Проверяет наличие обработки исключений в коде | [→ control-flow-extractor.ts:399-401] |
| `hasLabeledReturns` | function | Определяет наличие помеченных операторов возврата | [→ control-flow-extractor.ts:413-415] |
| `isCoroutineCall` | function | Проверяет является ли вызов корутиной Kotlin | [→ call-extractor.ts:357-359] |
| `isPotentialSuspendCall` | function | Проверяет возможность приостановки вызова функции | [→ call-extractor.ts:371-385] |
| `isScopeFunctionCall` | function | Определяет является ли вызов функцией области видимости | [→ call-extractor.ts:364-366] |
| `parseKDocText` | function | Парсит текст KDoc в структурированный формат | [→ doc-extractor.ts:46-49] |

## Files

- **call-extractor.ts** — Извлечение вызовов функций и методов из AST Kotlin
- **complexity-analyzer.ts** — Вычисление метрик сложности кода Kotlin функций
- **control-flow-extractor.ts** — Анализ потока управления и структур ветвления Kotlin
- **doc-extractor.ts** — Парсинг KDoc комментариев и документации Kotlin кода
