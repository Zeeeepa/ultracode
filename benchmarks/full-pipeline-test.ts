/**
 * Full Pipeline Test - OpenVINO embeddings + LibSQL storage
 *
 * Tests the complete embedding pipeline without two-phase mode.
 * Reads configuration from semantic-config.json (created by setup-embedding).
 */

import { EmbeddingGenerator } from "../src/semantic/embedding-generator.js";
import { VectorStore } from "../src/semantic/vector-store.js";
import { loadSemanticConfig, getVectorDimensions } from "../src/utils/config-paths.js";

const TOTAL = parseInt(process.argv[2] || "1000", 10);

// Load config from semantic-config.json
const semanticConfig = loadSemanticConfig();
if (!semanticConfig?.enabled) {
  console.error("Error: Run 'setup-embedding' first to configure semantic mode");
  process.exit(1);
}

const openvinoConfig = semanticConfig.embedding.openvino;
if (!openvinoConfig) {
  console.error("Error: OpenVINO not configured. Run 'setup-embedding --provider openvino'");
  process.exit(1);
}

// Use batch_size from config, allow CLI override
const CONFIG_BATCH_SIZE = openvinoConfig.batch_size ?? 16;
const BATCH_SIZE = parseInt(process.argv[3] || String(CONFIG_BATCH_SIZE), 10);
const DIMENSIONS = getVectorDimensions();

async function main() {
  console.error(`\n=== Full Pipeline Test ===`);
  console.error(`Config: ${openvinoConfig.selected_model}, ${DIMENSIONS}d, batch=${CONFIG_BATCH_SIZE}`);
  console.error(`Test:   ${TOTAL} embeddings, batch=${BATCH_SIZE}`);

  // Initialize embedding generator from config
  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: openvinoConfig.selected_model,
    batchSize: BATCH_SIZE,
    openvino: {
      irPath: openvinoConfig.ir_path,
    },
  });

  await generator.initialize();
  console.error("✓ EmbeddingGenerator initialized");

  // Initialize VectorStore with dimensions from config
  const vectorStore = new VectorStore({
    dimensions: DIMENSIONS,
  });

  await vectorStore.initialize();
  console.error("✓ VectorStore initialized");

  const beforeCount = await vectorStore.count();
  console.error(`Vectors before: ${beforeCount}`);

  // Generate and store embeddings
  const startTime = Date.now();
  let generated = 0;
  let stored = 0;

  for (let i = 0; i < TOTAL; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(TOTAL / BATCH_SIZE);

    // Generate batch of texts
    const texts: string[] = [];
    for (let j = 0; j < BATCH_SIZE && i + j < TOTAL; j++) {
      texts.push(`function test${i + j}(x: number): number { return x * ${i + j}; }`);
    }

    // Generate embeddings
    const embeddings = await generator.generateBatch(texts);
    generated += embeddings.length;

    // Store to LibSQL via VectorStore.insertBatch
    const vectorEmbeddings = embeddings.map((embedding, j) => ({
      id: `test-entity-${i + j}`,
      content: texts[j] || "",
      vector: embedding,
      metadata: { entityType: "function", filePath: "/test/file.ts" },
      createdAt: Date.now(),
    }));

    await vectorStore.insertBatch(vectorEmbeddings);
    stored += vectorEmbeddings.length;

    // Progress every 10 batches
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      const elapsed = Date.now() - startTime;
      const rate = (generated / elapsed) * 1000;
      console.error(`Progress: ${batchNum}/${totalBatches} batches, ${generated} generated, ${stored} stored (${rate.toFixed(1)} emb/sec)`);
    }
  }

  const totalTime = Date.now() - startTime;
  const afterCount = await vectorStore.count();

  console.error(`\n=== Results ===`);
  console.error(`Generated: ${generated} embeddings`);
  console.error(`Stored: ${stored} vectors`);
  console.error(`Vectors after: ${afterCount} (added: ${afterCount - beforeCount})`);
  console.error(`Total time: ${totalTime}ms`);
  console.error(`Rate: ${((generated / totalTime) * 1000).toFixed(1)} embeddings/sec`);

  // Cleanup test vectors
  console.error(`\nCleaning up test vectors...`);
  for (let i = 0; i < TOTAL; i++) {
    await vectorStore.delete(`test-entity-${i}`);
  }
  const finalCount = await vectorStore.count();
  console.error(`Vectors after cleanup: ${finalCount}`);

  console.error(`\n✓ Test completed successfully!`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
