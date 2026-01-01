/**
 * Test Phase 2: Flush dump to LibSQL (without OpenVINO)
 *
 * This tests loading embeddings from dump files and inserting to database.
 * Should be run AFTER phase 1 dumped embeddings.
 */

import { getDumpStats, loadAllBatches, cleanupDump, arrayToVector } from "../src/semantic/embedding-dump.js";
import { GraphStorageLibSQL } from "../src/storage/graph-storage-libsql.js";
import { VectorStore } from "../src/semantic/vector-store.js";
import type { VectorEmbedding } from "../src/types/semantic.js";

async function main() {
  console.log("=== Phase 2: Flush Test (No OpenVINO) ===\n");

  // Check dump stats
  const stats = getDumpStats();
  console.log(`Dump stats:`);
  console.log(`  - Batch count: ${stats.batchCount}`);
  console.log(`  - Total embeddings: ${stats.totalEmbeddings}`);
  console.log(`  - Disk size: ${(stats.diskSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  if (stats.totalEmbeddings === 0) {
    console.log("\nNo embeddings to flush. Run phase 1 first.");
    process.exit(1);
  }

  // Load embeddings from dump
  console.log("\nLoading embeddings from dump...");
  const dumpedEmbeddings = loadAllBatches();
  console.log(`Loaded ${dumpedEmbeddings.length} embeddings`);

  // Detect dimensions from first embedding
  const dimensions = dumpedEmbeddings[0]?.vector.length || 768;
  console.log(`Detected dimensions: ${dimensions}`);

  // Initialize VectorStore with correct dimensions
  console.log("\nInitializing VectorStore...");
  const vectorStore = new VectorStore({ dimensions });
  await vectorStore.initialize();
  console.log("VectorStore initialized");

  // Convert to VectorEmbedding format
  const vectorEmbeddings: VectorEmbedding[] = dumpedEmbeddings.map((de) => ({
    id: de.id,
    content: de.content,
    vector: arrayToVector(de.vector),
    metadata: de.metadata,
    createdAt: de.createdAt,
  }));

  // Insert in batches
  const BATCH_SIZE = 50;
  let inserted = 0;

  console.log("\nInserting embeddings...");
  const startTime = Date.now();

  for (let i = 0; i < vectorEmbeddings.length; i += BATCH_SIZE) {
    const batch = vectorEmbeddings.slice(i, i + BATCH_SIZE);
    await vectorStore.insertBatch(batch);
    inserted += batch.length;
    console.log(`  Progress: ${inserted}/${vectorEmbeddings.length}`);
  }

  const elapsed = Date.now() - startTime;
  const totalCount = await vectorStore.count();

  console.log(`\n✓ Inserted ${inserted} embeddings in ${elapsed}ms`);
  console.log(`  Rate: ${((inserted / elapsed) * 1000).toFixed(1)} embeddings/sec`);
  console.log(`  Total vectors in store: ${totalCount}`);

  // Clean up dump
  console.log("\nCleaning up dump files...");
  cleanupDump();

  const finalStats = getDumpStats();
  console.log(`Remaining dump files: ${finalStats.batchCount}`);

  console.log("\n✓ Phase 2 test PASSED!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Phase 2 test failed:", err);
  process.exit(1);
});
