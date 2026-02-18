# Addons

Модуль управления подключаемыми надстройками для анализа C# через Roslyn.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CSharpEntityMetadata` | interface | Метаданные сущности: namespace, типы, сигнатуры, диагностика. | [→ csharp-native-parser.ts:33-53] |
| `CSharpNativeParser` | class | Фасад парсера C# с методами parseFile и parseBatch. | [→ csharp-native-parser.ts:59-131] |
| `CSharpParsedEntity` | interface | Распарсенная сущность C# с метаданными и иерархией. | [→ csharp-native-parser.ts:15-17] |
| `CSharpParseResult` | interface | Результат парсинга C# файла с массивом сущностей. | [→ csharp-native-parser.ts:15-17] |
| `DiagnosticsHandler` | type | Обработчик события получения диагностических данных. | [→ roslyn-client.ts:48] |
| `ensureRoslynStarted` | function | Гарантировать запуск Roslyn и вернуть CSharpNativeParser. | [→ roslyn-lifecycle.ts:88-109] |
| `findSolutionFile` | function | Поиск .sln или .slnx файла в корневой директории. | [→ roslyn-lifecycle.ts:33-45] |
| `getCSharpParser` | function | Получить инициализированный парсер C# для текущего проекта. | [→ roslyn-lifecycle.ts:145-151] |
| `getRoslynClient` | function | Получить или создать синглтон RoslynAddonClient. | [→ roslyn-lifecycle.ts:88] |
| `isRoslynAvailable` | function | Проверка наличия Ultrasharp.Addon.dll на диске. | [→ roslyn-lifecycle.ts:51-78] |
| `PhaseChangedHandler` | type | Обработчик события изменения фазы инициализации Roslyn. | [→ roslyn-client.ts:48] |
| `RoslynAddonClient` | class | IPC клиент для управления подпроцессом Ultrasharp.Addon.dll. | [→ roslyn-client.ts:84-364] |
| `RoslynClientOptions` | interface | Опции конфигурации для подпроцесса Roslyn клиента. | [→ roslyn-client.ts:29-40] |
| `shutdownRoslynClient` | function | Остановить Roslyn подпроцесс и очистить ресурсы. | [→ roslyn-lifecycle.ts:156-183] |

## Files

- **csharp-native-parser.ts** — Парсер C# кода с использованием Roslyn через подпроцесс.
- **index.ts** — Реэкспорт всех типов и функций модуля addons.
- **roslyn-client.ts** — IPC клиент для управления подпроцессом Ultrasharp.Addon.
- **roslyn-lifecycle.ts** — Менеджер жизненного цикла синглтона Roslyn клиента.
