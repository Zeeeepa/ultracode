/**
 * Benchmark: SIMD (loop unrolling) vs Vanilla JS vector operations
 */

// Vanilla JS implementations for comparison
function vanillaDotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function vanillaCosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Loop unrolling implementations (from simd-vector-ops.ts)
function simdDotProduct(a: Float32Array, b: Float32Array): number {
  const len = a.length;
  let sum = 0;
  const len4 = len - (len % 4);

  for (let i = 0; i < len4; i += 4) {
    sum += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!;
  }
  for (let i = len4; i < len; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function simdCosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = a.length;
  let dot = 0, normA = 0, normB = 0;
  const len4 = len - (len % 4);

  for (let i = 0; i < len4; i += 4) {
    dot += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!;
    normA += a[i]! * a[i]! + a[i + 1]! * a[i + 1]! + a[i + 2]! * a[i + 2]! + a[i + 3]! * a[i + 3]!;
    normB += b[i]! * b[i]! + b[i + 1]! * b[i + 1]! + b[i + 2]! * b[i + 2]! + b[i + 3]! * b[i + 3]!;
  }
  for (let i = len4; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Loop unrolling x8
function simd8DotProduct(a: Float32Array, b: Float32Array): number {
  const len = a.length;
  let sum = 0;
  const len8 = len - (len % 8);

  for (let i = 0; i < len8; i += 8) {
    sum += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!
         + a[i + 4]! * b[i + 4]! + a[i + 5]! * b[i + 5]! + a[i + 6]! * b[i + 6]! + a[i + 7]! * b[i + 7]!;
  }
  for (let i = len8; i < len; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

function simd8CosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = a.length;
  let dot = 0, normA = 0, normB = 0;
  const len8 = len - (len % 8);

  for (let i = 0; i < len8; i += 8) {
    dot += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!
         + a[i + 4]! * b[i + 4]! + a[i + 5]! * b[i + 5]! + a[i + 6]! * b[i + 6]! + a[i + 7]! * b[i + 7]!;
    normA += a[i]! * a[i]! + a[i + 1]! * a[i + 1]! + a[i + 2]! * a[i + 2]! + a[i + 3]! * a[i + 3]!
           + a[i + 4]! * a[i + 4]! + a[i + 5]! * a[i + 5]! + a[i + 6]! * a[i + 6]! + a[i + 7]! * a[i + 7]!;
    normB += b[i]! * b[i]! + b[i + 1]! * b[i + 1]! + b[i + 2]! * b[i + 2]! + b[i + 3]! * b[i + 3]!
           + b[i + 4]! * b[i + 4]! + b[i + 5]! * b[i + 5]! + b[i + 6]! * b[i + 6]! + b[i + 7]! * b[i + 7]!;
  }
  for (let i = len8; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Benchmark runner
function benchmark(name: string, fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < 1000; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  return elapsed;
}

// Generate random vectors
function randomVector(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.random() * 2 - 1;
  }
  return v;
}

async function main() {
  const DIMS = [384, 768, 1024]; // Common embedding dimensions
  const ITERATIONS = 100000;
  const PAIRS = 10;

  console.log("=== Vector Operations Benchmark ===\n");
  console.log(`Iterations: ${ITERATIONS.toLocaleString()}`);
  console.log(`Vector pairs: ${PAIRS}\n`);

  for (const dim of DIMS) {
    console.log(`\n--- Dimension: ${dim} ---`);

    // Generate test vectors
    const vectors: { a: Float32Array; b: Float32Array }[] = [];
    for (let i = 0; i < PAIRS; i++) {
      vectors.push({ a: randomVector(dim), b: randomVector(dim) });
    }

    // Dot Product benchmarks
    console.log("\nDot Product:");

    const vanillaDotTime = benchmark("Vanilla", () => {
      for (const { a, b } of vectors) vanillaDotProduct(a, b);
    }, ITERATIONS);

    const simdDotTime = benchmark("SIMD x4", () => {
      for (const { a, b } of vectors) simdDotProduct(a, b);
    }, ITERATIONS);

    const simd8DotTime = benchmark("SIMD x8", () => {
      for (const { a, b } of vectors) simd8DotProduct(a, b);
    }, ITERATIONS);

    console.log(`  Vanilla:  ${vanillaDotTime.toFixed(1)}ms`);
    console.log(`  SIMD x4:  ${simdDotTime.toFixed(1)}ms (${(vanillaDotTime / simdDotTime).toFixed(2)}x faster)`);
    console.log(`  SIMD x8:  ${simd8DotTime.toFixed(1)}ms (${(vanillaDotTime / simd8DotTime).toFixed(2)}x faster)`);

    // Cosine Similarity benchmarks
    console.log("\nCosine Similarity:");

    const vanillaCosTime = benchmark("Vanilla", () => {
      for (const { a, b } of vectors) vanillaCosineSimilarity(a, b);
    }, ITERATIONS);

    const simdCosTime = benchmark("SIMD x4", () => {
      for (const { a, b } of vectors) simdCosineSimilarity(a, b);
    }, ITERATIONS);

    const simd8CosTime = benchmark("SIMD x8", () => {
      for (const { a, b } of vectors) simd8CosineSimilarity(a, b);
    }, ITERATIONS);

    console.log(`  Vanilla:  ${vanillaCosTime.toFixed(1)}ms`);
    console.log(`  SIMD x4:  ${simdCosTime.toFixed(1)}ms (${(vanillaCosTime / simdCosTime).toFixed(2)}x faster)`);
    console.log(`  SIMD x8:  ${simd8CosTime.toFixed(1)}ms (${(vanillaCosTime / simd8CosTime).toFixed(2)}x faster)`);

    // Verify correctness
    const { a, b } = vectors[0]!;
    const v1 = vanillaCosineSimilarity(a, b);
    const v2 = simdCosineSimilarity(a, b);
    const v3 = simd8CosineSimilarity(a, b);
    console.log(`\n  Correctness check: vanilla=${v1.toFixed(6)}, simd4=${v2.toFixed(6)}, simd8=${v3.toFixed(6)}`);
  }

  // Throughput summary
  console.log("\n\n=== Throughput (ops/sec) ===");
  const dim = 384;
  const vectors = Array.from({ length: PAIRS }, () => ({ a: randomVector(dim), b: randomVector(dim) }));

  const t1 = benchmark("", () => { for (const { a, b } of vectors) vanillaCosineSimilarity(a, b); }, ITERATIONS);
  const t2 = benchmark("", () => { for (const { a, b } of vectors) simdCosineSimilarity(a, b); }, ITERATIONS);
  const t3 = benchmark("", () => { for (const { a, b } of vectors) simd8CosineSimilarity(a, b); }, ITERATIONS);

  const ops1 = (ITERATIONS * PAIRS / t1) * 1000;
  const ops2 = (ITERATIONS * PAIRS / t2) * 1000;
  const ops3 = (ITERATIONS * PAIRS / t3) * 1000;

  console.log(`Vanilla:  ${(ops1 / 1e6).toFixed(2)}M ops/sec`);
  console.log(`SIMD x4:  ${(ops2 / 1e6).toFixed(2)}M ops/sec`);
  console.log(`SIMD x8:  ${(ops3 / 1e6).toFixed(2)}M ops/sec`);
}

main().catch(console.error);
