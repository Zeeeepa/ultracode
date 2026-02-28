# Benchmarks

Performance benchmarks for UltraCode.

## Available Benchmarks

### `benchmark-large-project.js`
Tests performance on large codebases:
- Multi-file parsing
- Relationship extraction
- Graph construction
- Memory usage

### `benchmark-simd.js`
SIMD (Single Instruction, Multiple Data) optimizations:
- Vector operations for embeddings
- Parallel processing performance
- Hardware acceleration tests

### `benchmark-workers.js`
Worker thread performance:
- Concurrent parsing
- Thread pool efficiency
- Multi-core utilization

## Running Benchmarks

```bash
# Run all benchmarks
npm run bench

# Run specific benchmark
node benchmarks/benchmark-large-project.js
node benchmarks/benchmark-simd.js
node benchmarks/benchmark-workers.js
```

## Interpreting Results

Benchmarks report:
- **Throughput**: Operations per second
- **Latency**: Time per operation (ms)
- **Memory**: Peak memory usage (MB)
- **Speedup**: Compared to baseline/single-threaded

## Adding New Benchmarks

1. Create `benchmark-<name>.js` in this directory
2. Follow existing structure:
   - Setup phase
   - Timed execution
   - Results reporting
3. Update this README
