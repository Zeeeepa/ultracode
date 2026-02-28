#!/usr/bin/env node

/**
 * Semantic Merge Demo - Merge analysis between master and master-beta in fabuza-front
 *
 * Demonstrates:
 * - Fast Path matching (by hashes)
 * - Semantic matching (by embeddings)
 * - Intent classification
 * - Conflict detection
 * - AI-assisted resolution
 */

import { createHash } from "node:crypto";
import { BranchManager } from "../../src/core/branch-manager.js";
import { ConflictDetector } from "../../src/merge/analysis/conflict-detector.js";
import { IntentClassifier } from "../../src/merge/analysis/intent-classifier.js";
import { AIConflictResolver } from "../../src/merge/engine/ai-conflict-resolver.js";
import { ConflictResolver } from "../../src/merge/engine/conflict-resolver.js";
import { GitIntegration } from "../../src/merge/integration/git-integration.js";
import { type CodeUnit, CodeUnitType } from "../../src/merge/models/code-unit.js";
import { EmbeddingGenerator } from "../../src/semantic/embedding-generator.js";

// Performance tracking
interface MergeMetrics {
  startTime: number;
  endTime?: number;
  totalFiles: number;
  fastPathMatches: number;
  semanticMatches: number;
  unmatchedUnits: number;
  conflictsDetected: number;
  aiResolved: number;
  manualReviewRequired: number;
  embeddingGenerationTime: number;
  matchingTime: number;
  conflictDetectionTime: number;
}

class SemanticMergeDemo {
  private projectPath: string;
  private branchA: string;
  private branchB: string;
  private metrics: MergeMetrics;

  private branchManager: BranchManager;
  private gitIntegration: GitIntegration;
  private embeddingGen: EmbeddingGenerator;
  private aiResolver: AIConflictResolver;
  private conflictResolver: ConflictResolver;
  private _intentClassifier: IntentClassifier;
  private conflictDetector: ConflictDetector;

  constructor(projectPath: string, branchA: string, branchB: string) {
    this.projectPath = projectPath;
    this.branchA = branchA;
    this.branchB = branchB;

    this.metrics = {
      startTime: Date.now(),
      totalFiles: 0,
      fastPathMatches: 0,
      semanticMatches: 0,
      unmatchedUnits: 0,
      conflictsDetected: 0,
      aiResolved: 0,
      manualReviewRequired: 0,
      embeddingGenerationTime: 0,
      matchingTime: 0,
      conflictDetectionTime: 0,
    };

    // Initialize components
    this.branchManager = new BranchManager({
      dbPath: "./vectors.db",
      workingDirectory: projectPath,
    });

    this.gitIntegration = new GitIntegration(projectPath);

    this.embeddingGen = new EmbeddingGenerator({
      modelName: "Xenova/all-MiniLM-L6-v2",
      quantized: true,
      batchSize: 16,
      provider: "memory", // Use memory for a quick demo
    });

    this.aiResolver = new AIConflictResolver({
      embeddingGenerator: this.embeddingGen,
      highSimilarityThreshold: 0.9,
      mediumSimilarityThreshold: 0.7,
      lowSimilarityThreshold: 0.5,
      minConfidenceForAutoMerge: 0.8,
      minConfidenceForSuggestion: 0.6,
    });

    this.conflictResolver = new ConflictResolver({
      aiEnabled: true,
      aiResolver: this.aiResolver,
      minConfidenceThreshold: 0.7,
    });

    this.intentClassifier = new IntentClassifier();
    this.conflictDetector = new ConflictDetector();
  }

  async initialize() {
    console.log("🚀 Initializing Semantic Merge Demo...");
    await this.embeddingGen.initialize();
    await this.branchManager.initialize();
    console.log("✅ Initialization complete\n");
  }

  /**
   * Simple file indexing (mock for demo)
   */
  async indexBranch(branch: string): Promise<Map<string, CodeUnit>> {
    console.log(`📚 Indexing branch: ${branch}`);

    const files = await this.gitIntegration.getChangedFiles("HEAD", branch);
    const units = new Map<string, CodeUnit>();

    // For demo: create mock CodeUnits based on files
    for (const file of files.slice(0, 50)) {
      // Limit to 50 files for demo
      const content = await this.gitIntegration.getFileContent(file, branch);

      const unit: CodeUnit = {
        id: this.generateId(file, branch),
        type: this.getUnitType(file),
        filePath: file,
        name: file.split("/").pop() || file,
        fullyQualifiedName: file,
        startLine: 1,
        endLine: content.split("\n").length,
        content,
        contentHash: this.hashContent(content),
        structuralHash: this.hashContent(content.replace(/\s+/g, "")),
        childIds: [],
        language: this.detectLanguage(file),
        metadata: { branch },
      };

      units.set(unit.id, unit);
    }

    console.log(`✅ Indexed ${units.size} units from ${branch}\n`);
    this.metrics.totalFiles = Math.max(this.metrics.totalFiles, units.size);

    return units;
  }

