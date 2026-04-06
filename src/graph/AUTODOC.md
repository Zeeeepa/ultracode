# Graph

## Overview

This module provides efficient graph reachability analysis through two complementary indexing structures: Basin Index and Bloom Reach Index. BasinIndex performs conservative pre-filtering by partitioning nodes into basins (groups that flow to the same sink), enabling O(1) negative reachability tests before expensive graph traversals. BloomReachIndex adds probabilistic reachability querying using Bloom filters, optimizing the trace engine and impact analyzer for practical codebases where most node pairs are unreachable. Together, these structures eliminate unnecessary BFS traversals and accelerate dependency analysis.

## Flow

```
Graph Structure (fan-in/fan-out counts, predecessors)
    ↓
BasinIndex: Multi-source reverse BFS from sinks
    ↓ (identifies basin boundaries)
O(1) reachability pre-filter (mayReach queries)
    ├─→ UNREACHABLE? → skip BFS
    └─→ MAYBE? → proceed to BloomReachIndex
         ↓
         BloomReachIndex: Bloom filter on reachable set
         ↓
         UNREACHABLE? → confirmed, skip BFS
         MAYBE? → fall back to full BFS if needed
         ↓
         Reachability Result (true/false/ambiguous)
```

## Entities

### Types & Interfaces

- **`BasinBuildInput`** `[basin-index.ts:16-25]` — Configuration object providing node count, fan-in/fan-out accessor, and predecessor lookup for basin index construction.
- **`BloomReachBuildInput`** `[bloom-reach.ts:73-86]` — Configuration object specifying node count, adjacency list provider, and reachable-nodes callback for bloom reach index construction.
- **`ReachResult`** `[bloom-reach.ts:71]` — Type alias representing the result of a reachability query (true/false/ambiguous state).

### Classes

- **`BasinIndex`** `[basin-index.ts:27-159]` — Partitions graph nodes into basins (groups flowing to the same sink) via multi-source reverse BFS, enabling O(1) negative reachability pre-filtering by testing whether two nodes belong to the same basin.
- **`BloomFilter`** `[bloom-reach.ts:20-65]` — Probabilistic set membership data structure using bitwise hashing to compactly represent reachable nodes with configurable false-positive rate.
- **`BloomReachIndex`** `[bloom-reach.ts:88-235]` — Builds a Bloom filter of reachable nodes from each source via BFS, providing efficient `canReach()` queries that return definitive false for unreachable pairs and probable true for potential reaches.

### Constants

- **`NO_BASIN`** `[basin-index.ts:16-25]` — Sentinel value (0xffff) indicating a node belongs to multiple basins, marking ambiguous reachability that requires full traversal rather than pre-filtering.

## Dependencies

- **Basin Index** internally implements multi-source reverse BFS with queue-based traversal; used as first-stage filter in trace engine and impact analyzer.
- **Bloom Reach Index** depends on complete BFS traversal to populate Bloom filter state; serves as second-stage filter when basin index is ambiguous (both nodes in NO_BASIN).
- Both indexes assume a static graph structure (node count, edges, fan counts) that must be stable across multiple reachability queries; marked invalid when graph topology changes.