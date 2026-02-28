---
module_name: python-extractors
description: "Extractors for calls, control flow, docstrings, and type hints from Python AST"
status: active
language: typescript
---

# Python Extractors

> Provides specialized extractor classes for extracting function calls, control flow structures, docstring documentation, and type annotations from Python tree-sitter AST nodes.

## Overview

This module contains four extractor classes used by the Python analyzer layers. `CallExtractor` walks AST nodes to find function/method calls including await expressions. `ControlFlowExtractor` extracts branches (if/elif/else), loops (for/while), exception handling (try/except/finally), returns, and awaits. `DocstringParser` supports Google, NumPy, and reStructuredText docstring formats. `TypeExtractor` handles complex Python type hints including Union, Optional, Generic, and subscript types.

## Data Flow

- **Inputs**: tree-sitter `ASTNode` objects and source code strings
- **Processing**: Recursive AST traversal and regex-based docstring parsing
- **Outputs**: `ParsedEntity["calls"]`, `ParsedEntity["controlFlow"]`, `ParsedEntity["documentation"]`, extracted type strings

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CallExtractor` | class | Extracts function/method calls from AST nodes | [`call-extractor.ts:14-103`](./call-extractor.ts) |
| `ControlFlowExtractor` | class | Extracts branches, loops, exceptions, returns, awaits | [`controlflow-extractor.ts:14-181`](./controlflow-extractor.ts) |
| `DocstringParser` | class | Parses Python docstrings in Google/NumPy/reST formats | [`docstring-parser.ts:14-14`](./docstring-parser.ts) |
| `TypeExtractor` | class | Extracts complex type hints (Union, Optional, Generic) | [`type-extractor.ts:14-104`](./type-extractor.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../../types/parser` | `ASTNode`, `ParsedEntity` types |
| `../utils/helpers` | `convertPosition`, `getNodeText` helper functions |

### External Packages

_None_

## Behavioral Properties

| Property | Value |
|----------|-------|
| AST backend | tree-sitter nodes |
| Docstring formats | Google, NumPy, reStructuredText |
| Await handling | `CallExtractor` propagates await flag through nested calls |

## Error Handling

Extractors return empty/undefined results when nodes are missing. Docstring parsing falls back gracefully when format is unrecognized.

## Known Limitations

- Docstring format detection is heuristic-based and may misclassify edge cases
- Type extractor does not resolve type aliases or perform cross-file type inference
- Control flow extraction does not handle `match/case` statements (Python 3.10+)

## Exports

- `CallExtractor`
- `ControlFlowExtractor`
- `DocstringParser`
- `TypeExtractor`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all four extractor classes |
| `call-extractor.ts` | Function/method call extraction with await support |
| `controlflow-extractor.ts` | Control flow structure extraction (branches, loops, exceptions) |
| `docstring-parser.ts` | Multi-format Python docstring parser |
| `type-extractor.ts` | Complex type hint extraction (Union, Optional, Generic, subscripts) |
