import type { CodeUnit } from "../models/code-unit.js";
import type { VersionedIndex } from "../models/versioned-index.js";

/**
 * Fast Path Matcher - O(1) matching через hash/signature lookups.
 *
 * 4 уровня matching (от самого строгого к самому слабому):
 * 1. Exact Content Match (contentHash) - 50-60% coverage
 * 2. Structural Match (structuralHash) - 25-30% coverage
 * 3. Signature Match (FQN + params) - 5-10% coverage
 * 4. ID Match (stable ID) - 5% coverage
 *
 * Total Fast Path coverage: ~90-95%
 *
 * Основано на FastPathMatcher из SharpToolsMCP.
 */
export class FastPathMatcher {
  /**
   * Выполнить bulk matching между двумя индексами.
   *
   * @param baseIndex - Base version index
   * @param targetIndex - Target version index (branchA or branchB)
   * @returns Map of targetUnitId → Match result
   */
  bulkMatch(baseIndex: VersionedIndex, targetIndex: VersionedIndex): Map<string, FastPathMatchResult> {
    const results = new Map<string, FastPathMatchResult>();

    // Try to match each unit in target index against base
    for (const [targetId, targetUnit] of targetIndex.units) {
      const match = this.findMatch(targetUnit, baseIndex);

      if (match) {
        results.set(targetId, match);
      }
    }

    return results;
  }

