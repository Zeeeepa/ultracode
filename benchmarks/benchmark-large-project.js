#!/usr/bin/env node
/**
 * Benchmark Script: Large Project Test
 *
 * Tests worker pool performance on a larger directory to see real speedup.
 * Uses the entire codebase (200+ files) instead of just src (40 files).
 */

import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const distPath = join(projectRoot, "dist", "index.js");

// Test entire project root (should have 200+ files)
const testDirectory = projectRoot;

/**
 * Run indexing with specific worker configuration
 */
async function runIndexing(useWorkers, label) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label}`);
  console.log(`${"=".repeat(60)}\n`);

  const startTime = Date.now();

  const env = {
    ...process.env,
    PARSER_USE_WORKERS: useWorkers ? "1" : "0",
  };

  const requestPayload = JSON.stringify({
    jsonrpc: "2.0",
    id: `benchmark-${Date.now()}`,
    method: "tools/call",
    params: {
      name: "index",
      arguments: {
        directory: testDirectory,
        reset: true,
        fullScan: false,
      },
    },
  });

  return new Promise((resolve, reject) => {
    const child = spawn("node", [distPath, testDirectory, requestPayload], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const elapsed = Date.now() - startTime;

      // Extract stats from logs (updated for language worker pools)
      const languagePoolsMatch = stdout.match(/Language worker pools initialized: (\d+) languages, (\d+) total workers/);
      const languagePoolsEnabledMatch = stdout.match(/Language worker pools enabled \(lazy initialization mode\)/);
      const thresholdMatch = stdout.match(/Using single-threaded parser \((\d+) files < (\d+) threshold\)/);
      const languageDistMatch = stdout.match(/Language distribution: ([^\n]+)/);
      const filesProcessedMatch = stdout.match(/filesProcessed["\s:]+(\d+)/);
      const entitiesMatch = stdout.match(/entitiesExtracted["\s:]+(\d+)/);

      console.log(`\n📊 Results:`);
      console.log(`   Time: ${elapsed}ms`);

      if (languagePoolsMatch) {
        console.log(`   Languages: ${languagePoolsMatch[1]} language pools`);
        console.log(`   Workers: ${languagePoolsMatch[2]} total workers`);
      } else if (languagePoolsEnabledMatch) {
        console.log(`   Workers: Lazy mode enabled (pools will be created on-demand)`);
      } else {
        console.log(`   Workers: 0 (disabled or failed)`);
      }

      if (thresholdMatch) {
        console.log(`   Threshold: ${thresholdMatch[1]} files < ${thresholdMatch[2]} → single-threaded`);
      }

      console.log(`   Files: ${filesProcessedMatch ? filesProcessedMatch[1] : "N/A"}`);
      console.log(`   Entities: ${entitiesMatch ? entitiesMatch[1] : "N/A"}`);

      if (languageDistMatch) {
        console.log(`   Distribution: ${languageDistMatch[1]}`);
      }

      if (code !== 0) {
        console.error(`\n⚠️  Process exited with code ${code}`);
        if (stderr) {
          console.error(`Stderr: ${stderr.slice(0, 500)}`);
        }
      }

      resolve({
        elapsed,
        filesProcessed: filesProcessedMatch ? parseInt(filesProcessedMatch[1]) : 0,
        success: code === 0,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });

    // Timeout after 5 minutes (larger project)
    setTimeout(() => {
      child.kill();
      reject(new Error("Benchmark timeout"));
    }, 300000);
  });
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log("🚀 Large Project Worker Pool Benchmark");
  console.log("======================================\n");
  console.log(`Test Directory: ${testDirectory}`);

  try {
    // Run benchmarks
    const singleThreaded = await runIndexing(false, "📍 SINGLE-THREADED BASELINE");
    const multiWorker = await runIndexing(true, "⚡ MULTI-WORKER (Language Pools)");

    // Calculate speedup
    console.log(`\n${"=".repeat(60)}`);
    console.log("📈 PERFORMANCE COMPARISON");
    console.log(`${"=".repeat(60)}\n`);

    if (singleThreaded.success && multiWorker.success) {
      const speedup = singleThreaded.elapsed / multiWorker.elapsed;
      const improvement = ((singleThreaded.elapsed - multiWorker.elapsed) / singleThreaded.elapsed * 100).toFixed(1);

      console.log(`Single-threaded: ${singleThreaded.elapsed}ms`);
      console.log(`Multi-worker:    ${multiWorker.elapsed}ms`);
      console.log(`Files processed: ${singleThreaded.filesProcessed}`);
      console.log(`\n🎯 Speedup: ${speedup.toFixed(2)}x`);
      console.log(`📊 Improvement: ${improvement}%`);

      if (speedup >= 2.0) {
        console.log("\n✅ Excellent performance gain!");
      } else if (speedup >= 1.5) {
        console.log("\n✅ Good performance gain!");
      } else if (speedup >= 1.2) {
        console.log("\n✅ Moderate performance gain");
      } else if (speedup >= 1.0) {
        console.log("\n⚠️  Minimal performance gain");
      } else {
        console.log("\n⚠️  Performance regression - single-threaded is faster");
      }
    } else {
      console.log("⚠️  Benchmark incomplete - one or more runs failed");
    }

    console.log(`\n${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    process.exit(1);
  }
}

main();
