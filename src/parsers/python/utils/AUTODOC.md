---
module_name: python-utils
description: "Utilities for Python parser: circular dependency detection and AST helper functions"
status: active
language: typescript
---

# Python Utils

> Provides the circular dependency detector for Python import graphs and shared helper functions for AST node processing, magic method classification, and performance monitoring.

## Overview

This module contains two main components. `CycleDetector` analyzes import dependency graphs to find circular dependencies, classifying them by type (import, inheritance, reference) and severity, with suggested fixes. The helpers module provides constants for magic method types and built-in decorators, AST node position conversion, text extraction, and a performance monitoring wrapper used across all analyzer layers.

## Data Flow

- **Inputs**: `AnalysisContext` for cycle detection; tree-sitter `ASTNode` objects for helpers
- **Processing**: DFS-based cycle detection on import graphs; direct AST node property access for helpers
- **Outputs**: `CycleAnalysisResult[]` with paths, types, and fix suggestions; converted positions, text strings, boolean classifications

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CycleDetector` | class | Detects and analyzes circular import dependencies | [`cycle-detector.ts:30-376`](./cycle-detector.ts) |
| `CycleInfo` | interface | Cycle path and edge information | [`cycle-detector.ts:13-16`](./cycle-detector.ts) |
| `CycleAnalysisResult` | interface | Analysis result with type, severity, and fix suggestion | [`cycle-detector.ts:18-24`](./cycle-detector.ts) |
| `MAGIC_METHOD_TYPES` | const | Maps Python dunder methods to their types | [`helpers.ts:17-59`](./helpers.ts) |
| `BUILTIN_DECORATORS` | const | List of built-in Python decorators | [`helpers.ts:64-97`](./helpers.ts) |
| `convertPosition` | function | Converts tree-sitter position to standard format | [`helpers.ts:84-97`](./helpers.ts) |
| `getNodeText` | function | Extracts text content from an AST node | [`helpers.ts:102-104`](./helpers.ts) |
| `isMagicMethod` | function | Checks if name is a Python dunder method | [`helpers.ts:109-111`](./helpers.ts) |
| `isBuiltinDecorator` | function | Checks if name is a built-in decorator | [`helpers.ts:116-118`](./helpers.ts) |
| `withPerformanceMonitoring` | function | Wraps function execution with timing metrics | [`helpers.ts:123-145`](./helpers.ts) |
| `hasYieldExpression` | function | Checks for yield expression in AST node | [`helpers.ts:148-162`](./helpers.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../types` | `AnalysisContext` type definition |
| `../../../types/parser` | `ASTNode`, `MagicType`, `PythonParserMetrics` types |
| `../../../logging/index` | Logging infrastructure |

### External Packages

_None_

## Behavioral Properties

| Property | Value |
|----------|-------|
| Cycle detection algorithm | DFS-based graph traversal |
| Cycle severity levels | `warning` and `error` |
| Performance monitoring | Records execution time into metrics object |

## Error Handling

`CycleDetector` handles missing dependencies gracefully by returning empty results. Helper functions return empty strings or false for null/undefined inputs.

## Known Limitations

- Cycle detection operates on static import graph, not runtime dependency resolution
- `hasYieldExpression` uses recursive search which may be slow on very deep ASTs
- Performance monitoring adds minor overhead per wrapped call

## Exports

- `CycleDetector`
- `BUILTIN_DECORATORS`
- `convertPosition`
- `getNodeText`
- `hasYieldExpression`
- `isBuiltinDecorator`
- `isMagicMethod`
- `MAGIC_METHOD_TYPES`
- `withPerformanceMonitoring`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all utilities and types |
| `cycle-detector.ts` | Circular dependency detection and analysis with severity classification |
| `helpers.ts` | Magic method constants, built-in decorators, position conversion, text extraction, performance monitoring |
