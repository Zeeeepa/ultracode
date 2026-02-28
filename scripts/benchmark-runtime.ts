#!/usr/bin/env npx tsx
/**
 * Runtime Benchmark - Compare Node.js vs Bun performance
 *
 * Tests:
 * 1. File read operations (readText, readJSON)
 * 2. File write operations (writeFile)
 * 3. Directory operations (readdir, glob)
 * 4. Shell command execution
 * 5. Codebase metrics (countSourceFiles, getCodebaseMetrics)
 * 6. Startup time (process spawn)
 * 7. SQLite operations (bun:sqlite vs better-sqlite3)
 * 8. HTTP fetch (local server)
 * 9. Crypto/hashing
 *
 * Usage:
 *   node --import tsx scripts/benchmark-runtime.ts
 *   bun scripts/benchmark-runtime.ts
 */

import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtime, features, logRuntimeInfo } from "../src/utils/runtime.js";
import {
  readText,
  readJSON,
  writeFile,
  readdir,
  mkdir,
  rm,
  stat,
  fileExists,
} from "../src/utils/file-ops.js";
import { glob, findSourceFiles } from "../src/utils/glob.js";
import { exec, countSourceFiles, getCodebaseMetrics } from "../src/utils/shell.js";

// =============================================================================
// BENCHMARK UTILITIES
// =============================================================================

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < Math.min(5, iterations); i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSec = 1000 / avgMs;

  return { name, iterations, totalMs, avgMs, minMs, maxMs, opsPerSec };
}

function formatResult(result: BenchmarkResult): string {
  return [
    `  ${result.name}:`,
    `    Avg: ${result.avgMs.toFixed(3)}ms`,
    `    Min: ${result.minMs.toFixed(3)}ms`,
    `    Max: ${result.maxMs.toFixed(3)}ms`,
    `    Ops/sec: ${result.opsPerSec.toFixed(1)}`,
  ].join("\n");
}

// =============================================================================
// TEST DATA SETUP
// =============================================================================

const testDir = join(tmpdir(), `ultracode-bench-${Date.now()}`);
const testFiles: string[] = [];

async function setupTestData(): Promise<void> {
  console.log(`\n📁 Setting up test data in ${testDir}...`);

  await mkdir(testDir, { recursive: true });

  // Create test files of various sizes
  const sizes = [
    { name: "small", size: 1024 }, // 1KB
    { name: "medium", size: 100 * 1024 }, // 100KB
    { name: "large", size: 1024 * 1024 }, // 1MB
  ];

  for (const { name, size } of sizes) {
    const filePath = join(testDir, `${name}.txt`);
    const content = "x".repeat(size);
    await writeFile(filePath, content);
    testFiles.push(filePath);
  }

  // Create JSON test file
  const jsonPath = join(testDir, "test.json");
  const jsonData = {
    name: "test",
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: `item-${i}`,
      nested: { a: 1, b: 2, c: 3 },
    })),
  };
  await writeFile(jsonPath, JSON.stringify(jsonData, null, 2));
  testFiles.push(jsonPath);

  // Create nested directory structure
  for (let i = 0; i < 10; i++) {
    const subDir = join(testDir, `subdir-${i}`);
    await mkdir(subDir, { recursive: true });
    for (let j = 0; j < 10; j++) {
      const filePath = join(subDir, `file-${j}.ts`);
      await writeFile(filePath, `// File ${i}-${j}\nexport const x = ${i * 10 + j};`);
    }
  }

  console.log(`✅ Created ${testFiles.length} test files + 100 nested files`);
}

async function cleanupTestData(): Promise<void> {
  try {
    await rm(testDir, true);
    console.log(`\n🧹 Cleaned up test data`);
  } catch {
    console.log(`\n⚠️ Could not clean up ${testDir}`);
  }
}

// =============================================================================
// BENCHMARKS
// =============================================================================

async function runFileReadBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n📖 File Read Benchmarks:");
  const results: BenchmarkResult[] = [];

  // Small file read
  const smallFile = join(testDir, "small.txt");
  results.push(
    await benchmark(
      "readText (1KB)",
      async () => {
        await readText(smallFile);
      },
      500,
    ),
  );

  // Medium file read
  const mediumFile = join(testDir, "medium.txt");
  results.push(
    await benchmark(
      "readText (100KB)",
      async () => {
        await readText(mediumFile);
      },
      200,
    ),
  );

  // Large file read
  const largeFile = join(testDir, "large.txt");
  results.push(
    await benchmark(
      "readText (1MB)",
      async () => {
        await readText(largeFile);
      },
      50,
    ),
  );

  // JSON read
  const jsonFile = join(testDir, "test.json");
  results.push(
    await benchmark(
      "readJSON",
      async () => {
        await readJSON(jsonFile);
      },
      200,
    ),
  );

  return results;
}

