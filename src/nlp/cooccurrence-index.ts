/**
 * Co-occurrence Index for Query Expansion
 *
 * Builds and queries a co-occurrence index from text content.
 * Terms that appear together within a sliding window are recorded,
 * allowing discovery of semantically related terms.
 *
 * Usage:
 * - During indexing: call updateFromChunk() for each text chunk
 * - During search: call getRelatedTerms() to expand queries
 */

import type { CooccurrenceOperations, RelatedTerm } from "../storage/libsql/cooccurrence-ops.js";
import { countTokens, tokenize, tokenizeUnique } from "./tokenizer.js";

// =============================================================================
// TYPES
// =============================================================================

export interface CooccurrenceIndexConfig {
  /** Sliding window size for co-occurrence (default: 5) */
  windowSize?: number;
  /** Minimum term length (default: 3) */
  minTermLength?: number;
  /** Maximum terms per chunk to process (default: 500) */
  maxTermsPerChunk?: number;
}

// =============================================================================
// COOCCURRENCE INDEX
// =============================================================================

export class CooccurrenceIndex {
  private config: Required<CooccurrenceIndexConfig>;

  constructor(
    private storage: CooccurrenceOperations,
    config: CooccurrenceIndexConfig = {},
  ) {
    this.config = {
      windowSize: config.windowSize ?? 5,
      minTermLength: config.minTermLength ?? 3,
      maxTermsPerChunk: config.maxTermsPerChunk ?? 500,
    };
  }

  // ===========================================================================
  // INDEXING
  // ===========================================================================

  /**
   * Update co-occurrence counts from a text chunk.
   * Extracts term pairs within a sliding window and updates the database.
   *
   * @param text - Text content to process (comment, docstring, markdown, etc.)
   */
  async updateFromChunk(text: string): Promise<void> {
    const { windowSize, minTermLength, maxTermsPerChunk } = this.config;

    // Tokenize the text
    let tokens = tokenize(text, minTermLength);

    // Limit tokens to prevent memory issues with large chunks
    if (tokens.length > maxTermsPerChunk) {
      tokens = tokens.slice(0, maxTermsPerChunk);
    }

    if (tokens.length < 2) return;

    // Extract co-occurrence pairs within sliding window
    const pairs = this.extractPairs(tokens, windowSize);

    if (pairs.size === 0) return;

    // Update database
    await this.storage.batchUpdateCooccurrence(pairs);

    // Update term frequencies
    const termCounts = countTokens(text, minTermLength);
    await this.storage.updateTermFrequenciesLegacy(termCounts, true);
  }

  /**
   * Batch update from multiple text chunks.
   * More efficient than calling updateFromChunk multiple times.
   *
   * @param chunks - Array of text chunks to process
   */
  async updateFromChunks(chunks: string[]): Promise<void> {
    const { windowSize, minTermLength, maxTermsPerChunk } = this.config;

    // Aggregate all pairs and term counts
    const allPairs = new Map<string, number>();
    const allTermCounts = new Map<string, number>();
    const processedDocs = new Set<string>(); // For doc_count tracking

    for (const chunk of chunks) {
      if (!chunk || chunk.length < minTermLength * 2) continue;

      let tokens = tokenize(chunk, minTermLength);
      if (tokens.length > maxTermsPerChunk) {
        tokens = tokens.slice(0, maxTermsPerChunk);
      }

      if (tokens.length < 2) continue;

      // Extract pairs
      const pairs = this.extractPairs(tokens, windowSize);
      for (const [key, count] of pairs) {
        allPairs.set(key, (allPairs.get(key) || 0) + count);
      }

      // Count terms (track unique documents for each term)
      const uniqueTerms = tokenizeUnique(chunk, minTermLength);
      const chunkHash = this.hashChunk(chunk);

      for (const term of uniqueTerms) {
        const docKey = `${term}|${chunkHash}`;
        if (!processedDocs.has(docKey)) {
          processedDocs.add(docKey);
          allTermCounts.set(term, (allTermCounts.get(term) || 0) + 1);
        }
      }
    }

    // Batch update database
    if (allPairs.size > 0) {
      await this.storage.batchUpdateCooccurrence(allPairs);
    }

    if (allTermCounts.size > 0) {
      await this.storage.updateTermFrequenciesLegacy(allTermCounts, true);
    }
  }

  /**
   * Extract term pairs within a sliding window.
   *
   * @param tokens - Array of tokens
   * @param windowSize - Window size for co-occurrence
   * @returns Map of "term1|term2" → count (terms sorted alphabetically)
   */
  private extractPairs(tokens: string[], windowSize: number): Map<string, number> {
    const pairs = new Map<string, number>();

    for (let i = 0; i < tokens.length; i++) {
      const t1 = tokens[i]!;

      // Look ahead within window
      for (let j = i + 1; j <= Math.min(i + windowSize, tokens.length - 1); j++) {
        const t2 = tokens[j]!;

        // Skip if same term
        if (t1 === t2) continue;

        // Sort alphabetically for consistent key
        const [first, second] = t1 < t2 ? [t1, t2] : [t2, t1];
        const key = `${first}|${second}`;

        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }

    return pairs;
  }

  /**
   * Simple hash for chunk deduplication.
   */
  private hashChunk(chunk: string): string {
    // Simple hash based on length and first/last chars
    const len = chunk.length;
    const first = chunk.charCodeAt(0) || 0;
    const last = chunk.charCodeAt(len - 1) || 0;
    const mid = chunk.charCodeAt(Math.floor(len / 2)) || 0;
    return `${len}_${first}_${mid}_${last}`;
  }

  // ===========================================================================
  // QUERYING
  // ===========================================================================

  /**
   * Get related terms for a single query term.
   *
   * @param term - Term to find related terms for
   * @param limit - Maximum number of related terms
   */
  async getRelatedTerms(term: string, limit = 5): Promise<RelatedTerm[]> {
    return this.storage.getRelatedTerms(term, limit);
  }

  /**
   * Get related terms for multiple query terms.
   * Returns unique related terms across all input terms.
   *
   * @param terms - Array of terms
   * @param limitPerTerm - Max related terms per input term
   */
  async getRelatedTermsForQuery(terms: string[], limitPerTerm = 3): Promise<RelatedTerm[]> {
    if (terms.length === 0) return [];

    const relatedMap = await this.storage.getRelatedTermsBatch(terms, limitPerTerm);

    // Merge and dedupe related terms, keeping highest score
    const merged = new Map<string, RelatedTerm>();

    for (const [_sourceTerm, related] of relatedMap) {
      for (const rt of related) {
        const existing = merged.get(rt.term);
        if (!existing || rt.score > existing.score) {
          merged.set(rt.term, rt);
        }
      }
    }

    // Sort by score and return
    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
  }

  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================

  /**
   * Recalculate PMI scores for all pairs.
   * Should be called after bulk indexing or periodically.
   */
  async recalculatePMI(): Promise<void> {
    await this.storage.recalculatePMI();
  }

  /**
   * Get statistics about the co-occurrence index.
   */
  async getStats() {
    return this.storage.getStats();
  }

  /**
   * Clear all co-occurrence data.
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Prune rare pairs to reduce index size.
   */
  async pruneRarePairs(minCount = 2): Promise<number> {
    return this.storage.pruneRarePairs(minCount);
  }
}
