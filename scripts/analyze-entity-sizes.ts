#!/usr/bin/env bun
/**
 * Analyze entity sizes in the project to determine optimal context window
 * for embedding models (256 vs 512 vs 8192 tokens)
 *
 * Uses same estimation as EntityExpander: ~10 tokens per line of code
 */

import { getGraphStorage } from "../src/storage/graph-storage-factory.js";
import type { Entity } from "../src/types/storage.js";

// Same estimation as entity-expander.ts
// ~10 tokens per line for code, ~6 for interfaces
function estimateTokens(entity: Entity): number {
  const loc = entity.location;
  if (!loc?.start?.line || !loc?.end?.line) {
    return 50; // Default for unknown
  }

  const lines = loc.end.line - loc.start.line + 1;
  const multiplier = entity.type === "interface" ? 6 : 10;

  return lines * multiplier;
}

async function analyzeEntitySizes() {
  console.log("📊 Analyzing entity sizes in project...\n");
  console.log("Using ~10 tokens/line estimation (same as EntityExpander)\n");

  const storage = await getGraphStorage();

  // Get all entities
  const entities = await storage.getAllEntities();

  console.log(`Total entities: ${entities.length}\n`);

  // Analyze sizes
  const sizes = {
    under128: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    under256: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    under512: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    under1024: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    under2048: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    under8192: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
    over8192: [] as { id: string; name: string; type: string; tokens: number; lines: number }[],
  };

  let totalTokens = 0;

  for (const entity of entities) {
    const tokens = estimateTokens(entity);
    const lines = (entity.location?.end?.line || 0) - (entity.location?.start?.line || 0) + 1;
    totalTokens += tokens;

    const info = {
      id: entity.id,
      name: entity.name || "unnamed",
      type: entity.type,
      tokens,
      lines
    };

    if (tokens <= 128) {
      sizes.under128.push(info);
    } else if (tokens <= 256) {
      sizes.under256.push(info);
    } else if (tokens <= 512) {
      sizes.under512.push(info);
    } else if (tokens <= 1024) {
      sizes.under1024.push(info);
    } else if (tokens <= 2048) {
      sizes.under2048.push(info);
    } else if (tokens <= 8192) {
      sizes.under8192.push(info);
    } else {
      sizes.over8192.push(info);
    }
  }

  // Print distribution
  console.log("=" .repeat(70));
  console.log("ENTITY SIZE DISTRIBUTION (by estimated tokens)");
  console.log("=".repeat(70));

  const total = entities.length;

  const printBucket = (label: string, items: typeof sizes.under128, cumulative: number) => {
    const count = items.length;
    const pct = ((count / total) * 100).toFixed(1);
    const cumPct = ((cumulative / total) * 100).toFixed(1);
    console.log(`${label.padEnd(20)} ${count.toString().padStart(5)} (${pct.padStart(5)}%)  | Cumulative: ${cumPct}%`);
  };

  let cumulative = sizes.under128.length;
  printBucket("≤128 tokens", sizes.under128, cumulative);

  cumulative += sizes.under256.length;
  printBucket("129-256 tokens", sizes.under256, cumulative);

  cumulative += sizes.under512.length;
  printBucket("257-512 tokens", sizes.under512, cumulative);

  cumulative += sizes.under1024.length;
  printBucket("513-1024 tokens", sizes.under1024, cumulative);

  cumulative += sizes.under2048.length;
  printBucket("1025-2048 tokens", sizes.under2048, cumulative);

  cumulative += sizes.under8192.length;
  printBucket("2049-8192 tokens", sizes.under8192, cumulative);

  printBucket(">8192 tokens", sizes.over8192, total);

  console.log("=".repeat(70));

  // Key insights
  const fit256 = sizes.under128.length + sizes.under256.length;
  const fit512 = fit256 + sizes.under512.length;
  const fit8192 = fit512 + sizes.under1024.length + sizes.under2048.length + sizes.under8192.length;
  const truncated256 = total - fit256;
  const truncated512 = total - fit512;

  console.log("\n📊 KEY INSIGHTS FOR EMBEDDING MODEL SELECTION:");
  console.log("=".repeat(70));
  console.log(`\n✅ Entities fitting in 256 context: ${fit256}/${total} (${((fit256/total)*100).toFixed(1)}%)`);
  console.log(`⚠️  Entities TRUNCATED with 256 context: ${truncated256} (${((truncated256/total)*100).toFixed(1)}%)`);
  console.log(`\n✅ Entities fitting in 512 context: ${fit512}/${total} (${((fit512/total)*100).toFixed(1)}%)`);
  console.log(`⚠️  Entities TRUNCATED with 512 context: ${truncated512} (${((truncated512/total)*100).toFixed(1)}%)`);
  console.log(`\n✅ Entities fitting in 8192 context: ${fit8192}/${total} (${((fit8192/total)*100).toFixed(1)}%)`);
  console.log(`⚠️  Entities TRUNCATED with 8192 context: ${sizes.over8192.length} (${((sizes.over8192.length/total)*100).toFixed(1)}%)`);

  // Show largest entities
  if (sizes.over8192.length > 0) {
    console.log("\n🔴 LARGEST ENTITIES (>8192 tokens / >819 lines):");
    sizes.over8192
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10)
      .forEach((e, i) => {
        console.log(`  ${i+1}. ${e.type}: ${e.name} (${e.lines} lines → ${e.tokens} tokens)`);
      });
  }

  if (truncated512 > 0) {
    console.log("\n🟡 ENTITIES TRUNCATED AT 512 (>51 lines):");
    [...sizes.under1024, ...sizes.under2048, ...sizes.under8192, ...sizes.over8192]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 20)
      .forEach((e, i) => {
        console.log(`  ${i+1}. ${e.type}: ${e.name} (${e.lines} lines → ${e.tokens} tokens)`);
      });
  }

  if (truncated256 > 0) {
    console.log("\n🟠 ENTITIES TRUNCATED AT 256 (>25 lines) - sample:");
    [...sizes.under512, ...sizes.under1024, ...sizes.under2048, ...sizes.under8192, ...sizes.over8192]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10)
      .forEach((e, i) => {
        console.log(`  ${i+1}. ${e.type}: ${e.name} (${e.lines} lines → ${e.tokens} tokens)`);
      });
  }

  // Analyze by entity type (functions vs classes)
  console.log("\n" + "=".repeat(70));
  console.log("📊 ANALYSIS BY ENTITY TYPE (after EntityExpander simulation):");
  console.log("=".repeat(70));

  const expandableTypes = ["class", "interface", "struct", "trait", "impl_block"];
  const methodTypes = ["function", "async_function", "method", "arrow_function"];

  const allEntities = [...sizes.under128, ...sizes.under256, ...sizes.under512, ...sizes.under1024, ...sizes.under2048, ...sizes.under8192, ...sizes.over8192];

  // Count classes that would be expanded (>512 tokens with EntityExpander default)
  const largeClasses = allEntities.filter(e =>
    expandableTypes.includes(e.type) && e.tokens > 512 * 0.8 // 80% threshold
  );

  // Count methods/functions
  const methods = allEntities.filter(e => methodTypes.includes(e.type));
  const methodsOver128 = methods.filter(e => e.tokens > 128);
  const methodsOver256 = methods.filter(e => e.tokens > 256);
  const methodsOver512 = methods.filter(e => e.tokens > 512);

  console.log(`\n📦 Classes/Interfaces that would be EXPANDED: ${largeClasses.length}`);
  console.log(`   (split into header + individual methods)`);

  console.log(`\n🔧 Functions/Methods (individual units for embedding):`);
  console.log(`   Total: ${methods.length}`);
  console.log(`\n   Context 128:`);
  console.log(`     Fitting: ${methods.length - methodsOver128.length} (${((1 - methodsOver128.length/methods.length)*100).toFixed(1)}%)`);
  console.log(`     Truncated: ${methodsOver128.length} (${((methodsOver128.length/methods.length)*100).toFixed(1)}%)`);
  console.log(`\n   Context 256:`);
  console.log(`     Fitting: ${methods.length - methodsOver256.length} (${((1 - methodsOver256.length/methods.length)*100).toFixed(1)}%)`);
  console.log(`     Truncated: ${methodsOver256.length} (${((methodsOver256.length/methods.length)*100).toFixed(1)}%)`);
  console.log(`\n   Context 512:`);
  console.log(`     Fitting: ${methods.length - methodsOver512.length} (${((1 - methodsOver512.length/methods.length)*100).toFixed(1)}%)`);
  console.log(`     Truncated: ${methodsOver512.length} (${((methodsOver512.length/methods.length)*100).toFixed(1)}%)`);

  if (methodsOver128.length > 0) {
    console.log(`\n   🟠 Large methods (>128 tokens / >12 lines) sample:`);
    methodsOver128
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 15)
      .forEach((e, i) => {
        console.log(`     ${i+1}. ${e.name} (${e.lines} lines → ${e.tokens} tokens)`);
      });
  }

  // Recommendation
  console.log("\n" + "=".repeat(70));
  console.log("💡 RECOMMENDATION:");
  console.log("=".repeat(70));

  const methodTruncRate128 = methodsOver128.length / methods.length;
  const methodTruncRate256 = methodsOver256.length / methods.length;
  const methodTruncRate512 = methodsOver512.length / methods.length;

  console.log(`\n   Context 128: ${(methodTruncRate128*100).toFixed(1)}% methods truncated`);
  console.log(`   Context 256: ${(methodTruncRate256*100).toFixed(1)}% methods truncated`);
  console.log(`   Context 512: ${(methodTruncRate512*100).toFixed(1)}% methods truncated`);

  if (methodTruncRate128 <= 0.02) {
    console.log("\n✅ 128 context is SUFFICIENT - less than 2% truncation.");
    console.log("   → Use fastest OpenVINO model (all-MiniLM-L6-v2, 80K tok/s)");
  } else if (methodTruncRate256 <= 0.05) {
    console.log("\n⚠️  128 context has >2% truncation, but 256 is OK.");
    console.log("   → Use 256+ context model (paraphrase-multilingual, granite-embedding)");
  } else if (methodTruncRate512 <= 0.05) {
    console.log("\n⚠️  256 context has >5% truncation, need 512.");
    console.log("   → Use 512+ context model (gte-small, snowflake-arctic)");
  } else {
    console.log("\n🔴 Many large methods (>5% truncated at 512).");
    console.log("   → Consider 8192 context or refactoring large methods.");
  }

  console.log("\n✅ Analysis complete!\n");
}

analyzeEntitySizes().catch(console.error);
