---
module_name: models
description: "Type definitions for the semantic merge system"
status: active
language: typescript
---

# Models

> Defines all data structures for the semantic merge pipeline: code units, versioned indexes, change intents, merge results, and semantic conflicts.

## Overview

The models module provides the type foundation for the entire semantic merge system. CodeUnit represents any semantic unit of code (file, class, function, method) with identity, content hashes, optional embeddings, and hierarchy. VersionedIndex stores all CodeUnit instances for a branch version with O(1) lookup indexes. ChangeIntent classifies why code was modified. SemanticConflict describes incompatible changes between branches. MergeResult captures the complete output of a three-way merge operation.

## Data Flow

- **Inputs**: Raw code entities from DevAgent indexing or GraphStorage.
- **Processing**: Factory functions create typed instances with computed hashes and IDs; helper functions manage multi-map indexes.
- **Outputs**: Strongly typed objects consumed by analysis, matching, engine, indexing, and integration modules.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CodeUnit` | interface | Universal code unit with identity, content, hashes, and embeddings | [`code-unit.ts:9-40`](./code-unit.ts) |
| `CodeUnitType` | enum | Unit types: File, Module, Class, Interface, Function, Method, Property, Block, Statement | [`code-unit.ts:45-55`](./code-unit.ts) |
| `CodeStructure` | interface | AST metadata with identifiers, imports, exports, and complexity metrics | [`code-unit.ts:60-71`](./code-unit.ts) |
| `VersionedIndex` | interface | Branch index with code units and O(1) hash lookup maps | [`versioned-index.ts:9-31`](./versioned-index.ts) |
| `createVersionedIndex` | function | Creates empty VersionedIndex for a branch | [`versioned-index.ts:36-53`](./versioned-index.ts) |
| `addUnitToIndex` | function | Adds a CodeUnit to an index, updating all lookup maps | [`versioned-index.ts:58-77`](./versioned-index.ts) |
| `findByContentHash` | function | Fast Path Level 1 lookup by content hash | [`versioned-index.ts:82-85`](./versioned-index.ts) |
| `findByStructuralHash` | function | Fast Path Level 2 lookup by structural hash | [`versioned-index.ts:90-93`](./versioned-index.ts) |
| `findBySignature` | function | Fast Path Level 3 lookup by signature | [`versioned-index.ts:98-101`](./versioned-index.ts) |
| `ChangeIntent` | interface | Change classification with type, confidence, and evidence | [`change-intent.ts:22-27`](./change-intent.ts) |
| `ChangeIntentType` | enum | Intent types: BugFix, Refactoring, FeatureAddition, APIChange, Unknown | [`change-intent.ts:11-17`](./change-intent.ts) |
| `EvidenceType` | enum | Evidence types for intent classification | [`change-intent.ts:39-63`](./change-intent.ts) |
| `SemanticConflict` | interface | Conflict between two branch versions with severity and resolution info | [`semantic-conflict.ts:30-55`](./semantic-conflict.ts) |
| `ConflictSeverity` | enum | Severity levels: Low, Medium, High, Critical | [`semantic-conflict.ts:11-16`](./semantic-conflict.ts) |
| `ConflictType` | enum | Conflict types: OverlappingChanges, IncompatibleIntents, APIBreakingChange, etc. | [`semantic-conflict.ts:18-25`](./semantic-conflict.ts) |
| `Resolution` | interface | Conflict resolution with strategy, confidence, and merged code | [`semantic-conflict.ts:71-76`](./semantic-conflict.ts) |
| `ResolutionStrategy` | enum | Resolution strategies: TakeBranchA, TakeBranchB, MergeBoth, ManualReview | [`semantic-conflict.ts:78-83`](./semantic-conflict.ts) |
| `MergeResult` | interface | Complete three-way merge result with all matched, added, deleted, and renamed units | [`merge-result.ts:64-108`](./merge-result.ts) |
| `MergeAction` | interface | Individual merge action for a code unit | [`merge-result.ts:21-41`](./merge-result.ts) |
| `MergeStats` | interface | Merge statistics including counts and timing | [`merge-result.ts:46-59`](./merge-result.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| (none) | Pure type definitions with no internal imports |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Intent confidence formula | min(0.7 + evidence.length * 0.1, 1.0) |
| VersionedIndex lookup complexity | O(1) via Map-based hash indexes |
| Conflict ID generation | Composite of unit IDs and timestamp for uniqueness |

## Error Handling

Factory functions (createOverlappingConflict, createBugFixIntent, etc.) always return valid objects without throwing. VersionedIndex helper functions return empty arrays for missing keys.

## Known Limitations

- CodeUnit.metadata uses `Record<string, any>` without strict typing for language-specific data.
- MergeActionType is a string union rather than an enum, making exhaustive checks more verbose.
- No built-in validation for CodeUnit fields (callers must ensure content hash consistency).

## Exports



## Files

| File | Description |
|------|-------------|
| `change-intent.ts` | ChangeIntent types, EvidenceType enum, and factory functions for each intent type |
| `code-unit.ts` | CodeUnit interface, CodeUnitType enum, and CodeStructure AST metadata |
| `index.ts` | Re-exports all model types and functions |
| `merge-result.ts` | MergeResult, MergeAction, MergeStats, and MergeActionType definitions |
| `semantic-conflict.ts` | SemanticConflict, ConflictSeverity, ConflictType, Resolution, and factory functions |
| `versioned-index.ts` | VersionedIndex interface with O(1) lookup indexes and helper functions |
