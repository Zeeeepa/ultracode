/**
 * Chaos Analysis - Usage Examples
 *
 * Demonstrates how to use Chaos Analysis to detect and fix state management issues.
 */

import { ChaosAnalyzer } from "../src/analysis/chaos/index.js";
import type { GraphStorage } from "../src/types/storage.js";

// ===========================================================================
// Example 1: Analyze specific state identifier
// ===========================================================================

async function analyzeToken(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("🔍 Analyzing 'token' state variable...\n");

  const result = await analyzer.analyzeSingle("token", {
    scope: "project",
    maxDepth: 10,
    excludePatterns: ["**/*.spec.ts", "**/node_modules/**"],
  });

  if (!result) {
    console.log("❌ No 'token' variable found in the codebase");
    return;
  }

  // Print AI-friendly summary
  console.log("📊 Summary (AI-friendly):");
  console.log("─".repeat(60));
  console.log(analyzer.formatForAI([result]));
  console.log("\n");

  // Print detailed report
  console.log("📋 Detailed Report:");
  console.log("─".repeat(60));
  console.log(analyzer.formatDetailed(result));

  // Access metrics programmatically
  const { metrics, refactoringPlan } = result;

  if (metrics.score > 70) {
    console.log("\n⚠️ WARNING: High chaos score!");
    console.log(`   Recommended strategy: ${refactoringPlan.strategy}`);
    console.log(`   Estimated effort: ${result.summary.estimatedEffort}`);
  }
}

// ===========================================================================
// Example 2: Auto-detect all state patterns
// ===========================================================================

async function autoDetectStateProblems(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("🔍 Auto-detecting state management problems...\n");

  const results = await analyzer.analyze({
    scope: "project",
    autoDetect: true,
    maxDepth: 10,
    excludePatterns: ["**/*.spec.ts", "**/node_modules/**", "**/dist/**"],
  });

  console.log(`✅ Found ${results.length} state patterns\n`);

  // Sort by chaos score (worst first)
  const sorted = results.sort((a, b) => b.metrics.score - a.metrics.score);

  // Show top 5 most problematic
  console.log("🔥 Top 5 Most Problematic States:");
  console.log("─".repeat(60));

  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    const result = sorted[i];
    const { overview, refactoringStrategy } = result.summary;

    console.log(`${i + 1}. ${overview.stateIdentifier}`);
    console.log(`   Score: ${overview.chaosScore}/100 (${overview.divergenceRisk})`);
    console.log(`   Files: ${overview.totalFiles}, Operations: ${overview.totalOperations}`);
    console.log(`   Recommended: ${refactoringStrategy}`);
    console.log();
  }

  return sorted;
}

// ===========================================================================
// Example 3: Analyze specific module
// ===========================================================================

async function analyzeAuthModule(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("🔍 Analyzing auth module state management...\n");

  const results = await analyzer.analyze({
    scope: "module",
    stateIdentifiers: ["token", "user", "isAuthenticated", "permissions"],
    maxDepth: 8,
    excludePatterns: ["**/*.spec.ts"],
  });

  // Aggregate metrics
  let totalOperations = 0;
  let totalFiles = new Set<string>();
  let worstScore = 0;

  for (const result of results) {
    totalOperations += result.summary.overview.totalOperations;
    result.statePattern.operations.forEach(op => totalFiles.add(op.file));
    worstScore = Math.max(worstScore, result.metrics.score);
  }

  console.log("📊 Auth Module Overview:");
  console.log("─".repeat(60));
  console.log(`State variables: ${results.length}`);
  console.log(`Total operations: ${totalOperations}`);
  console.log(`Files affected: ${totalFiles.size}`);
  console.log(`Worst chaos score: ${worstScore}/100`);
  console.log();

  // Recommendations
  if (worstScore > 70) {
    console.log("⚠️ Recommendation: Extract auth state into a dedicated service");
    console.log("   Consider using NgRx or a simpler AuthStateService with BehaviorSubjects");
  } else if (worstScore > 50) {
    console.log("✅ Moderate issues detected");
    console.log("   Review the hotspots and apply quick fixes");
  } else {
    console.log("✅ Auth module state management looks healthy");
  }

  return results;
}

// ===========================================================================
// Example 4: Find critical paths (where mutations happen)
// ===========================================================================