  /**
   * Найти match для одного unit в base index.
   *
   * Tries levels in order: Exact → Structural → Signature → ID
   */
  findMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex): FastPathMatchResult | undefined {
    // Level 1: Exact Content Match (highest confidence)
    const exactMatch = this.tryExactMatch(targetUnit, baseIndex);
    if (exactMatch) {
      return {
        baseUnitId: exactMatch.id,
        baseUnit: exactMatch,
        level: FastPathMatchLevel.ExactContent,
        confidence: 1.0,
      };
    }

    // Level 2: Structural Match (high confidence)
    const structuralMatch = this.tryStructuralMatch(targetUnit, baseIndex);
    if (structuralMatch) {
      return {
        baseUnitId: structuralMatch.id,
        baseUnit: structuralMatch,
        level: FastPathMatchLevel.Structural,
        confidence: 0.95,
      };
    }

    // Level 3: Signature Match (medium confidence)
    if (targetUnit.signature) {
      const signatureMatch = this.trySignatureMatch(targetUnit, baseIndex);
      if (signatureMatch) {
        return {
          baseUnitId: signatureMatch.id,
          baseUnit: signatureMatch,
          level: FastPathMatchLevel.Signature,
          confidence: 0.85,
        };
      }
    }

    // Level 4: ID Match (low confidence - only for same FQN)
    const idMatch = this.tryIdMatch(targetUnit, baseIndex);
    if (idMatch) {
      return {
        baseUnitId: idMatch.id,
        baseUnit: idMatch,
        level: FastPathMatchLevel.Id,
        confidence: 0.7,
      };
    }

    // No match found in Fast Path
    return undefined;
  }

  /**
   * Level 1: Exact Content Match.
   *
   * Matches if contentHash is identical (byte-for-byte same code).
   */
  private tryExactMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex): CodeUnit | undefined {
    const candidates = baseIndex.contentHashIndex.get(targetUnit.contentHash);

    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    // If multiple candidates, prefer same file path
    if (candidates.length === 1) {
      const firstId = candidates[0];
      return firstId ? baseIndex.units.get(firstId) : undefined;
    }

    // Prefer candidate with same file path
    const sameFileCandidate = candidates.find((id) => {
      const unit = baseIndex.units.get(id);
      return unit?.filePath === targetUnit.filePath;
    });

    if (sameFileCandidate) {
      return baseIndex.units.get(sameFileCandidate);
    }

    const firstId = candidates[0];
    return firstId ? baseIndex.units.get(firstId) : undefined;
  }

  /**
   * Level 2: Structural Match.
   *
   * Matches if structuralHash is identical (same AST structure).
   * Ignores whitespace, comments, formatting.
   */
  private tryStructuralMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex): CodeUnit | undefined {
    const candidates = baseIndex.structuralHashIndex.get(targetUnit.structuralHash);

    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    // Filter to same type (don't match function to class)
    const typedCandidates = candidates.filter((id) => {
      const unit = baseIndex.units.get(id);
      return unit?.type === targetUnit.type;
    });

    if (typedCandidates.length === 0) {
      return undefined;
    }

    // Prefer same file path and name
    const bestCandidate = typedCandidates.find((id) => {
      const unit = baseIndex.units.get(id);
      return unit?.filePath === targetUnit.filePath && unit?.name === targetUnit.name;
    });

    if (bestCandidate) {
      return baseIndex.units.get(bestCandidate);
    }

    const firstId = typedCandidates[0];
    return firstId ? baseIndex.units.get(firstId) : undefined;
  }

  /**
   * Level 3: Signature Match.
   *
   * Matches if signature is identical (FQN + params for functions).
   * Useful for renamed/moved code with same signature.
   */
  private trySignatureMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex): CodeUnit | undefined {
    if (!targetUnit.signature) {
      return undefined;
    }

    const candidates = baseIndex.signatureIndex.get(targetUnit.signature);

    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    // Filter to same type
    const typedCandidates = candidates.filter((id) => {
      const unit = baseIndex.units.get(id);
      return unit?.type === targetUnit.type;
    });

    if (typedCandidates.length === 0) {
      return undefined;
    }

    const firstCandidate = typedCandidates[0];
    if (!firstCandidate) {
      return undefined;
    }

    return baseIndex.units.get(firstCandidate);
  }

  /**
   * Level 4: ID Match.
   *
   * Matches by stable ID (based on FQN).
   * Only used as last resort - code may have changed significantly.
   */
  private tryIdMatch(targetUnit: CodeUnit, baseIndex: VersionedIndex): CodeUnit | undefined {
    // Try to find unit with same ID
    const candidate = baseIndex.units.get(targetUnit.id);

    // Only match if FQN is still the same (not moved/renamed)
    if (candidate && candidate.fullyQualifiedName === targetUnit.fullyQualifiedName) {
      return candidate;
    }

    return undefined;
  }

  /**
   * Вычислить статистику Fast Path coverage.
   */
  computeStatistics(matchResults: Map<string, FastPathMatchResult>, totalUnits: number): FastPathStatistics {
    const byLevel = new Map<FastPathMatchLevel, number>();

    for (const result of matchResults.values()) {
      byLevel.set(result.level, (byLevel.get(result.level) || 0) + 1);
    }

    const totalMatched = matchResults.size;
    const coverage = totalUnits > 0 ? totalMatched / totalUnits : 0;

    return {
      totalUnits,
      totalMatched,
      coverage,
      exactContentMatches: byLevel.get(FastPathMatchLevel.ExactContent) || 0,
      structuralMatches: byLevel.get(FastPathMatchLevel.Structural) || 0,
      signatureMatches: byLevel.get(FastPathMatchLevel.Signature) || 0,
      idMatches: byLevel.get(FastPathMatchLevel.Id) || 0,
    };
  }
}

/**
 * Результат Fast Path matching.
 */
export interface FastPathMatchResult {
  baseUnitId: string; // ID of matched unit in base
  baseUnit: CodeUnit; // Full matched unit
  level: FastPathMatchLevel; // Match level used
  confidence: number; // Confidence score (0.0-1.0)
}

/**
 * Уровни Fast Path matching.
 */
export enum FastPathMatchLevel {
  ExactContent = "exact_content", // Level 1: contentHash match
  Structural = "structural", // Level 2: structuralHash match
  Signature = "signature", // Level 3: signature match
  Id = "id", // Level 4: stable ID match
}

/**
 * Статистика Fast Path matching.
 */
export interface FastPathStatistics {
  totalUnits: number; // Total units to match
  totalMatched: number; // Successfully matched
  coverage: number; // Match rate (0.0-1.0)

  // Breakdown by level
  exactContentMatches: number;
  structuralMatches: number;
  signatureMatches: number;
  idMatches: number;
}
