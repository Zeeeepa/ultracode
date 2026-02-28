---
module_name: ngrx
description: "Parser and graph builder for NgRx state management patterns"
status: active
language: typescript
---

# NgRx

> Parses NgRx state management constructs (actions, effects, reducers, selectors, dispatches, selects) and builds graph entities and relationships for code analysis.

## Overview

This module provides type definitions for NgRx constructs and builder functions that convert NgRx analysis results into graph entities and relationships. It models the full NgRx data flow: actions trigger effects and reducers, reducers modify state, selectors compose state queries, and components dispatch actions and select state. The builders produce `ParsedEntity` and `NgRxRelationship` objects for integration into the code knowledge graph.

## Data Flow

- **Inputs**: `NgRxAnalysis` results containing actions, effects, reducers, selectors, dispatches, and selects
- **Processing**: Iterates over analysis results to generate typed relationships (listens_to, dispatches, handles, modifies, depends_on, reads_state)
- **Outputs**: `NgRxRelationship[]` for graph edges and `ParsedEntity[]` for graph nodes

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `buildNgRxRelationships` | function | Converts NgRx analysis into graph relationships | [`builders.ts:14-94`](./builders.ts) |
| `buildNgRxEntities` | function | Converts NgRx analysis into graph entities | [`builders.ts:99-178`](./builders.ts) |
| `NgRxAction` | interface | Action with type string and props | [`types.ts:12-19`](./types.ts) |
| `NgRxEffect` | interface | Effect with action dependencies | [`types.ts:24-32`](./types.ts) |
| `NgRxReducerHandler` | interface | Reducer handler with state changes | [`types.ts:37-40`](./types.ts) |
| `NgRxReducer` | interface | Reducer with handlers and state name | [`types.ts:45-51`](./types.ts) |
| `NgRxSelector` | interface | Selector with dependencies | [`types.ts:56-62`](./types.ts) |
| `NgRxDispatch` | interface | Store dispatch call | [`types.ts:67-73`](./types.ts) |
| `NgRxSelect` | interface | Store select call | [`types.ts:78-83`](./types.ts) |
| `NgRxAnalysis` | interface | Complete NgRx analysis result | [`types.ts:88-95`](./types.ts) |
| `NgRxRelationship` | interface | Relationship for graph storage | [`types.ts:100-108`](./types.ts) |
| `isNgRxFile` | function | Checks if file contains NgRx patterns | (re-exported from `../ngrx-parser`) |
| `NgRxParser` | class | Parser for NgRx source files | (re-exported from `../ngrx-parser`) |
| `parseNgRxFile` | function | Parses an NgRx file | (re-exported from `../ngrx-parser`) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../types/parser` | `ParsedEntity` type |
| `../../types/storage` | `RelationType` enum for graph relationships |
| `../ngrx-parser` | NgRx file parser (re-exported) |

### External Packages

_None_

## Behavioral Properties

| Property | Value |
|----------|-------|
| Relationship types | listens_to_action, dispatches_action, handles_action, modifies_state, depends_on_selector, reads_state |
| Entity types | action, effect, reducer, selector |
| Effect support | Both `createEffect` and `@Effect` decorator patterns |

## Error Handling

Builders iterate over arrays and skip entries with missing data. Empty analysis produces empty relationship and entity arrays.

## Known Limitations

- Relationship building assumes action names are globally unique within analysis scope
- Does not resolve action type strings across separate files
- Selector dependency tracking is limited to explicitly declared dependencies

## Exports

- `isNgRxFile`
- `NgRxParser`
- `parseNgRxFile`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports NgRx parser, builders, and types |
| `builders.ts` | Converts NgRx analysis into graph entities and relationships |
| `types.ts` | Type definitions for all NgRx constructs (actions, effects, reducers, selectors, dispatches, selects) |
