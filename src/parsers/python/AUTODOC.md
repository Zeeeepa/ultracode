---
module_name: python
description: "Advanced Python code analyzer with four-layer architecture"
status: active
language: typescript
---

# Python

> Comprehensive Python source code analyzer implementing a four-layer architecture for progressively deeper analysis: basic parsing, feature detection, relationship mapping, and pattern recognition.

## Overview

This module provides the `PythonAnalyzer` class that orchestrates four analysis layers. Layer 1 handles enhanced basic parsing (method classification, type hints, decorators). Layer 2 performs advanced feature analysis (magic methods, properties, async patterns, generators, dataclasses). Layer 3 builds relationship maps (inheritance hierarchies, MRO, import dependencies, method overrides). Layer 4 recognizes patterns (context managers, exception handling, design patterns, circular dependencies). Each layer is configurable and can be toggled independently.

## Data Flow

- **Inputs**: Python source code strings and AST nodes (tree-sitter based)
- **Processing**: Sequential layer execution with shared `AnalysisContext`, each layer enriching entities, relationships, and metrics
- **Outputs**: `ParsedEntity[]`, `EntityRelationship[]`, `ImportDependency[]`, `PatternAnalysis`, and `PythonParserMetrics`

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `PythonAnalyzer` | class | Main analyzer with four-layer architecture | [`python-analyzer.ts:35-150`](./python-analyzer.ts) |
| `createPythonAnalyzer` | function | Factory for creating analyzer with config | [`python-analyzer.ts:157-161`](./python-analyzer.ts) |
| `analyzePythonFile` | function | Async function for analyzing a Python file | [`python-analyzer.ts:157-161`](./python-analyzer.ts) |
| `Layer1BasicAnalyzer` | class | Enhanced basic parsing (methods, types, decorators) | [`layer1-basic.ts:25-520`](./layer1-basic.ts) |
| `Layer2FeatureAnalyzer` | class | Advanced feature analysis (magic methods, async) | [`layer2-features.ts:17-197`](./layer2-features.ts) |
| `Layer3RelationshipAnalyzer` | class | Relationship mapping (inheritance, dependencies) | [`layer3-relationships.ts:17-213`](./layer3-relationships.ts) |
| `Layer4PatternAnalyzer` | class | Pattern recognition (context managers, design patterns) | [`layer4-patterns.ts:21-24`](./layer4-patterns.ts) |
| `AnalysisContext` | interface | Analysis context with entities, relationships, metrics | [`types.ts:23-32`](./types.ts) |
| `PythonAnalysisConfig` | interface | Configuration with layer toggles | [`types.ts:41-51`](./types.ts) |
| `DEFAULT_PYTHON_CONFIG` | const | Default configuration object | [`types.ts:56-66`](./types.ts) |
| `initializeMetrics` | function | Creates empty metrics object | [`types.ts:75-113`](./types.ts) |
| `CycleDetector` | class | Circular dependency detector | [`utils/cycle-detector.ts:30-376`](./utils/cycle-detector.ts) |
| `CallExtractor` | class | Function call extraction from AST | [`extractors/call-extractor.ts:14-103`](./extractors/call-extractor.ts) |
| `ControlFlowExtractor` | class | Control flow structure extraction | [`extractors/controlflow-extractor.ts:14-181`](./extractors/controlflow-extractor.ts) |
| `DocstringParser` | class | Python docstring parsing (Google/NumPy/reST) | [`extractors/docstring-parser.ts:14-14`](./extractors/docstring-parser.ts) |
| `TypeExtractor` | class | Type hint extraction from AST | [`extractors/type-extractor.ts:14-104`](./extractors/type-extractor.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../types/parser` | Shared types (`ParsedEntity`, `ASTNode`, `PatternAnalysis`, etc.) |
| `../../logging/index` | Logging infrastructure |
| `../base-parser-utils` | Shared parser utilities (`findNodesByType`) |

### External Packages

_None (uses tree-sitter AST nodes passed in)_

## Behavioral Properties

| Property | Value |
|----------|-------|
| Parser backend | tree-sitter (AST nodes passed to analyzer) |
| Layer execution | Sequential with shared `AnalysisContext` |
| Dependency caching | Static `Map<string, Set<string>>` cache for cross-file analysis |

## Error Handling

Each layer catches and logs errors independently, allowing subsequent layers to run even if earlier ones fail. Performance monitoring wraps each layer with timing metrics.

## Known Limitations

- Cross-file relationship resolution requires external dependency cache population
- Circular dependency detection works on import graph, not runtime dependencies
- Pattern recognition confidence threshold is configurable but patterns are heuristic-based

## Exports

- `CallExtractor`
- `ControlFlowExtractor`
- `DocstringParser`
- `TypeExtractor`
- `Layer1BasicAnalyzer`
- `Layer2FeatureAnalyzer`
- `Layer3RelationshipAnalyzer`
- `Layer4PatternAnalyzer`
- `analyzePythonFile`
- `createPythonAnalyzer`
- `PythonAnalyzer`
- `DEFAULT_PYTHON_CONFIG`
- `initializeMetrics`
- `CycleDetector`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all analyzer components, extractors, types, and utilities |
| `python-analyzer.ts` | Main `PythonAnalyzer` class coordinating four analysis layers |
| `types.ts` | `AnalysisContext`, `PythonAnalysisConfig`, and metrics initialization |
| `layer1-basic.ts` | Layer 1: Method classification, type hints, decorator chaining |
| `layer2-features.ts` | Layer 2: Magic methods, properties, async patterns, generators |
| `layer3-relationships.ts` | Layer 3: Inheritance hierarchies, MRO, import dependencies |
| `layer4-patterns.ts` | Layer 4: Context managers, exception patterns, design patterns |
