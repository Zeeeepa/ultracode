# Detectors

Language-specific detectors identifying code anti-patterns and quality issues

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `checkAnyTypeParam` | function | Detects any type parameters reducing type safety guarantees | [→ typescript.ts:94-105] |
| `checkAsyncVoid` | function | Detects async functions returning void without proper error handling | [→ typescript.ts:11-25] |
| `checkBareExcept` | function | Detects catch-all exception handlers catching system exceptions | [→ python.ts:11-21] |
| `checkCSharpAsyncVoid` | function | Detects dangerous async void method declarations crashing process | [→ csharp.ts:30-42] |
| `checkDeepNesting` | function | Detects code blocks exceeding nesting depth threshold | [→ common.ts:33-44] |
| `checkEmptyCatch` | function | Detects try-catch blocks with empty handlers swallowing exceptions | [→ typescript.ts:30-44] |
| `checkGodFunction` | function | Detects functions with high cyclomatic or line complexity | [→ common.ts:11-28] |
| `checkGodService` | function | Detects constructors with excessive dependency injection parameters | [→ csharp.ts:47-65] |
| `checkGoroutineLeak` | function | Detects goroutines launched without context cancellation support | [→ go.ts:36-36] |
| `checkIgnoredError` | function | Detects functions with multiple calls ignoring error returns | [→ go.ts:9-30] |
| `checkJavaEmptyCatch` | function | Detects empty catch blocks swallowing exceptions silently | [→ java.ts:35-44] |
| `checkJavaMutableStatic` | function | Detects unprotected mutable static fields causing race conditions | [→ java.ts:49-62] |
| `checkLargeClass` | function | Detects classes with excessive methods and code size | [→ common.ts:112-112] |
| `checkLinqInHotpath` | function | Detects LINQ queries in performance-critical code paths | [→ csharp.ts:124-146] |
| `checkMissingCancellation` | function | Detects async tasks lacking cancellation token support | [→ csharp.ts:72-73] |
| `checkMutableDefaultArg` | function | Detects mutable default arguments shared across multiple calls | [→ python.ts:26] |
| `checkMutableStatic` | function | Detects unprotected mutable static fields causing thread issues | [→ csharp.ts:11-25] |
| `checkNakedReturn` | function | Detects unnamed returns in long functions reducing readability | [→ go.ts:74-74] |
| `checkNestedCallbacks` | function | Detects callback hell pattern with excessive nesting levels | [→ typescript.ts:49-63] |
| `checkNoDocumentation` | function | Detects public entities lacking documentation blocks | [→ common.ts:63-81] |
| `checkNoTypeHints` | function | Detects functions lacking type annotations and hints | [→ python.ts:76-76] |
| `checkPromiseNoCatch` | function | Detects promises lacking catch or try-catch error handlers | [→ typescript.ts:68-89] |
| `checkRawTypes` | function | Detects generic types used without type parameter specification | [→ java.ts:11-30] |
| `checkReflectionInHotpath` | function | Detects reflection calls in performance-critical code paths | [→ java.ts:85-104] |
| `checkSingletonMutableState` | function | Detects mutable static state in singleton class context | [→ csharp.ts:96-101] |
| `checkSmallFocusedFunction` | function | Detects well-structured short focused function pattern | [→ common.ts:91-95] |
| `checkStarImport` | function | Detects wildcard imports polluting module namespace and dependencies | [→ python.ts:52-68] |
| `checkStringConcatInLoop` | function | Detects inefficient string concatenation in loop constructs | [→ java.ts:72-79] |
| `checkTooManyParams` | function | Detects functions with more than seven parameters | [→ common.ts:49-58] |
| `checkTooManyReturns` | function | Detects functions exceeding reasonable return statement count | [→ go.ts:57-68] |

## Files

- **common.ts** — Universal code quality detectors applicable across all languages
- **csharp.ts** — C# specific detectors for threading and async anti-patterns
- **go.ts** — Go specific detectors for concurrency and error handling patterns
- **java.ts** — Java and Kotlin detectors for generics and reflection issues
- **python.ts** — Python specific detectors for imports and type safety patterns
- **typescript.ts** — TypeScript specific detectors for async and promise patterns
