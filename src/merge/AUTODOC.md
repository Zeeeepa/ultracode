---
module_name: merge
description: "Semantic 3-way merge engine with AST-aware indexing, Fast Path/Slow Path matching, intent classification, and AI-assisted conflict resolution"
status: active
language: typescript
entry_point: index.ts
exports:
  - ThreeWayMerger
  - ConflictResolver
  - AIConflictResolver
  - MultiVersionIndexer
  - FastPathMatcher
  - SemanticMatcher
  - ConflictDetector
  - IntentClassifier
  - ContentNormalizer
  - StructuralNormalizer
  - SignatureGenerator
  - LazyEmbeddingCache
  - GitIntegration
dependencies:
  - src/logging/index.js
  - src/utils/fast-hash.js
  - src/utils/file-ops.js
  - src/utils/simd-vector-ops.js
  - src/core/branch-manager.js
  - src/core/di-container.js
  - src/core/agent-registry.js
  - src/agents/conductor-orchestrator.js
  - src/semantic/embedding-generator.js
  - src/types/agent.js
tags:
  - merge
  - 3-way-merge
  - semantic-merge
  - conflict-detection
  - intent-classification
  - fast-path
  - embedding
  - git
---

# Semantic Merge Module

## Overview

A 3-way semantic merge engine that operates on code units (functions, classes, files) rather than raw text lines. The pipeline has five phases: (1) `MultiVersionIndexer` indexes base, branchA, and branchB via DevAgent with per-branch caching; (2) `FastPathMatcher` performs O(1) hash-based matching across four levels -- exact content, structural, signature, and stable ID -- covering ~90-95% of units; (3) `SemanticMatcher` handles the remaining ~5-10% via vector embedding cosine similarity combined with structural scoring (70/30 weighting); (4) `IntentClassifier` categorizes each change as BugFix, Refactoring, FeatureAddition, or APIChange using heuristic evidence collection; (5) `ConflictDetector` identifies conflicts by severity (Low/Medium/High/Critical) and type (Overlapping, IncompatibleIntents, APIBreaking, DeleteModify). The `ConflictResolver` applies rule-based resolution with optional `AIConflictResolver` fallback that uses embedding similarity to score strategies. `GitIntegration` provides safe branch checkout, merge-base discovery, and rename detection. All models are defined in the `models/` subdirectory as interfaces and enums.

## Data Flow

```
GitIntegration (checkout, merge-base, rename detection)
    |
MultiVersionIndexer (index base + branchA + branchB via DevAgent)
    |
    +--- ContentNormalizer (encoding/BOM/line-ending normalization)
    +--- StructuralNormalizer (AST normalization, structural hash)
    +--- SignatureGenerator (FQN + params signature)
    +--- LazyEmbeddingCache (on-demand vector embeddings)
    |
FastPathMatcher (O(1) hash/signature matching, ~90-95%)
SemanticMatcher (vector cosine similarity, ~5-10%)
    |
IntentClassifier (BugFix / Refactoring / Feature / APIChange)
ConflictDetector (severity + type classification)
    |
ConflictResolver --> AIConflictResolver (optional, embedding-based)
    |
MergeResult (matched units, conflicts, merge actions, stats)
```

## Public API

