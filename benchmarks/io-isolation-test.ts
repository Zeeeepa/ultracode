/**
 * I/O Isolation Test - Find which I/O operation crashes Bun + OpenVINO
 *
 * Test levels:
 * 1. Pure embeddings (no I/O) - PASSED at 5000
 * 2. console.error every N batches
 * 3. JSON.stringify (memory only)
 * 4. fs.writeFileSync (disk write)
 * 5. fs.readdirSync + readFileSync (disk read)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

const TOTAL = 2000;
const BATCH_SIZE = 20;
const IO_EVERY = 5; // Do I/O every N batches
const DUMP_DIR = "./benchmarks/io-test-dump";

// Ensure dump directory
if (!existsSync(DUMP_DIR)) {
  mkdirSync(DUMP_DIR, { recursive: true });
}

type IoLevel = "none" | "console" | "stringify" | "write" | "read";

async function runTest(level: IoLevel) {
  console.error(`\n=== Testing I/O Level: ${level} ===`);

  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.error("Ready");

  const texts: string[] = [];
  for (let i = 0; i < TOTAL; i++) {
    texts.push(`Test function ${i} with some code content`);
  }

  let generated = 0;
  let batchNum = 0;
  const startTime = Date.now();

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await generator.generateBatch(batch);
    generated += embeddings.length;
    batchNum++;

    // I/O operations based on level
    if (batchNum % IO_EVERY === 0) {
      switch (level) {
        case "none":
          // No I/O
          break;

        case "console":
          // Simple console output
          console.error(`Batch ${batchNum}: ${generated} embeddings`);
          break;

        case "stringify":
          // JSON stringify in memory (no disk)
          const data = {
            batch: batchNum,
            count: embeddings.length,
            sample: Array.from(embeddings[0].slice(0, 5)),
          };
          const _json = JSON.stringify(data);
          break;

        case "write":
          // Write to disk
          const writeData = {
            batch: batchNum,
            count: embeddings.length,
            embeddings: embeddings.map((e) => Array.from(e.slice(0, 10))),
          };
          writeFileSync(join(DUMP_DIR, `batch-${batchNum}.json`), JSON.stringify(writeData));
          break;

        case "read":
          // Read from disk (simulate getDumpStats)
          const files = readdirSync(DUMP_DIR).filter((f) => f.endsWith(".json"));
          let totalRead = 0;
          for (const file of files.slice(0, 5)) {
            // Only read first 5
            const content = readFileSync(join(DUMP_DIR, file), "utf-8");
            const parsed = JSON.parse(content);
            totalRead += parsed.count;
          }
          break;
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.error(`✓ Level "${level}": ${generated} embeddings in ${totalTime}ms`);
  console.error(`  Rate: ${((generated / totalTime) * 1000).toFixed(1)} emb/sec\n`);

  return { level, generated, time: totalTime };
}

async function main() {
  const levels: IoLevel[] = ["none", "console", "stringify", "write", "read"];
  const results: { level: IoLevel; generated: number; time: number }[] = [];

  // Get test level from args
  const argLevel = process.argv[2] as IoLevel | undefined;

  if (argLevel && levels.includes(argLevel)) {
    // Run single level
    const result = await runTest(argLevel);
    results.push(result);
  } else {
    // Run all levels sequentially
    for (const level of levels) {
      try {
        const result = await runTest(level);
        results.push(result);
      } catch (err) {
        console.error(`✗ Level "${level}" CRASHED:`, err);
        break;
      }
    }
  }

  console.error("\n=== Summary ===");
  for (const r of results) {
    console.error(`${r.level}: ${r.generated} in ${r.time}ms`);
  }
}

main().catch(console.error);
