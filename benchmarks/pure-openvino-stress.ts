/**
 * Pure OpenVINO stress test - no I/O between batches
 *
 * Tests how many embeddings can be generated before Bun crashes.
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

async function main() {
  // Minimal logging - only at start and end
  process.stderr.write("Init...");

  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 16,
  });

  await generator.initialize();
  process.stderr.write("ready\n");

  // Generate test texts
  const TOTAL_EMBEDDINGS = 2000;
  const BATCH_SIZE = 20;
  const texts: string[] = [];

  for (let i = 0; i < TOTAL_EMBEDDINGS; i++) {
    texts.push(`function testFunction${i}(param: string): void {
  console.log("Processing item ${i}");
  return param.toUpperCase();
}`);
  }

  // Use batches but NO logging inside loop
  let generated = 0;
  const startTime = Date.now();
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await generator.generateBatch(batch);
    results.push(...embeddings);
    generated += embeddings.length;
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n✓ Generated ${generated} embeddings in ${totalTime}ms`);
  console.log(`Rate: ${((generated / totalTime) * 1000).toFixed(1)} embeddings/sec`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
