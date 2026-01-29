/**
 * TASK-002: Hybrid Search Engine with Reciprocal Rank Fusion (RRF)
 *
 * Combines structural and semantic search results using RRF algorithm
 * Optimized for balanced retrieval with configurable weights
 *
 * Architecture References:
 * - Project Overview: doc/PROJECT_OVERVIEW.md
 * - Coding Standards: doc/CODING_STANDARD.md
 * - Architectural Decisions: doc/ARCHITECTURAL_DECISIONS.md
 *
 * @task_id TASK-002
 * @history
 *  - 2025-09-14: Created by Dev-Agent - TASK-002: Hybrid search with RRF implementation
 */

import type { QueryAgent } from "../agents/query-agent.js";
import { log } from "../logging/index.js";
import type { QueryExpander } from "../nlp/query-expander.js";
import type { FusionOptions, HybridResult, SemanticResult, SimilarityResult } from "../types/semantic.js";
import type { EmbeddingGenerator } from "./embedding-generator.js";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import type { VectorStore } from "./vector-store.js";

// =============================================================================
// EXTENDED SEMANTIC RESULT WITH EXPANSION INFO
// =============================================================================
export interface SemanticResultWithExpansion extends SemanticResult {
  /** Expanded query string (for debugging/transparency) */
  expandedQuery?: string;
  /** Query expansion metadata */
  expansionInfo?: {
    originalTokens: string[];
    coocTerms: Array<{ term: string; weight: number }>;
    prfTerms: Array<{ term: string; weight: number }>;
  };
}

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const DEFAULT_FUSION_OPTIONS: FusionOptions = {
  k: 60, // RRF constant
  structuralWeight: 0.6,
  semanticWeight: 0.4,
  limit: 10,
};

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================
interface StructuralResult {
  id: string;
  path: string;
  type: string;
  name: string;
  score?: number;
  content?: string | undefined;
}

interface RankedResult {
  id: string;
  score: number;
  structuralRank?: number;
  semanticRank?: number;
  content?: string | undefined;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// 4. UTILITY FUNCTIONS AND HELPERS
// =============================================================================
function normalizeScores(results: RankedResult[]): RankedResult[] {
  const maxScore = Math.max(...results.map((r) => r.score));
  const minScore = Math.min(...results.map((r) => r.score));
  const range = maxScore - minScore || 1;

  return results.map((r) => ({
    ...r,
    score: (r.score - minScore) / range,
  }));
}

function deduplicateResults(results: RankedResult[]): RankedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.id)) {
      return false;
    }
    seen.add(r.id);
    return true;
  });
}

// =============================================================================
// 5. CORE BUSINESS LOGIC
// =============================================================================
export class HybridSearchEngine {
  private vectorStore: VectorStore;
  private embeddingGen: EmbeddingGenerator;
  private queryAgent: QueryAgent | null = null;
  private queryExpander: QueryExpander | null = null;
  private searchMetrics = {
    totalSearches: 0,
    avgSearchTime: 0,
    avgResultCount: 0,
  };

  constructor(vectorStore: VectorStore, embeddingGen: EmbeddingGenerator, queryAgent?: QueryAgent) {
    this.vectorStore = vectorStore;
    this.embeddingGen = embeddingGen;
    this.queryAgent = queryAgent || null;
  }

  /**
   * Set the query expander for automatic query expansion.
   * When set, semantic search will use two-pass expansion (cooc + PRF).
   */
  setQueryExpander(expander: QueryExpander): void {
    this.queryExpander = expander;
    log.i("HYBRID", "QueryExpander configured");
  }

  /**
   * Set the query agent for structural search
   */
  setQueryAgent(queryAgent: QueryAgent): void {
    this.queryAgent = queryAgent;
  }

