/**
 * Async test - different async patterns between embed() calls
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";

const TOTAL = 2000;
type AsyncMode = "none" | "timeout" | "immediate" | "microtask" | "setImmediate";

async function runTest(mode: AsyncMode) {
  console.error(`\n=== Testing async mode: ${mode} ===`);

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

    // Different async patterns
    switch (mode) {
      case "none":
        // No async operation between embeds
        break;
      case "timeout":
        await new Promise((resolve) => setTimeout(resolve, 0));
        break;
      case "immediate":
        // Using queueMicrotask with Promise wrapper
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
        break;
      case "microtask":
        // Pure microtask via Promise.resolve()
        await Promise.resolve();
        break;
      case "setImmediate":
        // Using setImmediate (Node.js/Bun)
        await new Promise((resolve) => setImmediate(resolve));
        break;
    }

    if ((i + 1) % 100 === 0) {
      console.error(`Progress: ${i + 1}/${TOTAL}`);
    }
  }

  const totalTime = Date.now() - startTime;
  console.error(`✓ Mode "${mode}": ${count} embeddings in ${totalTime}ms`);
  return { mode, count, time: totalTime };
}

async function main() {
  const modes: AsyncMode[] = ["none", "microtask", "immediate", "setImmediate", "timeout"];
  const argMode = process.argv[2] as AsyncMode | undefined;

  if (argMode && modes.includes(argMode)) {
    await runTest(argMode);
  } else {
    // Run all modes
    for (const mode of modes) {
      try {
        await runTest(mode);
      } catch (err) {
        console.error(`✗ Mode "${mode}" CRASHED:`, err);
        break;
      }
    }
  }
}

main().catch(console.error);
