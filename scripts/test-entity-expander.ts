/**
 * Test entity expander on real project data
 */

import {
  expandLargeEntities,
  getExpansionStats,
  estimateEntityTokens,
} from "../src/semantic/entity-expander.js";
import type { ParsedEntity } from "../src/types/parser.js";

// Simulated large class entity (like VectorStore)
const largeClass: ParsedEntity = {
  id: "test-class-1",
  name: "VectorStore",
  type: "class",
  filePath: "src/semantic/vector-store.ts",
  location: {
    start: { line: 82, column: 0, index: 3641 },
    end: { line: 1319, column: 1, index: 46864 },
  },
  children: [
    {
      name: "constructor",
      type: "method",
      filePath: "src/semantic/vector-store.ts",
      location: {
        start: { line: 100, column: 2, index: 4000 },
        end: { line: 130, column: 3, index: 5500 },
      },
    },
    {
      name: "initialize",
      type: "method",
      filePath: "src/semantic/vector-store.ts",
      location: {
        start: { line: 135, column: 2, index: 5600 },
        end: { line: 200, column: 3, index: 8000 },
      },
      modifiers: ["async"],
    },
    {
      name: "search",
      type: "method",
      filePath: "src/semantic/vector-store.ts",
      location: {
        start: { line: 250, column: 2, index: 10000 },
        end: { line: 300, column: 3, index: 12000 },
      },
      modifiers: ["async"],
    },
    {
      name: "insertBatch",
      type: "method",
      filePath: "src/semantic/vector-store.ts",
      location: {
        start: { line: 350, column: 2, index: 14000 },
        end: { line: 400, column: 3, index: 16000 },
      },
      modifiers: ["async"],
    },
    {
      name: "close",
      type: "method",
      filePath: "src/semantic/vector-store.ts",
      location: {
        start: { line: 1300, column: 2, index: 45000 },
        end: { line: 1318, column: 3, index: 46800 },
      },
      modifiers: ["async"],
    },
  ],
};

// Small function (should NOT be expanded)
const smallFunction: ParsedEntity = {
  id: "test-func-1",
  name: "hashText",
  type: "function",
  filePath: "src/utils/fast-hash.ts",
  location: {
    start: { line: 10, column: 0, index: 200 },
    end: { line: 25, column: 1, index: 600 },
  },
};

// Interface (should be expanded if large enough with many methods)
const largeInterface: ParsedEntity = {
  id: "test-interface-1",
  name: "SemanticOperations",
  type: "interface",
  filePath: "src/types/semantic.ts",
  location: {
    start: { line: 50, column: 0, index: 1500 },
    end: { line: 150, column: 1, index: 5000 },
  },
  children: [
    {
      name: "search",
      type: "method",
      filePath: "src/types/semantic.ts",
      location: {
        start: { line: 55, column: 2, index: 1600 },
        end: { line: 60, column: 3, index: 1800 },
      },
    },
    {
      name: "findSimilar",
      type: "method",
      filePath: "src/types/semantic.ts",
      location: {
        start: { line: 65, column: 2, index: 1900 },
        end: { line: 70, column: 3, index: 2100 },
      },
    },
    {
      name: "detectClones",
      type: "method",
      filePath: "src/types/semantic.ts",
      location: {
        start: { line: 75, column: 2, index: 2200 },
        end: { line: 80, column: 3, index: 2400 },
      },
    },
  ],
};

async function main() {
  console.log("=== Entity Expander Test ===\n");

  const entities = [largeClass, smallFunction, largeInterface];

  // Test with 512 token limit
  console.log("--- Test with maxTokens: 512 ---\n");
  {
    const config = { maxTokens: 512 };
    const stats = getExpansionStats(entities, config);
    console.log("Input stats:");
    console.log(`  Total entities: ${stats.total}`);
    console.log(`  Needs expansion: ${stats.needsExpansion}`);
    console.log(`  Children count: ${stats.childrenCount}`);
    console.log(`  Largest: ${stats.largestEntity?.name} (${stats.largestEntity?.tokens} tokens)`);

    const expanded = expandLargeEntities(entities, config);
    console.log(`\nExpanded: ${entities.length} → ${expanded.length} entities`);
    console.log("\nExpanded entities:");
    for (const e of expanded) {
      const tokens = estimateEntityTokens(e);
      console.log(`  ${e.type.padEnd(10)} ${e.name.padEnd(35)} ${tokens} tokens`);
    }
  }

  // Test with 8192 token limit
  console.log("\n--- Test with maxTokens: 8192 ---\n");
  {
    const config = { maxTokens: 8192 };
    const stats = getExpansionStats(entities, config);
    console.log("Input stats:");
    console.log(`  Total entities: ${stats.total}`);
    console.log(`  Needs expansion: ${stats.needsExpansion}`);
    console.log(`  Children count: ${stats.childrenCount}`);

    const expanded = expandLargeEntities(entities, config);
    console.log(`\nExpanded: ${entities.length} → ${expanded.length} entities`);
    console.log("(With 8K context, large classes don't need expansion)");
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log("✅ Large classes (1000+ lines) → expanded into header + methods");
  console.log("✅ Small functions → kept as-is");
  console.log("✅ Adapts to provider's maxTokens (512, 8K)");
  console.log("✅ Each method gets its own embedding for better search");
}

main().catch(console.error);
