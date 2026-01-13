/**
 * TASK-002: Semantic Code Analyzer
 *
 * Analyzes code semantics for similarity detection, clone detection, and refactoring suggestions
 * Provides advanced code understanding capabilities beyond structural analysis
 *
 * Architecture References:
 * - Project Overview: doc/PROJECT_OVERVIEW.md
 * - Coding Standards: doc/CODING_STANDARD.md
 * - Architectural Decisions: doc/ARCHITECTURAL_DECISIONS.md
 *
 * @task_id TASK-002
 * @history
 *  - 2025-09-14: Created by Dev-Agent - TASK-002: Semantic code analysis implementation
 */

// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { log } from "../logging/index.js";
import type {
  CloneGroup,
  CrossLangResult,
  RefactoringSuggestion,
  SemanticAnalysis,
  SimilarCode,
} from "../types/semantic.js";
import type { EmbeddingGenerator } from "./embedding-generator.js";
import type { SemanticCache } from "./semantic-cache.js";
import type { VectorStore } from "./vector-store.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const CLONE_TYPE_THRESHOLDS = {
  type1: 0.95, // Exact clones
  type2: 0.85, // Renamed clones
  type3: 0.75, // Gapped clones
  type4: 0.65, // Semantic clones
};

const COMPLEXITY_WEIGHTS = {
  lines: 0.1,
  branches: 0.3,
  loops: 0.2,
  functions: 0.2,
  classes: 0.2,
};

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================
interface CodeMetrics {
  lines: number;
  branches: number;
  loops: number;
  functions: number;
  classes: number;
  complexity: number;
}

interface CodePattern {
  pattern: string;
  type: "antipattern" | "smell" | "improvement";
  description: string;
  suggestion: string;
}