async function runFileWriteBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n✏️ File Write Benchmarks:");
  const results: BenchmarkResult[] = [];

  const smallContent = "x".repeat(1024);
  const mediumContent = "x".repeat(100 * 1024);
  const largeContent = "x".repeat(1024 * 1024);

  results.push(
    await benchmark(
      "writeFile (1KB)",
      async () => {
        await writeFile(join(testDir, "write-small.txt"), smallContent);
      },
      200,
    ),
  );

  results.push(
    await benchmark(
      "writeFile (100KB)",
      async () => {
        await writeFile(join(testDir, "write-medium.txt"), mediumContent);
      },
      100,
    ),
  );

  results.push(
    await benchmark(
      "writeFile (1MB)",
      async () => {
        await writeFile(join(testDir, "write-large.txt"), largeContent);
      },
      20,
    ),
  );

  // Test Bun.FileSink for incremental writes (Bun only)
  if (runtime.isBun && globalThis.Bun) {
    // FileSink for 100KB - chunked writes (with proper sync)
    results.push(
      await benchmark(
        "FileSink (100KB, chunked)",
        async () => {
          const path = join(testDir, "filesink-medium.txt");
          const file = globalThis.Bun!.file(path);
          const writer = file.writer({ highWaterMark: 64 * 1024 }); // 64KB buffer
          const chunk = "x".repeat(10 * 1024); // 10KB chunks
          for (let i = 0; i < 10; i++) {
            writer.write(chunk);
          }
          await writer.flush();
          await writer.end();
        },
        100,
      ),
    );

    // FileSink for 1MB - chunked writes
    results.push(
      await benchmark(
        "FileSink (1MB, chunked)",
        async () => {
          const path = join(testDir, "filesink-large.txt");
          const file = globalThis.Bun!.file(path);
          const writer = file.writer({ highWaterMark: 256 * 1024 }); // 256KB buffer
          const chunk = "x".repeat(64 * 1024); // 64KB chunks
          for (let i = 0; i < 16; i++) {
            writer.write(chunk);
          }
          await writer.flush();
          await writer.end();
        },
        20,
      ),
    );

    // FileSink for 1MB - single write (compare with Bun.write)
    results.push(
      await benchmark(
        "FileSink (1MB, single write)",
        async () => {
          const path = join(testDir, "filesink-large-single.txt");
          const file = globalThis.Bun!.file(path);
          const writer = file.writer({ highWaterMark: 1024 * 1024 }); // 1MB buffer
          writer.write(largeContent);
          await writer.flush();
          await writer.end();
        },
        20,
      ),
    );

    // Direct Bun.write for comparison
    results.push(
      await benchmark(
        "Bun.write (100KB)",
        async () => {
          await globalThis.Bun!.write(join(testDir, "bunwrite-medium.txt"), mediumContent);
        },
        100,
      ),
    );

    results.push(
      await benchmark(
        "Bun.write (1MB)",
        async () => {
          await globalThis.Bun!.write(join(testDir, "bunwrite-large.txt"), largeContent);
        },
        20,
      ),
    );
  }

  return results;
}

async function runDirectoryBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n📂 Directory Benchmarks:");
  const results: BenchmarkResult[] = [];

  results.push(
    await benchmark(
      "readdir",
      async () => {
        await readdir(testDir);
      },
      500,
    ),
  );

  results.push(
    await benchmark(
      "readdir (withFileTypes)",
      async () => {
        await readdir(testDir, { withFileTypes: true });
      },
      500,
    ),
  );

  results.push(
    await benchmark(
      "stat",
      async () => {
        await stat(join(testDir, "small.txt"));
      },
      500,
    ),
  );

  results.push(
    await benchmark(
      "fileExists",
      async () => {
        await fileExists(join(testDir, "small.txt"));
      },
      500,
    ),
  );

  return results;
}

