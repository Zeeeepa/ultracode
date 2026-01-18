# Kotlin

*Last updated: 2026-01-18*

Определения типов для парсера Kotlin с контекстом и извлеченной информацией.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `AnnotationInfo` | interface | Информация об аннотациях, извлеченная из модификаторов | [→ types.ts:75-78] |
| `AntlrContext` | interface | Обобщенный контекст ANTLR с информацией о расположении | [→ types.ts:274-280] |
| `AntlrContextWithChildren` | interface | Контекст ANTLR с дочерними узлами дерева | [→ types.ts:285-289] |
| `AntlrToken` | interface | Интерфейс токена ANTLR с информацией о позиции | [→ types.ts:263-269] |
| `BranchInfo` | interface | Данные об условных ветвлениях в потоке выполнения | [→ types.ts:114-118] |
| `CallInfo` | interface | Данные о вызовах функций и методов в коде | [→ types.ts:45-66] |
| `ComplexityMetrics` | interface | Метрики сложности кода для функций и методов | [→ types.ts:224-232] |
| `ControlFlowInfo` | interface | Полная структура потока управления с ветвлениями и циклами | [→ types.ts:149-158] |
| `CoroutineInfo` | interface | Информация о корутинах, сопрограммах и операторах suspend | [→ types.ts:207-215] |
| `ExceptionInfo` | interface | Данные об обработке исключений и операторах throw | [→ types.ts:131-135] |
| `InheritanceInfo` | interface | Данные о наследовании для классов и интерфейсов | [→ types.ts:87-90] |
| `KDocInfo` | interface | Разобранная документация KDoc с параметрами и возвращаемыми значениями | [→ types.ts:176-198] |
| `KDocParam` | interface | Параметр документации KDoc с типом и описанием | [→ types.ts:167-171] |
| `KtorRouteInfo` | interface | Информация о маршрутах фреймворка Ktor HTTP API | [→ types.ts:250-254] |
| `LocationInfo` | type | Информация о расположении узлов в синтаксическом дереве | [→ types.ts:33-36] |
| `LoopInfo` | interface | Информация о циклах for, while и do-while в коде | [→ types.ts:123-126] |
| `ParameterInfo` | interface | Информация о параметрах функций и конструкторов | [→ types.ts:99-105] |
| `ParserContext` | interface | Контекст, передаваемый через все функции парсинга | [→ types.ts:17-24] |
| `ReturnInfo` | interface | Информация об операторах возврата в функциях | [→ types.ts:140-144] |
| `ViewModelInfo` | interface | Информация о паттерне Android ViewModel в коде | [→ types.ts:241-245] |

## Files

- **types.ts** — Основной файл модуля с экспортами всех типов парсера
