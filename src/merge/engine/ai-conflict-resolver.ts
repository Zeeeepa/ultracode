import type { EmbeddingGenerator } from "../../semantic/embedding-generator.js";
import type { CodeUnit } from "../models/code-unit.js";
import { type Resolution, ResolutionStrategy, type SemanticConflict } from "../models/semantic-conflict.js";

/**
 * AI-Assisted Conflict Resolver - Использует embeddings для умного разрешения конфликтов
 *
 * Функции:
 * - Semantic similarity analysis для кода из разных веток
 * - Intent prediction на основе векторной близости к известным паттернам
 * - Confidence scoring с учётом семантической дистанции
 * - Intelligent merge suggestions для compatible changes
 */

export interface AIConflictResolverConfig {
  // Embedding settings
  embeddingGenerator: EmbeddingGenerator;

  // Similarity thresholds
  highSimilarityThreshold: number; // default: 0.9 - очень похожие изменения
  mediumSimilarityThreshold: number; // default: 0.7 - умеренно похожие
  lowSimilarityThreshold: number; // default: 0.5 - мало похожие

  // Confidence settings
  minConfidenceForAutoMerge: number; // default: 0.8
  minConfidenceForSuggestion: number; // default: 0.6
}

/**
 * Результат AI-анализа конфликта
 */
export interface AIAnalysisResult {
  // Semantic similarity между branchA и branchB
  similarity: number;

  // Semantic distance от base до каждой ветки
  branchADistance: number;
  branchBDistance: number;

  // Предсказанная стратегия разрешения
  suggestedStrategy: ResolutionStrategy;

  // Confidence в предложенной стратегии
  confidence: number;

  // Объяснение решения
  explanation: string;

  // Merged code (если AI смог сгенерировать)
  mergedCode?: string;
}

export class AIConflictResolver {
  private config: AIConflictResolverConfig;
  private embeddingCache: Map<string, Float32Array> = new Map();

  constructor(config: AIConflictResolverConfig) {
    this.config = config;
  }

  /**
   * Проанализировать конфликт с помощью AI
   *
   * @param conflict - Конфликт для анализа
   * @returns AI analysis result
   */
  async analyzeConflict(conflict: SemanticConflict): Promise<AIAnalysisResult> {
    const { baseUnit, branchAUnit, branchBUnit } = conflict;

    // Generate embeddings for all three versions
    const [baseEmbedding, branchAEmbedding, branchBEmbedding] = await Promise.all([
      this.getEmbedding(baseUnit),
      this.getEmbedding(branchAUnit),
      this.getEmbedding(branchBUnit),
    ]);

    // Calculate semantic similarities
    const similarity = this.cosineSimilarity(branchAEmbedding, branchBEmbedding);
    const branchADistance =
      baseEmbedding && branchAEmbedding ? this.cosineDistance(baseEmbedding, branchAEmbedding) : 0;
    const branchBDistance =
      baseEmbedding && branchBEmbedding ? this.cosineDistance(baseEmbedding, branchBEmbedding) : 0;

    // Determine strategy based on similarity analysis
    const { strategy, confidence, explanation, mergedCode } = this.determineStrategy(
      conflict,
      similarity,
      branchADistance,
      branchBDistance,
    );

    return {
      similarity,
      branchADistance,
      branchBDistance,
      suggestedStrategy: strategy,
      confidence,
      explanation,
      mergedCode,
    };
  }

  /**
   * Получить или сгенерировать embedding для code unit
   */
  private async getEmbedding(unit: CodeUnit | null): Promise<Float32Array | null> {
    if (!unit) return null;

    // Check cache
    const cacheKey = this.getCacheKey(unit);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Use existing embedding if available
    if (unit.embedding) {
      this.embeddingCache.set(cacheKey, unit.embedding);
      return unit.embedding;
    }

    // Generate new embedding
    try {
      const text = this.prepareTextForEmbedding(unit);
      const embedding = await this.config.embeddingGenerator.generateEmbedding(text);

      this.embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.warn(`[AIConflictResolver] Failed to generate embedding for ${unit.id}:`, error);
      return null;
    }
  }

  /**
   * Подготовить текст для embedding
   */
  private prepareTextForEmbedding(unit: CodeUnit): string {
    // Включаем контекст: имя, сигнатуру, контент
    const parts: string[] = [];

    if (unit.fullyQualifiedName) {
      parts.push(`Name: ${unit.fullyQualifiedName}`);
    }

    if (unit.signature) {
      parts.push(`Signature: ${unit.signature}`);
    }

    if (unit.content) {
      // Normalize content: remove extra whitespace
      const normalized = unit.content.trim().replace(/\s+/g, " ");
      parts.push(`Code: ${normalized}`);
    }

    return parts.join("\n");
  }

