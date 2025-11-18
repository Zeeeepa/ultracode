#!/usr/bin/env node
/**
 * Benchmark SIMD Vector Operations
 *
 * Compares performance of:
 * - Pure JS cosine similarity
 * - BLAS-accelerated cosine similarity
 * - xxHash vs builtin hash
 *
 * Usage:
 *   node scripts/benchmark-simd.js
 *   USE_BLAS=true node scripts/benchmark-simd.js
 *   USE_BLAS=false node scripts/benchmark-simd.js
 */

import { performance } from "node:perf_hooks";

// =============================================================================
// CONFIGURATION
// =============================================================================

const VECTOR_DIMENSION = 384; // Standard embedding dimension
const VECTOR_COUNT = 10000; // Typical search database size
const ITERATIONS = 3; // Run benchmark multiple times for avg

// =============================================================================
// TEST DATA GENERATION
// =============================================================================

function generateRandomVector(dim) {
	const vec = new Float32Array(dim);
	for (let i = 0; i < dim; i++) {
		vec[i] = Math.random() - 0.5; // Range: [-0.5, 0.5]
	}
	return vec;
}

function generateTestData(count, dim) {
	console.log(`\nGenerating ${count} random ${dim}-dimensional vectors...`);
	const vectors = [];
	for (let i = 0; i < count; i++) {
		vectors.push(generateRandomVector(dim));
	}
	return vectors;
}

// =============================================================================
// PURE JS IMPLEMENTATIONS (BASELINE)
// =============================================================================

function cosineSimilarityJS(a, b) {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		const ai = a[i];
		const bi = b[i];
		dotProduct += ai * bi;
		normA += ai * ai;
		normB += bi * bi;
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dotProduct / denom;
}

