# Pattern Detection — Developer Guide

How to add new anti-patterns, best-patterns, code smells, and optimization rules.

## File Structure

```
src/analysis/patterns/
├── rules/                  — YAML pattern definitions
│   ├── common.yaml         — Universal patterns (all languages)
│   ├── typescript.yaml     — TypeScript-specific
│   ├── python.yaml         — Python-specific
│   ├── csharp.yaml         — C#-specific
│   ├── java.yaml           — Java/Kotlin-specific
│   └── go.yaml             — Go-specific
├── exemplars/              — Code snippet examples for semantic validation
│   └── {language}.yaml     — Curated "bad"/"good" code examples
└── detectors/              — Custom TypeScript detector functions
    └── {language}.ts       — Complex logic not expressible in YAML
```

## YAML Rule Structure

```yaml
patterns:
  - id: "{lang}:{kebab-case-name}"    # Unique: "ts:async-void", "java:regex-in-loop"
    category: "..."                    # anti-pattern | best-pattern | code-smell | optimization
    severity: "..."                    # critical | high | medium | low | info
    name: "Human Readable Name"
    description: "What and why"
    suggestion: "How to fix / what pattern to use"
    bigO:                              # Only for optimization rules
      before: "O(n²)"
      after: "O(n)"
    benchmark: "10x faster"            # Only for optimization rules
    tags: ["async", "performance"]
    enabled: true
    structural:                        # Metadata-based criteria (fast path)
      entityTypes: ["method", "function"]
      # ... see StructuralCriteria in types.ts
    customDetector: "functionName"     # Optional: complex logic in detectors/*.ts
    exemplarIds: ["id1"]               # Optional: references to exemplar snippets
    minSemanticSimilarity: 0.65        # 0 = skip semantic check
    minStructuralConfidence: 0.6       # Minimum structural match threshold
```

## Adding an Anti-Pattern

Anti-patterns detect **bad practices** that should be fixed.

```yaml
- id: "ts:empty-catch"
  category: "anti-pattern"
  severity: "high"
  name: "Empty Catch Block"
  description: "catch block without error handling swallows exceptions"
  suggestion: "Add logging or rethrow. Use typed catch."
  tags: ["error-handling"]
  enabled: true
  structural:
    entityTypes: ["method", "function"]
    hasExceptions: true
  exemplarIds: ["ts:empty-catch:bad1"]
  minSemanticSimilarity: 0.6
  minStructuralConfidence: 0.6
```

## Adding a Best-Pattern

Best-patterns detect **good practices** already in the code.

```yaml
- id: "cs:proper-di"
  category: "best-pattern"
  severity: "info"              # Always "info" — it's not a problem
  name: "Proper Dependency Injection"
  description: "Constructor injection with interfaces"
  suggestion: "Good pattern! Continue using it."
  tags: ["architecture", "di"]
  structural:
    entityTypes: ["method"]
    minParams: 2
    paramTypeRequired: "^I[A-Z]"
  minSemanticSimilarity: 0.55
  minStructuralConfidence: 0.6
```

## Adding a Code-Smell

Code smells are **structural issues** detected by metrics.

```yaml
- id: "common:god-function"
  category: "code-smell"
  severity: "high"
  name: "God Function"
  description: "Function too large and complex"
  suggestion: "Decompose into smaller functions"
  structural:
    entityTypes: ["method", "function"]
    minCyclomatic: 20
  minSemanticSimilarity: 0.0       # Metrics are deterministic — no semantic needed
  minStructuralConfidence: 0.8
```

## Adding an Optimization Rule

Optimization rules detect **performance improvement opportunities** with benchmarks.

```yaml
- id: "java:string-concat-in-loop"
  category: "optimization"
  severity: "medium"
  name: "String Concatenation in Loop"
  description: "String += in loop — O(n²) copies"
  suggestion: "Use StringBuilder"
  bigO: { before: "O(n²)", after: "O(n)" }
  benchmark: "10-100x faster"
  tags: ["performance", "memory"]
  structural:
    entityTypes: ["method", "function"]
    hasLoops: true
  exemplarIds: ["java:string-concat-in-loop:bad1"]
  minSemanticSimilarity: 0.65     # Semantic is critical for optimization
  minStructuralConfidence: 0.5
```

## Adding Graph-Based Rules

```yaml
structural:
  entityTypes: ["method"]
  relationships:
    - type: "references"
      direction: "outgoing"
      crossFileRatio:
        min: 0.5               # >50% refs outside file = feature envy
```

## Custom Detectors

For logic not expressible in YAML, add a function in `detectors/{language}.ts`:

```typescript
export function checkMyPattern(entity: Entity): CustomDetectorResult {
  // ... complex logic
  return { match: true, confidence: 0.9, matchedCriteria: ["reason"] };
}
```

Reference it in YAML: `customDetector: "checkMyPattern"`

## minSemanticSimilarity Guidelines

| Rule type | Threshold | Reason |
|-----------|-----------|--------|
| Pure metrics (god-class, deep-nesting) | `0.0` | Metrics are deterministic |
| Pure structural (async-void, missing-modifier) | `0.0` | Modifiers/types are exact |
| Patterns with variations (empty-catch) | `0.55-0.65` | Semantic reduces false positives |
| Optimization recipes | `0.60-0.75` | Structural is coarse, semantic is critical |
| Best-patterns | `0.55-0.65` | Helps determine "correct" usage |

## Checklist

1. Add entry to `rules/{language}.yaml`
2. If semantic validation needed — add exemplar(s) to `exemplars/{language}.yaml`
3. If complex logic — add `customDetector` in `detectors/{language}.ts`
4. Test: `detect_patterns` on real project shouldn't produce false positives
5. ID format: `{lang}:{kebab-case}` — globally unique
