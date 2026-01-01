/**
 * Multi-text test - verify that multiple texts per call crashes
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

async function main() {
  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.error("Ready");

  // Test 1: Single text (should work)
  console.error("\nTest 1: Single text...");
  const single = await generator.generateBatch(["Hello world"]);
  console.error(`✓ Single text: ${single.length} embeddings`);

  // Test 2: Two texts (may crash)
  console.error("\nTest 2: Two texts...");
  const two = await generator.generateBatch(["Hello world", "Goodbye world"]);
  console.error(`✓ Two texts: ${two.length} embeddings`);

  // Test 3: Five texts
  console.error("\nTest 3: Five texts...");
  const five = await generator.generateBatch([
    "Text one",
    "Text two",
    "Text three",
    "Text four",
    "Text five",
  ]);
  console.error(`✓ Five texts: ${five.length} embeddings`);

  console.error("\nAll tests passed!");
}

main().catch(console.error);