async function runGlobBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🔍 Glob Benchmarks:");
  const results: BenchmarkResult[] = [];

  results.push(
    await benchmark(
      "glob (**/*.ts)",
      async () => {
        await glob("**/*.ts", { cwd: testDir });
      },
      100,
    ),
  );

  results.push(
    await benchmark(
      "glob (**/*)",
      async () => {
        await glob("**/*", { cwd: testDir });
      },
      50,
    ),
  );

  // Test on actual codebase
  const srcDir = join(process.cwd(), "src");
  if (await fileExists(srcDir)) {
    results.push(
      await benchmark(
        "findSourceFiles (src/)",
        async () => {
          await findSourceFiles(srcDir);
        },
        20,
      ),
    );
  }

  return results;
}

async function runShellBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🐚 Shell Benchmarks:");
  const results: BenchmarkResult[] = [];

  results.push(
    await benchmark(
      "exec (echo)",
      async () => {
        await exec("echo test", { cwd: testDir });
      },
      100,
    ),
  );

  results.push(
    await benchmark(
      "exec (git --version)",
      async () => {
        await exec("git --version", { cwd: process.cwd() });
      },
      50,
    ),
  );

  return results;
}

async function runCodebaseMetricsBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n📊 Codebase Metrics Benchmarks:");
  const results: BenchmarkResult[] = [];

  results.push(
    await benchmark(
      "countSourceFiles (testDir)",
      async () => {
        await countSourceFiles(testDir);
      },
      50,
    ),
  );

  results.push(
    await benchmark(
      "getCodebaseMetrics (testDir)",
      async () => {
        await getCodebaseMetrics(testDir);
      },
      50,
    ),
  );

  return results;
}

async function runStartupBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🚀 Startup Time Benchmarks:");
  const results: BenchmarkResult[] = [];

  // Create a minimal test script
  const testScript = join(testDir, "startup-test.js");
  await writeFile(testScript, 'console.log("ok");');

  // Measure Node.js startup (always available)
  const nodeCmd = process.platform === "win32" ? "node" : "node";
  results.push(
    await benchmark(
      "startup (node)",
      async () => {
        await exec(`${nodeCmd} "${testScript}"`, { cwd: testDir });
      },
      20,
    ),
  );

  // Measure Bun startup if available
  try {
    const bunCheck = await exec("bun --version", { cwd: testDir });
    if (bunCheck.success) {
      results.push(
        await benchmark(
          "startup (bun)",
          async () => {
            await exec(`bun "${testScript}"`, { cwd: testDir });
          },
          20,
        ),
      );
    }
  } catch {
    // Bun not available
  }

  return results;
}

async function runSQLiteBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🗄️ SQLite Benchmarks:");
  const results: BenchmarkResult[] = [];

  const dbPath = join(testDir, "bench.db");

  // Use bun:sqlite under Bun, better-sqlite3 under Node
  if (runtime.isBun && globalThis.Bun) {
    // bun:sqlite benchmarks
    const { Database } = await import("bun:sqlite");
    const db = new Database(dbPath);

    // Setup
    db.run("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT, value REAL)");
    db.run("DELETE FROM items");

    // Insert benchmark
    const insertStmt = db.prepare("INSERT INTO items (name, value) VALUES (?, ?)");
    results.push(
      await benchmark(
        "sqlite insert (bun:sqlite)",
        async () => {
          for (let i = 0; i < 100; i++) {
            insertStmt.run(`item-${i}`, Math.random());
          }
        },
        20,
      ),
    );

    // Pre-populate for select
    db.run("DELETE FROM items");
    for (let i = 0; i < 1000; i++) {
      insertStmt.run(`item-${i}`, Math.random());
    }

    // Select benchmark
    const selectStmt = db.prepare("SELECT * FROM items WHERE value > ?");
    results.push(
      await benchmark(
        "sqlite select (bun:sqlite)",
        async () => {
          selectStmt.all(0.5);
        },
        100,
      ),
    );

    // Transaction benchmark
    results.push(
      await benchmark(
        "sqlite transaction (bun:sqlite)",
        async () => {
          db.transaction(() => {
            for (let i = 0; i < 50; i++) {
              insertStmt.run(`tx-item-${i}`, Math.random());
            }
          })();
        },
        20,
      ),
    );

    db.close();
  } else {
    // better-sqlite3 benchmarks
    try {
      const BetterSqlite3 = (await import("better-sqlite3")).default;
      const db = new BetterSqlite3(dbPath);

      // Setup
      db.exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT, value REAL)");
      db.exec("DELETE FROM items");

      // Insert benchmark
      const insertStmt = db.prepare("INSERT INTO items (name, value) VALUES (?, ?)");
      results.push(
        await benchmark(
          "sqlite insert (better-sqlite3)",
          async () => {
            for (let i = 0; i < 100; i++) {
              insertStmt.run(`item-${i}`, Math.random());
            }
          },
          20,
        ),
      );

      // Pre-populate for select
      db.exec("DELETE FROM items");
      for (let i = 0; i < 1000; i++) {
        insertStmt.run(`item-${i}`, Math.random());
      }

      // Select benchmark
      const selectStmt = db.prepare("SELECT * FROM items WHERE value > ?");
      results.push(
        await benchmark(
          "sqlite select (better-sqlite3)",
          async () => {
            selectStmt.all(0.5);
          },
          100,
        ),
      );

      // Transaction benchmark
      const txInsert = db.transaction(() => {
        for (let i = 0; i < 50; i++) {
          insertStmt.run(`tx-item-${i}`, Math.random());
        }
      });
      results.push(
        await benchmark(
          "sqlite transaction (better-sqlite3)",
          async () => {
            txInsert();
          },
          20,
        ),
      );

      db.close();
    } catch (e) {
      console.log("  ⚠️ better-sqlite3 not available, skipping SQLite benchmarks");
    }
  }

  return results;
}

