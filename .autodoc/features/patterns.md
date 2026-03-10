# Pattern Detection

## detect_patterns

Detect anti-patterns, best-patterns, code smells, and optimization opportunities using a two-stage pipeline: **structural analysis** (fast metadata/AST checks) → **semantic validation** (embedding similarity with curated exemplars).

Supports **235 rules** across **7 languages**: TypeScript, Python, C#, Java/Kotlin, Go, Zig, and language-agnostic common rules.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| projectPath | string? | current project | Project directory path |
| filePath | string? | - | Scan specific file only |
| language | string? | auto-detected | Filter: typescript, python, csharp, java, go, zig |
| category | string? | "all" | anti-pattern, best-pattern, code-smell, optimization, all |
| tags | string[]? | - | Filter by tags: async, performance, memory, security, jit, etc. |
| minConfidence | number? | 0.5 | Minimum combined score (0-1) |
| severity | string? | "all" | critical, high, medium, low, info, all |
| format | string? | "summary" | Output: summary, detailed, json |
| suppressPatterns | string[]? | - | Pattern IDs to skip (known false positives) |
| offset | number? | 0 | Pagination offset |
| limit | number? | 50 | Max results per category |
| entityLimit | number? | 50000 | Max entities to scan from DB |

### Returns

Summary format includes:
- Health score (0-100)
- Counts per category
- Top issues by severity
- Match details: pattern name, entity, file:line, confidence scores

Detailed format adds: description, suggestion, Big-O, benchmark, matched criteria.

### Examples

