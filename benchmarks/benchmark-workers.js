#!/usr/bin/env node
/**
 * Benchmark Script: Single-threaded vs Multi-worker Parser Performance
 *
 * Compares parsing performance with and without worker threads.
 */

import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const distPath = join(projectRoot, "dist", "index.js");

// Test directory - use src folder for larger dataset
const testDirectory = join(projectRoot, "src");

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
      const oldWorkerMatch = stdout.match(/Worker pool initialized with (\d+) workers/); // Fallback for old format
      const filesProcessedMatch = stdout.match(/filesProcessed["\s:]+(\d+)/);
      const entitiesMatch = stdout.match(/entitiesExtracted["\s:]+(\d+)/);
      const languageDistMatch = stdout.match(/Language distribution: ([^\n]+)/);
      const languageStatsMatch = stdout.match(/Language pool stats:([^]*?)(?=\n\[|$)/); // Multiline match

      console.log(`\n📊 Results:`);
      console.log(`   Time: ${elapsed}ms`);
      if (languagePoolsMatch) {
        console.log(`   Languages: ${languagePoolsMatch[1]} language pools`);
        console.log(`   Workers: ${languagePoolsMatch[2]} total workers`);
      } else if (oldWorkerMatch) {
        console.log(`   Workers: ${oldWorkerMatch[1]}`);
      } else {
        console.log(`   Workers: 0 (single-threaded or pool init failed)`);
      }
      console.log(`   Files: ${filesProcessedMatch ? filesProcessedMatch[1] : "N/A"}`);
      console.log(`   Entities: ${entitiesMatch ? entitiesMatch[1] : "N/A"}`);

      if (languageDistMatch) {
        console.log(`   Distribution: ${languageDistMatch[1]}`);
      }

      if (languageStatsMatch) {
        console.log(`   Language Stats:${languageStatsMatch[1]}`);
      }

      if (code !== 0) {
        console.error(`\n⚠️  Process exited with code ${code}`);
        if (stderr) {
          console.error(`Stderr: ${stderr.slice(0, 500)}`);
        }
      }

      resolve({
        elapsed,
        workers: languagePoolsMatch ? parseInt(languagePoolsMatch[2]) : (oldWorkerMatch ? parseInt(oldWorkerMatch[1]) : 0),
        filesProcessed: filesProcessedMatch ? parseInt(filesProcessedMatch[1]) : 0,
        entities: entitiesMatch ? parseInt(entitiesMatch[1]) : 0,
        success: code === 0,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill();
      reject(new Error("Benchmark timeout"));
    }, 120000);
  });
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log("🚀 Parser Worker Pool Benchmark");
  console.log("================================\n");
  console.log(`Test Directory: ${testDirectory}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`CPUs: ${cpus().length}`);

  try {
    // Warmup run (ignored)
    console.log("\n🔥 Warmup run...");
    await runIndexing(false, "Warmup (ignored)");

    // Run benchmarks
    const singleThreaded = await runIndexing(false, "📍 SINGLE-THREADED BASELINE");
    const multiWorker = await runIndexing(true, "⚡ MULTI-WORKER (4 workers)");

    // Calculate speedup
    console.log(`\n${"=".repeat(60)}`);
    console.log("📈 PERFORMANCE COMPARISON");
    console.log(`${"=".repeat(60)}\n`);

    if (singleThreaded.success && multiWorker.success) {
      const speedup = singleThreaded.elapsed / multiWorker.elapsed;
      const improvement = ((singleThreaded.elapsed - multiWorker.elapsed) / singleThreaded.elapsed * 100).toFixed(1);

      console.log(`Single-threaded: ${singleThreaded.elapsed}ms`);
      console.log(`Multi-worker:    ${multiWorker.elapsed}ms`);
      console.log(`\n🎯 Speedup: ${speedup.toFixed(2)}x`);
      console.log(`📊 Improvement: ${improvement}% faster`);

      if (speedup >= 2.0) {
        console.log("\n✅ Excellent performance gain!");
      } else if (speedup >= 1.5) {
        console.log("\n✅ Good performance gain!");
      } else if (speedup >= 1.2) {
        console.log("\n⚠️  Moderate performance gain");
      } else {
        console.log("\n⚠️  Limited performance gain - investigate overhead");
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
