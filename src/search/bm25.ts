/**
 * BM25 Scoring — ported from ultracode.zig/src/nlp/tfidf.zig
 *
 * BM25 (Best Matching 25) is a ranking function used by search engines.
 * It improves on TF-IDF by adding document length normalization and
 * term frequency saturation (diminishing returns for repeated terms).
 *
 * Parameters:
 *   k1 = 1.2 — term frequency saturation (higher = more weight to frequency)
 *   b  = 0.75 — document length normalization (0 = no normalization, 1 = full)
 *
 * Formula: IDF × (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × dl/avgdl))
 * IDF variant: ln((N - df + 0.5) / (df + 0.5) + 1)
 */

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Compute BM25 score for a single term in a single document.
 *
 * @param tf - Term frequency in this document
 * @param df - Document frequency (how many documents contain this term)
 * @param totalDocs - Total number of documents in the corpus
 * @param docLen - Length (token count) of this document
 * @param avgDocLen - Average document length across the corpus
 * @returns BM25 score for this term-document pair
 */
export function bm25Score(
  tf: number,
  df: number,
  totalDocs: number,
  docLen: number,
  avgDocLen: number,
): number {
  if (avgDocLen === 0) return tf;

  // IDF: BM25 variant — handles edge cases where df ≈ totalDocs
  const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

  // TF saturation + length normalization
  return idf * (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * docLen / avgDocLen));
}

/**
 * Compute IDF (Inverse Document Frequency) using the BM25 variant.
 *
 * @param df - Document frequency
 * @param totalDocs - Total number of documents
 */
export function bm25Idf(df: number, totalDocs: number): number {
  return Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
}

/**
 * Batch-score multiple query terms against a document.
 * Returns the sum of BM25 scores for each query term.
 *
 * @param termFreqs - Map of query term → frequency in this document
 * @param termDfs - Map of query term → document frequency in corpus
 * @param totalDocs - Total number of documents
 * @param docLen - Length of this document
 * @param avgDocLen - Average document length
 */
export function bm25ScoreDocument(
  termFreqs: Map<string, number>,
  termDfs: Map<string, number>,
  totalDocs: number,
  docLen: number,
  avgDocLen: number,
): number {
  let score = 0;
  for (const [term, tf] of termFreqs) {
    const df = termDfs.get(term) ?? 0;
    if (df > 0) {
      score += bm25Score(tf, df, totalDocs, docLen, avgDocLen);
    }
  }
  return score;
}
