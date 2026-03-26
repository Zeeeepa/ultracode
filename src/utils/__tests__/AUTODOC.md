# src/utils/__tests__

## Overview

This module contains unit tests and performance benchmarks for utility functions and optimizations. It includes a comprehensive test suite for a Bloom filter implementation (`bloom-filter.test.ts`) and a benchmark suite that compares old vs. new implementations of core utility operations (`optimizations-benchmark.ts`). The benchmarks measure performance improvements across deduplication, topic matching, history retrieval, and subscription management operations.

## Flow

```
Test Suite (bloom-filter.test.ts)
├─ Creation Tests → Verify filter initialization
├─ Member Tests → Test add() and has() operations
├─ Collision Tests → Check false positive rates
├─ Edge Cases → Validate boundary conditions
└─ String Variations → Test with diverse input strings

Benchmarks (optimizations-benchmark.ts)
├─ Pair old/new implementations
├─ Run iterations with timing
├─ Calculate speedup ratios
└─ Output formatted results
```

## Types

- **Entity** — `optimizations-benchmark.ts:11-14` — Interface representing benchmark test entity with optional properties.
- **Snapshot** — `optimizations-benchmark.ts:76-79` — Interface capturing subscription snapshot state.
- **Subscription** — `optimizations-benchmark.ts:105-108` — Interface defining subscription object with topic and history properties.

## Bloom Filter Tests

- **describe** — `bloom-filter.test.ts:4-200` — Root test suite for Bloom filter functionality.
- **it** — `bloom-filter.test.ts:5-45` — Test group for basic creation and insertion operations.
- **bloom** — `bloom-filter.test.ts:6-11` — Creates a Bloom filter and adds a single element.
- **bloom** — `bloom-filter.test.ts:13-17` — Creates a filter, adds multiple elements, verifies presence.
- **bloom** — `bloom-filter.test.ts:19-29` — Creates a filter, adds elements, tests absence detection.
- **bloom** — `bloom-filter.test.ts:31-44` — Creates a filter with numeric ID input and verifies storage.
- **it** — `bloom-filter.test.ts:47-65` — Test group for membership query operations.
- **bloom** — `bloom-filter.test.ts:48-51` — Creates filter and queries single element membership.
- **bloom** — `bloom-filter.test.ts:53-57` — Creates filter and queries multiple elements.
- **bloom** — `bloom-filter.test.ts:59-64` — Creates filter and tests negative queries.
- **it** — `bloom-filter.test.ts:67-77` — Test group for false positive rate measurement.
- **bloom** — `bloom-filter.test.ts:68-76` — Creates filter with 1000 elements and measures false positive frequency.
- **it** — `bloom-filter.test.ts:79-137` — Test group for filter size comparison and false positive scaling.
- **bloom** — `bloom-filter.test.ts:80-98` — Creates filter and counts false positives.
- **_** — `bloom-filter.test.ts:82-82` — Variable holding collection of test items.
- **smallBloom** — `bloom-filter.test.ts:100-122` — Creates a smaller Bloom filter for comparative analysis.
- **_** — `bloom-filter.test.ts:104-104` — Variable storing generated test items.
- **bloom** — `bloom-filter.test.ts:124-136` — Creates filter and calculates false positive rates across size variations.
- **_** — `bloom-filter.test.ts:126-126` — Variable holding test data for filter comparison.
- **it** — `bloom-filter.test.ts:139-158` — Test group for collision and overlap behavior.
- **bloom** — `bloom-filter.test.ts:140-144` — Creates two filters with overlapping elements.
- **bloom** — `bloom-filter.test.ts:146-151` — Creates two filters with unique elements.
- **bloom** — `bloom-filter.test.ts:153-157` — Creates filter and verifies no false overlaps.
- **it** — `bloom-filter.test.ts:160-199` — Test group for string input handling and similarity detection.
- **bloom** — `bloom-filter.test.ts:161-165` — Creates filter with string elements.
- **bloom** — `bloom-filter.test.ts:167-176` — Creates filter with varied string inputs.
- **bloom** — `bloom-filter.test.ts:178-183` — Creates filter and adds long string values.
- **bloom** — `bloom-filter.test.ts:185-198` — Creates filter and detects similar string matches.

