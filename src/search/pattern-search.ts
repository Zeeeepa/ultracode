/**
 * Pattern-based Search - Advanced Code Search
 *
 * Provides multiple search modes:
 * - Entity: Search by entity name/type (regex)
 * - Content: Search inside entity bodies
 * - Semantic: Vector similarity search
 * - Hybrid: Combination of all modes
 *
 * Features:
 * - SIMD-accelerated cosine similarity
 * - Framework-aware filtering
 * - Content-aware search
 * - Score-based ranking
 *
 * Architecture References:
 * - Graph Storage: src/storage/graph-storage.ts
 * - Vector Store: src/semantic/vector-store.ts
 * - Technology Detector: src/analysis/technology-detector.ts
 */

import { readFile } from "node:fs/promises";
import type { TechnologyDetector } from "../analysis/technology-detector.js";
import type { VectorStore } from "../semantic/vector-store.js";
import type { Entity, EntityType, GraphStorage } from "../types/storage.js";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface PatternSearchQuery {
  pattern: string; // Regex or semantic query
  scope?: {
    entityTypes?: EntityType[]; // Filter by entity types
    files?: string[]; // Filter by file paths
    frameworks?: string[]; // Filter by framework
  };
  contentFilter?: {
    contains?: string; // Content must contain this string
    regex?: string; // Content must match this regex
    semantic?: string; // Semantic similarity to this description
  };
  limit?: number;
  mode: "entity" | "content" | "semantic" | "hybrid";
}

export interface PatternSearchResult {
  entity: Entity;
  matchType: "name" | "content" | "semantic";
  score: number;
  snippet?: string; // Code snippet showing match
  highlights?: {
    // Highlighted match positions
    start: number;
    end: number;
  }[];
}

// =============================================================================
// PATTERN SEARCH IMPLEMENTATION
// =============================================================================

export class PatternSearch {
  // NOTE: WASM similarity was planned but currently unused (commented out in code)
  // private wasmSimilarityAvailable = false;

  constructor(
    private graphStorage: GraphStorage,
    private vectorStore: VectorStore | null,
    private technologyDetector: TechnologyDetector | null,
  ) {}

  /**
   * Initialize Pattern Search (load WASM modules)
   */
  async initialize(): Promise<void> {
    // NOTE: WASM similarity support disabled (cosineSimilarity method commented out)
    // Will be re-enabled when EmbeddingGenerator is implemented
    // try {
    //   // Try to load WASM vector-ops module
    //   // @ts-expect-error - WASM module may not exist at compile time
    //   const { cosine_similarity_simd } = await import("../../dist/wasm/vector-ops-simd/vector_ops_simd.js");
    //   if (cosine_similarity_simd) {
    //     this.wasmSimilarityAvailable = true;
    //     console.log("[PatternSearch] WASM vector-ops-simd loaded successfully");
    //   }
    // } catch (error) {
    //   console.warn("[PatternSearch] WASM vector-ops-simd not available, using fallback");
    //   this.wasmSimilarityAvailable = false;
    // }
  }

  /**
   * Search with specified mode
   */
  async search(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    switch (query.mode) {
      case "entity":
        return this.searchEntities(query);
      case "content":
        return this.searchContent(query);
      case "semantic":
        return this.searchSemantic(query);
      case "hybrid":
        return this.searchHybrid(query);
      default:
        throw new Error(`Unknown search mode: ${query.mode}`);
    }
  }

  // =============================================================================
  // PRIVATE: ENTITY SEARCH
  // =============================================================================

