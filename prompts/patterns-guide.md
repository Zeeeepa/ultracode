# Pattern Detection Guide

## Overview

UltraCode includes a **pattern detection system** that identifies anti-patterns, best-patterns, code smells, and optimization opportunities across 6 languages (TypeScript, Python, C#, Java/Kotlin, Go, + universal).

The system uses a **two-stage pipeline**:
1. **Structural Detector** — fast metadata/graph queries (Bloom-filter role)
2. **Semantic Validator** — embedding similarity with curated exemplars (precision filter)

This dramatically reduces false positives compared to purely rule-based systems.

## Tools

### `detect_patterns` — Full Scan

Scan a project or file for patterns across all categories.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| projectPath | string? | current | Project directory |
| filePath | string? | - | Scan specific file only |
| language | string? | auto | Filter: typescript, python, csharp, java, go |
| category | string? | "all" | anti-pattern, best-pattern, code-smell, optimization, all |
| tags | string[]? | - | Filter: async, performance, memory, security, etc. |
| minConfidence | number? | 0.5 | Minimum combined score (0-1) |
| severity | string? | "all" | critical, high, medium, low, info, all |
| format | string? | "summary" | summary, detailed, json |
| offset | number? | 0 | Pagination offset |
| limit | number? | 50 | Max results per category |

**Examples:**
```
# Find all anti-patterns in a TypeScript project
detect_patterns({category: "anti-pattern", language: "typescript"})

# Find performance optimization opportunities
detect_patterns({category: "optimization", tags: ["performance"]})

# Check a specific file for code smells
detect_patterns({filePath: "src/services/user-service.ts", category: "code-smell"})

# Only critical/high severity issues
detect_patterns({severity: "high", minConfidence: 0.7})

# Detailed output with exemplar matches
detect_patterns({format: "detailed"})
```

### `check_entity_patterns` — Single Entity Check

Check a specific entity for pattern matches.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| entityId | string | required | Entity ID to check |
| projectPath | string? | current | Project directory |
| category | string? | "all" | Category filter |

## Four Categories

### 1. Anti-Patterns (bad practices to fix)
- **async-void**, **empty-catch**, **mutable-static**, **bare-except**, **ignored-error**
- Severity: critical/high/medium
- Action: Fix immediately

### 2. Best-Patterns (good practices found)
- **proper-di**, **error-wrapping**, **context-propagation**, **small-focused-function**
- Severity: info
- Action: Keep doing this!

### 3. Code Smells (structural issues)
- **god-function**, **deep-nesting**, **large-class**, **feature-envy**, **too-many-params**
- Severity: high/medium
- Action: Refactor when touching this code

### 4. Optimization (performance improvements)
- **string-concat-in-loop**, **linq-in-hotpath**, **n-plus-one**, **regex-in-loop**
- Includes Big-O analysis and benchmarks
- Severity: medium/low
- Action: Optimize in hot paths

#### JIT Deoptimization Detectors (JS/TS)
Tag: `jit` — 9 rules detecting V8/JSC JIT-unfriendly patterns:
- **jit-delete-operator** (high) — `delete obj.prop` kills hidden classes and inline caching
- **jit-with-statement** (critical) — `with(obj)` disables all JIT optimizations
- **jit-eval** (critical) — `eval()` prevents scope analysis and optimization
- **jit-holey-array** (medium) — `new Array(n)` creates holey arrays (6x slower element access)
- **jit-arguments-object** (medium) — `arguments` object prevents function optimization
- **jit-megamorphic-interface** (low) — interfaces with 5+ implementations cause megamorphic dispatch (~3.5x slower)
- **jit-spread-in-hot-path** (medium) — excessive spread in loops forces repeated object allocation
- **jit-dynamic-property-access** (low) — `obj[variable]` in loops prevents inline caching
- **jit-optional-chaining-hot** (low) — excessive `?.` chains in hot paths add branching overhead

```
# Find all JIT deoptimization issues
detect_patterns({category: "optimization", tags: ["jit"]})
```

## Understanding Scores

Each match has three scores:
- **structuralConfidence** (0-1): How well metadata matches the rule criteria
- **semanticSimilarity** (0-1): How similar the code is to curated exemplars (1.0 if semantic skipped)
- **combinedScore**: `structural * 0.4 + semantic * 0.6` (for hybrid rules)

Rules with `minSemanticSimilarity: 0` use only structural checks (metrics-based rules like god-function).

## Workflow

```
1. Index project:        index({paths: ["./src"]})
2. Run full scan:        detect_patterns({format: "summary"})
3. Focus on issues:      detect_patterns({category: "anti-pattern", severity: "high"})
4. Check specific code:  check_entity_patterns({entityId: "..."})
5. Find optimizations:   detect_patterns({category: "optimization", tags: ["performance"]})
```

## Supported Languages & Rule Count

| Language | Anti-patterns | Best-patterns | Code Smells | Optimizations | Total |
|----------|:---:|:---:|:---:|:---:|:---:|
| Common | 0 | 2 | 7 | 0 | 9 |
| TypeScript | 7 | 2 | 0 | 14 | 23 |
| Python | 3 | 3 | 2 | 2 | 10 |
| C# | 4 | 2 | 2 | 6 | 14 |
| Java/Kotlin | 3 | 2 | 1 | 7 | 13 |
| Go | 2 | 3 | 2 | 2 | 9 |
| **Total** | **19** | **14** | **14** | **31** | **~78** |

Rules are extensible — add new YAML files to `rules/` and `exemplars/` directories.
