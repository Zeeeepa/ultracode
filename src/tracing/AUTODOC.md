# Semantic Tracing Module

Модуль семантической статической трассировки для анализа потока выполнения кода без его запуска.

## Архитектура

```
src/tracing/
├── types.ts              # Типы и интерфейсы
├── path-builder.ts       # Построение графа и поиск путей
├── trace-engine.ts       # Основной движок трассировки
├── state-tracker.ts      # Отслеживание состояний
├── condition-analyzer.ts # Анализ условий и точек принятия решений
├── data-flow-analyzer.ts # Анализ потока данных
├── output-formatter.ts   # Форматирование вывода (text, Mermaid)
└── index.ts              # Экспорты модуля
```

## Ключевые компоненты

### PathBuilder

Оптимизированный построитель графа вызовов с BFS/DFS алгоритмами.

- **buildAdjacencyGraph**: Строит граф смежности из storage
- **findPathsForward**: BFS поиск путей от A к B
- **findPathsBackward**: DFS поиск обратных путей
- **enrichPaths**: Обогащает пути метаданными (состояния, условия)

Оптимизации:
- Кэширование графа и узлов
- Пакетная обработка (batch 16)
- Loop unrolling для обхода соседей

### TraceEngine

Координирует все анализаторы для выполнения трассировки.

**Методы:**
- `traceFlow(from, to)`: Трассировка от точки A до B
- `traceBackwards(target)`: Обратная трассировка от цели

### StateTracker

Отслеживает изменения состояний вдоль путей выполнения.

**Методы:**
- `detectStateChanges(entity)`: Обнаружение изменений состояния
- `detectStateReads(entity)`: Обнаружение чтений состояния
- `analyzeStateImpact(state, scenarios)`: Анализ влияния состояния
- `buildStateDependencies(entityId)`: Построение зависимостей

### ConditionAnalyzer

Анализирует точки принятия решений в коде.

**Типы точек решений:**
- `validation`: Валидация входных данных
- `api_response`: Обработка ответов API
- `state_mutation`: Изменение состояния
- `guard`: Guard условия
- `loop`: Контроль цикла
- `error_handling`: try-catch
- `feature_flag`: Переключатели фич

### DataFlowAnalyzer

Отслеживает поток данных от источников к целевому состоянию.

**Источники данных:**
- API: fetch, axios, http
- Storage: localStorage, database
- Props: props, input, param
- State: state, store, redux
- Config: config, settings, env
- User Input: input, form, event

### OutputFormatter

Форматирует результаты для человекочитаемого вывода.

**Форматы:**
- Text: Структурированный текст с иконками
- Mermaid: Диаграммы последовательностей и flowchart

## MCP Tools

### trace_flow
```typescript
trace_flow({
  from: "handleLogin",
  to: "redirectToHome",
  trackStates: true,
  trackConditions: true,
  maxDepth: 15,
  format: "sequence"
})
```

### trace_backwards
```typescript
trace_backwards({
  target: "FinishTask",
  question: "why_not_called", // | "what_affects" | "dependencies"
  depth: 15,
  includeStates: true
})
```

### trace_data_flow
```typescript
trace_data_flow({
  entryPoint: "AppInit",
  targetState: "startPage",
  dataSources: ["config", "api:fetchUser"],
  trackTransformations: true
})
```

### analyze_state_impact
```typescript
analyze_state_impact({
  state: "isAuthenticated",
  scenarios: [
    { value: true, label: "logged in" },
    { value: false, label: "logged out" }
  ]
})
```

### find_decision_points
```typescript
find_decision_points({
  scenario: "checkout flow",
  includeGuards: true,
  includeEffects: true,
  groupBy: "impact"
})
```

## Паттерны использования

### Анализ почему метод не вызывается
```
trace_backwards(target: "FinishTask", question: "why_not_called")
```
Вернёт:
- Список вызывающих методов с вероятностями
- Блокирующие условия
- Зависимости от состояний
- Диагноз с рекомендациями

### Понимание потока данных
```
trace_data_flow(entryPoint: "handleRequest", targetState: "responseData")
```
Вернёт:
- Источники данных
- Трансформации (parse, map, validate)
- Ветвления на основе данных
- Матрицу поведения для разных входов

### Анализ влияния состояния
```
analyze_state_impact(state: "user.role", scenarios: [{value: "admin"}, {value: "user"}])
```
Вернёт:
- Все использования состояния
- Доступные/заблокированные пути для каждого сценария
- Включённые фичи
- Конфликты и рекомендации

## Интеграция с семантическим поиском

Модуль использует семантический поиск (если доступен) для:
- Нечёткого поиска entry/exit points
- Улучшения качества анализа на больших кодовых базах
- Поддержки естественно-языковых запросов

## Зависимости

- `../types/storage.js`: GraphStorage, Entity, Relationship
- `../storage/graph-storage.js`: Хранение графа
- Опционально: SemanticSearchService для улучшенного поиска
