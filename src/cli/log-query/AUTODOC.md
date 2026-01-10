# Log Query

*Last updated: 2026-01-10*

Модуль для чтения, фильтрации и анализа логов с поддержкой временных диапазонов

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `LogStats` | interface | Интерфейс для накопления статистики по логам | [→ log-reader.ts:17-28] |
| `createStats` | function | Создание пустого объекта статистики логов | [→ log-reader.ts:33-46] |
| `updateStats` | function | Обновление статистики при добавлении записи | [→ log-reader.ts:51-71] |
| `formatEntry` | function | Форматирование записи лога для вывода | [→ log-reader.ts:76-113] |
| `formatFields` | function | Форматирование выбранных полей записи логов | [→ log-reader.ts:118-123] |
| `getDefaultLogDir` | function | Получение директории логов по умолчанию | [→ log-reader.ts:128-145] |
| `findLogFiles` | function | Поиск всех файлов логов в директории | [→ log-reader.ts:152-173] |
| `followLogFile` | function | Отслеживание новых строк в файле логов | [→ log-reader.ts:221-271] |
| `EmbeddingSession` | interface | Интерфейс сессии встраивания текста | [→ log-reader.ts:276-284] |
| `collectEmbeddingSessions` | function | Сбор всех встраиваний из логов | [→ log-reader.ts:290-379] |
| `formatEmbeddingStats` | function | Форматирование статистики встраиваний | [→ log-reader.ts:384-419] |
| `formatStats` | function | Форматирование полной статистики логов | [→ log-reader.ts:424-474] |
| `KVFilterOp` | type | Тип операции сравнения для фильтров | [→ query-parser.ts:13] |
| `KVFilter` | interface | Интерфейс фильтра по ключ-значение парам | [→ query-parser.ts:18-22] |
| `LogQueryFilter` | interface | Полная структура фильтра запроса логов | [→ query-parser.ts:27-37] |
| `OutputOptions` | interface | Опции форматирования и вывода результатов | [→ query-parser.ts:42-51] |
| `parseLevels` | function | Парсинг строки уровней логирования (E,W,I,D,T) | [→ query-parser.ts:57-69] |
| `patternToRegex` | function | Конвертирование глоб-паттерна в регулярное выражение | [→ query-parser.ts:75-81] |
| `parseKVFilter` | function | Парсинг фильтра ключ-значение из строки | [→ query-parser.ts:87-108] |
| `parseArgs` | function | Парсинг всех аргументов командной строки | [→ query-parser.ts:113-117] |
| `matchesFilter` | function | Проверка совпадения записи с фильтром | [→ query-parser.ts:308-387] |
| `parseRelativeTime` | function | Парсинг относительного времени (5m, 1h) | [→ time-parser.ts:33-44] |
| `parseAbsoluteTime` | function | Парсинг абсолютного времени в формате YYYYMMDD | [→ time-parser.ts:50-110] |
| `parseTime` | function | Парсинг времени (относительного или абсолютного) | [→ time-parser.ts:115-122] |
| `formatRelativeTime` | function | Форматирование временного интервала в строку | [→ time-parser.ts:127-143] |
| `TimeRange` | interface | Интерфейс для диапазона времени (от-до) | [→ time-parser.ts:148-151] |
| `parseTimeRange` | function | Парсинг двух временных точек в диапазон | [→ time-parser.ts:153-166] |

## Files

- `log-query-cli.ts`
- **log-reader.ts** — Чтение и обработка файлов логов с накоплением статистики
- **query-parser.ts** — Парсинг аргументов командной строки в структуры фильтров
- **time-parser.ts** — Парсинг относительных и абсолютных временных форматов