## Optimization Benchmarks

- **deduplicateOld** — `optimizations-benchmark.ts:16-25` — Legacy deduplication function using nested loop comparison.
- **<anonymous>** — `optimizations-benchmark.ts:16-16` — Anonymous wrapper for old deduplication.
- **e** — `optimizations-benchmark.ts:20-20` — Variable referencing entity in loop.
- **deduplicateNew** — `optimizations-benchmark.ts:27-44` — Optimized deduplication using Set for O(1) lookup.
- **<anonymous>** — `optimizations-benchmark.ts:27-27` — Anonymous wrapper for new deduplication.
- **matchTopicOld** — `optimizations-benchmark.ts:50-57` — Legacy topic matching using regex object creation per call.
- **<anonymous>** — `optimizations-benchmark.ts:50-50` — Anonymous wrapper for old topic matching.
- **matchTopicNew** — `optimizations-benchmark.ts:60-70` — Optimized topic matching with regex caching.
- **<anonymous>** — `optimizations-benchmark.ts:60-60` — Anonymous wrapper for new topic matching.
- **getHistoryOld** — `optimizations-benchmark.ts:81-83` — Legacy history retrieval using linear search.
- **<anonymous>** — `optimizations-benchmark.ts:81-81` — Anonymous wrapper for old history retrieval.
- **s** — `optimizations-benchmark.ts:82-82` — Variable referencing subscription in search.
- **getHistoryNew** — `optimizations-benchmark.ts:85-99` — Optimized history retrieval using binary search.
- **<anonymous>** — `optimizations-benchmark.ts:85-85` — Anonymous wrapper for new history retrieval.
- **unsubscribeOld** — `optimizations-benchmark.ts:110-119` — Legacy unsubscribe using linear array search and splice.
- **<anonymous>** — `optimizations-benchmark.ts:110-110` — Anonymous wrapper for old unsubscribe.
- **s** — `optimizations-benchmark.ts:112-112` — Variable referencing subscription during removal.
- **unsubscribeNew** — `optimizations-benchmark.ts:121-139` — Optimized unsubscribe using Map for O(1) removal.
- **<anonymous>** — `optimizations-benchmark.ts:121-121` — Anonymous wrapper for new unsubscribe.
- **s** — `optimizations-benchmark.ts:131-131` — Variable referencing subscription in Map lookup.
- **benchmark** — `optimizations-benchmark.ts:145-159` — Executes timing comparison between two implementations over multiple iterations.
- **<anonymous>** — `optimizations-benchmark.ts:145-145` — Anonymous wrapper for benchmark execution.
- **formatSpeedup** — `optimizations-benchmark.ts:161-168` — Formats performance improvement ratio as percentage string.
- **<anonymous>** — `optimizations-benchmark.ts:161-161` — Anonymous wrapper for speedup formatting.
- **_** — `optimizations-benchmark.ts:187-190` — Variable storing baseline benchmark results.
- **deduplicateOld** — `optimizations-benchmark.ts:203-203` — Reference to legacy deduplication in benchmark execution.
- **deduplicateNew** — `optimizations-benchmark.ts:204-204` — Reference to optimized deduplication in benchmark execution.
- **_** — `optimizations-benchmark.ts:219-219` — Variable holding topic matching benchmark results.
- **topic** — `optimizations-benchmark.ts:227-233` — Generates topic string for matching benchmark test data.
- **topic** — `optimizations-benchmark.ts:239-245` — Generates topic string for matching benchmark test data.
- **_** — `optimizations-benchmark.ts:265-268` — Variable storing history retrieval benchmark results.
- **getHistoryOld** — `optimizations-benchmark.ts:274-274` — Reference to legacy history retrieval in benchmark execution.
- **getHistoryNew** — `optimizations-benchmark.ts:275-275` — Reference to optimized history retrieval in benchmark execution.
- **k** — `optimizations-benchmark.ts:316-316` — Variable used in unsubscribe benchmark iteration.
- **k** — `optimizations-benchmark.ts:317-317` — Variable used in unsubscribe benchmark iteration.
- **id** — `optimizations-benchmark.ts:322-326` — Generates sequential subscription identifier.
- **id** — `optimizations-benchmark.ts:332-336` — Generates sequential subscription identifier.