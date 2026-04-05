# Hypothesis

Infers runtime relationships between code entities through 4-tier hypothesis generation and bridge pathfinding for event handlers, callbacks, and interface dispatch.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `BridgePath` | interface | Contains steps and total confidence for bridged entity path | [→ bridge.ts:25-28] |
| `BridgeStep` | interface | Single step with entity, edge type, and hypothesis reference | [→ bridge.ts:30-35] |
| `CALLBACK_ENTRIES` | const | Catalog of callback function patterns across major frameworks | [→ catalogs.ts:271-273] |
| `CallbackEntry` | interface | Callback function pattern definition for framework inference | [→ catalogs.ts:23-29] |
| `clearHypotheses` | function | Deletes all hypotheses for project branch before regeneration | [→ hypothesis-ops.ts:16-21] |
| `countHypotheses` | function | Returns hypothesis count for specific project and branch | [→ hypothesis-ops.ts:107-113] |
| `findCallbackEntry` | function | Looks up callback entry by function name and language | [→ catalogs.ts:329-331] |
| `findDispatchPair` | function | Finds dispatch pair matching register for language context | [→ catalogs.ts:324-326] |
| `findPathWithHypotheses` | function | Finds paths between entities using hypothesis bridges | [→ bridge.ts:45-144] |
| `findRegisterPair` | function | Looks up register pair by function name and language | [→ catalogs.ts:324-326] |
| `generateHypotheses` | function | Runs Tiers 1–3 strategies and persists results database | [→ engine.ts:39-86] |
| `GenerateResult` | interface | Generation result containing tier counts and execution duration | [→ engine.ts:23-29] |
| `getHypothesisStore` | function | Returns singleton hypothesis store instance for application | [→ engine.ts:104-109] |
| `Hypothesis` | interface | Complete hypothesis with source, target, confidence, evidence | [→ types.ts:26-35] |
| `HypothesisRef` | interface | Lightweight reference for path steps without string ownership | [→ types.ts:38-43] |
| `HypothesisStore` | class | In-memory three-index store for source/target/pair lookups | [→ types.ts:51-129] |
| `HypothesisType` | enum | Enum of four inference tier types for hypotheses | [→ types.ts:14-20] |
| `loadAll` | function | Loads all cached hypotheses from database into memory | [→ hypothesis-ops.ts:70-104] |
| `loadCachedHypotheses` | function | Loads hypotheses from cache database into memory store | [→ engine.ts:92-99] |
| `persistBatch` | function | Saves hypotheses to database in batches using SQLite | [→ hypothesis-ops.ts:24-67] |
| `REGISTER_DISPATCH_PAIRS` | const | Catalog of register/dispatch pairs across major frameworks | [→ catalogs.ts:35-46] |
| `RegisterDispatchPair` | interface | Framework pattern pairing register method with dispatch method | [→ catalogs.ts:12-21] |

## Files

- **bridge.ts** — Phase 4 fallback using stored hypotheses to bridge graph gaps
- **catalogs.ts** — Framework pattern definitions for register/dispatch and callbacks
- **engine.ts** — Orchestrates hypothesis generation pipeline with Tiers 1–3 strategies
- **hypothesis-ops.ts** — SQLite CRUD operations for cache database hypotheses table
- **index.ts** — Public API re-exporting all hypothesis module functionality
- **types.ts** — Core data structures and in-memory hypothesis store implementation
