# Logging

*Last updated: 2026-01-10*

Система логирования с фиксированными позициями полей для отслеживания сборок и событий приложения.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `getBuildHash` | function | Получить хеш коммита гита или версию сборки | [→ build-info.ts:17-75] |
| `getPid` | function | Получить идентификатор текущего процесса приложения | [→ build-info.ts:81-87] |
| `setPid` | function | Установить пользовательский идентификатор процесса вручную | [→ build-info.ts:92-94] |
| `resetBuildInfo` | function | Сбросить кешированные значения информации сборки | [→ build-info.ts:99-102] |
| `getBuildInfo` | function | Получить объект с хешем и идентификатором процесса | [→ build-info.ts:107] |
| `FixedLogger` | class | Класс логгера с фиксированными позициями полей | [→ fixed-logger.ts:22-307] |
| `getLogger` | function | Получить глобальный экземпляр логгера приложения | [→ fixed-logger.ts:318-323] |
| `initLogger` | function | Инициализировать логгер с конфигурацией и параметрами | [→ fixed-logger.ts:328-334] |
| `setProjectHash` | function | Установить хеш проекта для всех логов приложения | [→ fixed-logger.ts:339-341] |
| `log` | const | Глобальный объект для логирования событий приложения | [→ fixed-logger.ts:346-380] |
| `serializeKV` | function | Преобразовать пары ключ-значение в строку | [→ kv-serializer.ts:70-99] |
| `ParsedKVPair` | interface | Интерфейс распарсенной пары ключ-значение из лога | [→ kv-serializer.ts:102-106] |
| `parseKV` | function | Распарсить строку пар ключ-значение в объект | [→ kv-serializer.ts:114-183] |
| `formatDuration` | function | Форматировать длительность операции в миллисекундах | [→ kv-serializer.ts:190-192] |
| `formatMemory` | function | Форматировать объем памяти в мегабайтах | [→ kv-serializer.ts:198-200] |
| `kvOpStart` | function | Создать пары ключ-значение для начала операции | [→ kv-serializer.ts:205-207] |
| `kvOpEnd` | function | Создать пары ключ-значение для конца операции | [→ kv-serializer.ts:212-214] |
| `kvError` | function | Создать пары ключ-значение для ошибки логирования | [→ kv-serializer.ts:219-222] |
| `formatTimestamp` | function | Форматировать дату в YYYYMMDD-HHmmss.mmm формат | [→ log-formatter.ts:18-27] |
| `parseTimestamp` | function | Распарсить строку временной метки в объект даты | [→ log-formatter.ts:34-90] |
| `formatPid` | function | Форматировать идентификатор процесса в пять символов | [→ log-formatter.ts:47-49] |
| `formatBuildHash` | function | Форматировать хеш сборки в восемь символов | [→ log-formatter.ts:54-56] |
| `formatProjectHash` | function | Форматировать хеш проекта в восемь символов | [→ log-formatter.ts:61-63] |
| `formatModule` | function | Форматировать имя модуля в двадцать символов | [→ log-formatter.ts:68-70] |
| `formatEvent` | function | Форматировать имя события в двадцать символов | [→ log-formatter.ts:75-77] |
| `formatLogLine` | function | Форматировать объект лога в строку с позициями | [→ log-formatter.ts:94-104] |
| `parseLogLine` | function | Распарсить строку лога в структурированный объект | [→ log-formatter.ts:109-142] |
| `formatLogLineColored` | function | Форматировать строку лога с цветовым выделением | [→ log-formatter.ts:148-163] |
| `extractFields` | function | Извлечь отдельные поля из строки лога | [→ log-formatter.ts:176-213] |
| `LogLevelChar` | type | Тип символа уровня логирования (E/W/I/D/T) | [→ log-types.ts:8] |
| `LOG_LEVEL_VALUES` | const | Числовые значения уровней логирования для фильтрации | [→ log-types.ts:8-8] |
| `LOG_LEVEL_NAMES` | const | Полные наименования уровней логирования для отображения | [→ log-types.ts:20-26] |
| `LOG_FIELD_POSITIONS` | const | Позиции начала и конца полей в строке лога | [→ log-types.ts:29-44] |
| `LOG_FIELD_LENGTHS` | const | Длины фиксированных полей в формате логов | [→ log-types.ts:47-55] |
| `KV_CONSTRAINTS` | const | Ограничения на размер ключей и значений в логах | [→ log-types.ts:58-62] |
| `KVValue` | type | Тип примитивного значения в парах ключ-значение | [→ log-types.ts:65] |
| `KVPairs` | type | Объект с парами ключ-значение для логирования событий | [→ log-types.ts:68] |
| `STANDARD_KEYS` | const | Стандартные ключи для часто используемых значений | [→ log-types.ts:68-68] |
| `LogEntry` | interface | Структура полной записи лога с всеми полями | [→ log-types.ts:93-102] |
| `ParsedLogLine` | interface | Распарсенная строка лога из файла с метаданными | [→ log-types.ts:105-108] |
| `FixedLoggerConfig` | interface | Конфигурация параметров работы логгера | [→ log-types.ts:111-126] |
| `DEFAULT_LOGGER_CONFIG` | const | Конфигурация по умолчанию для создания логгера | [→ log-types.ts:129-137] |
| `MODULES` | const | Перечисление доступных имен модулей приложения | [→ log-types.ts:140-160] |
| `ModuleName` | type | Тип строки с допустимыми именами модулей | [→ log-types.ts:162] |
| `LoggerAdapter` | class | Класс адаптера совместимости со старым логгером | [→ logger-adapter.ts:135-275] |
| `createLoggerAdapter` | function | Функция создания адаптера для старого API логирования | [→ logger-adapter.ts:280-282] |

## Files

- **build-info.ts** — Получение хеша коммита и информации о процессе
- **fixed-logger.ts** — Основной логгер с буферизацией и ротацией файлов
- **index.ts** — Экспорт публичного API всего модуля логирования
- **kv-serializer.ts** — Сериализация и парсинг пар ключ-значение
- **log-formatter.ts** — Форматирование и парсинг строк логов
- **log-types.ts** — Типы данных и константы для логирования
- **logger-adapter.ts** — Адаптер совместимости со старым логгером
