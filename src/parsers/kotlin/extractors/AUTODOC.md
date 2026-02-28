---
module_name: kotlin-extractors
description: "AST-based extractors for calls, control flow, complexity, and KDoc from Kotlin code"
status: active
language: typescript
---

# Kotlin Extractors

> Provides optimized AST-traversal extractors for function calls, control flow structures, complexity metrics, and KDoc documentation from Kotlin ANTLR parse trees.

## Overview

This module contains specialized extractors for Kotlin code analysis. The `unified-extractor` performs calls, control flow, and complexity extraction in a single AST pass for 40-50% performance improvement. It handles Kotlin-specific constructs including safe calls (`?.`), elvis operator (`?:`), `when` expressions, scope functions, coroutine builders, and labeled returns. Individual extractors are maintained for backward compatibility.

## Data Flow

- **Inputs**: ANTLR `ParserRuleContext` nodes from Kotlin function bodies and `CommonTokenStream` for KDoc
- **Processing**: Recursive AST traversal with node-type dispatch maps; handles Kotlin's `PostfixUnaryExpression` call chains
- **Outputs**: `CallInfo[]`, `ControlFlowInfo`, `ComplexityMetrics`, `KDocInfo` structures

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `extractUnified` | function | Single-pass extraction of calls, control flow, and complexity | [`unified-extractor.ts:106-106`](./unified-extractor.ts) |
| `UnifiedExtractionResult` | interface | Combined result type | [`unified-extractor.ts:42-46`](./unified-extractor.ts) |
| `extractCalls` | function | Extracts all function/method calls from a body | [`call-extractor.ts:37-46`](./call-extractor.ts) |
| `extractCallsSimple` | function | Returns call names as string array | [`call-extractor.ts:51-57`](./call-extractor.ts) |
| `extractCallsDetailed` | const | Alias for `extractCalls` | [`call-extractor.ts:62-62`](./call-extractor.ts) |
| `isCoroutineCall` | function | Checks if call is a coroutine builder | [`call-extractor.ts:357-359`](./call-extractor.ts) |
| `isScopeFunctionCall` | function | Checks if call is a scope function | [`call-extractor.ts:364-366`](./call-extractor.ts) |
| `isPotentialSuspendCall` | function | Heuristic check for suspend function calls | [`call-extractor.ts:371-385`](./call-extractor.ts) |
| `extractControlFlow` | function | Extracts branches, loops, exceptions, returns | [`control-flow-extractor.ts:30-44`](./control-flow-extractor.ts) |
| `getControlFlowStats` | function | Gets control flow statistics | [`control-flow-extractor.ts:376-384`](./control-flow-extractor.ts) |
| `hasExceptionHandling` | function | Checks for try/catch presence | [`control-flow-extractor.ts:399-401`](./control-flow-extractor.ts) |
| `getCaughtExceptionTypes` | function | Lists caught exception types | [`control-flow-extractor.ts:406-408`](./control-flow-extractor.ts) |
| `hasLabeledReturns` | function | Checks for labeled return statements | [`control-flow-extractor.ts:413-415`](./control-flow-extractor.ts) |
| `calculateComplexity` | function | Calculates all complexity metrics | [`complexity-analyzer.ts:28-62`](./complexity-analyzer.ts) |
| `calculateCyclomaticComplexity` | function | McCabe complexity with Kotlin extras | [`complexity-analyzer.ts:72-289`](./complexity-analyzer.ts) |
| `calculateCognitiveComplexity` | function | Sonar-style with Kotlin-specific penalties | [`complexity-analyzer.ts:116-181`](./complexity-analyzer.ts) |
| `calculateKotlinSpecificComplexity` | function | Extension/scope/null-safety/coroutine metrics | [`complexity-analyzer.ts:413-418`](./complexity-analyzer.ts) |
| `calculateClassComplexity` | function | Aggregate class-level metrics | [`complexity-analyzer.ts:361-365`](./complexity-analyzer.ts) |
| `getComplexityRating` | function | Returns low/medium/high/very-high rating | [`complexity-analyzer.ts:481-510`](./complexity-analyzer.ts) |
| `getRefactoringSuggestions` | function | Kotlin-aware refactoring suggestions | [`complexity-analyzer.ts:515-556`](./complexity-analyzer.ts) |
| `COMPLEXITY_THRESHOLDS` | const | Kotlin-tuned threshold values | [`complexity-analyzer.ts:455-476`](./complexity-analyzer.ts) |
| `extractKDoc` | function | Extracts KDoc from token stream | [`doc-extractor.ts:30-41`](./doc-extractor.ts) |
| `parseKDocText` | function | Parses raw KDoc text | [`doc-extractor.ts:46-49`](./doc-extractor.ts) |
| `extractKDocFromSource` | function | Extracts KDoc from source at a line | [`doc-extractor.ts:344-344`](./doc-extractor.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../types` | Shared Kotlin type definitions |
| `../utils/ast-helpers` | AST location, keyword checks, scope/coroutine detection |
| `../../../generated/kotlin/KotlinParser` | ANTLR-generated parser context types |

### External Packages
| Package | Purpose |
|---------|---------|
| `antlr4ng` | ANTLR4 runtime (`ParserRuleContext`, `CommonTokenStream`) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Unified pass performance | 40-50% faster than 3 separate passes |
| Kotlin-specific cyclomatic additions | `?.let{}`, `?.run{}` add to cyclomatic complexity |
| Cognitive complexity extras | Labeled returns, nested scope functions add penalties |

## Error Handling

All extractors return empty/default results for null inputs. Node type detection uses constructor name strings. KDoc parsing is defensive with regex-based tag splitting.

## Known Limitations

- Safe call + scope function complexity is estimated via regex on code text, not precise AST analysis
- KDoc `@suppress` tag handling is simplified (single warning per tag)
- Nested coroutine complexity detection uses heuristic regex matching

## Files

| File | Description |
|------|-------------|
| `unified-extractor.ts` | Single-pass extractor for calls, control flow, and complexity with Kotlin-specific handling |
| `call-extractor.ts` | AST-aware extraction of function calls, safe calls, scope functions, and coroutine builders |
| `complexity-analyzer.ts` | Complexity calculation with Kotlin-specific metrics (scope functions, null safety, coroutines) |
| `control-flow-extractor.ts` | Extraction of if/when/elvis branches, loops, exceptions, and labeled returns |
| `doc-extractor.ts` | KDoc comment parsing with Kotlin-specific tags (@property, @receiver, @sample, @suppress) |