// =============================================================================
// 4. UTILITY FUNCTIONS AND HELPERS
// =============================================================================
function extractCodeMetrics(code: string): CodeMetrics {
  const lines = code.split("\n").length;
  const branches = (code.match(/if\s*\(|else\s*{|switch\s*\(|case\s+/g) || []).length;
  const loops = (code.match(/for\s*\(|while\s*\(|do\s*{/g) || []).length;
  const functions = (code.match(/function\s+\w+|=>\s*{|async\s+function/g) || []).length;
  const classes = (code.match(/class\s+\w+/g) || []).length;

  const complexity =
    lines * COMPLEXITY_WEIGHTS.lines +
    branches * COMPLEXITY_WEIGHTS.branches +
    loops * COMPLEXITY_WEIGHTS.loops +
    functions * COMPLEXITY_WEIGHTS.functions +
    classes * COMPLEXITY_WEIGHTS.classes;

  return { lines, branches, loops, functions, classes, complexity };
}

function determineSemanticType(code: string): SemanticAnalysis["semanticType"] {
  const lowerCode = code.toLowerCase();

  if (lowerCode.includes("test") || lowerCode.includes("spec")) {
    return "test";
  } else if (lowerCode.includes("class")) {
    return "class";
  } else if (lowerCode.includes("function") || lowerCode.includes("=>")) {
    return "function";
  } else if (lowerCode.includes("export") || lowerCode.includes("module")) {
    return "module";
  } else {
    return "utility";
  }
}

function extractEntities(code: string): string[] {
  const entities: string[] = [];

  // Extract function names
  const funcMatches = code.match(/function\s+(\w+)/g) || [];
  entities.push(...funcMatches.map((m) => m.replace("function ", "")));

  // Extract class names
  const classMatches = code.match(/class\s+(\w+)/g) || [];
  entities.push(...classMatches.map((m) => m.replace("class ", "")));

  // Extract variable names
  const varMatches = code.match(/(?:const|let|var)\s+(\w+)/g) || [];
  entities.push(...varMatches.map((m) => m.replace(/(?:const|let|var)\s+/, "")));

  return [...new Set(entities)]; // Remove duplicates
}

// =============================================================================
// 5. CORE BUSINESS LOGIC
// =============================================================================
export class CodeAnalyzer {
  private vectorStore: VectorStore;
  private embeddingGen: EmbeddingGenerator;
  private cache: SemanticCache;
  private patterns: CodePattern[] = [];

  constructor(vectorStore: VectorStore, embeddingGen: EmbeddingGenerator, cache: SemanticCache) {
    this.vectorStore = vectorStore;
    this.embeddingGen = embeddingGen;
    this.cache = cache;
    this.initializePatterns();
  }

  /**
   * Initialize code patterns for analysis
   */
  private initializePatterns(): void {
    this.patterns = [
      {
        pattern: "nested_loops",
        type: "smell",
        description: "Deeply nested loops detected",
        suggestion: "Consider extracting inner loops into separate functions",
      },
      {
        pattern: "long_function",
        type: "smell",
        description: "Function exceeds recommended length",
        suggestion: "Break down into smaller, focused functions",
      },
      {
        pattern: "duplicate_logic",
        type: "antipattern",
        description: "Similar logic appears multiple times",
        suggestion: "Extract common logic into a reusable function",
      },
      {
        pattern: "complex_condition",
        type: "smell",
        description: "Complex conditional expression",
        suggestion: "Extract condition into a well-named variable or function",
      },
    ];
  }

  /**
   * Analyze code semantics
   */
  async analyzeCodeSemantics(code: string): Promise<SemanticAnalysis> {
    // Check cache first
    const cacheKey = `analysis:${code.slice(0, 100)}`;
    const cached = this.cache.get<SemanticAnalysis>(cacheKey);
    if (cached) {
      return cached;
    }

    // Extract metrics and entities
    const metrics = extractCodeMetrics(code);
    const entities = extractEntities(code);
    const semanticType = determineSemanticType(code);

    // Extract concepts using simple heuristics
    const concepts = this.extractConcepts(code);

    // Generate summary
    const summary = this.generateSummary(code, entities, semanticType);

    const analysis: SemanticAnalysis = {
      entities,
      concepts,
      complexity: metrics.complexity,
      semanticType,
      summary,
    };

    // Cache the result
    this.cache.set(cacheKey, analysis, 3600000); // 1 hour TTL

    return analysis;
  }

  /**
   * Find similar code snippets
   */
  async findSimilarCode(code: string, threshold = 0.5): Promise<SimilarCode[]> {
    // Generate embedding for the code
    const embedding = await this.embeddingGen.generateCodeEmbedding(code);

    // Search for similar vectors
    const results = await this.vectorStore.search(embedding, 20);

    // Filter by threshold and map to SimilarCode format
    const similarCode: SimilarCode[] = results
      .filter((r) => r.similarity >= threshold)
      .map((r) => ({
        id: r.id,
        path: (r.metadata?.["path"] as string) || (r.metadata?.["filePath"] as string) || "",
        content: r.content,
        similarity: r.similarity,
        type: this.determineSimilarityType(r.similarity),
        startLine: r.metadata?.["startLine"] as number | undefined,
        endLine: r.metadata?.["endLine"] as number | undefined,
        name: r.metadata?.["name"] as string | undefined,
      }));

    return similarCode;
  }

  /**
   * Detect code clones in the codebase
   * Optimized with:
   * - Entity caching to avoid redundant get() calls
   * - Union-Find for O(α(n)) group merging
   * - Parallel processing where possible
   */
  async detectClones(minSimilarity = 0.65): Promise<CloneGroup[]> {
    // Get total count
    const totalCount = await this.vectorStore.count();

    if (totalCount === 0) {
      return [];
    }

    // Limit clone detection to avoid performance issues on large codebases
    const maxSamples = Math.min(100, totalCount);

    log.d("ANALYZER", "Analyzing code fragments for clones", { maxSamples, minSimilarity });

    // Cache for entity metadata to avoid redundant get() calls
    const entityCache = new Map<string, { content: string; metadata: any; vector?: Float32Array }>();

    // Union-Find data structure for O(α(n)) group merging
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const find = (x: string): string => {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
      }
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!)); // Path compression
      }
      return parent.get(x)!;
    };

    const union = (x: string, y: string): void => {
      const rootX = find(x);
      const rootY = find(y);
      if (rootX === rootY) return;

      // Union by rank
      const rankX = rank.get(rootX) || 0;
      const rankY = rank.get(rootY) || 0;
      if (rankX < rankY) {
        parent.set(rootX, rootY);
      } else if (rankX > rankY) {
        parent.set(rootY, rootX);
      } else {
        parent.set(rootY, rootX);
        rank.set(rootX, rankX + 1);
      }
    };

    // Sample vectors using diverse random searches
    const sampleIds = new Set<string>();
    const searchPromises: Promise<void>[] = [];

    // Get samples in parallel using multiple random vectors
    const numSearches = Math.min(5, Math.ceil(maxSamples / 20));
    for (let i = 0; i < numSearches; i++) {
      const randomVector = new Float32Array(384).map(() => Math.random() - 0.5);
      searchPromises.push(
        this.vectorStore.search(randomVector, 20).then((results) => {
          for (const result of results) {
            if (sampleIds.size >= maxSamples) break;
            if (!sampleIds.has(result.id)) {
              sampleIds.add(result.id);
              // Cache entity data from search results
              entityCache.set(result.id, {
                content: result.content,
                metadata: result.metadata,
              });
            }
          }
        }),
      );
    }
    await Promise.all(searchPromises);

    // Find similar pairs using random search clustering
    // Since VectorStore.get() returns empty vectors (Faiss HNSW doesn't support reconstruct),
    // we use results from random searches to find clusters of similar entities.
    // Entities appearing in the same search result with high similarity are likely related.
    const processedPairs = new Set<string>();
    const similarityMap = new Map<string, number>();

    // Use random vector searches to find clusters
    const clusterSearches = Math.min(10, Math.ceil(maxSamples / 10));
    for (let i = 0; i < clusterSearches; i++) {
      const randomVector = new Float32Array(384).map(() => Math.random() - 0.5);
      const results = await this.vectorStore.search(randomVector, 30);

      // Results with similar similarity scores to the random vector are likely similar to each other
      // Group results by similarity buckets and union them
      const highSimilarityResults = results.filter((r) => r.similarity >= minSimilarity);

      for (let j = 0; j < highSimilarityResults.length; j++) {
        const r1 = highSimilarityResults[j]!;
        // Cache entity data
        if (!entityCache.has(r1.id)) {
          entityCache.set(r1.id, { content: r1.content, metadata: r1.metadata });
        }

        for (let k = j + 1; k < highSimilarityResults.length; k++) {
          const r2 = highSimilarityResults[k]!;
          // If both have high similarity to same random vector, they might be similar
          // Use geometric mean of their similarities as estimate
          const estimatedSimilarity = Math.sqrt(r1.similarity * r2.similarity);
          if (estimatedSimilarity < minSimilarity) continue;

          const pairKey = [r1.id, r2.id].sort().join("|");
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          similarityMap.set(pairKey, estimatedSimilarity);
          union(r1.id, r2.id);

          if (!entityCache.has(r2.id)) {
            entityCache.set(r2.id, { content: r2.content, metadata: r2.metadata });
          }
        }
      }
    }

    // Build clone groups from Union-Find structure
    const groupMembers = new Map<string, Set<string>>();
    for (const id of parent.keys()) {
      const root = find(id);
      if (!groupMembers.has(root)) {
        groupMembers.set(root, new Set());
      }
      groupMembers.get(root)!.add(id);
    }

    // Convert to CloneGroup format
    const cloneGroups: CloneGroup[] = [];
    let groupIndex = 0;

    for (const [, memberIds] of groupMembers) {
      if (memberIds.size < 2) continue; // Skip groups with single member

      const members = Array.from(memberIds);

      // Calculate average similarity for the group
      let totalSimilarity = 0;
      let pairCount = 0;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const pairKey = [members[i], members[j]].sort().join("|");
          if (similarityMap.has(pairKey)) {
            totalSimilarity += similarityMap.get(pairKey)!;
            pairCount++;
          }
        }
      }
      const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : minSimilarity;

      // Build member list from cache (no additional get() calls needed)
      const clones: SimilarCode[] = members.map((id) => {
        const cached = entityCache.get(id);
        return {
          id,
          path: (cached?.metadata?.["path"] as string) || (cached?.metadata?.["filePath"] as string) || "",
          content: cached?.content || "",
          similarity: avgSimilarity,
          type: this.determineSimilarityType(avgSimilarity),
          startLine: cached?.metadata?.["startLine"] as number | undefined,
          endLine: cached?.metadata?.["endLine"] as number | undefined,
          name: cached?.metadata?.["name"] as string | undefined,
        };
      });

      cloneGroups.push({
        id: `clone-${++groupIndex}`,
        cloneType: this.determineCloneType(avgSimilarity),
        members: clones,
        avgSimilarity,
      });
    }

    log.d("ANALYZER", "Clone detection complete", {
      cloneGroups: cloneGroups.length,
      entitiesCached: entityCache.size,
      pairsProcessed: processedPairs.size,
    });

    return cloneGroups;
  }

  /**
   * Cross-language semantic search
   */
  async crossLanguageSearch(query: string, languages: string[]): Promise<CrossLangResult[]> {
    // Generate query embedding
    const embedding = await this.embeddingGen.generateEmbedding(query);

    // Search across all languages
    const results = await this.vectorStore.search(embedding, 50);

    // Filter by language and map to CrossLangResult
    const crossLangResults: CrossLangResult[] = results
      .filter((r) => {
        const lang = r.metadata?.["language"] as string;
        return languages.includes(lang);
      })
      .map((r) => ({
        id: r.id,
        language: (r.metadata?.["language"] as string) || "unknown",
        path: (r.metadata?.["path"] as string) || (r.metadata?.["filePath"] as string) || "",
        content: r.content,
        similarity: r.similarity,
        startLine: r.metadata?.["startLine"] as number | undefined,
        endLine: r.metadata?.["endLine"] as number | undefined,
        name: r.metadata?.["name"] as string | undefined,
      }));

    return crossLangResults;
  }

  /**
   * Suggest refactoring opportunities
   */
  async suggestRefactoring(code: string): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    const metrics = extractCodeMetrics(code);

    // Check for long functions
    if (metrics.lines > 50) {
      suggestions.push({
        type: "extract",
        description: "Function is too long",
        impact: "medium",
        confidence: 0.8,
        code: "// Consider breaking this function into smaller pieces",
      });
    }

    // Check for complex conditions
    if (metrics.branches > 10) {
      suggestions.push({
        type: "simplify",
        description: "High cyclomatic complexity detected",
        impact: "high",
        confidence: 0.9,
        code: "// Consider using early returns or extracting complex conditions",
      });
    }

    // Check for duplicate code
    const similarCode = await this.findSimilarCode(code, 0.85);
    if (similarCode.length > 1) {
      suggestions.push({
        type: "combine",
        description: `Found ${similarCode.length} similar code fragments`,
        impact: "high",
        confidence: 0.85,
        code: "// Consider extracting common functionality into a shared function",
      });
    }

    // Check for naming improvements
    const entities = extractEntities(code);
    for (const entity of entities) {
      if (entity.length < 3 || entity === "tmp" || entity === "temp") {
        suggestions.push({
          type: "rename",
          description: `Poor variable name: '${entity}'`,
          impact: "low",
          confidence: 0.7,
        });
      }
    }

    // Check against known patterns
    for (const pattern of this.patterns) {
      if (this.matchesPattern(code, pattern)) {
        suggestions.push({
          type: pattern.type === "antipattern" ? "extract" : "simplify",
          description: pattern.description,
          impact: pattern.type === "antipattern" ? "high" : "medium",
          confidence: 0.75,
          code: `// ${pattern.suggestion}`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate code embedding
   */
  async generateCodeEmbedding(code: string): Promise<Float32Array> {
    return this.embeddingGen.generateCodeEmbedding(code);
  }

  // Private helper methods

  private extractConcepts(code: string): string[] {
    const concepts: string[] = [];

    // Extract programming concepts
    if (code.includes("async") || code.includes("await")) {
      concepts.push("asynchronous");
    }
    if (code.includes("Promise")) {
      concepts.push("promises");
    }
    if (code.includes("class")) {
      concepts.push("object-oriented");
    }
    if (code.includes("=>")) {
      concepts.push("functional");
    }
    if (code.includes("test") || code.includes("expect")) {
      concepts.push("testing");
    }
    if (code.includes("try") && code.includes("catch")) {
      concepts.push("error-handling");
    }

    return concepts;
  }

  private generateSummary(code: string, entities: string[], semanticType: SemanticAnalysis["semanticType"]): string {
    const lines = code.split("\n").length;
    const mainEntity = entities[0] || "code";

    return `${semanticType} containing ${entities.length} entities (${lines} lines). Main entity: ${mainEntity}`;
  }

  private determineSimilarityType(similarity: number): SimilarCode["type"] {
    if (similarity >= CLONE_TYPE_THRESHOLDS.type1) {
      return "exact";
    } else if (similarity >= CLONE_TYPE_THRESHOLDS.type2) {
      return "near";
    } else {
      return "semantic";
    }
  }

  private determineCloneType(similarity: number): CloneGroup["cloneType"] {
    if (similarity >= CLONE_TYPE_THRESHOLDS.type1) {
      return "type1"; // Exact clones
    } else if (similarity >= CLONE_TYPE_THRESHOLDS.type2) {
      return "type2"; // Renamed clones
    } else if (similarity >= CLONE_TYPE_THRESHOLDS.type3) {
      return "type3"; // Gapped clones
    } else {
      return "type4"; // Semantic clones
    }
  }

  private matchesPattern(code: string, pattern: CodePattern): boolean {
    // Simplified pattern matching - in production would use AST analysis
    switch (pattern.pattern) {
      case "nested_loops":
        return (code.match(/for\s*\([^)]*\)\s*{[^}]*for\s*\(/g) || []).length > 0;
      case "long_function":
        return code.split("\n").length > 50;
      case "complex_condition":
        return (code.match(/if\s*\([^)]{50,}\)/g) || []).length > 0;
      default:
        return false;
    }
  }

  /**
   * Get analyzer statistics
   */
  getStats(): {
    patternsLoaded: number;
    cacheStats: ReturnType<SemanticCache["getStats"]>;
  } {
    return {
      patternsLoaded: this.patterns.length,
      cacheStats: this.cache.getStats(),
    };
  }
}
