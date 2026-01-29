/**
 * Query Expander for Semantic Search
 *
 * Automatically expands search queries using:
 * 1. Co-occurrence terms - words that frequently appear together
 * 2. Pseudo-Relevance Feedback (PRF) - terms from top search results
 *
 * This improves recall by including semantically related terms
 * that might not be in the original query.
 */

import type { CooccurrenceIndex } from "./cooccurrence-index.js";
import { type TermScore, TfIdfExtractor } from "./tfidf.js";
import { tokenize } from "./tokenizer.js";

// =============================================================================
// TYPES
// =============================================================================

export interface QueryExpansionConfig {
  /** Weight for original query terms (default: 1.0) */
  originalWeight?: number;
  /** Weight for co-occurrence terms (default: 0.6) */
  cooccurrenceWeight?: number;
  /** Weight for PRF terms (default: 0.4) */
  prfWeight?: number;
  /** Maximum co-occurrence terms per query term (default: 3) */
  maxCoocTermsPerToken?: number;
  /** Maximum PRF terms to extract (default: 5) */
  maxPrfTerms?: number;
  /** Maximum total terms in expanded query (default: 15) */
  maxExpandedTerms?: number;
  /** Minimum term length (default: 3) */
  minTermLength?: number;
}

export interface ExpandedQuery {
  /** Original query string */
  original: string;
  /** Expanded query string for embedding */
  expanded: string;
  /** Original query tokens */
  originalTokens: string[];
  /** Co-occurrence expansion terms with weights */
  coocTerms: Array<{ term: string; weight: number }>;
  /** PRF expansion terms with weights */
  prfTerms: Array<{ term: string; weight: number }>;
  /** All terms with final weights (for debugging) */
  allTerms: Map<string, number>;
}

// =============================================================================
// QUERY EXPANDER
// =============================================================================

export class QueryExpander {
  private config: Required<QueryExpansionConfig>;
  private tfidfExtractor: TfIdfExtractor;

  constructor(
    private coocIndex: CooccurrenceIndex | null,
    config: QueryExpansionConfig = {},
  ) {
    this.config = {
      originalWeight: config.originalWeight ?? 1.0,
      cooccurrenceWeight: config.cooccurrenceWeight ?? 0.6,
      prfWeight: config.prfWeight ?? 0.4,
      maxCoocTermsPerToken: config.maxCoocTermsPerToken ?? 3,
      maxPrfTerms: config.maxPrfTerms ?? 5,
      maxExpandedTerms: config.maxExpandedTerms ?? 15,
      minTermLength: config.minTermLength ?? 3,
    };

    this.tfidfExtractor = new TfIdfExtractor({
      minLength: this.config.minTermLength,
    });
  }

  /**
   * Expand a query using co-occurrence and PRF.
   *
   * @param query - Original search query
   * @param topResults - Top results from initial search (for PRF)
   * @returns Expanded query with metadata
   */
  async expand(query: string, topResults: Array<{ content: string }>): Promise<ExpandedQuery> {
    const { minTermLength, originalWeight, cooccurrenceWeight, prfWeight, maxExpandedTerms } = this.config;

    // Step 1: Tokenize original query
    const originalTokens = tokenize(query, minTermLength);
    const originalSet = new Set(originalTokens);

    // Initialize weighted terms map
    const weightedTerms = new Map<string, number>();

    // Add original terms with full weight
    for (const token of originalTokens) {
      weightedTerms.set(token, originalWeight);
    }

    // Step 2: Get co-occurrence terms
    const coocTerms: Array<{ term: string; weight: number }> = [];
    if (this.coocIndex && originalTokens.length > 0) {
      const relatedTerms = await this.getCooccurrenceTerms(originalTokens, originalSet);

      for (const { term, score } of relatedTerms) {
        const weight = score * cooccurrenceWeight;
        coocTerms.push({ term, weight });

        // Merge into weighted terms (keep max)
        const existing = weightedTerms.get(term) || 0;
        weightedTerms.set(term, Math.max(existing, weight));
      }
    }

    // Step 3: Extract PRF terms from top results
    const prfTerms: Array<{ term: string; weight: number }> = [];
    if (topResults.length > 0) {
      const extractedTerms = this.extractPrfTerms(topResults, originalSet);

      for (const { term, score } of extractedTerms) {
        // Normalize TF-IDF score to 0-1 range (approximate)
        const normalizedScore = Math.min(score / 5, 1);
        const weight = normalizedScore * prfWeight;
        prfTerms.push({ term, weight });

        // Merge into weighted terms (keep max)
        const existing = weightedTerms.get(term) || 0;
        weightedTerms.set(term, Math.max(existing, weight));
      }
    }

    // Step 4: Sort by weight and limit
    const sortedTerms = Array.from(weightedTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxExpandedTerms);

    // Step 5: Build expanded query string
    const expandedTerms = sortedTerms.map(([term]) => term);
    const expanded = expandedTerms.join(" ");

    return {
      original: query,
      expanded,
      originalTokens,
      coocTerms,
      prfTerms,
      allTerms: new Map(sortedTerms),
    };
  }

  /**
   * Simple expansion without PRF (when no initial results available).
   * Uses only co-occurrence terms.
   */
  async expandWithoutPrf(query: string): Promise<ExpandedQuery> {
    return this.expand(query, []);
  }

  /**
   * Get co-occurrence terms for query tokens.
   */
  private async getCooccurrenceTerms(
    tokens: string[],
    excludeTerms: Set<string>,
  ): Promise<Array<{ term: string; score: number }>> {
    if (!this.coocIndex) return [];

    const { maxCoocTermsPerToken } = this.config;
    const relatedTerms = await this.coocIndex.getRelatedTermsForQuery(tokens, maxCoocTermsPerToken);

    // Filter out original tokens and normalize scores
    return relatedTerms
      .filter((rt) => !excludeTerms.has(rt.term))
      .map((rt) => ({
        term: rt.term,
        // Normalize PMI score to 0-1 range (PMI can be negative or > 1)
        score: Math.max(0, Math.min((rt.score + 5) / 10, 1)),
      }));
  }

  /**
   * Extract PRF terms from top search results using TF-IDF.
   */
  private extractPrfTerms(results: Array<{ content: string }>, excludeTerms: Set<string>): TermScore[] {
    const { maxPrfTerms } = this.config;

    const documents = results.map((r) => r.content).filter((c) => c && c.length > 0);

    if (documents.length === 0) return [];

    return this.tfidfExtractor.extractTopTerms(documents, excludeTerms, maxPrfTerms);
  }

  /**
   * Update config at runtime.
   */
  setConfig(config: Partial<QueryExpansionConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current config.
   */
  getConfig(): QueryExpansionConfig {
    return { ...this.config };
  }
}

/**
 * Create a simple query expander without co-occurrence index.
 * Only uses PRF for expansion.
 */
export function createPrfOnlyExpander(config?: QueryExpansionConfig): QueryExpander {
  return new QueryExpander(null, {
    ...config,
    cooccurrenceWeight: 0, // Disable co-occurrence
  });
}
