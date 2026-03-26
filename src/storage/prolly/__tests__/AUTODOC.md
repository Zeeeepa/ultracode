# src/storage/prolly/__tests__

## Overview

This module contains comprehensive test suites for the Prolly tree storage layer, verifying correct behavior of commit management, node persistence, and tree operations. Tests are organized across three files—`commit-manager.test.ts`, `node-store.test.ts`, and `prolly-tree.test.ts`—each testing a core storage component using mocked database clients to isolate behavior verification from actual database operations.

## Entity Listing

### Mock Utilities

- **createMockClient** (`commit-manager.test.ts:5-89`) — Constructs a mock database client with in-memory Maps for commits and branch heads, implementing SQL execution for table creation, commit insertion, and branch head updates.
- **createMockClient** (`node-store.test.ts:6-102`) — Constructs a mock database client with in-memory node storage, supporting SQL operations for node creation, retrieval, and batch queries.
- **createMockClient** (`prolly-tree.test.ts:6-54`) — Constructs a mock database client for tree operations, supporting SQL execution for node and metadata storage.

### CommitManager Test Suite

- **commitManager** (`commit-manager.test.ts:91-206`) — Describe block containing all tests for the CommitManager class.
- **mockClient** (`commit-manager.test.ts:93-93`) — Mock database client instance used throughout CommitManager tests.
- **it (basic commit creation)** (`commit-manager.test.ts:102-126`) — Verifies that commits can be created and stored with correct hashes, metadata, and branch associations.
- **it (commit history with time filters)** (`commit-manager.test.ts:128-143`) — Confirms that commit history retrieval correctly filters by branch and respects time-based constraints.
- **it (pagination)** (`commit-manager.test.ts:145-182`) — Validates that commit history pagination works correctly with offset and limit, and returns accurate result counts.
- **it (timestamp precision)** (`commit-manager.test.ts:184-205`) — Ensures commits are retrievable by creation timestamp with proper ordering.
- **commit** (`commit-manager.test.ts:104-109`) — Variable storing test commit data with hash, project, branch, parent, and tree metadata.
- **commit1** (`commit-manager.test.ts:121-121`) — First commit in history test sequence.
- **commit2** (`commit-manager.test.ts:122-122`) — Second commit for testing history ordering.
- **history** (`commit-manager.test.ts:136-136`) — Retrieved commit history for validation.
- **midpoint** (`commit-manager.test.ts:150-150`) — Timestamp value for pagination boundary testing.
- **futureTimestamp** (`commit-manager.test.ts:164-164`) — Timestamp beyond all commits for filter testing.
- **baseTime** (`commit-manager.test.ts:171-171`) — Base timestamp for generating commit sequences in pagination tests.

### NodeStore Test Suite

- **store** (`node-store.test.ts:104-390`) — Describe block containing all tests for the NodeStore class.
- **mockClient** (`node-store.test.ts:108-112`) — Mock database client instance for NodeStore tests.
- **it (single node storage)** (`node-store.test.ts:114-122`) — Verifies that individual nodes can be stored and retrieved with correct hashes.
- **it (node with children)** (`node-store.test.ts:124-184`) — Tests storing composite nodes with child references and validates parent-child relationships.
- **it (bulk node operations)** (`node-store.test.ts:186-227`) — Confirms batch insertion and retrieval of multiple nodes in a single operation.
- **it (duplicate detection)** (`node-store.test.ts:229-243`) — Validates that storing identical nodes returns consistent hashes.
- **it (node iteration)** (`node-store.test.ts:245-260`) — Verifies iteration over all stored nodes returns complete dataset.
- **it (node lookup by hash)** (`node-store.test.ts:262-285`) — Tests retrieval of individual nodes by their hash identifiers.
- **it (batch retrieval)** (`node-store.test.ts:287-305`) — Confirms fetching multiple nodes by hash list returns correct results.
- **it (nested node relationships)** (`node-store.test.ts:307-326`) — Validates correct storage and retrieval of nodes with nested child structures.
- **it (leaf node data)** (`node-store.test.ts:328-340`) — Tests storage of leaf nodes with actual data content.
- **it (node value extraction)** (`node-store.test.ts:342-367`) — Verifies that node values can be extracted and compared for equality.
- **it (large dataset handling)** (`node-store.test.ts:369-389`) — Tests storage and retrieval of a large number of nodes for performance validation.
- **hash** (`node-store.test.ts:125-135`) — Node hash computed from test data.
- **childHash** (`node-store.test.ts:137-154`) — Hash of a child node in parent-child relationship tests.
- **node** (`node-store.test.ts:156-167`) — Constructed node object for storage testing.
- **hash1** (`node-store.test.ts:169-183`) — Hash of composite test node.
- **nodes** (`node-store.test.ts:263-274`) — Collection of nodes for iteration testing.
- **sameNode** (`node-store.test.ts:276-284`) — Duplicate node used for hash consistency validation.
- **leafData** (`node-store.test.ts:343-357`) — Data content stored in a leaf node.
- **value** (`node-store.test.ts:359-366`) — Extracted value from node for comparison.

