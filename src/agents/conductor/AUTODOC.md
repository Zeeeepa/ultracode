# Conductor

*Last updated: 2026-01-11*

Модуль оркестрации задач для управления агентами и анализа сложности.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `analyzeTaskComplexity` | function | Анализирует сложность задачи и стратегию делегирования. | [→ task-analysis.ts:13-63] |
| `ConductorConfig` | interface | Интерфейс конфигурации оркестратора проводника. | [→ types.ts:9-18] |
| `ConductorConfigOverrides` | type | Тип переопределения конфигурации проводника. | [→ types.ts:48-50] |
| `createMethodProposalTemplate` | function | Создает шаблон предложений для типа задачи. | [→ method-proposals.ts:78-101] |
| `DEFAULT_CONDUCTOR_CONFIG` | const | Полная конфигурация проводника с установками. | [→ config.ts:18-27] |
| `DEFAULT_RESOURCE_CONSTRAINTS` | const | Объект с ограничениями ресурсов по умолчанию. | [→ config.ts:11-16] |
| `generateMethodProposals` | function | Генерирует пять предложений методов выполнения. | [→ method-proposals.ts:14-73] |
| `getConductorAgentDefaults` | function | Функция для получения конфигурации агента проводника. | [→ config.ts:29-32] |
| `getTaskTypeKey` | function | Определяет тип задачи для выбора шаблона. | [→ method-proposals.ts:106-114] |
| `initializeMethodProposalTemplates` | function | Инициализирует шаблоны предложений для типов. | [→ method-proposals.ts:119-128] |
| `isDirectImplementation` | function | Проверяет попытку обхода делегирования задачи. | [→ task-analysis.ts:80-80] |
| `isIndexingTask` | function | Проверяет является ли задача операцией индексирования. | [→ task-analysis.ts:68-74] |
| `MethodProposal` | interface | Интерфейс предложения метода выполнения. | [→ types.ts:37-46] |
| `SubTask` | interface | Интерфейс подзадачи с целевым агентом. | [→ types.ts:28-35] |
| `TaskComplexityAnalysis` | interface | Интерфейс результата анализа сложности задачи. | [→ types.ts:20-26] |

## Files

- **config.ts** — Конфигурация и значения по умолчанию для проводника.
- **index.ts** — Переэкспорт всех модулей проводника.
- **method-proposals.ts** — Генерация стратегий выполнения задач.
- **task-analysis.ts** — Анализ сложности и определение делегирования.
- **types.ts** — Определения типов для оркестратора проводника.
