/**
 * Delay test - does adding setTimeout between embed() calls cause crashes?
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

const TOTAL = 2000;
const DELAY_MS = parseInt(process.argv[2] || "0", 10);

async function main() {
  console.error(`Testing: ${TOTAL} embeddings with ${DELAY_MS}ms delay`);

  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.error("Ready");

  let count = 0;
  const startTime = Date.now();

  for (let i = 0; i < TOTAL; i++) {
    const texts = [`Test text number ${i}`];
    const emb = await generator.generateBatch(texts);
    count += emb.length;

    if (DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    if ((i + 1) % 100 === 0) {
      console.error(`Progress: ${i + 1}/${TOTAL}`);
    }
  }

  const totalTime = Date.now() - startTime;
  console.error(`✓ Done: ${count} embeddings in ${totalTime}ms`);
}

main().catch(console.error);
