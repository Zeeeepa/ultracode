# Статическая трассировка

🌐 **Language**: [EN](./tracing.md) | [RU]

---

Инструменты для анализа потока выполнения и данных без запуска кода.

---

## trace_flow

Трассировка пути выполнения от точки A до точки B. Находит все возможные пути и анализирует состояния, условия и async-границы.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `from` | string | да | Начальная точка (имя функции или семантический запрос) |
| `to` | string | да | Конечная точка (имя функции или семантический запрос) |
| `trackStates` | boolean | нет | Отслеживать изменения состояния (по умолчанию true) |
| `trackConditions` | boolean | нет | Отслеживать условия/ветвления (по умолчанию true) |
| `maxDepth` | number | нет | Максимальная глубина (по умолчанию 15) |
| `format` | string | нет | Формат: `sequence`, `tree`, `graph`, `mermaid` |

### Возвращает

```typescript
{
  paths: Array<{
    steps: Array<{
      entityId: string;
      name: string;
      filePath: string;
      line: number;
      type: "call" | "await" | "condition" | "state_change";
    }>;
    conditions: string[];      // Условия на пути
    stateChanges: string[];    // Изменения состояния
    isAsync: boolean;
    confidence: number;
  }>;
  mermaid?: string;            // Mermaid диаграмма (если format=mermaid)
  summary: string;
}
```

### Примеры

**Базовая трассировка:**
```
trace_flow({
  from: "handleLogin",
  to: "saveUserSession"
})
```

**С Mermaid диаграммой:**
```
trace_flow({
  from: "API endpoint /users",
  to: "database query",
  format: "mermaid",
  trackStates: true
})
```

**Аннотации границ API-контрактов**: Когда пути трассировки пересекают сущности API-контрактов (Swagger/OpenAPI, Protobuf/gRPC или GraphQL), шаги аннотируются `crossesApiContract: true` и `contractInfo` (type, endpoint, schemaName). Добавляется предупреждение на уровне пути: "Путь пересекает границу API-контракта." См. [api-contracts_ru.md](api-contracts_ru.md).

**Аннотации границ баз данных**: Когда пути трассировки пересекают операции с базами данных, шаги аннотируются `crossesDbBoundary: true` и `dbInfo` (type: sql/orm/redis, operation: read/write, tableName). См. [database-schema_ru.md](database-schema_ru.md).

---

## trace_backwards

Обратная трассировка — находит почему функция может не вызываться или что на неё влияет.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `target` | string | да | Целевая функция/метод |
| `question` | string | да | Тип анализа: `why_not_called`, `what_affects`, `dependencies` |
| `depth` | number | нет | Глубина обратной трассировки (по умолчанию 15) |
| `includeStates` | boolean | нет | Включать зависимости от состояния |
| `includeEffects` | boolean | нет | Включать побочные эффекты |

### Типы анализа

- **why_not_called** — почему функция может не вызываться (блокирующие условия)
- **what_affects** — что влияет на поведение функции
- **dependencies** — полный граф зависимостей

### Возвращает

```typescript
{
  target: { name: string; filePath: string; };
  callers: Array<{
    entityId: string;
    name: string;
    filePath: string;
    condition?: string;      // Условие вызова
  }>;
  blockingConditions: Array<{
    condition: string;
    location: string;
    probability: "likely" | "possible" | "unlikely";
  }>;
  stateDependencies: string[];
  diagnosis: string;
}
```

### Примеры

**Почему не вызывается:**
```
trace_backwards({
  target: "sendNotification",
  question: "why_not_called"
})
```

**Что влияет:**
```
trace_backwards({
  target: "calculatePrice",
  question: "what_affects",
  includeStates: true
})
```

---

## trace_data_flow

Трассировка потока данных — как данные из источников влияют на целевое состояние.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entryPoint` | string | да | Точка входа (функция) |
| `targetState` | string | да | Целевое состояние для трассировки |
| `dataSources` | string[] | нет | Источники данных (автоопределение если не указано) |
| `trackTransformations` | boolean | нет | Отслеживать трансформации данных |

### Возвращает

```typescript
{
  flows: Array<{
    source: string;
    target: string;
    transformations: Array<{
      location: string;
      operation: string;      // "map", "filter", "merge", etc.
    }>;
    branches: Array<{
      condition: string;
      outcome: string;
    }>;
  }>;
  behaviorMatrix: Array<{
    input: string;
    output: string;
    conditions: string[];
  }>;
}
```

### Примеры

```
trace_data_flow({
  entryPoint: "processOrder",
  targetState: "orderStatus",
  trackTransformations: true
})
```

---

## analyze_state_impact

Анализ влияния состояния на разные сценарии выполнения.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `state` | string | да | Переменная состояния |
| `scenarios` | array | да | Сценарии для анализа |
| `scope` | string | нет | Область анализа (семантический запрос) |

### Формат сценариев

```typescript
scenarios: [
  { value: true, label: "isAuthenticated = true" },
  { value: false, label: "isAuthenticated = false" }
]
```

### Возвращает

```typescript
{
  state: string;
  usages: Array<{
    entityId: string;
    name: string;
    usageType: "read" | "write" | "condition";
  }>;
  scenarioAnalysis: Array<{
    scenario: string;
    reachablePaths: string[];
    blockedPaths: string[];
    sideEffects: string[];
  }>;
  conflicts: string[];
  rippleEffects: string[];
}
```

### Примеры

```
analyze_state_impact({
  state: "isAdmin",
  scenarios: [
    { value: true, label: "Администратор" },
    { value: false, label: "Обычный пользователь" }
  ],
  scope: "модуль управления пользователями"
})
```

---

## find_decision_points

Поиск всех точек принятия решений в сценарии выполнения.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `scenario` | string | да | Сценарий для анализа |
| `includeGuards` | boolean | нет | Включать guard-условия (по умолчанию true) |
| `includeEffects` | boolean | нет | Включать побочные эффекты (по умолчанию true) |
| `groupBy` | string | нет | Группировка: `impact`, `location`, `type` |

### Типы точек решений

- **validation** — проверки валидации
- **api_response** — обработка ответов API
- **state_mutation** — изменения состояния
- **guard** — guard-условия
- **loop** — условия циклов
- **error_handling** — обработка ошибок
- **feature_flag** — feature flags

### Возвращает

```typescript
{
  decisionPoints: Array<{
    type: string;
    location: { file: string; line: number; };
    condition: string;
    outcomes: Array<{
      branch: "true" | "false" | "else";
      effects: string[];
    }>;
    impact: "high" | "medium" | "low";
  }>;
  mermaid?: string;         // Flowchart диаграмма
  summary: string;
}
```

### Примеры

```
find_decision_points({
  scenario: "оформление заказа",
  groupBy: "impact"
})
```
