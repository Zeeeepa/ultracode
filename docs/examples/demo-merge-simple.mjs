#!/usr/bin/env node
/**
 * Simplified Semantic Merge Demo
 *
 * Analyzes merge between master and master-beta in fabuza-front
 * Shows: Fast Path (hash) vs Semantic (embedding) matching
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const PROJECT_PATH = "D:\\fabuza-front";
const BRANCH_A = "master";
const BRANCH_B = "master-beta";

// Performance metrics
const metrics = {
  startTime: Date.now(),
  totalFiles: 0,
  fastPathMatches: 0, // Identical hashes
  modifiedInBoth: 0, // Modified in both branches (potential conflicts)
  modifiedInOne: 0, // Modified in only one branch
  addedFiles: 0,
  deletedFiles: 0,
  renamedFiles: 0,
};

// Utilities
function exec(cmd) {
  try {
    return execSync(cmd, {
      cwd: PROJECT_PATH,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (_error) {
    return "";
  }
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function getFileContent(path, branch) {
  try {
    return exec(`git show ${branch}:${path}`);
  } catch {
    return null;
  }
}

// Get merge base
console.log("🔍 Finding merge base...");
const mergeBase = exec(`git merge-base ${BRANCH_A} ${BRANCH_B}`);
console.log(`📍 Merge base: ${mergeBase.slice(0, 8)}\n`);

// Get the list of changed files
console.log("📊 Analyzing changed files...");

// Files changed in branch A (from base to master)
const filesA = exec(`git diff --name-status ${mergeBase} ${BRANCH_A}`).split("\n").filter(Boolean);

// Files changed in branch B (from base to master-beta)
const filesB = exec(`git diff --name-status ${mergeBase} ${BRANCH_B}`).split("\n").filter(Boolean);

// Parse changes
const changesA = new Map();
const changesB = new Map();

filesA.forEach((line) => {
  const [status, path] = line.split("\t");
  changesA.set(path, status);
});

filesB.forEach((line) => {
  const [status, path] = line.split("\t");
  changesB.set(path, status);
});

console.log(`✅ Branch A (${BRANCH_A}): ${changesA.size} files changed`);
console.log(`✅ Branch B (${BRANCH_B}): ${changesB.size} files changed\n`);

// Intersection analysis
console.log("⚡ Fast Path Analysis (hash-based)...\n");

// Set of all files
const allFiles = new Set([...changesA.keys(), ...changesB.keys()]);
metrics.totalFiles = allFiles.size;

const fastPathResults = [];
const semanticCandidates = [];

for (const file of allFiles) {
  const statusA = changesA.get(file);
  const statusB = changesB.get(file);

  // Only TS/TSX/JS/JSX files for analysis
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) {
    continue;
  }

  if (statusA && statusB) {
    // Changed in both branches
    if (statusA === "M" && statusB === "M") {
      // Both modified - check hashes
      const contentBase = getFileContent(file, mergeBase);
      const contentA = getFileContent(file, BRANCH_A);
      const contentB = getFileContent(file, BRANCH_B);

      if (!contentBase || !contentA || !contentB) {
        continue;
      }

      const _hashBase = hashContent(contentBase);
      const hashA = hashContent(contentA);
      const hashB = hashContent(contentB);

      if (hashA === hashB) {
        // Identical changes
        metrics.fastPathMatches++;
        fastPathResults.push({
          file,
          type: "identical",
          hashA,
          hashB,
        });
      } else {
        // Different changes - need semantic analysis
        metrics.modifiedInBoth++;
        semanticCandidates.push({
          file,
          sizeA: contentA.length,
          sizeB: contentB.length,
          sizeBase: contentBase.length,
          hashA,
          hashB,
        });
      }
    } else {
      // Different operations (add/delete/rename)
      metrics.modifiedInBoth++;
    }
  } else if (statusA || statusB) {
    // Changed in only one branch - automatic merge
    metrics.modifiedInOne++;
  }

  // Count operations
  if (statusA === "A" || statusB === "A") metrics.addedFiles++;
  if (statusA === "D" || statusB === "D") metrics.deletedFiles++;
  if (statusA?.startsWith("R") || statusB?.startsWith("R")) metrics.renamedFiles++;
}

console.log("📈 Fast Path Results:");
console.log(`   Identical changes (hash match): ${metrics.fastPathMatches}`);
console.log(`   Modified in both (need analysis): ${metrics.modifiedInBoth}`);
console.log(`   Modified in one (auto-merge): ${metrics.modifiedInOne}`);
console.log(`   Added files: ${metrics.addedFiles}`);
console.log(`   Deleted files: ${metrics.deletedFiles}`);
console.log(`   Renamed files: ${metrics.renamedFiles}\n`);

// Semantic analysis candidates
console.log("🧠 Semantic Analysis Candidates:");
console.log(`   Files requiring embedding analysis: ${semanticCandidates.length}\n`);

// Top 10 files by change size
if (semanticCandidates.length > 0) {
  console.log("📋 Top 10 files with largest changes:");

  const sorted = semanticCandidates
    .sort((a, b) => {
      const diffA = Math.abs(a.sizeA - a.sizeBase) + Math.abs(a.sizeB - a.sizeBase);
      const diffB = Math.abs(b.sizeA - b.sizeBase) + Math.abs(b.sizeB - b.sizeBase);
      return diffB - diffA;
    })
    .slice(0, 10);

  sorted.forEach((item, i) => {
    const diffA = (((item.sizeA - item.sizeBase) / item.sizeBase) * 100).toFixed(1);
    const diffB = (((item.sizeB - item.sizeBase) / item.sizeBase) * 100).toFixed(1);
    console.log(`   ${i + 1}. ${item.file}`);
    console.log(`      Branch A: ${diffA > 0 ? "+" : ""}${diffA}%, Branch B: ${diffB > 0 ? "+" : ""}${diffB}%`);
  });
  console.log();
}

// Generate final report
const totalTime = (Date.now() - metrics.startTime) / 1000;

console.log("=".repeat(60));
console.log("📊 SEMANTIC MERGE ANALYSIS REPORT");
console.log(`${"=".repeat(60)}\n`);

console.log(`📦 Project: ${PROJECT_PATH}`);
console.log(`🌿 Merge: ${BRANCH_A} → ${BRANCH_B}`);
console.log(`📍 Merge base: ${mergeBase.slice(0, 8)}\n`);

console.log("⏱️  Performance:");
console.log(`   Analysis time: ${totalTime.toFixed(2)}s\n`);

console.log("📈 File Statistics:");
console.log(`   Total files analyzed: ${metrics.totalFiles}`);
console.log(`   TS/TSX/JS/JSX files: ${fastPathResults.length + semanticCandidates.length}\n`);

const fastPathPercent = (metrics.fastPathMatches / (metrics.fastPathMatches + metrics.modifiedInBoth)) * 100 || 0;
const semanticPercent = (metrics.modifiedInBoth / (metrics.fastPathMatches + metrics.modifiedInBoth)) * 100 || 0;

console.log("🎯 Matching Strategy:");
console.log(`   Fast Path (hash match): ${metrics.fastPathMatches} files (${fastPathPercent.toFixed(1)}%)`);
console.log(`   Semantic (embedding needed): ${metrics.modifiedInBoth} files (${semanticPercent.toFixed(1)}%)`);
console.log(`   Auto-merge (one branch): ${metrics.modifiedInOne} files\n`);

console.log("💡 Recommendations:");
if (semanticPercent < 20) {
  console.log(`   ✅ Excellent! Only ${semanticPercent.toFixed(1)}% of files need semantic analysis.`);
  console.log(`   ✅ Fast Path matching is very efficient for this merge.`);
} else if (semanticPercent < 50) {
  console.log(`   ⚠️  Moderate: ${semanticPercent.toFixed(1)}% of files need semantic analysis.`);
  console.log(`   💡 Consider using embedding-based matching for better accuracy.`);
} else {
  console.log(`   ❌ High divergence: ${semanticPercent.toFixed(1)}% of files need semantic analysis.`);
  console.log(`   🚀 Semantic merge with embeddings highly recommended.`);
}
console.log();

console.log("🔮 Estimated Embedding Cost:");
const estimatedEmbeddingTime = semanticCandidates.length * 0.05; // ~50ms per file
console.log(`   Files to embed: ${semanticCandidates.length}`);
console.log(`   Estimated time: ${estimatedEmbeddingTime.toFixed(1)}s (with caching)`);
console.log(`   Provider: memory/transformers (local)` + "\n");

console.log("=".repeat(60));
