# RFC: Semantic Tracing Tools

## Проблема

Разработчики часто сталкиваются с задачами понимания поведения кода:

1. **"Почему метод не срабатывает?"** — нужно найти все условия и состояния, влияющие на вызов
2. **"Что происходит между точками A и B?"** — какие состояния меняются, в какой последовательности
3. **"Откуда берётся это поведение?"** — от каких данных зависит код, какие ветки срабатывают

Существующие инструменты (Grep, статический анализ) не отвечают на эти вопросы.

## Решение: Semantic Tracing

**Идея**: Комбинировать семантический поиск с анализом графа вызовов и control flow для построения "историй выполнения".

### Ключевые концепции

```
┌─────────────────────────────────────────────────────────────┐
│                    SEMANTIC TRACING                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Entry Point]  ──semantic──>  [Key Points]               │
│        │                             │                      │
│        v                             v                      │
│   [State Changes]  <──graph──>  [Conditions]               │
│        │                             │                      │
│        v                             v                      │
│   [Effects/Mutations]  ──trace──>  [Exit Point]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Предлагаемые инструменты

### 1. `trace_flow` — Трассировка потока выполнения

**Задача**: От точки A до точки B — что происходит?

```typescript
trace_flow({
  from: "startPage",           // Начальная точка (семантический поиск)
  to: "goToNextPage",          // Конечная точка
  trackStates: true,           // Отслеживать изменения состояний
  trackConditions: true,       // Отслеживать условия (if/switch/case)
  maxDepth: 20,                // Глубина анализа
  format: "sequence"           // sequence | tree | graph
})
```

**Возвращает**:
```json
{
  "paths": [
    {
      "id": "path-1",
      "confidence": 0.95,
      "steps": [
        {
          "order": 1,
          "entity": "startPage()",
          "file": "src/pages/start.ts:45",
          "action": "call",
          "stateChanges": [
            { "variable": "currentPage", "from": "null", "to": "start" }
          ]
        },
        {
          "order": 2,
          "entity": "validateUser()",
          "file": "src/auth/validate.ts:12",
          "action": "condition",
          "condition": "if (user.isAuthenticated)",
          "branches": ["true → continue", "false → redirect to login"]
        },
        {
          "order": 3,
          "entity": "loadPageData()",
          "file": "src/pages/start.ts:52",
          "action": "call",
          "stateChanges": [
            { "variable": "pageData", "from": "undefined", "to": "loaded" }
          ],
          "awaits": true
        },
        {
          "order": 4,
          "entity": "goToNextPage()",
          "file": "src/navigation/router.ts:78",
          "action": "call",
          "preconditions": [
            "pageData !== undefined",
            "user.isAuthenticated === true"
          ]
        }
      ],
      "summary": "Path from startPage to goToNextPage requires authenticated user and loaded page data"
    }
  ],
  "statesSummary": {
    "modified": ["currentPage", "pageData", "navigationHistory"],
    "read": ["user", "config"],
    "critical": ["user.isAuthenticated"]
  },
  "conditionsSummary": {
    "guards": 2,
    "branches": 4,
    "criticalConditions": ["user.isAuthenticated", "pageData !== undefined"]
  }
}
```

---

### 2. `trace_backwards` — Обратная трассировка

**Задача**: Метод не срабатывает — почему? Найти все влияющие факторы.

```typescript
trace_backwards({
  target: "FinishTask()",      // Целевой метод (семантический поиск)
  question: "why not called",  // Тип вопроса: "why not called" | "what affects" | "dependencies"
  depth: 15,                   // Глубина обратного анализа
  includeStates: true,         // Анализировать состояния
  includeEffects: true         // Анализировать side effects
})
```

**Возвращает**:
```json
{
  "target": {
    "name": "FinishTask()",
    "file": "src/tasks/manager.ts:156",
    "signature": "async FinishTask(taskId: string): Promise<void>"
  },
  "callers": [
    {
      "name": "TaskController.complete()",
      "file": "src/controllers/task.ts:89",
      "condition": "if (task.status === 'in_progress')",
      "probability": "conditional"
    },
    {
      "name": "AutoFinisher.checkAndFinish()",
      "file": "src/automation/auto-finisher.ts:34",
      "condition": "if (task.deadline < now && task.autoFinish)",
      "probability": "conditional"
    }
  ],
  "blockingConditions": [
    {
      "condition": "task.status === 'in_progress'",
      "location": "src/controllers/task.ts:88",
      "currentValue": "unknown (runtime)",
      "recommendation": "Check task status before calling"
    },
    {
      "condition": "task.autoFinish === true",
      "location": "src/automation/auto-finisher.ts:33",
      "currentValue": "unknown (runtime)",
      "recommendation": "Ensure autoFinish flag is set"
    }
  ],
  "statesDependencies": [
    {
      "state": "task.status",
      "modifiedBy": ["TaskController.start()", "TaskController.pause()"],
      "requiredValue": "in_progress"
    },
    {
      "state": "task.autoFinish",
      "modifiedBy": ["TaskSettings.update()"],
      "requiredValue": "true"
    }
  ],
  "callChains": [
    {
      "chain": ["UserAction → TaskController.complete() → FinishTask()"],
      "guards": ["task.status === 'in_progress'"],
      "likelihood": "high"
    },
    {
      "chain": ["CronJob → AutoFinisher.checkAndFinish() → FinishTask()"],
      "guards": ["task.deadline < now", "task.autoFinish"],
      "likelihood": "medium"
    }
  ],
  "diagnosis": {
    "possibleReasons": [
      "task.status is not 'in_progress' (most likely)",
      "task.autoFinish is false",
      "No caller invokes FinishTask due to guard conditions"
    ],
    "suggestedDebugPoints": [
      "src/controllers/task.ts:88 - check task.status value",
      "src/automation/auto-finisher.ts:33 - check autoFinish flag"
    ]
  }
}
```

---

### 3. `trace_data_flow` — Трассировка потока данных

**Задача**: От загрузки приложения — какие данные влияют на поведение?

```typescript
trace_data_flow({
  entryPoint: "AppInit()",     // Точка входа
  targetState: "startPage",    // Целевое состояние
  dataSources: ["URL params", "API /start"],  // Источники данных (семантический поиск)
  trackTransformations: true   // Отслеживать трансформации данных
})
```

**Возвращает**:
```json
{
  "entryPoint": "AppInit()",
  "targetState": "startPage",
  "dataFlows": [
    {
      "source": "URL params",
      "flow": [
        {
          "step": 1,
          "location": "src/router/parser.ts:23",
          "action": "parse",
          "input": "window.location.search",
          "output": "{ page: string, mode: string }",
          "transformation": "URLSearchParams parsing"
        },
        {
          "step": 2,
          "location": "src/router/router.ts:45",
          "action": "branch",
          "condition": "params.page === 'start'",
          "branches": {
            "true": "→ loadStartPage()",
            "false": "→ loadDefaultPage()"
          }
        },
        {
          "step": 3,
          "location": "src/pages/start.ts:12",
          "action": "setState",
          "state": "currentPage",
          "value": "'start'"
        }
      ],
      "affectsTarget": true,
      "criticalConditions": ["params.page === 'start'"]
    },
    {
      "source": "API /start",
      "flow": [
        {
          "step": 1,
          "location": "src/api/client.ts:78",
          "action": "fetch",
          "endpoint": "/api/start",
          "async": true
        },
        {
          "step": 2,
          "location": "src/api/client.ts:82",
          "action": "branch",
          "condition": "response.status === 200",
          "branches": {
            "true": "→ processStartData(response.data)",
            "false": "→ handleError(response)"
          }
        },
        {
          "step": 3,
          "location": "src/pages/start.ts:34",
          "action": "conditional_setState",
          "condition": "data.userType === 'premium'",
          "states": {
            "true": { "startPage": "premium-start" },
            "false": { "startPage": "basic-start" }
          }
        }
      ],
      "affectsTarget": true,
      "criticalConditions": ["response.status === 200", "data.userType"]
    }
  ],
  "behaviorMatrix": {
    "combinations": [
      {
        "inputs": { "URL.page": "start", "API.userType": "premium" },
        "result": { "startPage": "premium-start" },
        "path": "URL → router → API → premium flow"
      },
      {
        "inputs": { "URL.page": "start", "API.userType": "basic" },
        "result": { "startPage": "basic-start" },
        "path": "URL → router → API → basic flow"
      },
      {
        "inputs": { "URL.page": "other", "API": "any" },
        "result": { "startPage": "default" },
        "path": "URL → router → default flow (API not called)"
      }
    ]
  },
  "summary": {
    "dataSourcesAnalyzed": 2,
    "branchingPoints": 3,
    "possibleOutcomes": 3,
    "criticalDecisions": [
      "URL param 'page' determines initial routing",
      "API response 'userType' determines page variant"
    ]
  }
}
```

---

### 4. `analyze_state_impact` — Анализ влияния состояния

**Задача**: Что произойдёт если изменить состояние X?

```typescript
analyze_state_impact({
  state: "user.isAuthenticated",  // Состояние для анализа
  scenarios: [
    { value: true, label: "authenticated" },
    { value: false, label: "anonymous" }
  ],
  scope: "startPage flow"         // Область анализа (семантический поиск)
})
```

**Возвращает**:
```json
{
  "state": "user.isAuthenticated",
  "usages": [
    {
      "location": "src/guards/auth.guard.ts:15",
      "usage": "condition",
      "code": "if (!user.isAuthenticated) redirect('/login')"
    },
    {
      "location": "src/pages/start.ts:23",
      "usage": "condition",
      "code": "const features = user.isAuthenticated ? premiumFeatures : basicFeatures"
    }
  ],
  "scenarioAnalysis": {
    "authenticated": {
      "reachablePaths": ["startPage → dashboard", "startPage → profile"],
      "blockedPaths": [],
      "enabledFeatures": ["premiumFeatures", "fullNavigation"],
      "stateChanges": ["lastLogin updated", "sessionToken refreshed"]
    },
    "anonymous": {
      "reachablePaths": ["startPage → login redirect"],
      "blockedPaths": ["startPage → dashboard", "startPage → profile"],
      "enabledFeatures": ["basicFeatures", "limitedNavigation"],
      "stateChanges": ["redirectUrl saved"]
    }
  },
  "conflicts": [
    {
      "description": "If user.isAuthenticated changes during page load",
      "location": "src/pages/start.ts:23",
      "risk": "Features array may be inconsistent with actual auth state",
      "recommendation": "Add state synchronization or loading state"
    }
  ],
  "rippleEffects": {
    "directEffects": 5,
    "indirectEffects": 12,
    "affectedComponents": ["AuthGuard", "StartPage", "Navigation", "FeatureFlags"]
  }
}
```

---

### 5. `find_decision_points` — Поиск точек принятия решений

**Задача**: Найти все места, где определяется поведение для заданного сценария.

```typescript
find_decision_points({
  scenario: "user registration flow",  // Семантический поиск сценария
  includeGuards: true,                 // Включить guard conditions
  includeEffects: true,                // Включить side effects
  groupBy: "impact"                    // impact | location | type
})
```

**Возвращает**:
```json
{
  "scenario": "user registration flow",
  "entryPoints": [
    { "name": "RegisterPage.submit()", "file": "src/pages/register.ts:45" }
  ],
  "decisionPoints": [
    {
      "id": "dp-1",
      "location": "src/validation/user.ts:23",
      "type": "validation",
      "condition": "email.isValid && password.length >= 8",
      "outcomes": {
        "pass": "→ continue to API call",
        "fail": "→ show validation errors"
      },
      "impact": "high",
      "dataDepends": ["email", "password"]
    },
    {
      "id": "dp-2",
      "location": "src/api/auth.ts:67",
      "type": "api_response",
      "condition": "response.status",
      "outcomes": {
        "201": "→ registration success → login",
        "409": "→ email already exists → show error",
        "500": "→ server error → retry prompt"
      },
      "impact": "critical",
      "dataDepends": ["API /register response"]
    },
    {
      "id": "dp-3",
      "location": "src/auth/session.ts:34",
      "type": "state_mutation",
      "action": "setUser(response.user)",
      "effects": ["localStorage update", "state update", "redirect trigger"],
      "impact": "high",
      "triggeredBy": "dp-2 outcome 201"
    }
  ],
  "flowDiagram": {
    "mermaid": "graph TD\n  A[RegisterPage.submit] --> B{Validation}\n  B -->|pass| C[API /register]\n  B -->|fail| D[Show Errors]\n  C -->|201| E[Set User & Login]\n  C -->|409| F[Email Exists]\n  C -->|500| G[Server Error]"
  },
  "summary": {
    "totalDecisionPoints": 3,
    "criticalPoints": 1,
    "possibleOutcomes": 4,
    "statesModified": ["user", "session", "localStorage"]
  }
}
```

---

## Архитектура реализации

### Компоненты

```
┌─────────────────────────────────────────────────────────────┐
│                     SemanticTracer                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ EntryFinder │  │ PathBuilder │  │ StateTracker│        │
│  │ (semantic)  │  │ (graph BFS) │  │ (mutations) │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         v                v                v                │
│  ┌─────────────────────────────────────────────────┐      │
│  │              TraceEngine                        │      │
│  │  - Forward trace (A → B)                        │      │
│  │  - Backward trace (B → ?)                       │      │
│  │  - Data flow trace (source → state)            │      │
│  └─────────────────────────────────────────────────┘      │
│         │                                                  │
│         v                                                  │
│  ┌─────────────────────────────────────────────────┐      │
│  │            ConditionAnalyzer                    │      │
│  │  - Extract if/switch/case conditions           │      │
│  │  - Build decision tree                         │      │
│  │  - Analyze branch coverage                     │      │
│  └─────────────────────────────────────────────────┘      │
│         │                                                  │
│         v                                                  │
│  ┌─────────────────────────────────────────────────┐      │
│  │            OutputFormatter                      │      │
│  │  - Sequence diagrams                           │      │
│  │  - Mermaid flowcharts                          │      │
│  │  - JSON structured output                      │      │
│  └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Интеграция с существующим кодом

