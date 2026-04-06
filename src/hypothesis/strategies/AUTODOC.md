# Strategies

## Overview

This module implements a four-tier runtime relationship detection system for inferring implicit code relationships in a hypothesis engine. It uses pattern matching, callback resolution, interface narrowing, and proximity-based bridging to discover connections between entities in a code graph that may not have direct call relationships. Each strategy operates independently on the same graph storage and contributes discovered relationships back to the hypothesis store. The tiers progress from targeted pattern matching (decorators, events) through increasingly general approaches (callbacks, interfaces) to broad proximity-based discovery.

## Flow

```
Code Graph (entities + relationships)
           ↓
    ┌──────────────────────────────┐
    │  Four Detection Strategies   │
    └──────────────────────────────┘
           ↓
    ├─→ Tier 1: Decorator/Event Registration (string-key.ts)
    ├─→ Tier 2: Callback Argument Resolution (callback-arg.ts)
    ├─→ Tier 3: Interface Method Narrowing (interface-narrow.ts)
    └─→ Tier 4: Proximity Bridging (proximity-bridge.ts)
           ↓
    Hypothesis Store (inferred relationships + confidence)
```

## Entity Listing

### Functions

| Name | Description | Location |
|------|-------------|----------|
| `generate` | Detects decorator patterns and register/dispatch event bindings within the same directory scope, marking relationships with decorator or event types. | [string-key.ts:16-18] |
| `generate` | Detects callback patterns in setTimeout, promise.then, array.map calls and registers inferred callback relationships by scanning adjacent edges for referenced functions. | [callback-arg.ts:21-68] |
| `generate` | Narrows interface method implementations to concrete functions with confidence scoring based on parameter and return type compatibility across the entity set. | [interface-narrow.ts:20-78] |
| `generateForPair` | Executes on-demand bidirectional breadth-first search to bridge disconnected entities using proximity heuristics and gap detection between a source and target. | [proximity-bridge.ts:28-110] |

## Module Files

| File | Purpose | Tier |
|------|---------|------|
| **string-key.ts** | Matches decorator applications and event registration/dispatch patterns via string-based symbol lookup | Tier 1 |
| **callback-arg.ts** | Resolves callback function arguments in async patterns (setTimeout, Promise.then, array methods) | Tier 2 |
| **interface-narrow.ts** | Infers concrete implementations for interface methods by matching type signatures and parameter compatibility | Tier 3 |
| **proximity-bridge.ts** | Bridges gaps between unconnected entities using bidirectional BFS and proximity-weighted heuristics | Tier 4 |

## Dependencies

- **GraphStorage** — provides read access to entities and relationships in the code graph; required by all strategies to enumerate and inspect graph structure
- **HypothesisStore** — accepts newly inferred relationships and hypothesis records with confidence scores; strategies write results here
- **Callback Catalog** — maps known callback APIs (setTimeout, Promise.then, etc.) to parameter positions and invocation patterns for Tier 2 matching
- **Type System** — entity language and type information used for signature matching in Tier 3 interface narrowing and compatibility checks
- **BFS Traversal** — graph traversal primitives for proximity-bridge bidirectional search and distance calculation across entity neighborhoods