async function runCryptoBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🔐 Crypto Benchmarks:");
  const results: BenchmarkResult[] = [];

  const testData = "x".repeat(10000); // 10KB of data

  // Node.js crypto (always available)
  const { createHash } = await import("node:crypto");

  results.push(
    await benchmark(
      "hash SHA-256 (node:crypto)",
      async () => {
        createHash("sha256").update(testData).digest("hex");
      },
      500,
    ),
  );

  // Bun's native hash if available
  if (runtime.isBun && globalThis.Bun) {
    results.push(
      await benchmark(
        "hash SHA-256 (Bun.CryptoHasher)",
        async () => {
          const hasher = new globalThis.Bun!.CryptoHasher("sha256");
          hasher.update(testData);
          hasher.digest("hex");
        },
        500,
      ),
    );
  }

  return results;
}

async function runFetchBenchmarks(): Promise<BenchmarkResult[]> {
  console.log("\n🌐 HTTP Fetch Benchmarks:");
  const results: BenchmarkResult[] = [];

  // Create a simple test server
  const { createServer } = await import("node:http");

  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/`;

  try {
    // Warmup
    for (let i = 0; i < 5; i++) {
      await fetch(url);
    }

    results.push(
      await benchmark(
        "fetch (JSON response)",
        async () => {
          const res = await fetch(url);
          await res.json();
        },
        100,
      ),
    );
  } finally {
    server.close();
  }

  return results;
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("🚀 UltraCode Runtime Benchmark");
  console.log("═".repeat(60));

  // Show runtime info
  logRuntimeInfo();
  console.log("\nFeatures:");
  console.log(`  Bun.file: ${features.bunFile}`);
  console.log(`  Bun.write: ${features.bunWrite}`);
  console.log(`  Bun.Glob: ${features.bunGlob}`);
  console.log(`  Bun.$: ${features.bunShell}`);

  await setupTestData();

  const allResults: BenchmarkResult[] = [];

  try {
    allResults.push(...(await runFileReadBenchmarks()));
    allResults.push(...(await runFileWriteBenchmarks()));
    allResults.push(...(await runDirectoryBenchmarks()));
    allResults.push(...(await runGlobBenchmarks()));
    allResults.push(...(await runShellBenchmarks()));
    allResults.push(...(await runCodebaseMetricsBenchmarks()));
    allResults.push(...(await runStartupBenchmarks()));
    allResults.push(...(await runSQLiteBenchmarks()));
    allResults.push(...(await runCryptoBenchmarks()));
    allResults.push(...(await runFetchBenchmarks()));
  } finally {
    await cleanupTestData();
  }

  // Print summary
  console.log("\n" + "═".repeat(60));
  console.log("📈 RESULTS SUMMARY");
  console.log("═".repeat(60));
  console.log(`Runtime: ${runtime.name} ${runtime.version}`);
  console.log("");

  for (const result of allResults) {
    console.log(formatResult(result));
  }

  // Export as JSON for comparison
  const outputPath = join(process.cwd(), `benchmark-${runtime.name}-${Date.now()}.json`);
  const output = {
    runtime: runtime.name,
    version: runtime.version,
    timestamp: new Date().toISOString(),
    features: {
      bunFile: features.bunFile,
      bunWrite: features.bunWrite,
      bunGlob: features.bunGlob,
      bunShell: features.bunShell,
    },
    results: allResults,
  };
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n📄 Results saved to: ${outputPath}`);
}

main().catch(console.error);
