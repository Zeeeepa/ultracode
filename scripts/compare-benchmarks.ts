#!/usr/bin/env npx tsx
/**
 * Compare benchmark results between Node.js and Bun
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface BenchmarkResult {
  name: string;
  avgMs: number;
  opsPerSec: number;
}

interface BenchmarkFile {
  runtime: string;
  version: string;
  timestamp: string;
  features: Record<string, boolean>;
  results: BenchmarkResult[];
}

// Find benchmark files
const files = readdirSync(process.cwd())
  .filter((f) => f.startsWith("benchmark-") && f.endsWith(".json"))
  .sort();

if (files.length < 2) {
  console.log("Need at least 2 benchmark files to compare");
  process.exit(1);
}

// Read files
const benchmarks: BenchmarkFile[] = files.map((f) => {
  const content = readFileSync(join(process.cwd(), f), "utf-8");
  return JSON.parse(content);
});

// Find Node and Bun results
const nodeData = benchmarks.find((b) => b.runtime === "node");
const bunData = benchmarks.find((b) => b.runtime === "bun");

if (!nodeData || !bunData) {
  console.log("Need both Node.js and Bun benchmark results");
  process.exit(1);
}

console.log("═".repeat(80));
console.log("📊 BENCHMARK COMPARISON: Node.js vs Bun");
console.log("═".repeat(80));
console.log(`Node.js: v${nodeData.version}`);
console.log(`Bun:     v${bunData.version}`);
console.log("");

// Create map for easy lookup
const nodeMap = new Map(nodeData.results.map((r) => [r.name, r]));
const bunMap = new Map(bunData.results.map((r) => [r.name, r]));

// All unique test names
const allTests = new Set([...nodeMap.keys(), ...bunMap.keys()]);

// Print comparison table
console.log(
  "Test".padEnd(35) + "Node.js".padStart(12) + "Bun".padStart(12) + "Speedup".padStart(12),
);
console.log("-".repeat(71));

let totalNodeTime = 0;
let totalBunTime = 0;
let comparisons = 0;

for (const test of allTests) {
  const nodeResult = nodeMap.get(test);
  const bunResult = bunMap.get(test);

  if (!nodeResult || !bunResult) continue;

  const nodeMs = nodeResult.avgMs;
  const bunMs = bunResult.avgMs;
  const speedup = nodeMs / bunMs;

  totalNodeTime += nodeMs;
  totalBunTime += bunMs;
  comparisons++;

  let speedupStr: string;
  if (speedup >= 1) {
    speedupStr = `🚀 ${speedup.toFixed(2)}x`;
  } else {
    speedupStr = `🐢 ${(1 / speedup).toFixed(2)}x slower`;
  }

  console.log(
    test.padEnd(35) +
      `${nodeMs.toFixed(3)}ms`.padStart(12) +
      `${bunMs.toFixed(3)}ms`.padStart(12) +
      speedupStr.padStart(16),
  );
}

console.log("-".repeat(71));

// Overall comparison
const overallSpeedup = totalNodeTime / totalBunTime;
console.log("");
console.log("📈 OVERALL STATISTICS:");
console.log(`   Tests compared: ${comparisons}`);
console.log(`   Total Node.js time: ${totalNodeTime.toFixed(3)}ms`);
console.log(`   Total Bun time: ${totalBunTime.toFixed(3)}ms`);
console.log(
  `   Overall speedup: ${overallSpeedup >= 1 ? "🚀" : "🐢"} ${overallSpeedup.toFixed(2)}x ${overallSpeedup >= 1 ? "faster" : "slower"}`,
);

// Category breakdown
console.log("");
console.log("📂 BY CATEGORY:");

const categories = {
  "File Read": ["readText", "readJSON"],
  "File Write": ["writeFile"],
  Directory: ["readdir", "stat", "fileExists"],
  Glob: ["glob", "findSourceFiles"],
  Shell: ["exec"],
  Metrics: ["countSourceFiles", "getCodebaseMetrics"],
  Startup: ["startup"],
  SQLite: ["sqlite"],
  Crypto: ["hash"],
  Fetch: ["fetch"],
};

for (const [category, keywords] of Object.entries(categories)) {
  let catNodeTime = 0;
  let catBunTime = 0;
  let count = 0;

  for (const test of allTests) {
    if (!keywords.some((kw) => test.includes(kw))) continue;

    const nodeResult = nodeMap.get(test);
    const bunResult = bunMap.get(test);
    if (!nodeResult || !bunResult) continue;

    catNodeTime += nodeResult.avgMs;
    catBunTime += bunResult.avgMs;
    count++;
  }

  if (count > 0) {
    const speedup = catNodeTime / catBunTime;
    const emoji = speedup >= 1 ? "🚀" : "🐢";
    console.log(
      `   ${category.padEnd(15)} ${emoji} ${speedup.toFixed(2)}x ${speedup >= 1 ? "faster" : "slower"} (${count} tests)`,
    );
  }
}

// Cleanup files
console.log("");
console.log("🧹 Cleaning up benchmark files...");
for (const f of files) {
  try {
    require("fs").unlinkSync(join(process.cwd(), f));
  } catch {}
}
console.log("✅ Done!");
