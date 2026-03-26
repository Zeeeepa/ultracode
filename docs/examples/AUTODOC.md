# Examples Module

## Overview

The examples module provides runnable demonstrations of UltraCode's core capabilities: state analysis, code modification, GPU-accelerated operations, semantic merging, multi-branch indexing, and AST-driven parsing. Each example is a standalone script designed to showcase practical workflows and integration patterns, serving both as learning resources and production templates for common developer tasks.

## Core Examples

### State Analysis

**docs/examples/chaos-analysis-example.ts** — Demonstrates chaos score computation for detecting hidden state management issues, identifying mutation points, and generating AI-driven refactoring recommendations for complex state patterns.

### Code Modification

**docs/examples/code-modification-example.ts** — Shows snapshot-based version management for safe mutations, entity-level code replacement (functions, classes), and file operations (copy, rename, split, synthesize) with automatic rollback capability.

### GPU-Accelerated Operations

**docs/examples/cuda-example.ts** — Demonstrates GPU vector operations on CUDA hardware: cosine similarity, normalization, Euclidean distance, and semantic search with 100–200× performance gains over CPU implementations.

### Semantic Merging

**docs/examples/demo-merge-simple.mjs** — Simplified semantic merge workflow: hash-based content matching, conflict detection, and deterministic merge strategy selection without AI intervention.

**docs/examples/demo-semantic-merge.ts** — Full-featured semantic merge combining embedding-based intent classification, intelligent conflict resolution, and AI-powered strategies for complex branch scenarios.

### Multi-Branch Indexing

**docs/examples/layered-indexing-example.ts** — Shows branch lifecycle management, cross-branch semantic search, delta computation, and caching optimization for efficient multi-branch analysis.

### Parser Integration

**docs/examples/parser-agent-demo.ts** — Demonstrates tree-sitter AST parsing: single-file and batch processing, syntax tree analysis, cache efficiency metrics, and performance profiling for large codebases.

### Placeholder Examples

**docs/examples/analysis-example.ts** — Expansion point for general code analysis demonstrations beyond state-specific use cases.

## Flow

```
Developer Script
      ↓
  [Choose Example]
      ↓
    ┌─────────────────────────────────────┐
    │  Initialize Tool/Analyzer           │
    │  (Chaos/Modifier/GPU/Merge/Parser) │
    └─────────────────────────────────────┘
      ↓
  [Load Input Data]
      ↓
    ┌─────────────────────────────────────┐
    │  Process/Analyze/Compute            │
    │  (with snapshots/caching as needed) │
    └─────────────────────────────────────┘
      ↓
  [Output Results + Metrics]
```

## Key Patterns

- **Snapshot-Rollback Pattern**: Code modification examples demonstrate safe mutation via version snapshots, enabling risk-free refactoring and instant rollback.
- **Pipeline Composition**: Semantic merge and parser examples chain analysis stages (classification → detection → resolution).
- **Performance Profiling**: All examples include timing and resource metrics for production tuning guidance.
- **AI-Driven Workflows**: Chaos and semantic merge examples leverage embeddings and intent classification for intelligent recommendations.

## Dependencies and Integration

Examples depend on:
- **Analysis module** (`src/analysis/`): ChaosAnalyzer for state mutation detection.
- **Modifier module** (`src/tools/`): Code modification and file operation tooling.
- **GPU module** (`src/gpu/`): CUDA-accelerated vector operations.
- **Merge engine** (`src/merge/`): Semantic and hash-based conflict resolution.
- **Parser framework** (`src/parsers/`): Tree-sitter AST processing and caching.
- **Storage layer** (`src/storage/`): Graph and index persistence for branch and semantic data.

Examples are designed to run independently on a real codebase or test fixtures, making them suitable for CI/CD validation, feature documentation, and developer onboarding.

## Execution

All examples execute via:

```bash
bun examples/<filename>.ts
```

Examples automatically output analysis results, performance metrics, and actionable recommendations to the console.