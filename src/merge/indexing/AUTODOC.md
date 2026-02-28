---
module_name: indexing
description: "Multi-version code indexing with content normalization and signature generation"
status: active
language: typescript
---

# Indexing

> Indexes code from multiple git branches into VersionedIndex structures, normalizing content, generating structural hashes, and caching embeddings for the semantic merge pipeline.

## Overview

The indexing module prepares code for three-way merge by building VersionedIndex structures for each branch. MultiVersionIndexer orchestrates parallel branch indexing with caching support. ContentNormalizer handles encoding detection, BOM removal, and line ending normalization to ensure consistent hashing. StructuralNormalizer strips comments and whitespace to produce structural hashes. SignatureGenerator creates function/class signatures for fast-path matching. LazyEmbeddingCache generates embeddings on demand for unmatched units.

## Data Flow

- **Inputs**: Git branch names, BranchManager, GitIntegration, and ConductorOrchestrator for DevAgent-based indexing.
- **Processing**: Checks branch caches, checks out branches, runs DevAgent indexing, builds VersionedIndex with hash indexes (content, structural, signature, filePath).
- **Outputs**: MultiVersionIndexResult with three VersionedIndex objects (base, branchA, branchB) and merge-base commit hash.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ContentNormalizer` | class | Normalizes file encoding, BOM, and line endings for consistent hashing | [`content-normalizer.ts:13-116`](./content-normalizer.ts) |
| `NormalizedContent` | interface | Result of file normalization with encoding metadata | [`content-normalizer.ts:121-125`](./content-normalizer.ts) |
| `LazyEmbeddingCache` | class | On-demand batch embedding generation with in-memory caching | [`lazy-embedding-cache.ts:12-110`](./lazy-embedding-cache.ts) |
| `EmbeddingGeneratorFn` | type | Function type for generating embeddings from code strings | [`lazy-embedding-cache.ts:115-115`](./lazy-embedding-cache.ts) |
| `MultiVersionIndexer` | class | Parallel indexing of base + branchA + branchB with cache support | [`multi-version-indexer.ts:124-515`](./multi-version-indexer.ts) |
| `MultiVersionIndexResult` | interface | Result containing three VersionedIndex objects and statistics | [`multi-version-indexer.ts:100-111`](./multi-version-indexer.ts) |
| `SignatureGenerator` | class | Generates FQN-based signatures for functions, classes, and modules | [`signature-generator.ts:12-202`](./signature-generator.ts) |
| `StructuralNormalizer` | class | Strips comments and whitespace for structural hash comparison | [`structural-normalizer.ts:11-43`](./structural-normalizer.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `merge/models` | CodeUnit, VersionedIndex types |
| `merge/integration` | GitIntegration for branch checkout |
| `core/branch-manager` | Branch database caching |
| `core/di-container` | Dependency injection container |
| `core/agent-registry` | DevAgent creation for indexing |
| `logging` | Structured logging |
| `utils/fast-hash` | SHA256 hashing via hashText |
| `utils/file-ops` | File reading via readBytes |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default batch size | 32 embeddings per batch in LazyEmbeddingCache |
| Cache key strategy | Content hash (same content produces same embedding) |
| Incremental indexing | Enabled by default; skips branches with up-to-date cache |

## Error Handling

MultiVersionIndexer ensures git branch cleanup on indexing errors. LazyEmbeddingCache skips units that already have embeddings. ContentNormalizer defaults to UTF-8 when BOM detection fails. Cache load failures are logged and cause fresh re-indexing.

## Known Limitations

- SignatureGenerator uses regex-based parameter extraction; full AST parsing would improve accuracy.
- StructuralNormalizer comment removal is regex-based and may fail on edge cases (strings containing comment markers).
- MultiVersionIndexer requires sequential branch checkout (cannot index branches in parallel due to git working directory constraints).

## Exports



## Files

| File | Description |
|------|-------------|
| `content-normalizer.ts` | Normalizes file encoding, BOM, line endings, and trailing whitespace |
| `index.ts` | Re-exports all indexing module components |
| `lazy-embedding-cache.ts` | On-demand embedding generation with in-memory caching and batch processing |
| `multi-version-indexer.ts` | Indexes three git branches sequentially with branch database caching |
| `signature-generator.ts` | Generates function signatures (FQN + parameters) and class type signatures |
| `structural-normalizer.ts` | Normalizes code by removing comments, whitespace, and optional semicolons for structural comparison |