1. **SemanticAgent** — поиск entry/exit points по запросу
2. **GraphStorage** — обход графа вызовов (CALLS relations)
3. **ChaosAnalyzer** — анализ состояний и их изменений
4. **Parser data** — извлечение conditions из controlFlow
5. **QueryAgent** — выполнение запросов к графу

### Слои данных

```typescript
// Используем уже извлечённые парсером данные:
interface EntityWithTraceData {
  // Базовые данные сущности
  id: string;
  name: string;
  type: string;

  // Данные для трейсинга (уже есть в парсерах!)
  calls?: CallInfo[];           // Граф вызовов
  controlFlow?: ControlFlow;    // if/switch/loops
  complexity?: Complexity;      // Для приоритизации
  documentation?: Documentation; // Для понимания intent
}

// ControlFlow уже содержит:
interface ControlFlow {
  branches: BranchInfo[];   // if/switch условия
  loops: LoopInfo[];        // for/while
  exceptions: ExceptionInfo[]; // try/catch
  awaits: AwaitInfo[];      // async points
}
```

## Примеры использования

### Пример 1: "Почему FinishTask() не вызывается?"

```
> trace_backwards target="FinishTask()" question="why not called"

📍 Target: FinishTask() in src/tasks/manager.ts:156

🔙 Callers (2 found):
  1. TaskController.complete() [CONDITIONAL]
     └─ Guard: task.status === 'in_progress'

  2. AutoFinisher.checkAndFinish() [CONDITIONAL]
     └─ Guards: task.deadline < now AND task.autoFinish

⚠️ Blocking Conditions:
  • task.status must be 'in_progress'
    └─ Modified by: TaskController.start(), TaskController.pause()

  • task.autoFinish must be true
    └─ Modified by: TaskSettings.update()

💡 Diagnosis:
  Most likely: task.status is not 'in_progress'

🔍 Debug points:
  • src/controllers/task.ts:88 - check task.status
  • src/automation/auto-finisher.ts:33 - check autoFinish
```