  /**
   * Perform hybrid search combining structural and semantic results
   */
  async search(query: string, options: Partial<FusionOptions> = {}): Promise<HybridResult[]> {
    const startTime = Date.now();
    const fusionOptions = { ...DEFAULT_FUSION_OPTIONS, ...options };

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingGen.generateEmbedding(query);

      // Parallel execution of structural and semantic search
      const [structuralResults, semanticSearchResult] = await Promise.all([
        this.performStructuralSearch(query, fusionOptions.limit * 2),
        this.vectorStore.adaptiveSearch(queryEmbedding, fusionOptions.limit * 2),
      ]);
      const semanticResults = semanticSearchResult.results;

      log.d("HYBRID", `Found ${structuralResults.length} structural and ${semanticResults.length} semantic results`, {
        usedFaiss: semanticSearchResult.usedFaiss,
      });

      // Apply Reciprocal Rank Fusion
      const fusedResults = this.fuseResults(structuralResults, semanticResults, fusionOptions);

      // Update metrics
      const searchTime = Date.now() - startTime;
      this.updateMetrics(searchTime, fusedResults.length);

      log.i("HYBRID", `Hybrid search complete`, {
        resultsCount: fusedResults.length,
        searchTimeMs: searchTime,
      });

      return fusedResults;
    } catch (error) {
      log.e("HYBRID", "Hybrid search failed", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Perform structural search using QueryAgent
   */
  private async performStructuralSearch(query: string, limit: number): Promise<StructuralResult[]> {
    if (!this.queryAgent) {
      log.d("HYBRID", "QueryAgent not available, skipping structural search");
      return [];
    }

    try {
      // Use QueryAgent to search for structural matches
      const task = {
        id: `search-${Date.now()}`,
        type: "search",
        priority: 5,
        payload: { query, limit },
        createdAt: Date.now(),
      };

      const results = (await this.queryAgent.process(task)) as StructuralResult[];
      return results || [];
    } catch (error) {
      log.e("HYBRID", "Structural search failed", { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Apply Reciprocal Rank Fusion to combine results
   * OPTIMIZED: Pre-computed RRF scores using Float32Array for better cache utilization
   */
  private fuseResults(
    structural: StructuralResult[],
    semantic: SimilarityResult[],
    options: FusionOptions,
  ): HybridResult[] {
    const scores = new Map<string, RankedResult>();
    const k = options.k;

    // OPTIMIZATION: Pre-compute RRF scores in Float32Array for better cache utilization
    const structuralLen = structural.length;
    const semanticLen = semantic.length;

    // Pre-compute structural RRF scores
    const structuralScores = new Float32Array(structuralLen);
    const structuralWeight = options.structuralWeight;
    for (let i = 0; i < structuralLen; i++) {
      structuralScores[i] = structuralWeight / (k + i + 1);
    }

    // Pre-compute semantic RRF scores
    const semanticScores = new Float32Array(semanticLen);
    const semanticWeight = options.semanticWeight;
    for (let i = 0; i < semanticLen; i++) {
      semanticScores[i] = semanticWeight / (k + i + 1);
    }

    // Process structural results with pre-computed RRF scoring
    for (let rank = 0; rank < structuralLen; rank++) {
      const item = structural[rank]!;
      const rrfScore = structuralScores[rank]!;

      const existing = scores.get(item.id);
      if (existing) {
        existing.score += rrfScore;
        existing.structuralRank = rank;
      } else {
        scores.set(item.id, {
          id: item.id,
          score: rrfScore,
          structuralRank: rank,
          content: item.content,
          metadata: { path: item.path, type: item.type, name: item.name },
        });
      }
    }

    // Process semantic results with pre-computed RRF scoring
    for (let rank = 0; rank < semanticLen; rank++) {
      const item = semantic[rank]!;
      const rrfScore = semanticScores[rank]!;

      const existing = scores.get(item.id);
      if (existing) {
        existing.score += rrfScore;
        existing.semanticRank = rank;
        // Merge metadata
        if (item.metadata) {
          existing.metadata = { ...existing.metadata, ...item.metadata };
        }
      } else {
        scores.set(item.id, {
          id: item.id,
          score: rrfScore,
          semanticRank: rank,
          content: item.content,
          metadata: item.metadata,
        });
      }
    }

    // Sort by combined score and limit
    const rankedResults = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit);

    // Normalize scores and deduplicate
    const normalized = normalizeScores(rankedResults);
    const deduplicated = deduplicateResults(normalized);

    // Convert to HybridResult format
    return deduplicated.map((r) => ({
      id: r.id,
      score: r.score,
      source: this.determineSource(r),
      content: r.content,
      metadata: r.metadata,
    }));
  }

  /**
   * Determine the primary source of a result
   */
  private determineSource(result: RankedResult): "structural" | "semantic" | "hybrid" {
    const hasStructural = result.structuralRank !== undefined;
    const hasSemantic = result.semanticRank !== undefined;

    if (hasStructural && hasSemantic) {
      return "hybrid";
    } else if (hasStructural) {
      return "structural";
    } else {
      return "semantic";
    }
  }

  /**
   * Perform pure semantic search without structural component.
   *
   * When QueryExpander is configured, uses two-pass query expansion:
   * 1. First pass: quick search with original query to get initial results
   * 2. Expand query using co-occurrence + PRF from initial results
   * 3. Final pass: search with expanded query for better recall
   */
  async semanticSearch(query: string, limit = 10): Promise<SemanticResultWithExpansion> {
    const startTime = Date.now();

    try {
      // If no query expander, use simple single-pass search
      if (!this.queryExpander) {
        const queryEmbedding = await this.embeddingGen.generateEmbedding(query);
        const searchResult = await this.vectorStore.adaptiveSearch(queryEmbedding, limit);
        const processingTime = Date.now() - startTime;

        return {
          query,
          results: searchResult.results,
          processingTime,
        };
      }

      // Two-pass search with query expansion
      return this.semanticSearchWithExpansion(query, limit, startTime);
    } catch (error) {
      log.e("HYBRID", "Semantic search failed", { query, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Two-pass semantic search with query expansion.
   * Internal method used when QueryExpander is configured.
   */
  private async semanticSearchWithExpansion(
    query: string,
    limit: number,
    startTime: number,
  ): Promise<SemanticResultWithExpansion> {
    // Pass 1: Quick initial search for PRF
    const initialEmbedding = await this.embeddingGen.generateEmbedding(query);
    const initialResults = await this.vectorStore.adaptiveSearch(initialEmbedding, 5);

    // Expand query using cooc + PRF
    const expanded = await this.queryExpander!.expand(
      query,
      initialResults.results.map((r) => ({ content: r.content || "" })),
    );

    log.d("HYBRID", "Query expanded", {
      original: query,
      expanded: expanded.expanded,
      coocTerms: expanded.coocTerms.length,
      prfTerms: expanded.prfTerms.length,
    });

    // Pass 2: Final search with expanded query
    const expandedEmbedding = await this.embeddingGen.generateEmbedding(expanded.expanded);
    const finalResults = await this.vectorStore.adaptiveSearch(expandedEmbedding, limit);

    const processingTime = Date.now() - startTime;

    return {
      query,
      expandedQuery: expanded.expanded,
      results: finalResults.results,
      processingTime,
      expansionInfo: {
        originalTokens: expanded.originalTokens,
        coocTerms: expanded.coocTerms,
        prfTerms: expanded.prfTerms,
      },
    };
  }

  /**
   * Re-rank results based on custom scoring
   */
  async rerank(
    results: HybridResult[],
    query: string,
    scoreFunction?: (result: HybridResult, query: string) => number,
  ): Promise<HybridResult[]> {
    if (!scoreFunction) {
      // Default re-ranking based on query terms
      scoreFunction = (result, q) => {
        const terms = q.toLowerCase().split(/\s+/);
        const content = (result.content || "").toLowerCase();

        let score = 0;
        for (const term of terms) {
          if (content.includes(term)) {
            score += 1;
          }
        }

        return score / terms.length;
      };
    }

    // Calculate new scores
    const reranked = results.map((r) => ({
      ...r,
      score: r.score * 0.7 + scoreFunction(r, query) * 0.3,
    }));

    // Sort by new scores
    return reranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Update search metrics
   */
  private updateMetrics(searchTime: number, resultCount: number): void {
    this.searchMetrics.totalSearches++;

    const prevAvgTime = this.searchMetrics.avgSearchTime;
    const prevAvgCount = this.searchMetrics.avgResultCount;
    const n = this.searchMetrics.totalSearches;

    this.searchMetrics.avgSearchTime = (prevAvgTime * (n - 1) + searchTime) / n;
    this.searchMetrics.avgResultCount = (prevAvgCount * (n - 1) + resultCount) / n;
  }

  /**
   * Get search metrics
   */
  getMetrics(): typeof this.searchMetrics {
    return { ...this.searchMetrics };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.embeddingGen.clearCache();
    log.i("HYBRID", "Caches cleared");
  }
}
