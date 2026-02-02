# Static Tracing

🌐 **Language**: [EN] | [RU](./tracing_ru.md)

---

Tools for analyzing execution flow and data without running code.

---

## trace_flow

Trace execution path from point A to point B. Finds all possible paths and analyzes states, conditions, and async boundaries.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `from` | string | yes | Start point (function name or semantic query) |
| `to` | string | yes | End point (function name or semantic query) |
| `trackStates` | boolean | no | Track state changes (default true) |
| `trackConditions` | boolean | no | Track conditions/branches (default true) |
| `maxDepth` | number | no | Maximum depth (default 15) |
| `format` | string | no | Format: `sequence`, `tree`, `graph`, `mermaid` |

### Returns

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
    conditions: string[];      // Conditions on path
    stateChanges: string[];    // State changes
    isAsync: boolean;
    confidence: number;
  }>;
  mermaid?: string;            // Mermaid diagram (if format=mermaid)
  summary: string;
}
```

### Examples

**Basic tracing:**
```
trace_flow({
  from: "handleLogin",
  to: "saveUserSession"
})
```

**With Mermaid diagram:**
```
trace_flow({
  from: "API endpoint /users",
  to: "database query",
  format: "mermaid",
  trackStates: true
})
```

---

## trace_backwards

Backwards tracing — finds why a function might not be called or what affects it.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `target` | string | yes | Target function/method |
| `question` | string | yes | Analysis type: `why_not_called`, `what_affects`, `dependencies` |
| `depth` | number | no | Backwards tracing depth (default 15) |
| `includeStates` | boolean | no | Include state dependencies |
| `includeEffects` | boolean | no | Include side effects |

### Analysis Types

- **why_not_called** — why function might not be called (blocking conditions)
- **what_affects** — what affects function behavior
- **dependencies** — complete dependency graph

### Returns

```typescript
{
  target: { name: string; filePath: string; };
  callers: Array<{
    entityId: string;
    name: string;
    filePath: string;
    condition?: string;      // Call condition
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

### Examples

**Why not called:**
```
trace_backwards({
  target: "sendNotification",
  question: "why_not_called"
})
```

**What affects:**
```
trace_backwards({
  target: "calculatePrice",
  question: "what_affects",
  includeStates: true
})
```

---

## trace_data_flow

Data flow tracing — how data from sources affects target state.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entryPoint` | string | yes | Entry point (function) |
| `targetState` | string | yes | Target state to trace |
| `dataSources` | string[] | no | Data sources (auto-detect if not specified) |
| `trackTransformations` | boolean | no | Track data transformations |

### Returns

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

### Examples

```
trace_data_flow({
  entryPoint: "processOrder",
  targetState: "orderStatus",
  trackTransformations: true
})
```

---

## analyze_state_impact

Analyze state impact on different execution scenarios.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `state` | string | yes | State variable |
| `scenarios` | array | yes | Scenarios to analyze |
| `scope` | string | no | Analysis scope (semantic query) |

### Scenario Format

```typescript
scenarios: [
  { value: true, label: "isAuthenticated = true" },
  { value: false, label: "isAuthenticated = false" }
]
```

### Returns

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

### Examples

```
analyze_state_impact({
  state: "isAdmin",
  scenarios: [
    { value: true, label: "Administrator" },
    { value: false, label: "Regular user" }
  ],
  scope: "user management module"
})
```

---

## find_decision_points

Find all decision points in execution scenario.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `scenario` | string | yes | Scenario to analyze |
| `includeGuards` | boolean | no | Include guard conditions (default true) |
| `includeEffects` | boolean | no | Include side effects (default true) |
| `groupBy` | string | no | Grouping: `impact`, `location`, `type` |

### Decision Point Types

- **validation** — validation checks
- **api_response** — API response handling
- **state_mutation** — state mutations
- **guard** — guard conditions
- **loop** — loop conditions
- **error_handling** — error handling
- **feature_flag** — feature flags

### Returns

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
  mermaid?: string;         // Flowchart diagram
  summary: string;
}
```

### Examples

```
find_decision_points({
  scenario: "order checkout",
  groupBy: "impact"
})
```