### Пример 2: "Что происходит от startPage до goToNextPage?"

```
> trace_flow from="startPage" to="goToNextPage" trackStates=true

📊 Flow Analysis: startPage → goToNextPage

Path found (confidence: 95%):

  1. startPage()
     └─ State: currentPage = 'start'

  2. validateUser()
     └─ Condition: user.isAuthenticated
     └─ ✓ true → continue
     └─ ✗ false → redirect('/login')

  3. loadPageData() [async]
     └─ State: pageData = loaded
     └─ Await: fetch('/api/page-data')

  4. goToNextPage()
     └─ Preconditions:
        • pageData !== undefined ✓
        • user.isAuthenticated ✓

📈 States Modified:
  • currentPage: null → 'start'
  • pageData: undefined → {loaded}
  • navigationHistory: [..., 'start']

🔀 Critical Conditions:
  • user.isAuthenticated (guard)
  • pageData !== undefined (implicit)
```

### Пример 3: "От каких данных зависит поведение startPage?"

```
> trace_data_flow entryPoint="AppInit()" targetState="startPage" dataSources=["URL", "API /start"]

📊 Data Flow Analysis

🌐 Source 1: URL params
  window.location.search
    ↓ parse
  { page: 'start', mode: 'demo' }
    ↓ branch (params.page === 'start')
  loadStartPage()
    ↓ setState
  currentPage = 'start'

🔌 Source 2: API /start
  fetch('/api/start')
    ↓ branch (status === 200)
  response.data
    ↓ branch (data.userType)
  startPage variant selection

📋 Behavior Matrix:
  ┌─────────────┬──────────────┬─────────────────┐
  │ URL.page    │ API.userType │ Result          │
  ├─────────────┼──────────────┼─────────────────┤
  │ 'start'     │ 'premium'    │ premium-start   │
  │ 'start'     │ 'basic'      │ basic-start     │
  │ other       │ any          │ default-page    │
  └─────────────┴──────────────┴─────────────────┘

💡 Critical Decisions:
  1. URL param 'page' determines initial routing
  2. API response 'userType' determines page variant
```

## План реализации

### Phase 1: Core Engine
- [ ] TraceEngine с BFS/DFS по графу вызовов
- [ ] Интеграция с SemanticAgent для поиска entry points
- [ ] Базовый вывод путей

### Phase 2: State Tracking
- [ ] Интеграция с ChaosAnalyzer
- [ ] Отслеживание state mutations вдоль пути
- [ ] Определение preconditions/postconditions

### Phase 3: Condition Analysis
- [ ] Парсинг условий из controlFlow
- [ ] Построение decision trees
- [ ] Анализ branch coverage

### Phase 4: Output & Visualization
- [ ] Mermaid диаграммы
- [ ] Sequence diagrams
- [ ] Interactive exploration

## Открытые вопросы

1. **Глубина анализа**: Как ограничить без потери важной информации?
2. **Семантическая точность**: Как улучшить поиск entry/exit points?
3. **Runtime vs Static**: Какие данные можно получить статически, а какие требуют runtime?
4. **Performance**: Как кешировать результаты для больших кодовых баз?
