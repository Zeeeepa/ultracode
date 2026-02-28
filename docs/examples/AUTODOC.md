# Examples Module

The module contains usage examples for key UltraCode features including code analysis, semantic merging, code modification, and indexing.

## Files

| File | Description |
|------|---------|
| `analysis-example.ts` | Empty stub file for analysis examples. |
| `chaos-analysis-example.ts` | Usage examples for the state chaos analyzer to detect issues in state management. Demonstrates state variable analysis, chaos score metrics, mutation point detection, and refactoring impact assessment. |
| `code-modification-example.ts` | Code modification examples: version management through state snapshots, entity-level code replacement, file operations (copy, rename, split, synthesize). |
| `cuda-example.ts` | Examples of GPU-accelerated vector operations via CUDA: cosine similarity computation, vector normalization, Euclidean distance, and semantic search on GPU with 100-200x acceleration. |
| `demo-merge-simple.mjs` | Demonstration of semantic merge analysis between two branches: fast path matching by content hashes, conflict detection, and merge strategy recommendations. |
| `demo-semantic-merge.ts` | Full-featured semantic merge demonstration using embeddings, intent classification, conflict detection and resolution with AI. |
| `layered-indexing-example.ts` | Examples of multi-layered indexing integration for branch management: branch switching, caching, semantic search with delta changes, and lifecycle management. |
| `parser-agent-demo.ts` | Parser agent demonstration based on tree-sitter: single file processing, batch processing, cache efficiency, and parsing performance analysis. |

## Exports

The module has no public exports. Each file is an independent example and can be run separately.

## Usage

Examples are executed with commands like:

```bash
# Run an example via bun
bun examples/cuda-example.ts

# Or via Node.js (after compilation)
node dist/examples/cuda-example.js

# Run semantic merge demonstration
bun examples/demo-semantic-merge.ts
```

Each example contains a complete usage scenario with output of analysis results, performance metrics, and recommendations.
