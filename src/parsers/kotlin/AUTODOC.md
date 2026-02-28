---
module_name: kotlin
description: "Type definitions for the Kotlin ANTLR parser context and extracted information"
status: active
language: typescript
---

# Kotlin

> Defines all shared types for the Kotlin parser pipeline, including parser context, call info, control flow, documentation, coroutines, complexity metrics, and framework patterns.

## Overview

This module provides the foundational type definitions used across all Kotlin parser submodules. It defines the `ParserContext` passed through parsing functions, structural types for calls, annotations, inheritance, parameters, control flow (including Kotlin-specific constructs like `when`, `elvis`, labeled returns), KDoc documentation, coroutine information, complexity metrics, and framework pattern types for Android ViewModel and Ktor routing.

## Data Flow

- **Inputs**: N/A (type definitions only)
- **Processing**: Types are consumed by extractors, framework analyzers, and the main Kotlin parser
- **Outputs**: Type contracts for all Kotlin parser modules

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ParserContext` | interface | Context passed through all parsing functions | [`types.ts:17-24`](./types.ts) |
| `LocationInfo` | type | AST node position information | [`types.ts:33-36`](./types.ts) |
| `CallInfo` | interface | Function/method call information with Kotlin-specific fields | [`types.ts:45-66`](./types.ts) |
| `AnnotationInfo` | interface | Annotation information from modifiers | [`types.ts:75-78`](./types.ts) |
| `InheritanceInfo` | interface | Class/interface inheritance data | [`types.ts:87-90`](./types.ts) |
| `ParameterInfo` | interface | Function/constructor parameter info | [`types.ts:99-105`](./types.ts) |
| `BranchInfo` | interface | Branch info including `when` and `elvis` types | [`types.ts:114-118`](./types.ts) |
| `LoopInfo` | interface | Loop information (for/while/do-while) | [`types.ts:123-126`](./types.ts) |
| `ExceptionInfo` | interface | Exception handling information | [`types.ts:131-135`](./types.ts) |
| `ReturnInfo` | interface | Return statement info with label support | [`types.ts:140-144`](./types.ts) |
| `ControlFlowInfo` | interface | Complete control flow with awaits | [`types.ts:149-158`](./types.ts) |
| `KDocParam` | interface | KDoc parameter documentation | [`types.ts:167-171`](./types.ts) |
| `KDocInfo` | interface | Parsed KDoc with Kotlin-specific tags | [`types.ts:176-198`](./types.ts) |
| `CoroutineInfo` | interface | Coroutine and suspend function info | [`types.ts:207-215`](./types.ts) |
| `ComplexityMetrics` | interface | Code complexity metrics | [`types.ts:224-232`](./types.ts) |
| `ViewModelInfo` | interface | Android ViewModel pattern info | [`types.ts:241-245`](./types.ts) |
| `KtorRouteInfo` | interface | Ktor HTTP route info | [`types.ts:250-254`](./types.ts) |
| `AntlrToken` | interface | ANTLR token with position info | [`types.ts:263-269`](./types.ts) |
| `AntlrContext` | interface | Generic ANTLR context | [`types.ts:274-280`](./types.ts) |
| `AntlrContextWithChildren` | interface | ANTLR context with children | [`types.ts:285-289`](./types.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../types/parser` | Shared `ParsedEntity` and `EntityRelationship` types |

### External Packages

_None_

## Behavioral Properties

| Property | Value |
|----------|-------|
| Kotlin-specific branch types | `when`, `when-entry`, `elvis` |
| Labeled returns | `ReturnInfo.label` for `return@name` |
| Coroutine awareness | `CallInfo.isAwait`, `CoroutineInfo` with scope/dispatcher tracking |

## Error Handling

N/A (type definitions only).

## Known Limitations

- `CallInfo.isAwait` is set by extractors but not all suspend calls are detectable statically
- `ViewModelInfo` and `KtorRouteInfo` are simplified representations of complex framework patterns

## Files

| File | Description |
|------|-------------|
| `types.ts` | All shared type definitions for the Kotlin parser pipeline |