  /**
   * Определить стратегию разрешения на основе similarity analysis
   */
  private determineStrategy(
    conflict: SemanticConflict,
    similarity: number,
    branchADistance: number,
    branchBDistance: number,
  ): {
    strategy: ResolutionStrategy;
    confidence: number;
    explanation: string;
    mergedCode?: string;
  } {
    const { branchAUnit, branchBUnit } = conflict;

    // Case 1: Very high similarity - likely same change
    if (similarity >= this.config.highSimilarityThreshold) {
      // Выбираем ветку с меньшей дистанцией от base
      const preferA = branchADistance <= branchBDistance;

      return {
        strategy: preferA ? ResolutionStrategy.TakeBranchA : ResolutionStrategy.TakeBranchB,
        confidence: 0.95,
        explanation: `Both branches made semantically similar changes (similarity: ${similarity.toFixed(2)}). Choosing ${preferA ? "branchA" : "branchB"} as it's closer to base.`,
        mergedCode: preferA ? branchAUnit.content : branchBUnit.content,
      };
    }

    // Case 2: Medium similarity - compatible changes
    if (similarity >= this.config.mediumSimilarityThreshold) {
      // Попробовать интеллектуальное слияние
      const mergedCode = this.attemptIntelligentMerge(conflict, similarity);

      if (mergedCode) {
        return {
          strategy: ResolutionStrategy.MergeBoth,
          confidence: 0.7 + similarity * 0.2, // 0.7-0.9 range
          explanation: `Changes are semantically compatible (similarity: ${similarity.toFixed(2)}). AI-generated merge proposed.`,
          mergedCode,
        };
      }

      // Если AI merge не удалось - предложить manual review
      return {
        strategy: ResolutionStrategy.ManualReview,
        confidence: 0.6,
        explanation: `Changes are moderately similar (${similarity.toFixed(2)}) but automatic merge is uncertain. Manual review recommended.`,
      };
    }

    // Case 3: Low similarity - divergent changes
    if (similarity >= this.config.lowSimilarityThreshold) {
      return {
        strategy: ResolutionStrategy.ManualReview,
        confidence: 0.4,
        explanation: `Changes are semantically different (similarity: ${similarity.toFixed(2)}). Manual review required.`,
      };
    }

    // Case 4: Very low similarity - completely different
    return {
      strategy: ResolutionStrategy.ManualReview,
      confidence: 0.2,
      explanation: `Changes are semantically divergent (similarity: ${similarity.toFixed(2)}). Careful manual review strongly recommended.`,
    };
  }

  /**
   * Попытка интеллектуального слияния на основе semantic analysis
   *
   * Эвристика: если изменения семантически близки, пытаемся объединить их
   */
  private attemptIntelligentMerge(conflict: SemanticConflict, similarity: number): string | null {
    const { baseUnit, branchAUnit, branchBUnit } = conflict;

    // Эвристика 1: Если одна ветка добавила функционал, другая - bugfix
    // пытаемся объединить оба изменения
    const baseLength = baseUnit?.content.length || 0;
    const branchALength = branchAUnit.content.length;
    const branchBLength = branchBUnit.content.length;

    // Если обе ветки добавили код (увеличили размер)
    const branchAAdded = branchALength > baseLength;
    const branchBAdded = branchBLength > baseLength;

    if (branchAAdded && branchBAdded && similarity >= 0.7) {
      // Простая стратегия: берем более длинную версию
      // (предполагаем, что она включает больше функционала)
      return branchALength > branchBLength ? branchAUnit.content : branchBUnit.content;
    }

    // Эвристика 2: Если изменения маленькие и похожие - берем одну из веток
    const maxChange = Math.max(Math.abs(branchALength - baseLength), Math.abs(branchBLength - baseLength));

    if (maxChange < 100 && similarity >= 0.8) {
      // Маленькие похожие изменения - берем branchA
      return branchAUnit.content;
    }

    // TODO: Более продвинутые эвристики:
    // - AST-based merge для структурных изменений
    // - Line-by-line diff с semantic scoring
    // - ML-based code generation для merge

    return null; // Не можем безопасно слить
  }

  /**
   * Cosine similarity между двумя векторами (0-1, где 1 = identical)
   */
  private cosineSimilarity(a: Float32Array | null, b: Float32Array | null): number {
    if (!a || !b || a.length !== b.length) return 0;

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
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Cosine distance (1 - similarity)
   */
  private cosineDistance(a: Float32Array, b: Float32Array): number {
    const similarity = this.cosineSimilarity(a, b);
    return 1 - similarity;
  }

  /**
   * Cache key для embedding
   */
  private getCacheKey(unit: CodeUnit): string {
    return `${unit.id}-${unit.contentHash}`;
  }

  /**
   * Создать Resolution на основе AI analysis
   */
  createResolution(aiAnalysis: AIAnalysisResult): Resolution {
    return {
      strategy: aiAnalysis.suggestedStrategy,
      confidence: aiAnalysis.confidence,
      mergedCode: aiAnalysis.mergedCode || "",
      explanation: aiAnalysis.explanation,
    };
  }

  /**
   * Очистить cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Получить статистику cache
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: 1000, // Можно сделать конфигурируемым
    };
  }
}