```json
// Find all anti-patterns
detect_patterns({category: "anti-pattern"})

// Performance optimizations only
detect_patterns({category: "optimization", tags: ["performance"]})

// Check specific file with high confidence
detect_patterns({filePath: "src/services/auth.ts", severity: "high"})

// Detailed output for Python pandas issues
detect_patterns({language: "python", tags: ["pandas"], format: "detailed"})

// Suppress known false positives
detect_patterns({suppressPatterns: ["cs:empty-interface", "py:no-docstring"]})

// JIT deoptimization rules for JS/TS
detect_patterns({category: "optimization", tags: ["jit"]})
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

## Scoring

- **structuralConfidence** (0-1): Metadata match quality (AST fields, calls, metrics)
- **semanticSimilarity** (0-1): Embedding similarity with curated exemplars
- **combinedScore**: structural × 0.4 + semantic × 0.6 (for hybrid rules); 1.0 for structural-only rules
- **healthScore** (0-100): Overall project health based on pattern balance

---

## Categories

### Anti-Patterns
Bad practices that should be fixed. 103 rules across all languages.

### Best-Patterns
Good practices found in code. 18 rules. Severity is always "info".

### Code Smells
Structural issues detectable by metrics and AST analysis. 66 rules.

### Optimization
Performance improvement opportunities with Big-O analysis and benchmarks. 54 rules.

---

## Rules by Language

### TypeScript / JavaScript — 52 rules

#### Anti-patterns (20)
- `ts:async-void` — Async Void Function (high)
- `ts:empty-catch` — Empty Catch Block (high)
- `ts:promise-no-catch` — Promise Without Error Handling (high)
- `ts:async-constructor` — Async Constructor (high)
- `ts:event-listener-leak` — Event Listener Leak (high)
- `ts:unsafe-type-assertion` — Unsafe Type Assertion (high)
- `ts:unsafe-innerhtml` — Unsafe innerHTML Assignment (critical)
- `ts:redos-vulnerability` — ReDoS Vulnerability (critical)
- `ts:circular-dependency` — Circular Dependency (high)
- `ts:nested-callbacks` — Nested Callbacks / Callback Hell (medium)
- `ts:any-type-param` — Any Type Parameter (medium)
- `ts:mutable-export` — Mutable Export (medium)
- `ts:non-null-assertion-abuse` — Non-null Assertion Abuse (medium)
- `ts:nullish-vs-or-confusion` — Nullish vs OR Confusion (medium)
- `ts:throw-non-error` — Throw Non-Error Object (medium)
- `ts:unsafe-index-access` — Unsafe Index Access (medium)
- `ts:missing-null-check` — Missing Null Check (medium)
- `ts:declaration-merging-trap` — Declaration Merging Trap (medium)
- `ts:no-error-typing` — Untyped Error in Catch (low)

#### Best-patterns (2)
- `ts:proper-error-handling` — Proper Async Error Handling (info)
- `ts:proper-async-await` — Proper Async/Await Usage (info)

#### Code-smells (13)
- `ts:boolean-trap` — Boolean Trap (medium)
- `ts:inconsistent-return-type` — Inconsistent Return Type (medium)
- `ts:parameter-mutation` — Parameter Mutation (medium)
- `ts:barrel-file` — Barrel File (medium)
- `ts:enum-pitfalls` — Enum Pitfalls (medium)
- `ts:missing-generic-constraint` — Missing Generic Constraint (low)
- `ts:namespace-antipattern` — Namespace Declaration (low)
- `ts:conditional-type-abuse` — Conditional Type Abuse (info)
- `ts:any-in-tests` — Any Type in Tests (low)
- `ts:snapshot-abuse` — Snapshot Test Abuse (low)
- `ts:implementation-testing` — Implementation Testing (low)
- `ts:stringly-typed-api` — Stringly-Typed API (low)
- `ts:missing-readonly` — Missing Readonly on Class Property (low)
- `ts:missing-input-validation` — Missing Input Validation (low)
- `ts:side-effect-import` — Side-Effect Import (low)

#### Optimizations (17)
- `ts:jit-eval` — eval() Prevents JIT Optimization (critical) `[jit]`
- `ts:jit-with-statement` — with Statement Deoptimizes Scope Chain (critical) `[jit]`
- `ts:jit-delete-operator` — delete Operator Kills Inline Caching (high) `[jit]`
- `ts:jit-holey-array` — Holey Array via new Array(n) (medium) `[jit]`
- `ts:jit-arguments-object` — arguments Object Prevents Optimization (medium) `[jit]`
- `ts:jit-spread-in-hot-path` — Spread Operator in Hot Path (medium) `[jit]`
- `ts:jit-dynamic-property-access` — Dynamic Property Access in Loop (low) `[jit]`
- `ts:jit-megamorphic-interface` — Megamorphic Interface / 5+ Implementations (low) `[jit]`
- `ts:jit-optional-chaining-hot` — Excessive Optional Chaining (low) `[jit]`
- `ts:rxjs-subscribe-in-loop` — Subscribe in Loop Without Unsubscribe (high)
- `ts:layout-thrashing` — Layout Thrashing (medium)
- `ts:angular-default-change-detection` — Default Change Detection in Angular (medium)
- `ts:no-trackby-ngfor` — ngFor Without trackBy (medium)
- `ts:function-in-template` — Function Call in Template (medium)
- `ts:quadratic-array-ops` — Quadratic Array Operations (medium)
- `ts:json-deep-clone` — JSON Deep Clone (medium)
- `ts:accumulating-spread` — Accumulating Spread in Reduce (medium)
- `ts:await-in-loop` — Await in Loop (medium)

---

### Python — 75 rules

#### Anti-patterns (30)
- `py:bare-except` — Bare Except Clause (high)
- `py:mutable-default-arg` — Mutable Default Argument (high)
- `py:swallowed-exception` — Swallowed Exception / except:pass (high)
- `py:open-without-with` — open() Without Context Manager (high)
- `py:async-no-await` — Async Function Without Await (high)
- `py:re-raise-different` — Re-raise Different Exception Type (high)
- `py:pd-append-in-loop` — DataFrame.append() in Loop, O(n²) (high)
- `py:pd-concat-in-loop` — pd.concat() in Loop, O(n²) (high)
- `py:pd-chained-indexing` — Chained Indexing Assignment (high)
- `py:pd-inplace-true` — inplace=True Parameter (medium)
- `py:pd-missing-copy` — DataFrame Slice Without .copy() (medium)
- `py:pd-nan-comparison` — NaN Equality Comparison (critical)
- `py:np-append-in-loop` — np.append() in Loop (high)
- `py:np-float-cmp` — Float Equality Comparison (high)
- `py:np-deprecated-alias` — NumPy Deprecated Type Alias (medium)
- `py:np-matrix` — np.matrix Usage (medium)
- `py:sk-data-leakage` — Data Leakage: fit_transform Before Split (critical)
- `py:sk-cv-leakage` — Cross-validation Leakage (critical)
- `py:sk-predict-no-fit` — predict() Without fit() (high)
- `py:eval-exec` — eval/exec Usage (critical)
- `py:subprocess-shell` — subprocess with shell=True (critical)
- `py:sql-injection` — SQL String Interpolation (critical)
- `py:pickle-load` — pickle.load() on Untrusted Data (critical)
- `py:yaml-load-unsafe` — yaml.load() Without SafeLoader (critical)
- `py:asyncio-run-in-loop` — asyncio.run() Inside Async Function (critical)
- `py:plt-no-close` — Figure Without plt.close() (medium)
- `py:plt-state-confusion` — Mixed pyplot/OO API (medium)
- `py:star-import` — Star Import (medium)
- `py:global-state` — Global Mutable State (medium)
- `py:generic-raise` — Generic Exception Raise (medium)
- `py:del-finalizer` — __del__ Finalizer (medium)
- `py:gil-thread` — ThreadPoolExecutor for CPU-bound Work (high)
- `py:test-float-eq` — Float Equality in Tests (high)

#### Best-patterns (3)
- `py:context-manager` — Context Manager Usage (info)
- `py:type-annotations` — Fully Typed Function (info)
- `py:generator-pattern` — Generator Pattern (info)

#### Code-smells (24)
- `py:god-class` — God Class / >20 methods (high)
- `py:high-complexity` — High Cyclomatic Complexity / CC>10 (high)
- `py:deep-nesting` — Deeply Nested Code / >4 levels (high)
- `py:too-many-returns` — Too Many Return Statements / >5 (medium)
- `py:isinstance-chain` — isinstance Chain / >3 checks (medium)
- `py:init-too-complex` — __init__ Does Too Much / >10 calls (medium)
- `py:wide-try` — Wide Try Block (medium)
- `py:any-abuse` — Excessive Any Type Usage (medium)
- `py:many-pos-args` — Too Many Positional Arguments (medium)
- `py:bool-trap` — Boolean Trap (medium)
- `py:asyncio-run` — asyncio.run() Usage (medium)
- `py:threadpool-no-max` — ThreadPoolExecutor Without max_workers (medium)
- `py:no-seed` — Random Without Seed (medium)
- `py:pd-merge-no-validate` — merge() Without validate (medium)
- `py:sk-no-pipeline` — Multiple fit_transform Without Pipeline (medium)
- `py:sk-no-random-state` — sklearn Without random_state (medium)
- `py:sk-accuracy` — accuracy_score on Imbalanced Data (medium)
- `py:no-type-hints` — Missing Type Hints (low)
- `py:no-docstring` — Missing Docstring (low)
- `py:type-ignore-no-code` — Blanket type: ignore (low)
- `py:pd-dot-values` — DataFrame.values Usage (low)
- `py:pd-csv-no-dtype` — read_csv Without dtype (low)
- `py:open-no-encoding` — open() Without encoding (low)
- `py:missing-repr` — Class Missing __repr__ (low)
- `py:property-no-setter` — Read-only @property Without Documentation (info)

#### Optimizations (18)
- `py:pd-iterrows` — DataFrame.iterrows(), O(n²) (high)
- `py:np-loop` — Python Loop Over NumPy Array (high)
- `py:string-concat-in-loop` — String Concatenation in Loop, O(n²) (medium)
- `py:string-concat-loop-hint` — String Concatenation in Loop (parser-detected) (medium)
- `py:pd-apply` — DataFrame.apply() Anti-pattern (medium)
- `py:pd-groupby-apply` — groupby().apply() Pattern (medium)
- `py:plt-show-loop` — plt.show() in Loop (medium)
- `py:re-compile-loop` — Regex Compile in Loop (medium)
- `py:sorted-loop` — sorted() in Loop (medium)
- `py:missing-slots` — Class Missing __slots__ (medium)
- `py:list-comprehension-over-loop` — Loop Instead of Comprehension (low)
- `py:pd-itertuples` — DataFrame.itertuples() Usage (low)
- `py:date-parse-loop` — Date Parsing in Loop (low)

---

### C# — 63 rules

#### Anti-patterns (38)
- `cs:mutable-static` — Mutable Static Field (critical)
- `cs:ef-dbcontext-singleton` — DbContext Registered as Singleton (critical)
- `cs:async-sync-over-async` — Sync-over-Async / .Result / .Wait() (critical)
- `cs:mem-httpclient-new` — new HttpClient() — Socket Exhaustion (critical)
- `cs:conc-lock-on-this` — lock(this) or lock(typeof(...)) (critical)
- `cs:err-swallowed-exception` — Swallowed Exception / Empty Catch (critical)
- `cs:aspnet-wildcard-cors` — Wildcard CORS / AllowAnyOrigin (critical)
- `cs:grpc-channel-per-call` — New gRPC Channel Per Call (critical)
- `cs:async-lock-with-await` — lock() with await Inside (critical)
- `cs:ef-raw-sql-injection` — SQL Injection in FromSqlRaw (critical)
- `cs:ef-load-entire-table` — EF Core Load Entire Table (critical)
- `cs:async-void` — Async Void Method (high)
- `cs:singleton-mutable-state` — Singleton Mutable State (high)
- `cs:ef-n-plus-one` — EF Core N+1 Query (high)
- `cs:err-throw-ex` — throw ex — Stack Trace Lost (high)
- `cs:aspnet-pii-in-logs` — PII Object Destructuring in Logs (high)
- `cs:mem-missing-dispose` — IDisposable Without using/Dispose (high)
- `cs:conc-dict-check-then-act` — Dictionary TOCTOU (high)
- `cs:aspnet-captive-dependency` — Captive Dependency / Singleton→Scoped (high)
- `cs:async-parallel-foreach-async` — Parallel.ForEach with Async Delegate (high)
- `cs:ef-find-in-loop` — EF Query Inside Loop (high)
- `cs:ef-client-side-eval` — EF Core Client-Side Evaluation (high)
- `cs:hardcoded-connection` — Hardcoded Connection String (high)
- `cs:mixed-async-sync` — Mixed Async and Sync-over-Async (high)
- `cs:missing-cancellation` — Missing CancellationToken (medium)
- `cs:ef-cartesian-explosion` — EF Core Cartesian Explosion (medium)
- `cs:ef-entity-as-api-response` — EF Entity Exposed in API Response (medium)
- `cs:async-fire-and-forget` — Fire-and-Forget Async Call (medium)
- `cs:async-task-run-in-aspnet` — Task.Run in ASP.NET Controller (medium)
- `cs:di-service-locator` — Service Locator Anti-Pattern (medium)
- `cs:mem-static-collection-leak` — Static Collection Memory Leak (medium)
- `cs:minimal-api-no-validation` — Minimal API Without Validation (medium)
- `cs:grpc-missing-deadline` — gRPC Call Without Deadline (medium)
- `cs:ef-savechanges-no-transaction` — Multiple SaveChanges Without Transaction (medium)
- `cs:err-catch-generic` — catch(Exception) Without Specific Catches (medium)
- `cs:err-exception-flow-control` — Exception as Flow Control (medium)
- `cs:mem-event-handler-leak` — Event Handler Without Unsubscribe (medium)
- `cs:regex-no-timeout` — Regex Without Timeout (medium)

#### Best-patterns (3)
- `cs:proper-di` — Proper Dependency Injection (info)
- `cs:cancellation-propagation` — Cancellation Token Propagation (info)

#### Code-smells (12)
- `cs:god-service` — God Service (medium)
- `cs:deep-nesting` — Excessive Nesting Depth (medium)
- `cs:boolean-blindness` — Boolean Blindness / 3+ bool Parameters (medium)
- `cs:minimal-api-fat-lambda` — Fat Lambda in Minimal API (medium)
- `cs:empty-interface` — Empty Interface (low)
- `cs:di-too-many-deps` — Too Many Constructor Dependencies (low)
- `cs:minimal-api-results-not-typed` — Minimal API Using Results Instead of TypedResults (low)
- `cs:large-try-block` — Overly Large Try Block (low)
- `cs:catch-rethrow-only` — Catch That Only Rethrows (low)
- `cs:no-configureawait` — Missing ConfigureAwait in Library Code (low)

#### Optimizations (9)
- `cs:string-concat-in-loop` — String Concatenation in Loop (medium)
- `cs:linq-in-hotpath` — LINQ in Hot Path (medium)
- `cs:no-asnotracking` — EF Query Without AsNoTracking (medium)
- `cs:no-arraypool` — Temporary Buffer Without ArrayPool (medium)
- `cs:linq-premature-materialization` — LINQ Premature Materialization (medium)
- `cs:string-interpolation-in-log` — String Interpolation in Logger (low)

---

### Java / Kotlin — 12 rules

#### Anti-patterns (3)
- `java:raw-types` — Raw Type Usage (medium)
- `java:empty-catch` — Empty Catch Block (high)
- `java:mutable-static-field` — Mutable Static Field (high)

#### Best-patterns (2)
- `java:builder-pattern` — Builder Pattern (info)
- `java:proper-resource-handling` — Try-With-Resources (info)

#### Code-smells (1)
- `java:god-class` — God Class (high)

#### Optimizations (6)
- `java:string-concat-in-loop` — String Concatenation in Loop (medium)
- `java:regex-in-loop` — Regex Compilation in Loop (medium)
- `java:reflection-in-hotpath` — Reflection in Hot Path (high)
- `java:list-no-capacity` — ArrayList Without Initial Capacity (low)
- `kotlin:boxing-nullable-primitives` — Boxing via Nullable Primitives (medium)
- `kotlin:sequence-for-large-collections` — Chain Without Sequence (low)

---

### Go — 9 rules

#### Anti-patterns (2)
- `go:ignored-error` — Ignored Error (high)
- `go:goroutine-leak` — Goroutine Leak (high)

#### Best-patterns (3)
- `go:error-wrapping` — Error Wrapping (info)
- `go:context-propagation` — Context Propagation (info)
- `go:interface-segregation` — Small Interface (info)

#### Code-smells (2)
- `go:naked-return` — Naked Return in Long Function (low)
- `go:too-many-returns` — Too Many Return Statements (medium)

#### Optimizations (2)
- `go:string-concat-in-loop` — String Concatenation in Loop (medium)
- `go:slice-no-capacity` — Slice Without Pre-allocation (low)

---

### Zig — 16 rules

#### Anti-patterns (7)
- `zig:missing-defer-free` — Missing defer free (high)
- `zig:missing-errdefer` — Missing errdefer (high)
- `zig:empty-catch` — Empty Catch (high)
- `zig:unsafe-cast-abuse` — Unsafe Cast Abuse (high)
- `zig:alloc-without-free` — Alloc Without Free (high)
- `zig:hardcoded-allocator` — Hardcoded Allocator (medium)
- `zig:mutex-not-deferred` — Mutex Not Deferred (medium)

#### Best-patterns (3)
- `zig:has-deinit` — Has deinit (info)
- `zig:allocator-param` — Allocator Parameter (info)
- `zig:proper-error-handling` — Proper Error Handling (info)

#### Code-smells (4)
- `zig:unreachable-abuse` — Unreachable Abuse (medium)
- `zig:swallowed-error` — Swallowed Error (medium)
- `zig:unsafe-optional-unwrap` — Unsafe Optional Unwrap (medium)
- `zig:wrong-naming-convention` — Wrong Naming Convention (low)

#### Optimizations (2)
- `zig:allocation-in-loop` — Allocation in Loop (medium)
- `zig:string-concat-in-loop` — String Concatenation in Loop (medium)

---

### Common (language-agnostic) — 9 rules

#### Best-patterns (2)
- `common:small-focused-function` — Small Focused Function (info)
- `common:documented-public-api` — Documented Public API (info)

#### Code-smells (7)
- `common:god-function` — God Function (high)
- `common:large-class` — Large Class (high)
- `common:deep-nesting` — Deep Nesting (medium)
- `common:too-many-params` — Too Many Parameters (medium)
- `common:feature-envy` — Feature Envy (medium)
- `common:shotgun-surgery` — Shotgun Surgery (medium)
- `common:no-documentation` — Undocumented Public API (low)

---

## Summary

| Language | Total | Anti-pattern | Best-pattern | Code-smell | Optimization |
|----------|-------|-------------|-------------|-----------|-------------|
| TypeScript/JS | 52 | 20 | 2 | 13 | 17 |
| Python | 75 | 30 | 3 | 24 | 18 |
| C# | 63 | 38 | 3 | 12 | 9 |
| Java/Kotlin | 12 | 3 | 2 | 1 | 6 |
| Go | 9 | 2 | 3 | 2 | 2 |
| Zig | 16 | 7 | 3 | 4 | 2 |
| Common | 9 | 0 | 2 | 7 | 0 |
| **Total** | **235** | **103** | **18** | **63** | **54** |

### Detection pipeline

1. **Structural filtering** — fast metadata checks (entity type, calls, controlFlow, hints, metrics)
2. **Custom detectors** — language-specific TypeScript functions with AST/regex analysis
3. **Semantic validation** — embedding similarity with curated exemplar code snippets
4. **Scoring** — combined confidence from structural + semantic stages

### Data sources by language

| Language | Parser | Metadata fields |
|----------|--------|----------------|
| TypeScript/JS | TypeScript Compiler API | jitHints, antipatternHints, calls, controlFlow |
| Python | python-ast-cli.py (native AST) | pythonHints, classMeta, controlFlow (extended), calls with kwargs |
| C# | Roslyn .NET analyzer | csharpHints, calls, controlFlow |
| Java/Kotlin | ANTLR4 grammar | calls, controlFlow, metrics |
| Go | go-ast-cli.go (native AST) | calls, controlFlow |
| Zig | zigOps extractor | zigOps (forceUnwrap, unsafeCast, unreachable) |