| Export | Kind | Description | Location |
|--------|------|-------------|----------|
| `ThreeWayMerger` | class | Main engine: `performMerge(branchA, branchB)` orchestrating all 5 phases | [`three-way-merger.ts:45-618`](./engine/three-way-merger.ts) |
| `ConflictResolver` | class | Rule-based resolver: `resolveConflict()`, `resolveConflicts()`, `getPreview()`, `applyResolution()` | [`conflict-resolver.ts:34-419`](./engine/conflict-resolver.ts) |
| `AIConflictResolver` | class | Embedding-based resolver: `analyzeConflict()`, `createResolution()` | [`ai-conflict-resolver.ts:54-334`](./engine/ai-conflict-resolver.ts) |
| `MultiVersionIndexer` | class | 3-branch indexer: `indexThreeBranches(branchA, branchB)` with caching | [`multi-version-indexer.ts:124-515`](./indexing/multi-version-indexer.ts) |
| `FastPathMatcher` | class | O(1) matching: `bulkMatch()`, `findMatch()`, `computeStatistics()` | [`fast-path-matcher.ts:17-241`](./matching/fast-path-matcher.ts) |
| `SemanticMatcher` | class | Vector matching: `findMatch()`, `bulkMatch()`, `computeStatistics()` | [`semantic-matcher.ts:15-190`](./matching/semantic-matcher.ts) |
| `ConflictDetector` | class | Conflict detection: `detectConflict()`, `detectConflicts()` | [`conflict-detector.ts:19-251`](./analysis/conflict-detector.ts) |
| `IntentClassifier` | class | Intent analysis: `classifyIntent(baseUnit, changedUnit)` | [`intent-classifier.ts:23-245`](./analysis/intent-classifier.ts) |
| `ContentNormalizer` | class | File normalization: `normalize(filePath)`, `computeContentHash()` | [`content-normalizer.ts:13-116`](./indexing/content-normalizer.ts) |
| `StructuralNormalizer` | class | AST normalization: `normalizeCode()`, `computeStructuralHash()` | [`structural-normalizer.ts:11-43`](./indexing/structural-normalizer.ts) |
| `SignatureGenerator` | class | Signature gen: `generateSignature()`, `computeSignatureHash()` | [`signature-generator.ts:12-202`](./indexing/signature-generator.ts) |
| `LazyEmbeddingCache` | class | Lazy embeddings: `generateEmbeddings()`, `clearCache()`, `getCacheStats()` | [`lazy-embedding-cache.ts:12-110`](./indexing/lazy-embedding-cache.ts) |
| `GitIntegration` | class | Git ops: `checkoutBranch()`, `getMergeBase()`, `getChangedFilesBetween()` | [`git-integration.ts:51-431`](./integration/git-integration.ts) |
| `CodeUnit` | interface | Universal code unit: id, hashes, content, embedding, hierarchy | [`code-unit.ts:9-40`](./models/code-unit.ts) |
| `VersionedIndex` | interface | Per-branch index with hash/signature/filePath lookup maps | [`versioned-index.ts:9-31`](./models/versioned-index.ts) |
| `MergeResult` | interface | Full merge output: matched units, conflicts, actions, stats | [`merge-result.ts:64-108`](./models/merge-result.ts) |
| `SemanticConflict` | interface | Conflict details: type, severity, regions, resolution suggestions | [`semantic-conflict.ts:30-55`](./models/semantic-conflict.ts) |
| `ChangeIntent` | interface | Intent classification with type, confidence, and evidence | [`change-intent.ts:22-27`](./models/change-intent.ts) |

## Dependencies

| Dependency | Kind | Purpose |
|------------|------|---------|
| `src/logging/index.js` | internal | Structured logging (`log.i`, `log.d`, `log.w`, `log.e`) |
| `src/utils/fast-hash.js` | internal | SHA256 hashing via `hashText()` for content/structural/signature hashes |
| `src/utils/file-ops.js` | internal | `readBytes()` for raw file reading in ContentNormalizer |
| `src/utils/simd-vector-ops.js` | internal | SIMD-optimized `cosineSimilarity()` for SemanticMatcher |
| `src/core/branch-manager.js` | internal | Branch database caching and metadata for MultiVersionIndexer |
| `src/core/di-container.js` | internal | DI container for agent creation during indexing |
| `src/core/agent-registry.js` | internal | `getOrCreateAgent()` to obtain DevAgent for indexing |
| `src/agents/conductor-orchestrator.js` | internal | Orchestrator providing GraphStorage fallback |
| `src/semantic/embedding-generator.js` | internal | `EmbeddingGenerator` interface for AIConflictResolver |
| `src/types/agent.js` | internal | `Agent` interface and `AgentType` enum |
| `node:child_process` | stdlib | `execSync` for git CLI operations in GitIntegration |
| `node:fs` | stdlib | `existsSync` for git repository validation |
| `node:path` | stdlib | `join` for path construction |

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `ThreeWayMergerConfig.fastPathEnabled` | `true` | Enable hash-based O(1) Fast Path matching |
| `ThreeWayMergerConfig.semanticMatchingEnabled` | `true` | Enable vector embedding Slow Path matching |
| `ThreeWayMergerConfig.semanticThreshold` | `0.7` | Minimum combined score for semantic match acceptance |
| `ThreeWayMergerConfig.classifyIntents` | `true` | Enable change intent classification |
| `ThreeWayMergerConfig.autoResolveConflicts` | `false` | Enable automatic conflict resolution |
| `ConflictResolverConfig.aiEnabled` | `false` | Enable AI-assisted conflict resolution |
| `ConflictResolverConfig.minConfidenceThreshold` | `0.5` | Minimum confidence for auto-resolve |
| `AIConflictResolverConfig.highSimilarityThreshold` | `0.9` | Threshold for "same change" detection |
| `AIConflictResolverConfig.minConfidenceForAutoMerge` | `0.8` | Minimum confidence to auto-merge via AI |
| `IndexingOptions.incremental` | `true` | Use incremental indexing |
| `LazyEmbeddingCacheOptions.batchSize` | `32` | Batch size for parallel embedding generation |
| `GitIntegrationConfig.restoreOnError` | `true` | Restore original branch on checkout failure |