function cosineSimilarityJSOptimized(a, b) {
	const len = a.length;
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	// Loop unrolling: process 4 elements at a time
	const len4 = len - (len % 4);

	for (let i = 0; i < len4; i += 4) {
		const a0 = a[i];
		const a1 = a[i + 1];
		const a2 = a[i + 2];
		const a3 = a[i + 3];

		const b0 = b[i];
		const b1 = b[i + 1];
		const b2 = b[i + 2];
		const b3 = b[i + 3];

		dotProduct += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
		normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
		normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
	}

	// Handle remaining elements
	for (let i = len4; i < len; i++) {
		const ai = a[i];
		const bi = b[i];
		dotProduct += ai * bi;
		normA += ai * ai;
		normB += bi * bi;
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dotProduct / denom;
}

// =============================================================================
// BENCHMARK RUNNER
// =============================================================================

function benchmarkCosineSimilarity(name, cosineFn, queryVector, vectors) {
	const times = [];

	for (let iter = 0; iter < ITERATIONS; iter++) {
		const start = performance.now();

		for (const vec of vectors) {
			cosineFn(queryVector, vec);
		}

		const elapsed = performance.now() - start;
		times.push(elapsed);
	}

	const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
	const throughput = (vectors.length / (avgTime / 1000)).toFixed(0);

	return {
		name,
		avgTime: avgTime.toFixed(2),
		perVector: (avgTime / vectors.length).toFixed(4),
		throughput,
		times,
	};
}

function printResults(results) {
	console.log("\n┌─────────────────────────────────────────────────────────────────┐");
	console.log("│                  SIMD Benchmark Results                         │");
	console.log("├─────────────────────────────────────────────────────────────────┤");

	// Sort by avgTime
	results.sort((a, b) => parseFloat(a.avgTime) - parseFloat(b.avgTime));

	const baseline = results.find((r) => r.name.includes("Pure JS"));
	const baselineTime = baseline ? parseFloat(baseline.avgTime) : 1;

	for (const result of results) {
		const speedup = (baselineTime / parseFloat(result.avgTime)).toFixed(2);
		const speedupStr = baseline && result !== baseline ? ` (${speedup}x faster)` : "";

		console.log(`│ ${result.name.padEnd(35)} │`);
		console.log(`│   Total:      ${result.avgTime.padStart(10)} ms${speedupStr.padStart(20)} │`);
		console.log(`│   Per vector: ${result.perVector.padStart(10)} ms                   │`);
		console.log(`│   Throughput: ${result.throughput.padStart(10)} vectors/sec          │`);
		console.log("├─────────────────────────────────────────────────────────────────┤");
	}

	console.log("└─────────────────────────────────────────────────────────────────┘\n");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
	console.log("========================================");
	console.log("  SIMD Vector Operations Benchmark");
	console.log("========================================");

	console.log(`\nConfiguration:`);
	console.log(`  Vector dimension: ${VECTOR_DIMENSION}`);
	console.log(`  Vector count:     ${VECTOR_COUNT}`);
	console.log(`  Iterations:       ${ITERATIONS}`);
	console.log(`  USE_BLAS:         ${process.env.USE_BLAS !== "false" ? "true" : "false"}`);

	// Generate test data
	const vectors = generateTestData(VECTOR_COUNT, VECTOR_DIMENSION);
	const queryVector = generateRandomVector(VECTOR_DIMENSION);

	console.log("\nRunning benchmarks...\n");

	const results = [];

	// Baseline: Pure JS (simple)
	console.log("[1/4] Benchmarking: Pure JS (baseline)...");
	results.push(benchmarkCosineSimilarity("Pure JS (baseline)", cosineSimilarityJS, queryVector, vectors));

	// Optimized JS (loop unrolling)
	console.log("[2/4] Benchmarking: Pure JS (optimized)...");
	results.push(
		benchmarkCosineSimilarity("Pure JS (loop unrolling)", cosineSimilarityJSOptimized, queryVector, vectors),
	);

	// BLAS-accelerated (if available)
	try {
		console.log("[3/4] Loading optimized module...");
		const simdModule = await import("../dist/utils/simd-vector-ops.js");
		const cosineSimilarityOptimized = simdModule.cosineSimilarity;

		// Warm up JIT
		for (let i = 0; i < 100; i++) {
			cosineSimilarityOptimized(queryVector, vectors[0]);
		}

		console.log("[4/4] Benchmarking: Loop Unrolling...");
		const status = simdModule.getOptimizationStatus();

		results.push(benchmarkCosineSimilarity("Loop Unrolling", cosineSimilarityOptimized, queryVector, vectors));

		console.log(`\nOptimization Status: ${JSON.stringify(status, null, 2)}`);
	} catch (error) {
		console.error("\n[ERROR] Failed to load optimized module:", error);
		console.log("Make sure to run 'npm run build' first!");
		process.exit(1);
	}

	// Print results
	printResults(results);

	// Summary
	const baseline = results.find((r) => r.name.includes("baseline"));
	const optimized = results.find((r) => r.name.includes("Loop Unrolling"));

	if (baseline && optimized) {
		const speedup = (parseFloat(baseline.avgTime) / parseFloat(optimized.avgTime)).toFixed(2);
		console.log(`🚀 Loop Unrolling Speedup: ${speedup}x faster than baseline JS\n`);

		// Estimate real-world impact
		const searches = 100;
		const baselineTotal = (parseFloat(baseline.avgTime) * searches) / 1000;
		const optimizedTotal = (parseFloat(optimized.avgTime) * searches) / 1000;
		const savings = baselineTotal - optimizedTotal;

		console.log("Real-world impact (100 searches):");
		console.log(`  Baseline JS:      ${baselineTotal.toFixed(1)}s`);
		console.log(`  Loop Unrolling:   ${optimizedTotal.toFixed(1)}s`);
		console.log(`  Time saved:       ${savings.toFixed(1)}s (${((savings / baselineTotal) * 100).toFixed(1)}%)\n`);
	}
}

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
