#!/usr/bin/env bun
/**
 * Test multilingual OpenVINO models
 */

import { OpenVINOProvider } from "../src/semantic/providers/openvino-provider.js";

const MODELS = [
  { id: "paraphrase-multilingual-MiniLM-L12-v2", maxTokens: 512, langs: "50+" },
  { id: "distiluse-base-multilingual-cased-v2", maxTokens: 512, langs: "15" },
  { id: "multilingual-e5-base", maxTokens: 512, langs: "94" },
  { id: "multilingual-e5-small", maxTokens: 512, langs: "94" },
];

// Test texts (code samples)
const TEST_TEXTS = [
  "async function fetchUserData(userId: string): Promise<User> { return await db.users.findById(userId); }",
  "class UserService { constructor(private db: Database) {} async getUser(id: string) { return this.db.query(id); } }",
  "interface Config { host: string; port: number; timeout?: number; }",
  "const handleError = (error: Error) => { console.error('Error:', error.message); throw error; }",
  "export type UserId = string; export type UserRole = 'admin' | 'user' | 'guest';",
];

async function testModel(modelId: string, maxTokens: number, langs: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Testing: ${modelId} (${langs} languages, ${maxTokens} tokens)`);
  console.log("═".repeat(60));

  try {
    const provider = new OpenVINOProvider({
      model: modelId,
      device: "CPU",
      autoDownload: true,
    });

    const initStart = performance.now();
    await provider.initialize();
    const initTime = performance.now() - initStart;
    console.log(`  Init time: ${initTime.toFixed(0)}ms`);
    console.log(`  Dimensions: ${provider.getDimension()}`);

    // Warmup
    await provider.embed("warmup text for model initialization");

    // Benchmark
    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const text = TEST_TEXTS[i % TEST_TEXTS.length]!;
      await provider.embed(text);
    }

    const totalTime = performance.now() - start;
    const perChunk = totalTime / iterations;
    const chunksPerSec = Math.round(1000 / perChunk);

    console.log(`  Total time: ${totalTime.toFixed(0)}ms for ${iterations} chunks`);
    console.log(`  Per chunk: ${perChunk.toFixed(2)}ms`);
    console.log(`  Throughput: ${chunksPerSec} chunks/s`);

    await provider.close?.();

    return {
      model: modelId,
      langs,
      maxTokens,
      dims: provider.getDimension(),
      initMs: Math.round(initTime),
      perChunkMs: Number(perChunk.toFixed(2)),
      chunksPerSec,
      status: "success",
    };
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
    return {
      model: modelId,
      langs,
      maxTokens,
      status: "error",
      error: error.message,
    };
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  OpenVINO Multilingual Models Benchmark                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const results = [];

  for (const model of MODELS) {
    const result = await testModel(model.id, model.maxTokens, model.langs);
    results.push(result);
  }

  console.log("\n\n" + "═".repeat(70));
  console.log("RESULTS SUMMARY");
  console.log("═".repeat(70) + "\n");

  console.log("| Model | Langs | Chunks/s | ms/chunk | Dims | Context |");
  console.log("|-------|-------|----------|----------|------|---------|");

  for (const r of results) {
    if (r.status === "success") {
      console.log(`| ${r.model} | ${r.langs} | ${r.chunksPerSec} | ${r.perChunkMs} | ${r.dims} | ${r.maxTokens} |`);
    } else {
      console.log(`| ${r.model} | ${r.langs} | ERROR | - | - | ${r.maxTokens} |`);
    }
  }
}

main().catch(console.error);
