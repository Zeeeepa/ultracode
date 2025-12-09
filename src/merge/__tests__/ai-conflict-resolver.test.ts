import { describe, expect, it, spyOn } from "bun:test";
import { AIConflictResolver } from "../engine/ai-conflict-resolver.js";
import { type CodeUnit, CodeUnitType } from "../models/code-unit.js";
import {
  ConflictSeverity,
  ConflictType,
  ResolutionStrategy,
  type SemanticConflict,
} from "../models/semantic-conflict.js";

// Mock EmbeddingGenerator
class MockEmbeddingGenerator {
  async generateEmbedding(text: string): Promise<Float32Array> {
    // Generate deterministic embeddings based on text content
    const dim = 384;
    const embedding = new Float32Array(dim);

    // Create hash from text content (not just length)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % dim;
    }

    // Set values at hashed positions
    for (let i = 0; i < dim; i++) {
      // Create more variation based on text content
      const charHash = (text.charCodeAt(i % text.length) || 0) % 10;
      embedding[i] = i === hash ? 1.0 : charHash / 100;
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        const val = embedding[i];
        if (val !== undefined) {
          embedding[i] = val / norm;
        }
      }
    }

    return embedding;
  }

  async initialize() {}
  setBatchSize(_size: number) {}
}

describe("AIConflictResolver", () => {
  const createCodeUnit = (overrides: Partial<CodeUnit> = {}): CodeUnit => ({
    id: "test-id",
    type: CodeUnitType.Function,
    filePath: "test.ts",
    name: "testFunction",
    fullyQualifiedName: "test.testFunction",
    startLine: 1,
    endLine: 10,
    content: "function test() {}",
    contentHash: "hash-content",
    structuralHash: "hash-structural",
    childIds: [],
    language: "typescript",
    metadata: {},
    ...overrides,
  });

  const createConflict = (overrides: Partial<SemanticConflict> = {}): SemanticConflict => ({
    id: "conflict-1",
    type: ConflictType.OverlappingChanges,
    severity: ConflictSeverity.Medium,
    baseUnit: createCodeUnit({ contentHash: "base", content: "base code" }),
    branchAUnit: createCodeUnit({ contentHash: "a", content: "code from A" }),
    branchBUnit: createCodeUnit({ contentHash: "b", content: "code from B" }),
    description: "Test conflict",
    conflictingRegions: [],
    autoResolvable: false,
    ...overrides,
  });

  describe("analyzeConflict", () => {
    it("should detect high similarity for identical code", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      // Identical content should produce very similar embeddings
      const conflict = createConflict({
        branchAUnit: createCodeUnit({ content: "identical code here" }),
        branchBUnit: createCodeUnit({ content: "identical code here" }),
      });

      const analysis = await resolver.analyzeConflict(conflict);

      expect(analysis.similarity).toBeGreaterThan(0.8);
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });

    it("should detect medium similarity for related code", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict({
        branchAUnit: createCodeUnit({
          content: "function test() { return 1; }",
        }),
        branchBUnit: createCodeUnit({
          content: "function test() { return 2; }",
        }),
      });

      const analysis = await resolver.analyzeConflict(conflict);

      // Should detect some similarity
      expect(analysis.similarity).toBeGreaterThan(0.5);
    });

    it("should suggest TakeBranchA for high similarity with closer base", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict({
        baseUnit: createCodeUnit({ content: "base code" }),
        branchAUnit: createCodeUnit({ content: "base code with minor change" }),
        branchBUnit: createCodeUnit({ content: "base code with minor change" }),
      });

      const analysis = await resolver.analyzeConflict(conflict);

      expect([ResolutionStrategy.TakeBranchA, ResolutionStrategy.TakeBranchB]).toContain(analysis.suggestedStrategy);
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });

    it("should require manual review for low similarity", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict({
        branchAUnit: createCodeUnit({
          content: "completely different code A with lots of unique content here",
        }),
        branchBUnit: createCodeUnit({
          content: "totally unrelated code B with different implementation approach",
        }),
      });

      const analysis = await resolver.analyzeConflict(conflict);

      expect(analysis.suggestedStrategy).toBe(ResolutionStrategy.ManualReview);
      expect(analysis.confidence).toBeLessThan(0.7);
    });

    it("should handle null base unit", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict({
        baseUnit: null,
        branchAUnit: createCodeUnit({ content: "new code A" }),
        branchBUnit: createCodeUnit({ content: "new code B" }),
      });

      const analysis = await resolver.analyzeConflict(conflict);

      expect(analysis.branchADistance).toBe(0);
      expect(analysis.branchBDistance).toBe(0);
      expect(analysis.similarity).toBeGreaterThanOrEqual(0);
    });
  });

  describe("createResolution", () => {
    it("should create resolution from AI analysis", () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const analysis = {
        similarity: 0.95,
        branchADistance: 0.1,
        branchBDistance: 0.2,
        suggestedStrategy: ResolutionStrategy.TakeBranchA,
        confidence: 0.9,
        explanation: "Test explanation",
        mergedCode: "merged code",
      };

      const resolution = resolver.createResolution(analysis);

      expect(resolution.strategy).toBe(ResolutionStrategy.TakeBranchA);
      expect(resolution.confidence).toBe(0.9);
      expect(resolution.mergedCode).toBe("merged code");
      expect(resolution.explanation).toBe("Test explanation");
    });
  });

  describe("cache management", () => {
    it("should cache embeddings", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const generateSpy = spyOn(mockGen, "generateEmbedding");

      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict();

      // First call should generate embeddings
      await resolver.analyzeConflict(conflict);
      const firstCallCount = generateSpy.mock.calls.length;

      // Second call with same conflict should use cache
      await resolver.analyzeConflict(conflict);
      const secondCallCount = generateSpy.mock.calls.length;

      // Should not generate new embeddings
      expect(secondCallCount).toBe(firstCallCount);
    });

    it("should clear cache", async () => {
      const mockGen = new MockEmbeddingGenerator() as any;
      const resolver = new AIConflictResolver({
        embeddingGenerator: mockGen,
        highSimilarityThreshold: 0.9,
        mediumSimilarityThreshold: 0.7,
        lowSimilarityThreshold: 0.5,
        minConfidenceForAutoMerge: 0.8,
        minConfidenceForSuggestion: 0.6,
      });

      const conflict = createConflict();

      await resolver.analyzeConflict(conflict);

      let stats = resolver.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      resolver.clearCache();

      stats = resolver.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});
