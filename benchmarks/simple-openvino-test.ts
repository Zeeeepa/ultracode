/**
 * Simple OpenVINO test - minimal code
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

async function main() {
  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.log("Ready");

  let count = 0;
  for (let i = 0; i < 5000; i++) {
    const texts = [`Test text number ${i}`];
    const emb = await generator.generateBatch(texts);
    count += emb.length;
  }

  console.log(`Done: ${count} embeddings`);
}

main().catch(console.error);
