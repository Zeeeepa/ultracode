/**
 * Semantic Validator — Embedding similarity validation for structural candidates
 *
 * For each structural candidate:
 * 1. Get entity embedding (from stored embeddingBase64 or generate on-the-fly)
 * 2. Compare with pattern exemplars via cosine similarity
 * 3. Compute combinedScore: structural * 0.4 + semantic * 0.6
 * 4. For structural-only (minSemanticSimilarity: 0): skip, combinedScore = structural
 */

import { log } from "../../logging/index.js";
import type { EmbeddingGenerator } from "../../semantic/embedding-generator.js";
import type { ExemplarStore } from "./exemplar-store.js";
import type { PatternDefinition, PatternMatch, StructuralCandidate } from "./types.js";

export class SemanticValidator {
  constructor(
    private exemplarStore: ExemplarStore,
    private embeddingGen?: EmbeddingGenerator,
  ) {}

  /**
   * Validate structural candidates with semantic similarity
   *
   * @returns Confirmed PatternMatch[] with combined scores
   */
  async validate(
    candidates: StructuralCandidate[],
    _patternMap: Map<string, PatternDefinition>,
  ): Promise<PatternMatch[]> {
    const results: PatternMatch[] = [];

    // Split: semantic vs structural-only
    const needsSemantic = candidates.filter((c) => c.pattern.minSemanticSimilarity > 0);
    const structuralOnly = candidates.filter((c) => c.pattern.minSemanticSimilarity === 0);

    // Structural-only: pass through with semanticSimilarity = 1.0
    for (const c of structuralOnly) {
      results.push(this.createMatch(c, 1.0, undefined));
    }

    // Semantic validation
    if (needsSemantic.length > 0) {
      // Ensure exemplar embeddings are ready
      if (this.embeddingGen) {
        try {
          await this.exemplarStore.ensureEmbeddings(this.embeddingGen);
        } catch (err) {
          log.e("SEMANTIC_VALIDATOR", "ensure_embeddings_error", { error: String(err) });
        }
      }

      for (const c of needsSemantic) {
        try {
          const entityEmbedding = await this.getEntityEmbedding(c);
          if (!entityEmbedding) {
            // Can't get embedding — use structural confidence without semantic penalty
            if (c.confidence >= c.pattern.minStructuralConfidence) {
              results.push(this.createMatch(c, -1, undefined));
            }
            continue;
          }

          const exemplarResults = this.exemplarStore.findSimilarExemplars(entityEmbedding, c.pattern.id, 1);

          const topExemplar = exemplarResults[0];
          const similarity = topExemplar?.similarity ?? 0;

          if (similarity >= c.pattern.minSemanticSimilarity) {
            results.push(this.createMatch(c, similarity, topExemplar));
          }
        } catch (err) {
          log.w("SEMANTIC_VALIDATOR", "candidate_validation_error", {
            entity: c.entity.id,
            pattern: c.pattern.id,
            error: String(err),
          });
        }
      }
    }

    log.i("SEMANTIC_VALIDATOR", "validation_complete", {
      candidates: candidates.length,
      confirmed: results.length,
      structuralOnly: structuralOnly.length,
      semanticValidated: needsSemantic.length,
    });

    return results;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private createMatch(
    candidate: StructuralCandidate,
    semanticSimilarity: number,
    closestExemplar?: { id: string; similarity: number; description: string },
  ): PatternMatch {
    const isStructuralOnly = candidate.pattern.minSemanticSimilarity === 0;
    const noSemanticData = semanticSimilarity < 0;

    const combinedScore =
      isStructuralOnly || noSemanticData ? candidate.confidence : candidate.confidence * 0.4 + semanticSimilarity * 0.6;

    return {
      patternId: candidate.pattern.id,
      pattern: candidate.pattern,
      entityId: candidate.entity.id,
      entityName: candidate.entity.name,
      entityType: candidate.entity.type,
      filePath: candidate.entity.filePath,
      line: candidate.entity.location?.start?.line ?? 0,
      structuralConfidence: candidate.confidence,
      semanticSimilarity: isStructuralOnly ? 1.0 : noSemanticData ? 0 : semanticSimilarity,
      combinedScore,
      matchedCriteria: candidate.matchedCriteria,
      closestExemplar: closestExemplar
        ? { id: closestExemplar.id, similarity: closestExemplar.similarity, description: closestExemplar.description }
        : undefined,
    };
  }

  private async getEntityEmbedding(candidate: StructuralCandidate): Promise<Float32Array | null> {
    // Try stored embedding first
    const base64 = candidate.entity.embeddingBase64;
    if (base64) {
      try {
        const buffer = Buffer.from(base64, "base64");
        // Safety: ensure alignment and valid length for Float32Array
        const byteLen = buffer.byteLength;
        if (byteLen < 4 || byteLen % 4 !== 0) {
          log.w("SEMANTIC_VALIDATOR", "invalid_embedding_size", { entity: candidate.entity.id, byteLen });
          return null;
        }
        // Copy to aligned buffer to avoid potential SIGBUS on unaligned access
        const aligned = new ArrayBuffer(byteLen);
        new Uint8Array(aligned).set(new Uint8Array(buffer.buffer, buffer.byteOffset, byteLen));
        return new Float32Array(aligned);
      } catch (err) {
        log.w("SEMANTIC_VALIDATOR", "embedding_decode_error", { entity: candidate.entity.id, error: String(err) });
        return null;
      }
    }

    // Generate on-the-fly
    if (this.embeddingGen) {
      try {
        const text = candidate.entity.embeddingText ?? candidate.entity.name;
        const language = candidate.entity.language ?? (candidate.entity.metadata?.language as string | undefined);
        return await this.embeddingGen.generateCodeEmbedding(text, language);
      } catch (err) {
        log.w("SEMANTIC_VALIDATOR", "embed_error", {
          entity: candidate.entity.id,
          error: String(err),
        });
      }
    }

    return null;
  }
}