## Behavioral Properties

Fast Path matching proceeds through four levels in order: (1) exact contentHash (confidence 1.0, ~50-60% coverage), (2) structuralHash ignoring whitespace/comments (0.95, ~25-30%), (3) FQN+params signature (0.85, ~5-10%), (4) stable ID (0.7, ~5%). When multiple candidates match at a given level, same-file-path candidates are preferred. Semantic matching computes a combined score of 70% vector cosine similarity plus 30% structural hash similarity, with a configurable threshold (default 0.7). `IntentClassifier` collects evidence for each intent type (try-catch additions for BugFix, CFG-preserved for Refactoring, new children for FeatureAddition, signature changes for APIChange) and selects the type with the most evidence. `ConflictDetector` uses an intent compatibility matrix where BugFix+Refactoring is compatible but APIChange is incompatible with everything. `ContentNormalizer` strips BOM, normalizes CRLF/CR to LF, and trims trailing whitespace per line. `MultiVersionIndexer` caches per-branch indexes keyed by commit hash; cache misses trigger full DevAgent re-indexing with GraphStorage fallback. `AIConflictResolver` caches embeddings by `${unitId}-${contentHash}` and uses heuristics: high similarity (>=0.9) picks the branch closer to base, medium (>=0.7) attempts intelligent merge, low (<0.5) forces manual review.

## Error Handling

`MultiVersionIndexer.indexThreeBranches()` throws on missing merge base; on any error it calls `GitIntegration.cleanup()` to restore the original branch. `GitIntegration.checkoutBranch()` throws if uncommitted changes are detected or if the target branch does not exist, and auto-restores when `restoreOnError` is enabled. `SemanticMatcher.findMatch()` throws if the target unit lacks an embedding. `AIConflictResolver.analyzeConflict()` catches embedding generation failures and logs a warning. `ConflictResolver` falls back to manual review when AI confidence is below threshold or when AI fails entirely. `MultiVersionIndexer` falls back to `GraphStorage.getAllEntities()` when DevAgent returns no entities. All git operations use `execSync` with `windowsHide: true` and pipe-based stdio to suppress terminal output.

## Observability

`ThreeWayMerger` emits info-level logs at each phase boundary with unit counts, match counts, and timing. Tags: `3WAYMERGE` (three-way merger), `MULTIVIDX` (multi-version indexer), `CONFLICTRES` (conflict resolver), `AICONFLICT` (AI resolver), `GITINTEGR` (git integration). `MergeStats` provides `mergeTimeMs`, `matchedCount`, `conflictCount`, `autoMergedCount`, `manualReviewCount`, `addedFromACount`, `addedFromBCount`, `deletedCount`, `renamedCount`. `FastPathStatistics` and `SemanticMatchStatistics` expose coverage rates and breakdown by match level. `LazyEmbeddingCache.getCacheStats()` returns cache size and estimated memory usage. `AIConflictResolver.getCacheStats()` reports embedding cache size.

## Known Limitations

1. `ConflictResolver.attemptSimpleMerge()` is a stub returning `null` for most cases; proper diff3/tree-merge is not yet implemented.
2. `StructuralNormalizer` uses regex-based comment removal rather than AST parsing; may mishandle comments inside strings.
3. `SignatureGenerator` uses regex for parameter extraction; complex generics or destructured parameters may be missed.
4. `IntentClassifier` relies on heuristic pattern matching; it cannot detect subtle semantic intent changes.
5. `AIConflictResolver` intelligent merge heuristic is simplistic (takes the longer version); no AST-aware merging.
6. `MultiVersionIndexer` indexes branches sequentially, not in parallel, to avoid concurrent git checkout conflicts.
7. `GitIntegration` uses synchronous `execSync` for all git operations, blocking the event loop.
8. Embedding generation requires an external `EmbeddingGenerator`; without it, semantic matching and AI resolution are unavailable.

## TypeScript Notes

