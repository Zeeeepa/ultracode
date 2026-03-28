# src/utils/__tests__

## Overview

This module provides a comprehensive test suite and performance benchmark suite for utility functions, validating Bloom filter correctness and quantifying optimization gains across multiple implementations. The Bloom filter tests verify creation, membership queries, false positive rates, collision detection, and string handling with diverse inputs. The optimization benchmarks compare legacy versus optimized implementations of deduplication, topic matching, history retrieval, and subscription management, measuring execution time and calculating speedup ratios to guide performance improvement decisions.

## Flow

```
Test Suite (bloom-filter.test.ts)
├─ Creation Tests
│  └─ Insertion & Presence Verification
├─ Membership Queries
│  └─ Single/Multiple Element Lookups
├─ False Positive Analysis
│  └─ Rate Measurement & Comparison
├─ Filter Scaling
│  └─ Capacity & Size Trade-offs
├─ Collision Detection
│  └─ Overlap & Uniqueness Verification
└─ String Handling
   └─ Diverse Input & Similarity Detection

Benchmark Suite (optimizations-benchmark.ts)
├─ Legacy Implementation
│  └─ Baseline Execution
├─ Optimized Implementation
│  └─ New Execution
└─ Comparison Report
   └─ Speedup Calculation
```

## Bloom Filter Test Suite

- **describe** — `bloom-filter.test.ts:4-200` — Root test suite for Bloom filter functionality validating creation, insertion, membership queries, false positive rates, collision behavior, and string input handling across diverse test scenarios.

### Creation and Insertion Tests

- **it** — `bloom-filter.test.ts:5-45` — Test group for basic creation and insertion operations, validating filter initialization and correct element storage.
- **bloom** — `bloom-filter.test.ts:6-11` — Verifies basic Bloom filter creation and single-element insertion.
- **bloom** — `bloom-filter.test.ts:13-17` — Validates sequential insertion of multiple elements and presence verification for all added items.
- **bloom** — `bloom-filter.test.ts:19-29` — Confirms that added elements are retrievable while non-added elements are correctly reported as absent.
- **bloom** — `bloom-filter.test.ts:31-44` — Tests numeric ID input storage and retrieval to validate non-string element handling.

### Membership Query Tests

- **it** — `bloom-filter.test.ts:47-65` — Test group for membership query operations, verifying has() method accuracy for single elements, batches, and negative queries.
- **bloom** — `bloom-filter.test.ts:48-51` — Tests single-element membership query accuracy.
- **bloom** — `bloom-filter.test.ts:53-57` — Validates batch membership verification for multiple elements.
- **bloom** — `bloom-filter.test.ts:59-64` — Confirms negative queries correctly identify non-member elements.

### False Positive Rate Tests

- **it** — `bloom-filter.test.ts:67-77` — Test group for false positive rate measurement with standard dataset and random non-member queries.
- **bloom** — `bloom-filter.test.ts:68-76` — Creates a 1000-element filter and measures false positive frequency against random queries.

### Filter Size and Scaling Tests

- **it** — `bloom-filter.test.ts:79-137` — Test group comparing false positive rates and scaling behavior across different filter capacities.
- **bloom** — `bloom-filter.test.ts:80-98` — Measures false positive count for a standard-capacity filter against generated test items.
- **_** — `bloom-filter.test.ts:82-82` — Collection of generated test items for false positive measurement.
- **smallBloom** — `bloom-filter.test.ts:100-122` — Creates a reduced-capacity Bloom filter for comparative false positive analysis.
- **_** — `bloom-filter.test.ts:104-104` — Test items generated for small filter comparison.
- **bloom** — `bloom-filter.test.ts:124-136` — Analyzes false positive rate scaling across different filter sizes.
- **_** — `bloom-filter.test.ts:126-126` — Test data for filter size comparison analysis.

### Collision and Overlap Tests

- **it** — `bloom-filter.test.ts:139-158` — Test group for collision and overlap behavior verification between independent filters.
- **bloom** — `bloom-filter.test.ts:140-144` — Creates two filters with overlapping elements and detects intersection.
- **bloom** — `bloom-filter.test.ts:146-151` — Creates two filters with completely unique elements to verify no false overlap detection.
- **bloom** — `bloom-filter.test.ts:153-157` — Verifies no false overlaps occur when querying random non-member elements.

### String Input and Similarity Tests

- **it** — `bloom-filter.test.ts:160-199` — Test group for string input handling and similarity detection with diverse character sets and lengths.
- **bloom** — `bloom-filter.test.ts:161-165` — Validates text-based insertion and query operations with string elements.
- **bloom** — `bloom-filter.test.ts:167-176` — Tests encoding robustness with varied string inputs including special characters.
- **bloom** — `bloom-filter.test.ts:178-183` — Validates performance with extended string lengths.
- **bloom** — `bloom-filter.test.ts:185-198` — Detects similar string matches to test substring and variation handling.

## Optimization Benchmark Suite

### Benchmark Execution Framework

- **benchmark** — `optimizations-benchmark.ts:145-159` — Executes timing comparison between two implementations over multiple iterations, calculating speedup ratio and reporting aggregate results.

### Deduplication Optimization

- **deduplicateOld** — `optimizations-benchmark.ts:16-25` — Legacy deduplication implementation using nested loop comparison with O(n²) time complexity.
- **<anonymous>** — `optimizations-benchmark.ts:16-16` — Anonymous wrapper function for legacy deduplication baseline.
- **e** — `optimizations-benchmark.ts:20-20` — Loop variable referencing array elements during deduplication comparison.
- **deduplicateNew** — `optimizations-benchmark.ts:27-44` — Optimized deduplication using Set-based lookup achieving O(n) time complexity.
- **<anonymous>** — `optimizations-benchmark.ts:27-27` — Anonymous wrapper function for optimized deduplication implementation.

### Topic Matching Optimization

- **matchTopicOld** — `optimizations-benchmark.ts:50-57` — Legacy topic matching using regex object creation on every invocation, causing recompilation overhead.
- **<anonymous>** — `optimizations-benchmark.ts:50-50` — Anonymous wrapper function for legacy topic matching baseline.