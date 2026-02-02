# Code Analysis

🌐 **Language**: [EN] | [RU](./analysis_ru.md)

---

Tools for analyzing code quality, complexity, and dependencies.

---

## analyze_code_impact

Change impact analysis — shows what will break when modifying specified entity.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes* | Entity ID to analyze |
| `entityName` | string | yes* | Entity name (if no ID) |
| `filePath` | string | no | File path (to clarify entityName) |
| `depth` | number | no | Dependency analysis depth (default 3) |
| `includeTests` | boolean | no | Include test files |

*Specify either `entityId` or `entityName`

### Returns

```typescript
{
  entity: { id: string; name: string; type: string; };
  directDependents: Array<{
    entityId: string;
    name: string;
    filePath: string;
    usageType: "calls" | "imports" | "extends" | "implements";
  }>;
  indirectDependents: Array<{...}>;
  affectedFiles: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
}
```

### Examples

**Analysis by ID:**
```
analyze_code_impact({
  entityId: "src/services/user.ts:UserService",
  depth: 4
})
```

**Analysis by name:**
```
analyze_code_impact({
  entityName: "validateEmail",
  filePath: "src/utils/validators.ts"
})
```

---

## find_duplicates

Semantic code duplicate search. Finds functionally similar code, even if written differently.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `threshold` | number | no | Similarity threshold 0-1 (default 0.8) |
| `minLines` | number | no | Minimum lines for duplicate (default 5) |
| `filePattern` | string | no | Glob pattern for files |
| `excludePatterns` | string[] | no | Exclusion patterns |
| `groupBy` | string | no | Grouping: `file`, `similarity`, `type` |

### Returns

```typescript
{
  groups: Array<{
    similarity: number;
    entities: Array<{
      entityId: string;
      name: string;
      filePath: string;
      lines: [number, number];
      snippet: string;
    }>;
  }>;
  totalDuplicates: number;
  suggestion: string;
}
```

### Examples

```
find_duplicates({
  threshold: 0.85,
  minLines: 10,
  excludePatterns: ["**/*.test.ts", "**/*.spec.ts"]
})
```

---

## jscpd_detect_clones

Token-based clone detector (without embeddings). Faster than semantic search but less flexible.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `directory` | string | no | Directory to analyze |
| `minLines` | number | no | Minimum lines (default 5) |
| `minTokens` | number | no | Minimum tokens (default 50) |
| `format` | string | no | Format: `summary`, `detailed`, `json` |

### Returns

```typescript
{
  clones: Array<{
    firstFile: string;
    secondFile: string;
    lines: number;
    tokens: number;
    fragment: string;
  }>;
  statistics: {
    totalFiles: number;
    totalLines: number;
    duplicatedLines: number;
    percentage: number;
  };
}
```

### Examples

```
jscpd_detect_clones({
  minLines: 10,
  minTokens: 100,
  format: "detailed"
})
```

---

## suggest_refactoring

AI-powered refactoring suggestions. Analyzes code and suggests improvements.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes* | Entity ID |
| `filePath` | string | yes* | File path |
| `focus` | string | no | Focus: `complexity`, `readability`, `performance`, `all` |

*Specify either `entityId` or `filePath`

### Returns

```typescript
{
  suggestions: Array<{
    type: "extract_function" | "rename" | "simplify" | "split_class" | ...;
    description: string;
    location: { file: string; line: number; };
    before: string;
    after: string;
    effort: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
  }>;
}
```

### Examples

```
suggest_refactoring({
  entityId: "src/handlers/payment.ts:processPayment",
  focus: "complexity"
})
```

---

## analyze_hotspots

Find "hotspots" — code areas with high complexity, frequent changes, or strong coupling.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `metric` | string | no | Metric: `complexity`, `changes`, `coupling`, `all` |
| `threshold` | number | no | Selection threshold (depends on metric) |
| `limit` | number | no | Maximum results |
| `includeHistory` | boolean | no | Include git history |

### Returns

```typescript
{
  hotspots: Array<{
    entityId: string;
    name: string;
    filePath: string;
    metrics: {
      cyclomatic: number;
      cognitive: number;
      coupling: number;
      changeFrequency?: number;
    };
    riskScore: number;
    recommendation: string;
  }>;
}
```

### Examples

```
analyze_hotspots({
  metric: "complexity",
  threshold: 15,
  limit: 20
})
```

---

## analyze_state_chaos

"State chaos" analysis — detect problems with state management in TypeScript/Angular projects.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `scope` | string | no | Scope: `file`, `module`, `project` |
| `stateIdentifiers` | string[] | no | Specific variables to analyze |
| `autoDetect` | boolean | no | Auto-detect states |
| `format` | string | no | Format: `summary`, `detailed`, `json` |
| `maxDepth` | number | no | Tracing depth |
| `excludePatterns` | string[] | no | Exclusion patterns |

### Returns

```typescript
{
  states: Array<{
    identifier: string;
    chaosScore: number;         // 0-100
    divergenceRisk: "low" | "medium" | "high" | "critical";
    filesAffected: number;
    mutationPoints: number;
    defensivePatterns: number;
    refactoringStrategy: "Service" | "Store" | "Signal" | "Context";
    problemAreas: Array<{
      file: string;
      line: number;
      issue: string;
    }>;
  }>;
  summary: string;
}
```

### Examples

**Analyze specific state:**
```
analyze_state_chaos({
  stateIdentifiers: ["token", "userId"],
  format: "detailed"
})
```

**Auto-detect all problematic states:**
```
analyze_state_chaos({
  scope: "project",
  autoDetect: true,
  format: "summary"
})
```

> Learn more: [chaos-analysis.md](chaos-analysis.md)

---

## detect_technology_stack

Automatic project technology stack detection.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `directory` | string | no | Directory to analyze |
| `detailed` | boolean | no | Detailed analysis |

### Returns

```typescript
{
  languages: Array<{ name: string; percentage: number; files: number; }>;
  frameworks: string[];
  buildTools: string[];
  packageManagers: string[];
  databases: string[];
  testing: string[];
  ci: string[];
  containerization: string[];
}
```

### Examples

```
detect_technology_stack({ detailed: true })
```