  /**
   * Fast Path matching - by hashes
   */
  async fastPathMatch(
    baseUnits: Map<string, CodeUnit>,
    branchAUnits: Map<string, CodeUnit>,
    branchBUnits: Map<string, CodeUnit>,
  ): Promise<{
    matched: Array<{ baseUnit: CodeUnit; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>;
    unmatchedA: CodeUnit[];
    unmatchedB: CodeUnit[];
  }> {
    console.log("⚡ Fast Path Matching (hash-based)...");
    const startTime = Date.now();

    const matched: Array<{
      baseUnit: CodeUnit;
      branchAUnit: CodeUnit;
      branchBUnit: CodeUnit;
    }> = [];
    const unmatchedA: CodeUnit[] = [];
    const unmatchedB: CodeUnit[] = [];

    const baseByPath = new Map(Array.from(baseUnits.values()).map((u) => [u.filePath, u]));
    const branchAByPath = new Map(Array.from(branchAUnits.values()).map((u) => [u.filePath, u]));
    const branchBByPath = new Map(Array.from(branchBUnits.values()).map((u) => [u.filePath, u]));

    // Match by file path and content hash
    for (const [path, branchAUnit] of branchAByPath) {
      const baseUnit = baseByPath.get(path);
      const branchBUnit = branchBByPath.get(path);

      if (baseUnit && branchBUnit) {
        matched.push({ baseUnit, branchAUnit, branchBUnit });
        this.metrics.fastPathMatches++;
      } else {
        unmatchedA.push(branchAUnit);
      }
    }

    // Find unmatched in branchB
    for (const [path, branchBUnit] of branchBByPath) {
      if (!branchAByPath.has(path)) {
        unmatchedB.push(branchBUnit);
      }
    }

    this.metrics.matchingTime += Date.now() - startTime;
    console.log(`✅ Fast Path: ${matched.length} matches, ${unmatchedA.length + unmatchedB.length} unmatched\n`);

    return { matched, unmatchedA, unmatchedB };
  }

  /**
   * Semantic matching - by embeddings
   */
  async semanticMatch(
    unmatchedA: CodeUnit[],
    unmatchedB: CodeUnit[],
  ): Promise<Array<{ unitA: CodeUnit; unitB: CodeUnit; similarity: number }>> {
    console.log("🧠 Semantic Matching (embedding-based)...");
    const startTime = Date.now();

    if (unmatchedA.length === 0 || unmatchedB.length === 0) {
      console.log("⚠️ No unmatched units for semantic matching\n");
      return [];
    }

    const matches: Array<{ unitA: CodeUnit; unitB: CodeUnit; similarity: number }> = [];

    // Generate embeddings for unmatched units
    console.log(`📊 Generating embeddings for ${unmatchedA.length + unmatchedB.length} units...`);
    const embeddingStartTime = Date.now();

    for (const unit of unmatchedA.slice(0, 10)) {
      // Limit for demo
      const embeddingA = await this.embeddingGen.generateEmbedding(unit.content);

      let bestMatch: { unitB: CodeUnit; similarity: number } | null = null;

      for (const unitB of unmatchedB.slice(0, 10)) {
        const embeddingB = await this.embeddingGen.generateEmbedding(unitB.content);
        const similarity = this.cosineSimilarity(embeddingA, embeddingB);

        if (similarity > 0.7 && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { unitB, similarity };
        }
      }

      if (bestMatch) {
        matches.push({ unitA: unit, unitB: bestMatch.unitB, similarity: bestMatch.similarity });
        this.metrics.semanticMatches++;
      }
    }

    this.metrics.embeddingGenerationTime = Date.now() - embeddingStartTime;
    this.metrics.matchingTime += Date.now() - startTime;

    console.log(`✅ Semantic: ${matches.length} matches found\n`);
    return matches;
  }

  /**
   * Conflict analysis
   */
  async analyzeConflicts(matches: Array<{ baseUnit: CodeUnit; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>) {
    console.log("🔍 Analyzing conflicts...");
    const startTime = Date.now();

    const conflicts = [];

    for (const match of matches.slice(0, 20)) {
      // Limit for demo
      const conflict = this.conflictDetector.detectConflict(match.baseUnit, match.branchAUnit, match.branchBUnit);

      if (conflict) {
        conflicts.push(conflict);
        this.metrics.conflictsDetected++;

        // Try AI resolution
        try {
          const resolution = await this.conflictResolver.resolveConflict(conflict);

          if (resolution.confidence >= 0.7) {
            this.metrics.aiResolved++;
          } else {
            this.metrics.manualReviewRequired++;
          }
        } catch {
          this.metrics.manualReviewRequired++;
        }
      }
    }

    this.metrics.conflictDetectionTime = Date.now() - startTime;
    console.log(`✅ Found ${conflicts.length} conflicts\n`);

    return conflicts;
  }

  /**
   * Run full analysis
   */
  async run() {
    try {
      await this.initialize();

      console.log("=".repeat(60));
      console.log(`📦 Project: ${this.projectPath}`);
      console.log(`🌿 Merge: ${this.branchA} → ${this.branchB}`);
      console.log(`${"=".repeat(60)}\n`);

      // Get merge base
      const mergeBase = await this.gitIntegration.getMergeBase(this.branchA, this.branchB);
      console.log(`📍 Merge base: ${mergeBase}\n`);

      // Index branches (simplified for demo)
      const baseUnits = await this.indexBranch(mergeBase);
      const branchAUnits = await this.indexBranch(this.branchA);
      const branchBUnits = await this.indexBranch(this.branchB);

      // Fast Path matching
      const { matched, unmatchedA, unmatchedB } = await this.fastPathMatch(baseUnits, branchAUnits, branchBUnits);

      this.metrics.unmatchedUnits = unmatchedA.length + unmatchedB.length;

      // Semantic matching
      const _semanticMatches = await this.semanticMatch(unmatchedA, unmatchedB);

      // Conflict analysis
      await this.analyzeConflicts(matched);

      // Generate report
      this.metrics.endTime = Date.now();
      this.generateReport();
    } catch (error) {
      console.error("❌ Error during merge analysis:", error);
      throw error;
    }
  }

  /**
   * Report generation
   */
  generateReport() {
    const totalTime = (this.metrics.endTime! - this.metrics.startTime) / 1000;

    console.log("\n" + "=".repeat(60));
    console.log("📊 SEMANTIC MERGE REPORT");
    console.log("=".repeat(60) + "\n");

    console.log("⏱️  Performance:");
    console.log(`   Total time: ${totalTime.toFixed(2)}s`);
    console.log(`   Matching time: ${(this.metrics.matchingTime / 1000).toFixed(2)}s`);
    console.log(`   Embedding generation: ${(this.metrics.embeddingGenerationTime / 1000).toFixed(2)}s`);
    console.log(`   Conflict detection: ${(this.metrics.conflictDetectionTime / 1000).toFixed(2)}s\n`);

    console.log("📈 Matching Statistics:");
    console.log(`   Total files analyzed: ${this.metrics.totalFiles}`);
    console.log(`   Fast Path matches (hash): ${this.metrics.fastPathMatches}`);
    console.log(`   Semantic matches (embedding): ${this.metrics.semanticMatches}`);
    console.log(`   Unmatched units: ${this.metrics.unmatchedUnits}\n`);

    const fastPathPercent = (this.metrics.fastPathMatches / this.metrics.totalFiles) * 100 || 0;
    const semanticPercent = (this.metrics.semanticMatches / this.metrics.totalFiles) * 100 || 0;

    console.log("🎯 Efficiency:");
    console.log(`   Fast Path coverage: ${fastPathPercent.toFixed(1)}%`);
    console.log(`   Semantic coverage: ${semanticPercent.toFixed(1)}%\n`);

    console.log("⚠️  Conflicts:");
    console.log(`   Total conflicts: ${this.metrics.conflictsDetected}`);
    console.log(`   AI-resolved: ${this.metrics.aiResolved}`);
    console.log(`   Manual review required: ${this.metrics.manualReviewRequired}\n`);

    if (this.metrics.conflictsDetected > 0) {
      const aiSuccessRate = (this.metrics.aiResolved / this.metrics.conflictsDetected) * 100;
      console.log(`💡 AI Resolution Success Rate: ${aiSuccessRate.toFixed(1)}%\n`);
    }

    console.log("=".repeat(60));
  }

  // Helper methods

  private generateId(path: string, branch: string): string {
    return createHash("sha256").update(`${path}:${branch}`).digest("hex").slice(0, 16);
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private getUnitType(file: string): CodeUnitType {
    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      return CodeUnitType.File;
    }
    return CodeUnitType.File;
  }

  private detectLanguage(file: string): string {
    if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
    if (file.endsWith(".js") || file.endsWith(".jsx")) return "javascript";
    return "unknown";
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// Run demo
const demo = new SemanticMergeDemo("D:\\fabuza-front", "master", "master-beta");

demo.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