  private async searchEntities(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    const filters: any = {};

    // Apply entity type filter
    if (query.scope?.entityTypes) {
      filters.entityType = query.scope.entityTypes;
    }

    // Apply file path filter
    if (query.scope?.files) {
      filters.filePath = query.scope.files;
    }

    // Apply framework filter
    if (query.scope?.frameworks && this.technologyDetector) {
      const techStack = await this.technologyDetector.detectStack();
      const relevantFiles = await this.getFilesForFrameworks(query.scope.frameworks, techStack);
      filters.filePath = relevantFiles;
    }

    // Query entities with regex pattern
    filters.name = new RegExp(query.pattern, "i");

    const entities = await this.graphStorage.findEntities({
      type: "entity",
      filters,
      limit: query.limit || 100,
    });

    return entities.map((entity) => ({
      entity,
      matchType: "name",
      score: 1.0,
    }));
  }

  // =============================================================================
  // PRIVATE: CONTENT SEARCH
  // =============================================================================

  private async searchContent(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    // First, get candidate entities
    const candidates = await this.searchEntities({
      ...query,
      pattern: ".*", // Match all entities
      mode: "entity",
    });

    const results: PatternSearchResult[] = [];

    // For each candidate, check content
    for (const { entity } of candidates) {
      const content = await this.getEntityContent(entity);

      // Apply content filters
      if (query.contentFilter?.contains) {
        if (!content.includes(query.contentFilter.contains)) continue;
      }

      if (query.contentFilter?.regex) {
        const regex = new RegExp(query.contentFilter.regex, "i");
        if (!regex.test(content)) continue;
      }

      if (query.contentFilter?.semantic) {
        // Semantic similarity check
        const similarity = await this.computeSemanticSimilarity(content, query.contentFilter.semantic);
        if (similarity < 0.7) continue;
      }

      // Generate snippet
      const snippet = this.generateSnippet(content, query.pattern);

      results.push({
        entity,
        matchType: "content",
        score: 1.0,
        snippet,
      });
    }

    return results.slice(0, query.limit || 100);
  }

  // =============================================================================
  // PRIVATE: SEMANTIC SEARCH
  // =============================================================================

  private async searchSemantic(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    if (!this.vectorStore) {
      console.warn("[PatternSearch] VectorStore not available");
      return [];
    }

    try {
      // TODO: Generate query embedding (EmbeddingGenerator.generate method needs implementation)
      // const { EmbeddingGenerator } = await import("../semantic/embedding-generator.js");
      // const generator = new EmbeddingGenerator();
      // const queryEmbedding = await generator.generate({ content: query.pattern });

      // TODO: Search vector store (VectorStore.searchSimilar method needs implementation)
      // const similarEntities = await this.vectorStore.searchSimilar(queryEmbedding.embedding, query.limit || 10);

      // Fallback to entity search for now
      const results: PatternSearchResult[] = [];
      const entities = await this.graphStorage.searchEntities({ namePattern: query.pattern });

      for (const entity of entities.slice(0, query.limit || 10)) {
        // Apply scope filters
        if (query.scope?.entityTypes && !query.scope.entityTypes.includes(entity.type)) continue;
        if (query.scope?.files && !query.scope?.files.includes(entity.filePath)) continue;

        results.push({
          entity,
          matchType: "name",
          score: 0.5, // Fallback score (semantic search TODO)
        });
      }

      return results;
    } catch (error) {
      console.error("[PatternSearch] Semantic search failed:", error);
      return [];
    }
  }

  // =============================================================================
  // PRIVATE: HYBRID SEARCH
  // =============================================================================

  private async searchHybrid(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    // Combine entity search and content search
    const entityResults = await this.searchEntities(query);
    const contentResults = await this.searchContent(query);

    // If semantic query provided, also do vector search
    let semanticResults: PatternSearchResult[] = [];
    if (query.contentFilter?.semantic && this.vectorStore) {
      semanticResults = await this.searchSemantic({
        ...query,
        pattern: query.contentFilter.semantic,
        mode: "semantic",
      });
    }

    // Merge results with scoring
    return this.mergeResults([...entityResults, ...contentResults, ...semanticResults], query.limit);
  }

  // =============================================================================
  // PRIVATE: UTILITIES
  // =============================================================================

