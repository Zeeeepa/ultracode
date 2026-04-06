# Hypothesis

## Overview

The Hypothesis module infers runtime relationships between code entities that static AST analysis cannot discover—such as event handlers, callbacks, and interface dispatch through dynamic registration. It uses a 4-tier strategy: Tier 1–3 employ direct pattern matching and proximity heuristics to generate hypotheses with confidence scores, which are persisted to SQLite; Tier 4 (bridge) uses stored hypotheses as fallback pathfinding edges when standard graph traversal fails. This enables trace_flow to connect code that relies on late binding, framework-specific registration, or callback pipelines.

## Flow

```
Source Entity → Tier 1: Direct Patterns    ↓
                Tier 2: Register/Dispatch  → Hypotheses → SQLite Cache
                Tier 3: Proximity Heuristics ↓
                        (Generate & Persist)

Later:
Target Entity ← Forward BFS (real edges) ╭─ Bridge hypothesis lookup
    ↓           Backward BFS (real edges)  ├─ Connect frontier gaps
  Found ←       Match on stored hypotheses ╰─ Return hypothesis path
```

## Core Data Structures

**HypothesisType** (types.ts:14-20)
Enum of four inference tier types for hypotheses, categorizing generated relationships by their inference strategy.

**Hypothesis** (types.ts:26-35)
Complete hypothesis with source entity, target entity, confidence score (0–1), and evidence trail explaining the inference basis.

**HypothesisRef** (types.ts:38-43)
Lightweight reference for path steps without string ownership, enabling efficient storage of hypothesis pointers in graph paths.

**HypothesisStore** (types.ts:51-129)
In-memory three-index store for source lookup, target lookup, and pair lookups—supports fast hypothesis retrieval by either endpoint.

## Generation Pipeline

**generateHypotheses** (engine.ts:39-86)
Runs Tiers 1–3 strategies (direct patterns, register/dispatch, proximity) and persists all generated hypotheses to the database.

**GenerateResult** (engine.ts:23-29)
Generation result containing tier counts and execution duration for monitoring inference performance.

**getHypothesisStore** (engine.ts:104-109)
Returns singleton hypothesis store instance for application, ensuring consistent access to generated and cached hypotheses throughout the session.

## Cache Operations

**clearHypotheses** (hypothesis-ops.ts:16-21)
Deletes all hypotheses for a specific project branch before regeneration, preventing stale data from previous analysis runs.

**persistBatch** (hypothesis-ops.ts:24-67)
Saves hypotheses to database in batches using SQLite, optimizing write performance for bulk hypothesis storage.

**loadAll** (hypothesis-ops.ts:70-104)
Loads all cached hypotheses from database into memory store, hydrating the working hypothesis set from persistent cache.

**countHypotheses** (hypothesis-ops.ts:107-113)
Returns hypothesis count for a specific project and branch, enabling progress reporting and cache validation.

**loadCachedHypotheses** (engine.ts:92-99)
Loads hypotheses from cache database into memory store during initialization, restoring previously inferred relationships.

## Bridge Pathfinding

**BridgePath** (bridge.ts:25-28)
Contains steps and total confidence for bridged entity path, representing a complete journey from source to target using hypothesis edges.

**BridgeStep** (bridge.ts:30-35)
Single step with entity, edge type, and hypothesis reference—marks whether this step relied on a hypothesis bridge or real code edge.

**findPathWithHypotheses** (bridge.ts:45-144)
Finds paths between entities using hypothesis bridges as fallback when standard BFS/DFS traversal exhausts real edges, implementing four-phase algorithm: forward BFS from source, backward BFS from target, frontier hypothesis matching, and on-demand Tier 4 bridge generation.

## Framework Catalogs

**RegisterDispatchPair** (catalogs.ts:12-21)
Framework pattern pairing register method with dispatch method, enabling recognition of framework-specific event binding patterns.

**CallbackEntry** (catalogs.ts:23-29)
Callback function pattern definition for framework inference, specifying callback names and contexts where callbacks are invoked.

**REGISTER_DISPATCH_PAIRS** (catalogs.ts:35-46)
Catalog of register/dispatch pairs across major frameworks (React, Vue, Angular, Node.js EventEmitter, and others), hardcoded patterns enabling automated discovery of callback registration.

**CALLBACK_ENTRIES** (catalogs.ts:271-273)
Catalog of callback function patterns across major frameworks, comprehensive list of callback naming conventions and dispatch points.

**findRegisterPair** (catalogs.ts:324-326)
Looks up register pair by function name and language, returning matching framework pattern or null if not in catalog.

**findDispatchPair** (catalogs.ts:324-326)
Finds dispatch pair matching register for language context, enabling bidirectional framework pattern lookup.

**findCallbackEntry** (catalogs.ts:329-331)
Looks up callback entry by function name and language, identifying whether a function matches known callback patterns.

## Dependencies

**Internal:** GraphStorage (edge and entity lookups during hypothesis generation), Tier 1–3 strategy modules (pattern matching, register/dispatch pairing, proximity heuristics).

**External:** SQLite database for persistent hypothesis cache, hardcoded framework catalogs covering React, Vue, Angular, Node.js event emitters, and other major JavaScript/TypeScript frameworks.

## Design Patterns

**4-Tier Confidence Hierarchy:** Tiers 1–3 apply increasingly speculative heuristics (direct patterns → register/dispatch → proximity), each tier's hypotheses weighted lower than prior tiers, enabling trace_flow to prefer high-confidence relationships while still using bridges when necessary.

**Lazy Bridge Generation:** Tier 4 hypotheses are generated on-demand during pathfinding when frontier BFS gaps remain, avoiding upfront computation of low-confidence relationships that may never be queried.

**Snapshot Persistence:** All generated hypotheses are persisted to SQLite between sessions, allowing expensive inference to run asynchronously or during idle time without blocking interactive trace requests.