All models use strict interfaces with optional fields marked via `?` and explicit `| undefined` unions. Enums are used for `CodeUnitType`, `ChangeIntentType`, `EvidenceType`, `ConflictSeverity`, `ConflictType`, `ResolutionStrategy`, and `FastPathMatchLevel`. `VersionedIndex` uses `Map<string, CodeUnit>` for O(1) lookups and `Map<string, string[]>` multi-maps for hash indexes. `Float32Array` is used for embeddings to minimize memory. Factory functions (`createVersionedIndex`, `createOverlappingConflict`, etc.) provide ergonomic model construction. Config interfaces use `Partial<T>` in constructors with spread-based defaults. The `engine/index.ts` barrel re-exports `MultiVersionIndexer` from `../indexing/` in addition to engine-local exports.

## Exports



## Files

| File | Lines | Purpose |
|------|-------|---------|
| [`index.ts`](./index.ts) | 4 | Module barrel: re-exports indexing, matching, models |
| [`models/index.ts`](./models/index.ts) | 7 | Models barrel: re-exports all model types |
| [`models/code-unit.ts`](./models/code-unit.ts) | 71 | `CodeUnit` interface, `CodeUnitType` enum, `CodeStructure` interface |
| [`models/change-intent.ts`](./models/change-intent.ts) | 123 | `ChangeIntent`, `ChangeIntentType`, `EvidenceType`, factory functions |
| [`models/semantic-conflict.ts`](./models/semantic-conflict.ts) | 156 | `SemanticConflict`, `ConflictSeverity`, `ConflictType`, `Resolution`, factory functions |
| [`models/merge-result.ts`](./models/merge-result.ts) | 108 | `MergeResult`, `MergeAction`, `MergeStats`, `MergeActionType` |
| [`models/versioned-index.ts`](./models/versioned-index.ts) | 122 | `VersionedIndex`, `createVersionedIndex`, `addUnitToIndex`, hash lookup functions |
| [`indexing/index.ts`](./indexing/index.ts) | 6 | Indexing barrel: re-exports all indexing components |
| [`indexing/content-normalizer.ts`](./indexing/content-normalizer.ts) | 125 | BOM/encoding/line-ending normalization, SHA256 content hashing |
| [`indexing/structural-normalizer.ts`](./indexing/structural-normalizer.ts) | 148 | AST normalization: strip comments/whitespace, structural hash |
| [`indexing/signature-generator.ts`](./indexing/signature-generator.ts) | 202 | Function/class/module signature generation and hashing |
| [`indexing/lazy-embedding-cache.ts`](./indexing/lazy-embedding-cache.ts) | 130 | On-demand embedding generation with in-memory caching |
| [`indexing/multi-version-indexer.ts`](./indexing/multi-version-indexer.ts) | 515 | 3-branch parallel indexing with DevAgent and per-branch caching |
| [`matching/index.ts`](./matching/index.ts) | 3 | Matching barrel: re-exports FastPathMatcher and SemanticMatcher |
| [`matching/fast-path-matcher.ts`](./matching/fast-path-matcher.ts) | 276 | 4-level O(1) hash-based matching with statistics |
| [`matching/semantic-matcher.ts`](./matching/semantic-matcher.ts) | 214 | Vector cosine similarity matching with combined scoring |
| [`analysis/index.ts`](./analysis/index.ts) | 2 | Analysis barrel: re-exports ConflictDetector and IntentClassifier |
| [`analysis/intent-classifier.ts`](./analysis/intent-classifier.ts) | 245 | Heuristic intent classification with evidence collection |
| [`analysis/conflict-detector.ts`](./analysis/conflict-detector.ts) | 251 | Conflict detection, severity classification, intent compatibility matrix |
| [`engine/index.ts`](./engine/index.ts) | 8 | Engine barrel: re-exports ThreeWayMerger, ConflictResolver, AIConflictResolver |
| [`engine/three-way-merger.ts`](./engine/three-way-merger.ts) | 618 | Main 5-phase merge orchestrator with rename and delete-modify detection |
| [`engine/conflict-resolver.ts`](./engine/conflict-resolver.ts) | 419 | Rule-based conflict resolution with Git-style conflict markers |
| [`engine/ai-conflict-resolver.ts`](./engine/ai-conflict-resolver.ts) | 334 | Embedding-based AI conflict analysis and intelligent merge heuristics |
| [`integration/index.ts`](./integration/index.ts) | 2 | Integration barrel: re-exports GitIntegration |
| [`integration/git-integration.ts`](./integration/git-integration.ts) | 431 | Safe git operations: checkout, merge-base, diff, branch restore |
