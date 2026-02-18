# Language Configs

*Last updated: 2026-01-10*

Модуль конфигураций языков программирования для парсинга кода.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `isMagicMethodNode` | function | Проверяет, является ли узел методом магии Python. | [→ python-helpers.ts:14-19] |
| `isAsyncNode` | function | Проверяет, является ли узел асинхронной конструкцией Python. | [→ python-helpers.ts:24-27] |
| `isGeneratorNode` | function | Определяет, является ли узел генератором или yield выражением. | [→ python-helpers.ts:32-35] |
| `isComprehensionNode` | function | Проверяет, является ли узел list/dict/set comprehension. | [→ python-helpers.ts:40-48] |
| `isContextManagerNode` | function | Определяет контекстный менеджер (with statement). | [→ python-helpers.ts:53-56] |
| `isExceptionHandlingNode` | function | Проверяет, обрабатывает ли узел исключения Python. | [→ python-helpers.ts:61-70] |
| `isDecoratorNode` | function | Определяет, является ли узел декоратором функции или класса. | [→ python-helpers.ts:75-78] |
| `isSpecialClassNode` | function | Проверяет dataclass и другие специальные классы. | [→ python-helpers.ts:81-98] |
| `getPythonNodeCategory` | function | Возвращает расширённую категорию типа узла Python. | [→ python-helpers.ts:103-143] |
| `LANGUAGE_CONFIGS` | const | Словарь конфигураций всех поддерживаемых языков программирования. | [→ registry.ts:31-53] |
| `getLanguageConfig` | function | Получает конфигурацию по названию языка программирования. | [→ registry.ts:58-60] |
| `getFileConfig` | function | Получает конфигурацию языка по пути файла автоматически. | [→ registry.ts:58-60] |
| `isFunctionNode` | function | Проверяет, является ли узел определением функции языка. | [→ registry.ts:58-60] |
| `isClassNode` | function | Проверяет, является ли узел определением класса языка. | [→ registry.ts:81-84] |
| `isImportNode` | function | Проверяет, является ли узел импортом модуля или пакета. | [→ registry.ts:89-92] |
| `isExportNode` | function | Проверяет, является ли узел экспортом или переэкспортом. | [→ registry.ts:97-100] |
| `isTypeNode` | function | Проверяет, является ли узел определением типа или интерфейса. | [→ registry.ts:106-121] |
| `validateConfigurations` | function | Валидирует все конфигурации языков при запуске приложения. | [→ registry.ts:106-121] |

## Files

- **index.ts** — Переэкспортирует конфигурации всех поддерживаемых языков программирования.
- **python-helpers.ts** — Утилиты для определения специальных типов узлов Python AST.
- **registry.ts** — Центральный реестр конфигураций всех языков с функциями поиска.