async function findMutationHotspots(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("🔍 Finding mutation hotspots...\n");

  const results = await analyzer.analyze({
    scope: "project",
    stateIdentifiers: ["userData", "userProfile"],
    maxDepth: 10,
  });

  for (const result of results) {
    console.log(`\n📍 State: ${result.statePattern.identifier}`);
    console.log("─".repeat(60));

    const { flowMap } = result;

    // Find nodes with mutations
    const mutationNodes = flowMap.nodes.filter(n => n.hasMutation);

    console.log(`Mutation points: ${mutationNodes.length}`);

    // Group by file
    const fileGroups = new Map<string, typeof mutationNodes>();
    for (const node of mutationNodes) {
      if (!fileGroups.has(node.file)) {
        fileGroups.set(node.file, []);
      }
      fileGroups.get(node.file)!.push(node);
    }

    // Print top 3 files with most mutations
    const sorted = Array.from(fileGroups.entries()).sort((a, b) => b[1].length - a[1].length);

    console.log("\nTop files with mutations:");
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      const [file, nodes] = sorted[i];
      console.log(`  ${i + 1}. ${file} (${nodes.length} mutations)`);
      for (const node of nodes.slice(0, 2)) {
        console.log(`     - ${node.entityName} (depth: ${node.depth})`);
      }
    }
  }
}

// ===========================================================================
// Example 5: Compare before/after refactoring
// ===========================================================================

async function measureRefactoringImpact(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("📊 Measuring refactoring impact...\n");

  // Analyze current state
  const beforeResults = await analyzer.analyze({
    scope: "project",
    stateIdentifiers: ["globalConfig"],
    maxDepth: 10,
  });

  if (beforeResults.length === 0) return;

  const before = beforeResults[0];

  console.log("Before Refactoring:");
  console.log("─".repeat(60));
  console.log(`Chaos Score: ${before.metrics.score}/100`);
  console.log(`Coupling: ${before.metrics.coupling.score}/100`);
  console.log(`Mutations: ${before.metrics.mutationSpread.totalMutations}`);
  console.log(`Defensive Patterns: ${countDefensive(before.metrics.defensive)}`);
  console.log();

  // Expected improvements
  const plan = before.refactoringPlan;
  console.log("After Refactoring (Estimated):");
  console.log("─".repeat(60));
  console.log(`Strategy: ${plan.strategy}`);
  console.log(`Coupling Reduction: -${plan.benefits.reducedCoupling}%`);
  console.log(`Mutation Reduction: -${plan.benefits.reducedMutations} points`);
  console.log(`Testability: ${plan.benefits.improvedTestability ? "Improved" : "Same"}`);
  console.log();

  // Show quick wins
  if (before.summary.quickFixes.length > 0) {
    console.log("🎯 Quick Wins:");
    for (const fix of before.summary.quickFixes) {
      console.log(`  - ${fix}`);
    }
  }
}

function countDefensive(defensive: any): number {
  return (
    defensive.nullChecks +
    defensive.typeGuards +
    defensive.defaultValues +
    defensive.tryCatch +
    defensive.localCopies
  );
}

// ===========================================================================
// Example 6: Integration with Code Graph RAG
// ===========================================================================

async function integratedAnalysis(storage: GraphStorage, projectRoot: string) {
  const analyzer = new ChaosAnalyzer(storage, projectRoot);

  console.log("🔗 Integrated Chaos Analysis + Code Graph...\n");

  // Step 1: Find all services in the codebase
  const services = await storage.searchEntities({
    types: ["class"],
    namePattern: ".*Service$", // Classes ending with "Service"
  });

  console.log(`Found ${services.length} services`);

  // Step 2: For each service, analyze its state management
  for (const service of services.slice(0, 3)) {
    // Analyze top 3
    console.log(`\n📦 Analyzing ${service.name}...`);

    // Get all properties of this service
    const properties = await storage.searchEntities({
      types: ["property", "field"],
      // Filter by file path
    });

    // Analyze each property
    for (const prop of properties.filter(p => p.filePath === service.filePath).slice(0, 2)) {
      const result = await analyzer.analyzeSingle(prop.name, {
        scope: "file",
        maxDepth: 5,
      });

      if (result && result.metrics.score > 40) {
        console.log(`  ⚠️ ${prop.name}: ${result.metrics.score}/100 (${result.metrics.divergenceRisk})`);
      }
    }
  }
}

// ===========================================================================
// Main: Run all examples
// ===========================================================================

export async function runChaosAnalysisExamples(storage: GraphStorage, projectRoot: string) {
  console.log("🚀 Chaos Analysis Examples\n");
  console.log("=".repeat(60));

  try {
    await analyzeToken(storage, projectRoot);
    console.log("\n" + "=".repeat(60) + "\n");

    await autoDetectStateProblems(storage, projectRoot);
    console.log("\n" + "=".repeat(60) + "\n");

    await analyzeAuthModule(storage, projectRoot);
    console.log("\n" + "=".repeat(60) + "\n");

    await findMutationHotspots(storage, projectRoot);
    console.log("\n" + "=".repeat(60) + "\n");

    await measureRefactoringImpact(storage, projectRoot);
    console.log("\n" + "=".repeat(60) + "\n");

    await integratedAnalysis(storage, projectRoot);
  } catch (error) {
    console.error("❌ Error during analysis:", error);
    throw error;
  }

  console.log("\n✅ All examples completed!");
}
