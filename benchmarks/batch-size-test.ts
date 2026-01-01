/**
 * Batch size test - isolate if batch size causes crashes
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

const TOTAL = 5000;
const BATCH_SIZE = parseInt(process.argv[2] || "1", 10);

async function main() {
  console.error(`Testing batch size: ${BATCH_SIZE}`);

  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.error("Ready");

  let count = 0;
  const startTime = Date.now();

  for (let i = 0; i < TOTAL; i += BATCH_SIZE) {
    const texts: string[] = [];
    for (let j = 0; j < BATCH_SIZE && i + j < TOTAL; j++) {
      texts.push(`Test text number ${i + j}`);
    }
    const emb = await generator.generateBatch(texts);
    count += emb.length;
  }

  const totalTime = Date.now() - startTime;
  console.error(`✓ Batch size ${BATCH_SIZE}: ${count} embeddings in ${totalTime}ms`);
  console.error(`Rate: ${((count / totalTime) * 1000).toFixed(1)} emb/sec`);
}

main().catch(console.error);
