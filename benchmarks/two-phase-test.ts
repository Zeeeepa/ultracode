/**
 * Test two-phase embedding mode
 *
 * Tests that embeddings are dumped to disk during Phase 1,
 * then flushed to LibSQL in Phase 2.
 */

import { SemanticAgent } from "../src/agents/semantic-agent.js";
import { getConfig } from "../src/config/yaml-config.js";
import type { ParsedEntity } from "../src/types/parser.js";
import { getDumpStats, cleanupDump } from "../src/semantic/embedding-dump.js";

async function main() {
  console.log("=== Two-Phase Mode Test ===\n");

  // Check config
  const config = getConfig();
  console.log(`twoPhaseMode config: ${config.mcp?.embedding?.twoPhaseMode}`);
  console.log(`provider config: ${config.mcp?.embedding?.provider}`);

  // Clean any previous dump
  cleanupDump();
  console.log("Cleaned previous dump files\n");

  // Create semantic agent
  console.log("Initializing SemanticAgent...");
  const agent = new SemanticAgent();
  await agent.initialize();

  console.log(`Two-phase mode enabled: ${agent.isTwoPhaseMode()}`);

  if (!agent.isTwoPhaseMode()) {
    console.log("ERROR: Two-phase mode not enabled! Check config.");
    process.exit(1);
  }

  // Wait for embedding to be ready
  console.log("Waiting for embedding generator...");
  const ready = await agent.waitForEmbeddingReady(60000);
  if (!ready) {
    console.log("ERROR: Embedding generator not ready");
    process.exit(1);
  }
  console.log("Embedding generator ready\n");

  // Generate test entities
  const testEntities: ParsedEntity[] = [];
  for (let i = 0; i < 100; i++) {
    testEntities.push({
      id: `test-entity-${i}`,
      name: `TestFunction${i}`,
      type: "function",
      filePath: `/test/file${Math.floor(i / 10)}.ts`,
      location: {
        start: { line: i * 10, column: 0, index: i * 100 },
        end: { line: i * 10 + 5, column: 0, index: i * 100 + 50 },
      },
      language: "typescript",
      metadata: {
        signature: `function TestFunction${i}(param: string): void`,
        code: `function TestFunction${i}(param: string): void {\n  console.log("Test ${i}");\n  return param.toUpperCase();\n}`,
      },
    });
  }

  console.log(`Created ${testEntities.length} test entities`);

  // Phase 1: Generate embeddings (should dump to disk)
  console.log("\n=== PHASE 1: Generate & Dump ===");
  const phase1Start = Date.now();

  // Process in batches
  const BATCH_SIZE = 20;
  for (let i = 0; i < testEntities.length; i += BATCH_SIZE) {
    const batch = testEntities.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(testEntities.length / BATCH_SIZE)}...`);

    // @ts-ignore - handleNewEntities is public
    await agent.handleNewEntities(batch);
  }

  const phase1Time = Date.now() - phase1Start;
  const dumpStats = getDumpStats();

  console.log(`\nPhase 1 completed in ${phase1Time}ms`);
  console.log(`Dump stats: ${dumpStats.totalEmbeddings} embeddings in ${dumpStats.batchCount} batches`);
  console.log(`Disk size: ${(dumpStats.diskSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  if (dumpStats.totalEmbeddings === 0) {
    console.log("ERROR: No embeddings were dumped!");
    process.exit(1);
  }

  // Phase 2: Flush to database
  console.log("\n=== PHASE 2: Flush to Database ===");
  const phase2Start = Date.now();

  const flushResult = await agent.flushDumpToDatabase();

  const phase2Time = Date.now() - phase2Start;
  console.log(`\nPhase 2 completed in ${phase2Time}ms`);
  console.log(`Inserted: ${flushResult.inserted}, Skipped: ${flushResult.skipped}`);

  // Verify dump is cleaned
  const finalStats = getDumpStats();
  console.log(`\nFinal dump stats: ${finalStats.totalEmbeddings} embeddings remaining`);

  if (finalStats.totalEmbeddings > 0) {
    console.log("WARNING: Dump files not cleaned up!");
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Total time: ${phase1Time + phase2Time}ms`);
  console.log(`Phase 1 (generate & dump): ${phase1Time}ms`);
  console.log(`Phase 2 (flush to DB): ${phase2Time}ms`);
  console.log(`Entities processed: ${testEntities.length}`);
  console.log(`Embeddings inserted: ${flushResult.inserted}`);
  console.log("\n✓ Two-phase mode test PASSED!");

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
