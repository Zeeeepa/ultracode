# benchmarks

## Overview

The `benchmarks` module provides performance testing utilities for evaluating critical subsystems: worker-pool throughput, SIMD vector operations, large-project indexing scalability, and LLM/embedding inference latency. Each benchmark isolates a specific concern to identify bottlenecks and validate optimization gains. These are used for profiling during development and comparing performance across different configurations or environments.

## Flow

```
Test Setup (configuration, env vars)
        ↓
Spawned Process/Function Execution
        ↓
Performance Measurement (timing, throughput, latency)
        ↓
Results Reporting & Comparison
```

## Entity Listing

### Project Indexing Benchmarks

- **benchmark-large-project.js** — Tests worker-pool indexing performance on a full codebase (200+ files) to measure real-world speedup with parallel workers versus single-threaded execution.
- **benchmark-workers.js** — Compares worker process spawning and multithreading overhead versus baseline to quantify worker pool benefits.
- **benchmark-simd.js** — Evaluates SIMD vector operation performance improvements to validate native acceleration gains.

### LLM & Embedding Inference Benchmarks

- **embedding-benchmark.ts** — Measures embedding generation throughput and latency for vector inference pipelines.
- **llm-benchmark.ts** — Evaluates LLM token generation latency and throughput under various workload conditions.

## Dependencies

- **Node.js child_process module** — Spawns isolated indexer processes with environment-variable configuration for testing different code paths.
- **Timing utilities** — Uses `Date.now()` or equivalent for measuring wall-clock execution duration and throughput calculations.
- **Project distribution artifacts** — References compiled `dist/index.js` for running benchmark tests against production build output.
- **Environment configuration flags** — Respects `PARSER_USE_WORKERS` and similar env vars to toggle optimization features during testing.
- **File system access** — Reads project directories and test fixtures to establish realistic indexing workloads.