### ProllyTree Test Suite

- **nodeStore** (`prolly-tree.test.ts:56-353`) — Describe block containing all tests for the ProllyTree class.
- **mockClient** (`prolly-tree.test.ts:61-68`) — Mock database client instance for ProllyTree tests.
- **it (tree building and root hash)** (`prolly-tree.test.ts:70-119`) — Verifies that a Prolly tree can be built from entries and produces a consistent root hash.
- **it (tree iteration)** (`prolly-tree.test.ts:121-134`) — Tests iteration over tree entries returns them in order.
- **it (tree lookup)** (`prolly-tree.test.ts:136-154`) — Validates single-entry lookup functionality in the tree.
- **it (tree range queries)** (`prolly-tree.test.ts:156-176`) — Tests retrieving ranges of entries from the tree.
- **it (tree updates)** (`prolly-tree.test.ts:178-203`) — Verifies updating tree entries produces correct new root hashes.
- **it (tree diff)** (`prolly-tree.test.ts:205-291`) — Confirms tree diff operation correctly identifies added, removed, and modified entries between two trees.
- **it (tree statistics)** (`prolly-tree.test.ts:293-317`) — Tests that tree statistics (node count, depth, entry count) are computed correctly.
- **it (entity serialization)** (`prolly-tree.test.ts:319-352`) — Validates serialization and deserialization of complex entities through the tree.
- **rootHash** (`prolly-tree.test.ts:71-76`) — Root hash computed from initial tree entries.
- **entries** (`prolly-tree.test.ts:78-87`) — Entry set for tree construction.
- **tree** (`prolly-tree.test.ts:89-102`, `prolly-tree.test.ts:104-118`) — Prolly tree instances used throughout tests.
- **tree1** (`prolly-tree.test.ts:206-225`) — First tree in diff comparison.
- **root1** (`prolly-tree.test.ts:251-251`) — Root hash of first tree in diff test.
- **tree2** (`prolly-tree.test.ts:253-253`) — Second tree in diff comparison.
- **diff** (`prolly-tree.test.ts:258-258`) — Diff result between two trees showing changes.
- **stats** (`prolly-tree.test.ts:301-301`, `prolly-tree.test.ts:310-310`) — Tree statistics object containing node and entry metrics.
- **entity** (`prolly-tree.test.ts:321-327`) — Test entity object for serialization verification.
- **serialized** (`prolly-tree.test.ts:329-329`, `prolly-tree.test.ts:347-347`) — Serialized representation of an entity.
- **deserialized** (`prolly-tree.test.ts:332-332`, `prolly-tree.test.ts:348-348`) — Deserialized entity after round-trip serialization.
- **complex** (`prolly-tree.test.ts:337-345`) — Complex nested entity structure for testing.

## Dependencies

Tests depend on:
- **CommitManager** (`../commit-manager.js`) — Core class managing commit storage and history queries.
- **NodeStore** (`../node-store.js`) — Core class handling persistent node storage.
- **ProllyTree** (`../prolly-tree.js`) — Core class implementing the Prolly tree data structure.
- **bun:test** — Bun's native test framework providing `describe`, `it`, `expect`, `beforeEach`, and `mock` utilities.