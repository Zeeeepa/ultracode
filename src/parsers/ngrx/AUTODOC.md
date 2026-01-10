# Ngrx

*Last updated: 2026-01-10*

Парсер и построитель графа для NgRx паттернов управления состоянием.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `buildNgRxRelationships` | function | Преобразует анализ NgRx в отношения графа. | [→ builders.ts:14-94] |
| `buildNgRxEntities` | function | Преобразует анализ NgRx в сущности графа. | [→ builders.ts:99-178] |
| `NgRxAction` | interface | Интерфейс действия NgRx с типом и пропсами. | [→ types.ts:12-19] |
| `NgRxEffect` | interface | Интерфейс эффекта с зависимостями действий. | [→ types.ts:24-32] |
| `NgRxReducerHandler` | interface | Интерфейс обработчика редьюсера с изменениями. | [→ types.ts:37-40] |
| `NgRxReducer` | interface | Интерфейс редьюсера с обработчиками и состоянием. | [→ types.ts:45-51] |
| `NgRxSelector` | interface | Интерфейс селектора с зависимостями от других. | [→ types.ts:56-62] |
| `NgRxDispatch` | interface | Интерфейс вызова dispatch с именем действия. | [→ types.ts:67-73] |
| `NgRxSelect` | interface | Интерфейс вызова select с именем селектора. | [→ types.ts:78-83] |
| `NgRxAnalysis` | interface | Полный результат анализа NgRx конструктов. | [→ types.ts:88-95] |
| `NgRxRelationship` | interface | Интерфейс отношения для хранения в графе. | [→ types.ts:100-108] |

## Files

- **builders.ts** — Построение сущностей и отношений из анализа NgRx.
- **index.ts** — Переэкспорт всей функциональности модуля NgRx.
- **types.ts** — Типы данных для конструктов NgRx состояния.
