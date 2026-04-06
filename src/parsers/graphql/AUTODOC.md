# GraphQL

Analyzes GraphQL schemas and links them to source code implementations.

## Overview

This module parses GraphQL schema files and automatically detects links between schema definitions and implementation code. It identifies resolver implementations, generated types, hooks, and queries, building a complete relationship graph that tracks how GraphQL definitions connect to their implementations and generated artifacts. The module follows the same pattern as the Swagger code linker, using pattern matching for generated file detection and resolver framework identification to establish bidirectional code-to-schema links.

## Flow

```
GraphQL Schema Files (.graphql, .gql)
              ↓
    GraphQLSchemaParser
    (extract type definitions, fields, mutations)
              ↓
  buildGraphQLRelationships
  (organize entities into relationship graph)
              ↓
  analyzeGraphQLCodeLinks
  (detect resolver implementations, generated artifacts, consumers)
              ↓
     GraphQLAnalysis
     (output: entities + bidirectional code links)
```

## Entities

### Public API

| Name | Description | Location |
|------|-------------|----------|
| `analyzeGraphQLCodeLinks` | Analyzes and returns links between GraphQL schema entities and their resolver implementations, generated types, and consumer code | graphql-code-linker.ts:113-168 |
| `buildGraphQLRelationships` | Constructs a relationship graph from parsed GraphQL schema definitions, organizing entities and their connections for storage | graphql-code-linker.ts:173-225 |
| `getGraphQLCodegenConfigFiles` | Returns list of detected GraphQL code generation configuration files in the project | graphql-code-linker.ts:452-454 |
| `getGraphQLGeneratedCodeMarkers` | Returns markers and patterns used to identify GraphQL code generation artifacts in output files | graphql-code-linker.ts:452-454 |

### Parsers

| Name | Description | Location |
|------|-------------|----------|
| `GraphQLSchemaParser` | Parser for .graphql/.gql schema files that extracts field definitions, types, arguments, and mutations into structured entities | graphql-parser.ts:49 |

### Types

| Name | Description | Location |
|------|-------------|----------|
| `GraphQLAnalysis` | Complete analysis result containing all discovered GraphQL entities, relationships, and code links for a project | types.ts:33-44 |
| `GraphQLCodeLink` | Represents a bidirectional link between a GraphQL schema entity and a code entity (resolver, generated type, consumer) | types.ts:13-28 |
| `GraphQLRelationship` | Relationship entry for storage in the graph system, tracking connections between GraphQL definitions and code | types.ts:49-62 |
| `GraphQLFieldDef` | Schema field definition including name, type, arguments, and description | types.ts:76-83 |
| `GraphQLArg` | Field argument definition with type information and default values | types.ts:67-71 |

## Exports

- `analyzeGraphQLCodeLinks`
- `buildGraphQLRelationships`
- `getGraphQLCodegenConfigFiles`
- `getGraphQLGeneratedCodeMarkers`

## Files

| File | Purpose |
|------|---------|
| graphql-code-linker.ts | Core analysis engine that links GraphQL schema definitions to resolver implementations and generated code, using patterns for type suffixes, generated file markers, and resolver framework detection |
| graphql-parser.ts | Text-based parser for .graphql/.gql schema files that extracts type definitions, fields, arguments, and mutations into entity structures |
| index.ts | Module exports aggregating parsing and linking functionality |
| types.ts | Type definitions for GraphQL analysis results, code links, relationships, and schema entities |

## Key Dependencies

- **types/storage.ts** — Provides `Entity` and `RelationType` for representing GraphQL entities and their relationships within the storage graph system
- **swagger-code-linker.ts** — Design reference; GraphQL linker implements the same pattern-based linking approach for schema-to-code relationship analysis

## Design Patterns

**Pattern Linking**: Detector uses generated file patterns (`.generated.ts`, `__generated__/`, markers like `@generated`) and resolver framework patterns (Apollo, tRPC, Fastify) to establish code-to-schema relationships without explicit imports.