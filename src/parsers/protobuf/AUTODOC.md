# Protobuf

Analyzes protobuf services and links them to implementations

## Overview

This module provides a complete protobuf parsing and code linking framework for analyzing relationships between `.proto` definitions and their generated implementations. It parses protobuf files to extract service, message, and field definitions, then links these entities to corresponding source code implementations (producers/consumers). The module builds a graph-based representation of these relationships, enabling code analysis tools to trace data contracts and implementation patterns across gRPC boundaries.

## Flow

```
.proto Files
    ↓
ProtobufParser (text-based extraction)
    ↓
Entity Extraction (messages, services, fields, enums)
    ↓
analyzeProtobufCodeLinks (match to code implementations)
    ↓
buildProtobufRelationships (construct graph)
    ↓
ProtobufAnalysis + ProtobufRelationship
    ↓
Code Analysis Pipeline
```

## Entities

### Functions

| Name | Location | Description |
|------|----------|-------------|
| `analyzeProtobufCodeLinks` | protobuf-code-linker.ts:96-137 | Analyzes links between protobuf definitions and source code implementations, identifying producers and consumers of protobuf types. |
| `buildProtobufRelationships` | protobuf-code-linker.ts:142-194 | Constructs a graph representation of protobuf definitions and their relationships for storage in the analysis system. |
| `getProtobufCodegenConfigFiles` | protobuf-code-linker.ts:413-415 | Identifies configuration files that control protobuf code generation. |
| `getProtobufGeneratedCodeMarkers` | protobuf-code-linker.ts:413-415 | Detects markers within generated protobuf source files to distinguish hand-written from auto-generated code. |

### Classes

| Name | Location | Description |
|------|----------|-------------|
| `ProtobufParser` | protobuf-parser.ts:37-37 | Text-based parser that extracts services, messages, fields, and enums from `.proto` file content. |

### Interfaces & Types

| Name | Location | Description |
|------|----------|-------------|
| `ProtobufAnalysis` | types.ts:33-44 | Result container holding producers, consumers, and analyzed protobuf types from code linking. |
| `ProtobufCodeLink` | types.ts:13-28 | Represents a connection between a protobuf entity and its corresponding source code implementation. |
| `ProtobufRelationship` | types.ts:49-63 | Graph storage entity representing a protobuf definition node and its relationships within the analysis system. |
| `ProtoField` | types.ts:68-77 | Describes a single field definition within a protobuf message, including type and field number. |
| `ProtoEnumValue` | types.ts:80-85 | Represents a single value definition within a protobuf enum type. |

## Exports

- `analyzeProtobufCodeLinks`
- `buildProtobufRelationships`
- `getProtobufCodegenConfigFiles`
- `getProtobufGeneratedCodeMarkers`

## Files

| File | Purpose |
|------|---------|
| index.ts | Main module entry point, re-exporting parser and linking functionality. |
| protobuf-parser.ts | Implements `ProtobufParser` for lexical analysis and extraction of protobuf definitions. |
| protobuf-code-linker.ts | Implements code linking analysis and relationship graph construction from parsed protobuf definitions. |
| types.ts | Type definitions for protobuf analysis results, code links, and relationship storage. |

## Dependencies

**Internal:**
- Depends on a broader code analysis pipeline for matching protobuf entities to source code implementations
- Integrates with graph storage system for relationship persistence

**External:**
- No external dependencies visible; uses standard text parsing and graph construction patterns

**Patterns:**
- **Parser Pattern**: `ProtobufParser` implements single-responsibility lexical analysis of `.proto` syntax
- **Linker Pattern**: `analyzeProtobufCodeLinks` and `buildProtobufRelationships` form a two-phase linking pipeline (analysis → graph construction)
- **Graph Model**: `ProtobufRelationship` enables storage of complex protobuf definition hierarchies for downstream analysis