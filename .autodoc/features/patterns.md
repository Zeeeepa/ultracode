# Pattern Detection

## detect_patterns

Detect anti-patterns, best-patterns, code smells, and optimization opportunities using two-stage pipeline: structural analysis + semantic validation.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| projectPath | string? | current project | Project directory path |
| filePath | string? | - | Scan specific file only |
| language | string? | auto-detected | Filter: typescript, python, csharp, java, go |
| category | string? | "all" | anti-pattern, best-pattern, code-smell, optimization, all |
| tags | string[]? | - | Filter by tags: async, performance, memory, security, etc. |
| minConfidence | number? | 0.5 | Minimum combined score (0-1) |
| severity | string? | "all" | critical, high, medium, low, info, all |
| format | string? | "summary" | Output: summary, detailed, json |
| offset | number? | 0 | Pagination offset |
| limit | number? | 50 | Max results per category |

### Returns

Summary format includes:
- Health score (0-100)
- Counts per category
- Top issues by severity
- Match details: pattern name, entity, file:line, confidence scores

### Examples

```json
// Find all anti-patterns
detect_patterns({category: "anti-pattern"})

// Performance optimizations only
detect_patterns({category: "optimization", tags: ["performance"]})

// Check specific file
detect_patterns({filePath: "src/services/auth.ts", severity: "high"})

// Detailed output with exemplar matches
detect_patterns({format: "detailed", minConfidence: 0.7})
```

## check_entity_patterns

Check specific entity for pattern matches with detailed scoring.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| entityId | string | required | Entity ID to check |
| projectPath | string? | current project | Project directory |
| category | string? | "all" | Category filter |

### Returns

Array of matched patterns with:
- Pattern details (name, description, suggestion, bigO, benchmark)
- Confidence scores (structural, semantic, combined)
- Closest exemplar match
- Matched criteria list

### Examples

```json
// Check single entity
check_entity_patterns({entityId: "abc123"})

// Only optimization patterns
check_entity_patterns({entityId: "abc123", category: "optimization"})
```

## Categories

### Anti-Patterns
Bad practices that should be fixed. Examples: async-void, empty-catch, mutable-static, bare-except, ignored-error.

### Best-Patterns
Good practices found in code. Examples: proper-di, error-wrapping, context-propagation. Severity is always "info".

### Code Smells
Structural issues detectable by metrics. Examples: god-function, deep-nesting, large-class, feature-envy.

### Optimization
Performance improvement opportunities with Big-O and benchmarks. Examples: string-concat-in-loop, linq-in-hotpath, n+1-queries.

#### JIT Deoptimization (JS/TS, tag: `jit`)
9 rules detecting V8/JSC JIT-unfriendly patterns that cause hidden class transitions, megamorphic dispatch, and deoptimization bailouts:
- **jit-delete-operator** — kills inline caching (35-40% throughput loss)
- **jit-with-statement**, **jit-eval** — disable JIT entirely (critical)
- **jit-holey-array** — `new Array(n)` creates holey arrays (6x slower access)
- **jit-arguments-object** — prevents function optimization
- **jit-megamorphic-interface** — 5+ implementations cause ~3.5x slower dispatch
- **jit-spread-in-hot-path**, **jit-dynamic-property-access**, **jit-optional-chaining-hot** — hot loop patterns

Filter: `detect_patterns({category: "optimization", tags: ["jit"]})`

## Scoring

- **structuralConfidence** (0-1): Metadata match quality
- **semanticSimilarity** (0-1): Embedding similarity with curated exemplars
- **combinedScore**: structural x 0.4 + semantic x 0.6 (for hybrid rules)
- **healthScore** (0-100): Overall project health based on pattern balance
