# Detectors

Language-specific code pattern detectors for identifying anti-patterns across TypeScript, C#, Go, Java, Python, and Zig

## Overview

This module provides a collection of language-specific detector functions that identify anti-patterns, code quality issues, and problematic design patterns across TypeScript, Python, C#, Go, and Java codebases. Each detector examines code entities (functions, classes, constructors) by analyzing their metadata (metrics, modifiers, complexity, nesting depth) and returns a standardized result indicating whether the pattern matches, along with a confidence score. Detectors are organized by language to capture language-specific concerns—such as async/void in C# and TypeScript, goroutine leaks in Go, or mutable statics in Java—while common detectors (god functions, deep nesting, missing documentation) apply across all languages.

## Flow

```
┌─────────────────────────────────────────────────┐
│ Entity (function/class/method)                  │
│ with metadata: metrics, modifiers, signatures   │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Language Detector  │
        │ (TS/Py/C#/Go/Java) │
        └────────┬───────────┘
                 │
          Analyze entity:
          • Complexity metrics
          • Line count
          • Parameter count
          • Nesting depth
          • Async patterns
          • Type annotations
                 │
                 ↓
        ┌────────────────────────┐
        │ CustomDetectorResult   │
        │ {                      │
        │   match: boolean,      │
        │   confidence: number,  │
        │   matchedCriteria?: [] │
        │ }                      │
        └────────────────────────┘
```

## Entity Listing

### Common Detectors (Language-Agnostic)
- `checkGodFunction` — Detects functions exceeding cyclomatic complexity > 20 or lines of code > 200 [common.ts:11-30]
- `checkDeepNesting` — Detects code blocks with nesting depth exceeding 5 levels [common.ts:32-45]
- `checkTooManyParams` — Detects functions with more than seven parameters reducing readability and testability [common.ts:52-75]
- `checkNoDocumentation` — Detects public entities lacking documentation blocks [common.ts:81-98]
- `checkSmallFocusedFunction` — Detects well-structured short focused function pattern indicating code health [common.ts:104-120]
- `checkLargeClass` — Detects classes with excessive methods and code size violating single responsibility [common.ts:127-145]

### TypeScript Detectors
- `checkAsyncVoid` — Detects async functions returning void without proper error handling causing unhandled promise rejections [typescript.ts:11-25]
- `checkEmptyCatch` — Detects try-catch blocks with empty handlers swallowing exceptions silently [typescript.ts:32-48]
- `checkNestedCallbacks` — Detects callback hell pattern with excessive nesting levels reducing maintainability [typescript.ts:55-74]
- `checkPromiseNoCatch` — Detects promises lacking catch or try-catch error handlers creating silent failures [typescript.ts:81-105]
- `checkAnyTypeParam` — Detects any type parameters reducing type safety guarantees and defeating static analysis [typescript.ts:112-128]

### Python Detectors
- `checkBareExcept` — Detects catch-all exception handlers catching system exceptions like KeyboardInterrupt [python.ts:11-26]
- `checkMutableDefaultArg` — Detects mutable default arguments shared across multiple calls causing state leakage [python.ts:33-52]
- `checkStarImport` — Detects wildcard imports polluting module namespace and creating hidden dependencies [python.ts:59-75]
- `checkNoTypeHints` — Detects functions lacking type annotations and hints reducing code clarity and IDE support [python.ts:82-108]

### C# Detectors
- `checkMutableStatic` — Detects unprotected mutable static fields causing thread safety issues and race conditions [csharp.ts:11-32]
- `checkCSharpAsyncVoid` — Detects dangerous async void method declarations that crash the process on unhandled exceptions [csharp.ts:39-54]
- `checkGodService` — Detects constructors with excessive dependency injection parameters violating single responsibility [csharp.ts:61-85]
- `checkMissingCancellation` — Detects async tasks lacking cancellation token support preventing graceful shutdown [csharp.ts:92-115]
- `checkSingletonMutableState` — Detects mutable static state in singleton class context causing concurrency issues [csharp.ts:122-138]
- `checkLinqInHotpath` — Detects LINQ queries in performance-critical code paths causing allocation overhead [csharp.ts:145-168]

### Go Detectors
- `checkIgnoredError` — Detects functions with multiple calls ignoring error returns causing silent failures [go.ts:9-35]
- `checkGoroutineLeak` — Detects goroutines launched without context cancellation support creating resource leaks [go.ts:42-62]
- `checkTooManyReturns` — Detects functions exceeding reasonable return statement count indicating complex control flow [go.ts:69-84]
- `checkNakedReturn` — Detects unnamed returns in long functions reducing code readability and maintainability [go.ts:91-107]

### Java & Kotlin Detectors
- `checkRawTypes` — Detects generic types used without type parameter specification reducing type safety [java.ts:11-38]
- `checkJavaEmptyCatch` — Detects empty catch blocks swallowing exceptions silently without logging or handling [java.ts:45-61]
- `checkStringConcatInLoop` — Detects inefficient string concatenation in loop constructs causing O(n²) behavior [java.ts:68-84]
- `checkJavaMutableStatic` — Detects unprotected mutable static fields causing race conditions in concurrent access [java.ts:91-108]
- `checkReflectionInHotpath` — Detects reflection calls in performance-critical code paths reducing throughput [java.ts:115-136]

### Zig Detectors
- `checkMissingDeferFree` — Detects missing defer statements for memory and resource cleanup preventing leaks [zig.ts:13-34]
- `checkMissingErrdefer` — Detects missing errdefer blocks for error-path cleanup causing incomplete error recovery [zig.ts:39-66]
- `checkEmptyCatch` — Detects empty error handling blocks swallowing errors silently without logging or recovery [zig.ts:71-85]
- `checkSwallowedError` — Detects ignored error returns without proper error handling or propagation [zig.ts:90-108]

## Dependencies

- **Input Type**: `Entity` from `../../../types/storage.js` — code entity with metadata (metrics, modifiers, signatures)
- **Output Type**: `CustomDetectorResult` from `../types.js` — standardized detection result with match status and confidence score
- **Metadata Access**: Detectors examine `entity.metadata` to extract metrics (cyclomatic complexity, lines of code), modifiers (async, static, public), and structural properties (nesting depth, parameter count)