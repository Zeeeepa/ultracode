---
module_name: matching
description: "Fast-path and semantic code unit matching for three-way merge"
status: active
language: typescript
---

# Matching

> Matches code units between branch versions using a tiered strategy: O(1) hash-based fast path (covering ~90-95% of units) and vector embedding-based semantic matching for the remainder.

## Overview

The matching module provides two complementary matching strategies for the semantic merge pipeline. FastPathMatcher uses four progressively relaxed hash/ID lookups to match code units with O(1) complexity per unit. SemanticMatcher handles the remaining ~5-10% of unmatched units using cosine similarity of vector embeddings combined with structural hash comparison, producing a weighted combined score.

## Data Flow

- **Inputs**: CodeUnit objects from VersionedIndex with content hashes, structural hashes, signatures, embeddings, and IDs.
- **Processing**: FastPathMatcher tries exact content hash, structural hash, signature, and ID matching in order; SemanticMatcher computes vector similarity (70% weight) + structural similarity (30% weight).
- **Outputs**: Match results with confidence scores, match level/type, and matched base CodeUnit references.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `FastPathMatcher` | class | O(1) hash-based matching with 4 levels of decreasing strictness | [`fast-path-matcher.ts:17-241`](./fast-path-matcher.ts) |
| `FastPathMatchResult` | interface | Match result with base unit, match level, and confidence | [`fast-path-matcher.ts:246-251`](./fast-path-matcher.ts) |
| `FastPathMatchLevel` | enum | Match levels: ExactContent, Structural, Signature, Id | [`fast-path-matcher.ts:256-261`](./fast-path-matcher.ts) |
| `FastPathStatistics` | interface | Coverage statistics broken down by match level | [`fast-path-matcher.ts:266-276`](./fast-path-matcher.ts) |
| `SemanticMatcher` | class | Vector embedding-based matching for unmatched units | [`semantic-matcher.ts:15-190`](./semantic-matcher.ts) |
| `SemanticMatchResult` | interface | Match result with vector similarity, structural similarity, and combined score | [`semantic-matcher.ts:195-202`](./semantic-matcher.ts) |
| `SemanticMatchStatistics` | interface | Coverage and average similarity statistics | [`semantic-matcher.ts:207-214`](./semantic-matcher.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `merge/models` | CodeUnit and VersionedIndex types |
| `utils/simd-vector-ops` | SIMD-optimized cosine similarity for vector comparison |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Fast path confidence | ExactContent: 1.0, Structural: 0.95, Signature: 0.85, ID: 0.7 |
| Semantic score formula | vectorSimilarity * 0.7 + structuralSimilarity * 0.3 |
| Default similarity threshold | 0.7 minimum combined score for semantic matching |

## Error Handling

SemanticMatcher throws if a target unit is missing its embedding (requires LazyEmbeddingCache to generate first). FastPathMatcher returns undefined for unmatched units without throwing. Both matchers handle empty index edges gracefully.

## Known Limitations

- Structural similarity is binary (1.0 for matching hash, 0.0 otherwise); edit distance would provide finer granularity.
- SemanticMatcher candidate filtering only matches by type, not by file proximity or namespace.
- FastPathMatcher prefers same-file candidates for exact matches but falls back to first candidate for other levels.

## Exports



## Files

| File | Description |
|------|-------------|
| `fast-path-matcher.ts` | Four-level O(1) hash/ID matching with bulk and single-unit operations |
| `index.ts` | Re-exports FastPathMatcher and SemanticMatcher |
| `semantic-matcher.ts` | Embedding-based matching with combined vector + structural scoring |