  private async getEntityContent(entity: Entity): Promise<string> {
    try {
      const fileContent = await readFile(entity.filePath, "utf-8");
      const lines = fileContent.split("\n");
      return lines.slice(entity.location.start.line - 1, entity.location.end.line).join("\n");
    } catch (error) {
      console.warn(`[PatternSearch] Failed to read entity content: ${entity.filePath}`, error);
      return "";
    }
  }

  private generateSnippet(content: string, pattern: string): string {
    // Find match position
    const regex = new RegExp(pattern, "i");
    const match = content.match(regex);

    if (!match) {
      // No match, return first 100 chars
      return content.slice(0, 100);
    }

    const matchStart = match.index || 0;
    const contextBefore = 50;
    const contextAfter = 50;

    const start = Math.max(0, matchStart - contextBefore);
    const end = Math.min(content.length, matchStart + match[0].length + contextAfter);

    return content.slice(start, end);
  }

  private mergeResults(results: PatternSearchResult[], limit?: number): PatternSearchResult[] {
    // Remove duplicates and sort by score
    const seen = new Set<string>();
    const unique: PatternSearchResult[] = [];

    for (const result of results) {
      if (seen.has(result.entity.id)) continue;
      seen.add(result.entity.id);
      unique.push(result);
    }

    // Sort by score (descending)
    unique.sort((a, b) => b.score - a.score);

    return limit ? unique.slice(0, limit) : unique;
  }

  private async computeSemanticSimilarity(content: string, query: string): Promise<number> {
    if (!this.vectorStore) return 0;

    try {
      // TODO: Use SIMD-accelerated cosine similarity (EmbeddingGenerator.generate needs implementation)
      // const { EmbeddingGenerator } = await import("../semantic/embedding-generator.js");
      // const generator = new EmbeddingGenerator();
      // const contentEmbedding = await generator.generate({ content });
      // const queryEmbedding = await generator.generate({ content: query });
      // return this.cosineSimilarity(contentEmbedding.embedding, queryEmbedding.embedding);

      // Fallback: string matching
      return content.toLowerCase().includes(query.toLowerCase()) ? 1.0 : 0.0;
    } catch (error) {
      console.error("[PatternSearch] Semantic similarity computation failed:", error);
      return 0;
    }
  }

  // NOTE: Cosine similarity computation is available but currently unused
  // Will be used when EmbeddingGenerator is implemented (see computeSemanticSimilarity)
  // private cosineSimilarity(a: Float32Array, b: Float32Array): number {
  //   if (this.wasmSimilarityAvailable) {
  //     try {
  //       const { cosine_similarity_simd } = require("../../dist/wasm/vector-ops-simd/vector_ops_simd.js");
  //       return cosine_similarity_simd(a, b);
  //     } catch {
  //       // Fallback to JS
  //     }
  //   }
  //
  //   // JavaScript fallback
  //   let dotProduct = 0;
  //   let normA = 0;
  //   let normB = 0;
  //
  //   for (let i = 0; i < a.length; i++) {
  //     dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
  //     normA += (a[i] ?? 0) * (a[i] ?? 0);
  //     normB += (b[i] ?? 0) * (b[i] ?? 0);
  //   }
  //
  //   if (normA === 0 || normB === 0) return 0;
  //
  //   return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // }

  private async getFilesForFrameworks(frameworks: string[], techStack: any): Promise<string[]> {
    // Get all files that use specified frameworks
    const files: string[] = [];

    for (const framework of frameworks) {
      const frameworkInfo = techStack.frameworks.find((f: any) => f.name === framework);
      if (!frameworkInfo) continue;

      // Get files from import analysis
      const imports = await this.graphStorage.findEntities({
        type: "entity",
        filters: { entityType: "import" as EntityType },
      });

      for (const imp of imports) {
        const source = imp.metadata.importData?.source || "";
        if (source.toLowerCase().includes(framework.toLowerCase())) {
          files.push(imp.filePath);
        }
      }
    }

    return [...new Set(files)]; // Deduplicate
  }
}
