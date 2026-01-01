/**
 * Repeated batch test - find crash threshold
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

const BATCH_SIZE = parseInt(process.argv[2] || "2", 10);
const ITERATIONS = parseInt(process.argv[3] || "100", 10);

async function main() {
  console.error(`Testing: ${ITERATIONS} iterations of batch size ${BATCH_SIZE}`);

  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8, // Internal batch size
  });

  await generator.initialize();
  console.error("Ready");

  let count = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const texts: string[] = [];
    for (let j = 0; j < BATCH_SIZE; j++) {
      texts.push(`Text ${i * BATCH_SIZE + j}`);
    }
    const emb = await generator.generateBatch(texts);
    count += emb.length;

    if ((i + 1) % 10 === 0) {
      console.error(`Progress: ${i + 1}/${ITERATIONS} (${count} embeddings)`);
    }
  }

  console.error(`✓ Done: ${count} embeddings`);
}

main().catch(console.error);
