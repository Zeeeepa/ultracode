import { cosineSimilarity } from "../../utils/simd-vector-ops.js";
import type { CodeUnit } from "../models/code-unit.js";
import type { VersionedIndex } from "../models/versioned-index.js";

/**
 * Semantic Matcher - Slow Path через vector embeddings.
 *
 * Используется для оставшихся 5-10% units после Fast Path.
 * Основан на vector similarity с GPU acceleration.
 *
 * Combined score: vector similarity (70%) + structural (30%)
 *
 * Основано на SemanticMatcher из SharpToolsMCP.
 */
export class SemanticMatcher {
  /**
   * Найти semantic match для unit в base index.
   *
   * @param targetUnit - Target unit to match (must have embedding)
   * @param baseIndex - Base version index (units must have embeddings)
   * @param threshold - Minimum similarity threshold (0.0-1.0), default 0.7
   * @returns Match result or undefined if no match above threshold
   */
  findMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex, threshold = 0.7): SemanticMatchResult | undefined {
    // Требуем embedding в target unit
    if (!targetUnit.embedding) {
      throw new Error(`Target unit ${targetUnit.id} missing embedding. Use LazyEmbeddingCache to generate.`);
    }

    // Поиск кандидатов с embeddings в base index
    const candidates = this.findCandidates(targetUnit, baseIndex);

    if (candidates.length === 0) {
      return undefined;
    }

    // Вычисляем similarity для каждого кандидата
    const similarities = candidates.map((candidate) => {
      const vectorSim = this.computeVectorSimilarity(targetUnit.embedding!, candidate.embedding!);
      const structuralSim = this.computeStructuralSimilarity(targetUnit, candidate);

      // Combined score: vector 70% + structural 30%
      const combinedScore = vectorSim * 0.7 + structuralSim * 0.3;

      return {
        candidate,
        vectorSimilarity: vectorSim,
        structuralSimilarity: structuralSim,
        combinedScore,
      };
    });

    // Сортируем по combined score (descending)
    similarities.sort((a, b) => b.combinedScore - a.combinedScore);

    // Берем лучший match выше threshold
    const best = similarities[0];
    if (!best || best.combinedScore < threshold) {
      return undefined;
    }

    return {
      baseUnitId: best.candidate.id,
      baseUnit: best.candidate,
      vectorSimilarity: best.vectorSimilarity,
      structuralSimilarity: best.structuralSimilarity,
      combinedScore: best.combinedScore,
      confidence: this.scoreToConfidence(best.combinedScore),
    };
  }

  /**
   * Bulk semantic matching для multiple units.
   *
   * @param targetUnits - Units to match (with embeddings)
   * @param baseIndex - Base index (units with embeddings)
   * @param threshold - Minimum similarity threshold
   * @returns Map of targetUnitId → Match result
   */
  bulkMatch(targetUnits: CodeUnit[], baseIndex: VersionedIndex, threshold = 0.7): Map<string, SemanticMatchResult> {
    const results = new Map<string, SemanticMatchResult>();

    for (const targetUnit of targetUnits) {
      // Skip units without embeddings
      if (!targetUnit.embedding) {
        continue;
      }

      const match = this.findMatch(targetUnit, baseIndex, threshold);
      if (match) {
        results.set(targetUnit.id, match);
      }
    }

    return results;
  }

  /**
   * Найти кандидатов в base index (units с embeddings того же типа).
   */
  private findCandidates(targetUnit: CodeUnit, baseIndex: VersionedIndex): CodeUnit[] {
    const candidates: CodeUnit[] = [];

    // Фильтруем по типу и наличию embedding
    for (const [, baseUnit] of baseIndex.units) {
      if (baseUnit.type === targetUnit.type && baseUnit.embedding) {
        candidates.push(baseUnit);
      }
    }

    return candidates;
  }

  /**
   * Вычислить vector similarity с GPU acceleration.
   *
   * Использует SIMD/WASM cosine similarity.
   */
  private computeVectorSimilarity(embedding1: Float32Array, embedding2: Float32Array): number {
    // Используем SIMD-optimized cosine similarity
    return cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Вычислить structural similarity (based on hashes).
   *
   * Простая метрика: совпадает structuralHash = 1.0, иначе 0.0
   * (можно улучшить используя edit distance)
   */
  private computeStructuralSimilarity(unit1: CodeUnit, unit2: CodeUnit): number {
    // Exact structural match
    if (unit1.structuralHash === unit2.structuralHash) {
      return 1.0;
    }

    // Different structure
    return 0.0;
  }

  /**
   * Конвертировать combined score в confidence (0.0-1.0).
   *
   * Mapping:
   * - 0.9-1.0 → 0.9-1.0 (very high confidence)
   * - 0.8-0.9 → 0.75-0.9 (high confidence)
   * - 0.7-0.8 → 0.6-0.75 (medium confidence)
   */
  private scoreToConfidence(score: number): number {
    if (score >= 0.9) {
      // Map [0.9, 1.0] → [0.9, 1.0]
      return score;
    }
    if (score >= 0.8) {
      // Map [0.8, 0.9] → [0.75, 0.9]
      return 0.75 + (score - 0.8) * 1.5;
    }
    // Map [0.7, 0.8] → [0.6, 0.75]
    return 0.6 + (score - 0.7) * 1.5;
  }

  /**
   * Вычислить статистику Semantic Path.
   */
  computeStatistics(matchResults: Map<string, SemanticMatchResult>, totalUnits: number): SemanticMatchStatistics {
    const totalMatched = matchResults.size;
    const coverage = totalUnits > 0 ? totalMatched / totalUnits : 0;

    // Compute average scores
    let sumVector = 0;
    let sumStructural = 0;
    let sumCombined = 0;

    for (const result of matchResults.values()) {
      sumVector += result.vectorSimilarity;
      sumStructural += result.structuralSimilarity;
      sumCombined += result.combinedScore;
    }

    const count = totalMatched || 1; // Avoid division by zero

    return {
      totalUnits,
      totalMatched,
      coverage,
      avgVectorSimilarity: sumVector / count,
      avgStructuralSimilarity: sumStructural / count,
      avgCombinedScore: sumCombined / count,
    };
  }
}

/**
 * Результат Semantic matching.
 */
export interface SemanticMatchResult {
  baseUnitId: string; // ID matched unit in base
  baseUnit: CodeUnit; // Full matched unit
  vectorSimilarity: number; // Cosine similarity (0.0-1.0)
  structuralSimilarity: number; // Structural hash similarity (0.0-1.0)
  combinedScore: number; // Weighted score (0.0-1.0)
  confidence: number; // Confidence (0.0-1.0)
}

/**
 * Статистика Semantic matching.
 */
export interface SemanticMatchStatistics {
  totalUnits: number; // Total units to match
  totalMatched: number; // Successfully matched
  coverage: number; // Match rate (0.0-1.0)
  avgVectorSimilarity: number; // Average vector similarity
  avgStructuralSimilarity: number; // Average structural similarity
  avgCombinedScore: number; // Average combined score
}
