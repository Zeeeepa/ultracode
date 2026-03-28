/**
 * TF-IDF / BM25 Extractor for Pseudo-Relevance Feedback (PRF)
 *
 * Extracts top terms from a set of documents using BM25 scoring
 * (upgraded from basic TF-IDF). BM25 adds document length normalization
 * and term frequency saturation for better ranking quality.
 *
 * BM25 IDF: ln((N - df + 0.5) / (df + 0.5) + 1)
 * BM25 TF:  (tf * (k1+1)) / (tf + k1 * (1 - b + b * dl/avgdl))
 */

import { bm25Idf, bm25Score } from "../search/bm25.js";
import { tokenize, tokenizeUnique } from "./tokenizer.js";

// =============================================================================
// TYPES
// =============================================================================

export interface TermScore {
  term: string;
  score: number;
  tf: number;
  idf: number;
}

export interface TfIdfOptions {
  /** Minimum token length (default: 3 for PRF to avoid noise) */
  minLength?: number;
  /** Use log normalization for TF (default: true) */
  logNormTf?: boolean;
  /** Minimum document frequency - exclude rare terms (default: 1) */
  minDocFreq?: number;
  /** Maximum document frequency ratio - exclude too common terms (default: 0.9) */
  maxDocFreqRatio?: number;
}

// =============================================================================
// TF-IDF EXTRACTOR
// =============================================================================

export class TfIdfExtractor {
  private options: Required<TfIdfOptions>;

  constructor(options: TfIdfOptions = {}) {
    this.options = {
      minLength: options.minLength ?? 3,
      logNormTf: options.logNormTf ?? true,
      minDocFreq: options.minDocFreq ?? 1,
      maxDocFreqRatio: options.maxDocFreqRatio ?? 0.9,
    };
  }

  /**
   * Extract top terms from a set of documents using TF-IDF scoring.
   *
   * @param documents - Array of document texts
   * @param excludeTerms - Terms to exclude (e.g., original query terms)
   * @param limit - Maximum number of terms to return
   * @returns Array of terms with scores, sorted by score descending
   */
  extractTopTerms(documents: string[], excludeTerms: Set<string>, limit = 5): TermScore[] {
    if (documents.length === 0) {
      return [];
    }

    const N = documents.length;
    const { minLength, minDocFreq, maxDocFreqRatio } = this.options;

    // Step 1: Calculate document frequency for each term
    const docFreq = new Map<string, number>();

    for (const doc of documents) {
      const uniqueTokens = tokenizeUnique(doc, minLength);
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // Step 2: Calculate term frequency across all documents (pooled)
    const termFreq = new Map<string, number>();
    for (const doc of documents) {
      const tokens = tokenize(doc, minLength);
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }
    }

    // Step 3: Calculate BM25 scores (upgraded from basic TF-IDF)
    const maxDocFreq = Math.floor(N * maxDocFreqRatio);
    const scores: TermScore[] = [];
    // Average document length for BM25 normalization
    const totalTokens = [...termFreq.values()].reduce((a, b) => a + b, 0);
    const avgDocLen = totalTokens / Math.max(N, 1);

    for (const [term, tf] of termFreq) {
      // Skip excluded terms
      if (excludeTerms.has(term)) continue;

      const df = docFreq.get(term) || 1;

      // Skip terms with too low or too high document frequency
      if (df < minDocFreq || df > maxDocFreq) continue;

      // BM25 IDF variant
      const idf = bm25Idf(df, N);

      // BM25 score with document length normalization
      const score = bm25Score(tf, df, N, totalTokens / N, avgDocLen);

      scores.push({ term, score, tf, idf });
    }

    // Step 4: Sort by score and return top terms
    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Extract terms from a single document with IDF from a corpus.
   * Useful when you have pre-computed IDF values from indexing.
   *
   * @param document - Document text
   * @param idfMap - Map of term → IDF value
   * @param excludeTerms - Terms to exclude
   * @param limit - Maximum terms to return
   */
  extractWithPrecomputedIdf(
    document: string,
    idfMap: Map<string, number>,
    excludeTerms: Set<string>,
    limit = 5,
  ): TermScore[] {
    const { minLength, logNormTf } = this.options;
    const tokens = tokenize(document, minLength);

    // Count term frequencies
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Calculate TF-IDF using provided IDF values
    const scores: TermScore[] = [];
    const defaultIdf = Math.log(10); // Default IDF for unknown terms (assume 10 docs)

    for (const [term, tf] of termFreq) {
      if (excludeTerms.has(term)) continue;

      const idf = idfMap.get(term) ?? defaultIdf;
      const normalizedTf = logNormTf ? 1 + Math.log(tf) : tf;
      const score = normalizedTf * idf;

      scores.push({ term, score, tf, idf });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Build IDF map from a corpus of documents.
   * Can be persisted and reused for faster extraction.
   *
   * @param documents - Array of document texts
   * @returns Map of term → IDF value
   */
  buildIdfMap(documents: string[]): Map<string, number> {
    if (documents.length === 0) {
      return new Map();
    }

    const N = documents.length;
    const { minLength } = this.options;

    // Count document frequency
    const docFreq = new Map<string, number>();
    for (const doc of documents) {
      const uniqueTokens = tokenizeUnique(doc, minLength);
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // Calculate IDF (BM25 variant)
    const idfMap = new Map<string, number>();
    for (const [term, df] of docFreq) {
      idfMap.set(term, bm25Idf(df, N));
    }

    return idfMap;
  }
}

/**
 * Convenience function for one-off extraction without creating an instance.
 */
export function extractTopTerms(
  documents: string[],
  excludeTerms: Set<string> = new Set(),
  limit = 5,
  options: TfIdfOptions = {},
): TermScore[] {
  const extractor = new TfIdfExtractor(options);
  return extractor.extractTopTerms(documents, excludeTerms, limit);
}
