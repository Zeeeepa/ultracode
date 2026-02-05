/**
 * Analysis Tool Handlers
 *
 * Handlers for code analysis operations:
 * - suggest_refactoring
 * - analyze_hotspots
 * - find_related_concepts
 * - analyze_state_chaos
 * - analyze_code_impact
 * - detect_technology_stack
 */

import { execSync } from "node:child_process";
import { z } from "zod";
import type { TechnologyStack } from "../../analysis/technology-detector.js";
import { log } from "../../logging/index.js";
import type { GraphStorageLibSQL } from "../../storage/graph-storage-libsql.js";
import { TimeTravelManager } from "../../storage/prolly/index.js";
import type { RefactoringSuggestion } from "../../types/semantic.js";
import { toError } from "../../utils/error-handling.js";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, paginate, SAFE_LIMITS } from "../response-limits.js";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Refactoring suggestion output format for API response
 */
interface RefactoringSuggestionOutput {
  type: string;
  impact: string;
  confidence: number;
  description: string;
  entityId?: string;
  filePath?: string;
  suggestedCode?: string;
}

/**
 * Code hotspot with metrics
 */
interface Hotspot {
  id: string;
  name: string;
  type: string;
  filePath?: string;
  score: number;
  metrics: HotspotMetrics;
}

/**
 * Hotspot metrics
 */
interface HotspotMetrics {
  linesOfCode?: number;
  cyclomaticComplexity?: number;
  cognitiveComplexity?: number;
  nestingDepth?: number;
  parameterCount?: number;
  changeFrequency?: number;
  changeFrequencyScore?: number;
  changeSource?: "prolly" | "git" | "none";
  couplingScore?: number;
  dependencyCount?: number;
}

/**
 * Parsed entity from GraphStorage
 */
interface ParsedEntity {
  id: string;
  name: string;
  type: string;
  filePath?: string;
  code?: string;
  location?: {
    start?: { line?: number };
    end?: { line?: number };
  };
  metadata?: {
    metrics?: HotspotMetrics;
    isStateful?: boolean;
    [key: string]: unknown;
  };
}

/**
 * State chaos analysis result
 */
interface StateAnalysis {
  totalStateEntities: number;
  statePatterns: string[];
  chaosScore: number;
  recommendations: string[];
}

// TechnologyStack imported from technology-detector.ts

// =============================================================================
// SUGGEST REFACTORING
// =============================================================================

const SuggestRefactoringSchema = z.object({
  entityId: z.string().optional(),
  filePath: z.string().optional(),
  projectPath: projectPathParam,
  type: z.enum(["extract_method", "rename", "move", "simplify", "all"]).optional().default("all"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
});

export class SuggestRefactoringToolHandler extends BaseToolHandler<z.infer<typeof SuggestRefactoringSchema>> {
  protected parseArgs(args: unknown) {
    return SuggestRefactoringSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SuggestRefactoringSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const semanticAgent = await this.context.getSemanticAgent();
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Get code from entity or file
    let code: string | undefined;
    const targetEntityId = args.entityId;
    let targetFilePath = args.filePath ? this.context.normalizeInputPath(args.filePath) : undefined;

    if (args.entityId) {
      // Get entity to find its file path
      const entity = await storage.getEntity(args.entityId);
      if (entity?.filePath) {
        targetFilePath = entity.filePath;
      }
    }

    if (!code && targetFilePath) {
      // Read file content
      try {
        const { readFile } = await import("node:fs/promises");
        code = await readFile(targetFilePath, "utf-8");
      } catch {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Cannot read file: ${targetFilePath}` }) }],
        };
      }
    }

    if (!code) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No code found. Provide entityId or filePath." }) }],
      };
    }

    // suggestRefactoring expects a code string
    const allSuggestions = await semanticAgent.suggestRefactoring(code);

    const paginatedResult = paginate(allSuggestions, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entityId: targetEntityId,
              filePath: targetFilePath,
              suggestionsFound: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              suggestions: paginatedResult.data.map(
                (s: RefactoringSuggestion): RefactoringSuggestionOutput => ({
                  type: s.type,
                  impact: s.impact,
                  confidence: s.confidence,
                  description: s.description,
                  entityId: targetEntityId,
                  filePath: targetFilePath,
                  suggestedCode: s.code,
                }),
              ),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// ANALYZE HOTSPOTS
// =============================================================================

const AnalyzeHotspotsSchema = z.object({
  projectPath: projectPathParam,
  metric: z.enum(["complexity", "changes", "coupling", "all"]).optional().default("complexity"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.hotspots),
  includeHistoricalMetrics: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use Prolly Tree history for changeFrequency calculation"),
  lookbackDays: z.number().optional().default(30).describe("Number of days to look back for change frequency"),
});

export class AnalyzeHotspotsToolHandler extends BaseToolHandler<z.infer<typeof AnalyzeHotspotsSchema>> {
  // Cache for change frequency to avoid redundant calculations within same execution
  private changeFrequencyCache = new Map<string, { changeCount: number; source: "prolly" | "git" | "none" }>();

  protected parseArgs(args: unknown) {
    return AnalyzeHotspotsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AnalyzeHotspotsSchema>): Promise<ToolResult> {
    // Clear cache for fresh execution
    this.changeFrequencyCache.clear();

    // v3: Ensure correct project context for GraphStorage queries
    const storage = (await this.ensureGraphStorageForProject(args.projectPath)) as GraphStorageLibSQL;
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Get all entities (limited to prevent memory issues)
    const entities = await storage.findEntities({ filters: {}, limit: 5000 });

    // Pre-calculate change frequencies if using historical metrics with "changes" or "all"
    const needsHistory = args.includeHistoricalMetrics && (args.metric === "changes" || args.metric === "all");

    if (needsHistory) {
      await this.preloadChangeFrequencies(entities, storage, args.lookbackDays);
    }

    // Analyze hotspots based on metric
    const hotspots: Hotspot[] = [];

    for (const entity of entities) {
      const { score, changeMetrics } = this.calculateHotspotScore(entity, args.metric, args.includeHistoricalMetrics);
      if (score > 0) {
        // Get metrics or calculate basic ones from location
        const storedMetrics = (entity.metadata?.["metrics"] ?? {}) as Partial<HotspotMetrics>;
        const storedLinesOfCode = storedMetrics.linesOfCode;
        const linesOfCode: number | undefined =
          storedLinesOfCode ??
          (entity.location?.end?.line && entity.location?.start?.line
            ? entity.location.end.line - entity.location.start.line + 1
            : undefined);

        hotspots.push({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          filePath: entity.filePath,
          score: Math.round(score * 100) / 100,
          metrics: {
            ...storedMetrics,
            ...(linesOfCode !== undefined && storedLinesOfCode === undefined ? { linesOfCode } : {}),
            ...changeMetrics,
          },
        });
      }
    }

    // Sort by score
    hotspots.sort((a, b) => b.score - a.score);

    // Apply pagination to sorted results
    const paginatedResult = paginate(hotspots, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              metric: args.metric,
              includeHistoricalMetrics: args.includeHistoricalMetrics,
              lookbackDays: args.lookbackDays,
              hotspotsFound: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              hotspots: paginatedResult.data,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Pre-load change frequencies for all entities in a batch to minimize diff operations.
   * Uses Prolly Tree history first, falls back to Git for entities without Prolly data.
   */
  private async preloadChangeFrequencies(
    entities: ParsedEntity[],
    storage: GraphStorageLibSQL,
    lookbackDays: number,
  ): Promise<void> {
    const adapter = storage.getLibSQLAdapter?.();
    const commitManager = adapter?.getCommitManager?.();
    const nodeStore = adapter?.getProllyNodeStore?.();

    const entityChangeCount = new Map<string, { count: number; source: "prolly" | "git" | "none" }>();
    let prollyDataAvailable = false;

    // Initialize all entities with 0 changes
    for (const entity of entities) {
      entityChangeCount.set(entity.id, { count: 0, source: "none" });
    }

    // === Phase 1: Try Prolly Tree ===
    if (commitManager && nodeStore) {
      const sinceTimestamp = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
      const recentCommits = await commitManager.getCommitsSince(sinceTimestamp);

      if (recentCommits.length >= 2) {
        prollyDataAvailable = true;
        const timeTravel = new TimeTravelManager(nodeStore, commitManager);

        // Analyze each commit pair
        for (let i = 0; i < recentCommits.length - 1; i++) {
          const current = recentCommits[i];
          const parent = recentCommits[i + 1];
          if (!current || !parent) continue;

          try {
            const diff = await timeTravel.diffCommits(parent.commitHash, current.commitHash);
            if (!diff) continue;

            // Count changes for each entity
            for (const entry of [...diff.treeDiff.added, ...diff.treeDiff.modified, ...diff.treeDiff.deleted]) {
              const existing = entityChangeCount.get(entry.key);
              if (existing) {
                entityChangeCount.set(entry.key, { count: existing.count + 1, source: "prolly" });
              }
            }
          } catch (error) {
            log.w("HOTSPOTS", "diff_failed", { error: (error as Error).message });
          }
        }

        log.d("HOTSPOTS", "prolly_preload_complete", {
          commits: recentCommits.length,
          withChanges: [...entityChangeCount.values()].filter((v) => v.count > 0).length,
        });
      } else {
        log.d("HOTSPOTS", "insufficient_commits", { count: recentCommits.length });
      }
    } else {
      log.d("HOTSPOTS", "prolly_not_available", { reason: "missing components" });
    }

    // === Phase 2: Git fallback for entities without Prolly data ===
    // Only use Git if Prolly data wasn't available or for entities with 0 changes
    const gitChangeCache = new Map<string, number>(); // Cache by filePath
    let gitFallbackCount = 0;

    for (const entity of entities) {
      const current = entityChangeCount.get(entity.id);
      if (!current || current.count > 0 || !entity.filePath) continue;

      // Check Git cache first (multiple entities can share same file)
      let gitCount = gitChangeCache.get(entity.filePath);
      if (gitCount === undefined) {
        gitCount = this.getChangeFrequencyFromGit(entity.filePath, lookbackDays);
        gitChangeCache.set(entity.filePath, gitCount);
      }

      if (gitCount > 0) {
        entityChangeCount.set(entity.id, { count: gitCount, source: "git" });
        gitFallbackCount++;
      }
    }

    if (gitFallbackCount > 0) {
      log.d("HOTSPOTS", "git_fallback_complete", {
        filesChecked: gitChangeCache.size,
        entitiesUpdated: gitFallbackCount,
      });
    }

    // Store in cache
    for (const [entityId, data] of entityChangeCount) {
      this.changeFrequencyCache.set(entityId, { changeCount: data.count, source: data.source });
    }

    log.d("HOTSPOTS", "preloaded_change_frequencies", {
      entities: entities.length,
      prollyAvailable: prollyDataAvailable,
      withChanges: [...entityChangeCount.values()].filter((v) => v.count > 0).length,
    });
  }

  /**
   * Get change frequency from Git log (fallback when Prolly data unavailable).
   */
  private getChangeFrequencyFromGit(filePath: string, lookbackDays: number): number {
    try {
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const output = execSync(`git log --oneline --since="${since}" -- "${filePath}"`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Count lines (commits)
      const lines = output.trim().split("\n").filter(Boolean);
      return lines.length;
    } catch {
      // Git not available or file not tracked
      return 0;
    }
  }

  private calculateHotspotScore(
    entity: ParsedEntity,
    metric: string,
    includeHistoricalMetrics: boolean,
  ): {
    score: number;
    changeMetrics?: { changeFrequency: number; changeFrequencyScore: number; changeSource: "prolly" | "git" | "none" };
  } {
    const metrics = entity.metadata?.metrics || {};
    let score = 0;
    let changeMetrics:
      | { changeFrequency: number; changeFrequencyScore: number; changeSource: "prolly" | "git" | "none" }
      | undefined;

    // Calculate lines from location if metrics not available
    const linesOfCode =
      metrics.linesOfCode ||
      (entity.location?.end?.line && entity.location?.start?.line
        ? entity.location.end.line - entity.location.start.line + 1
        : 0);

    if (metric === "complexity" || metric === "all") {
      // Cyclomatic complexity is the primary metric
      score += (metrics.cyclomaticComplexity || 0) * 2;
      // Cognitive complexity (harder to understand)
      score += (metrics.cognitiveComplexity || 0) * 1.5;
      // Nesting depth (deep nesting is bad)
      score += (metrics.nestingDepth || 0) * 3;
      // Lines of code (larger = harder to maintain)
      score += linesOfCode / 50;
      // Too many parameters
      const paramCount = metrics.parameterCount || 0;
      score += paramCount > 4 ? (paramCount - 4) * 2 : 0;
    }

    if (metric === "changes" || metric === "all") {
      if (includeHistoricalMetrics) {
        // Use pre-calculated change frequency from cache
        const cached = this.changeFrequencyCache.get(entity.id);
        if (cached && cached.changeCount > 0) {
          // Log-normalized score: log(changeCount + 1) * 10
          const changeScore = Math.log(cached.changeCount + 1) * 10;
          score += changeScore;
          changeMetrics = {
            changeFrequency: cached.changeCount,
            changeFrequencyScore: Math.round(changeScore * 100) / 100,
            changeSource: cached.source,
          };
        } else {
          changeMetrics = {
            changeFrequency: 0,
            changeFrequencyScore: 0,
            changeSource: "none",
          };
        }
      } else {
        // Use stored metrics (legacy behavior)
        score += (metrics.changeFrequency || 0) * 10;
      }
    }

    if (metric === "coupling" || metric === "all") {
      // coupling metrics require dependency analysis (not yet implemented)
      score += metrics.couplingScore || 0;
      score += (metrics.dependencyCount || 0) / 5;
    }

    return { score, changeMetrics };
  }
}

// =============================================================================
// FIND RELATED CONCEPTS
// =============================================================================

const FindRelatedConceptsSchema = z.object({
  entityId: z.string().describe("Entity ID to find related concepts for"),
  projectPath: projectPathParam,
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
});

export class FindRelatedConceptsToolHandler extends BaseToolHandler<z.infer<typeof FindRelatedConceptsSchema>> {
  protected parseArgs(args: unknown) {
    return FindRelatedConceptsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof FindRelatedConceptsSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const semanticAgent = await this.context.getSemanticAgent();
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Get entity name from ID to use as concept
    const entity = await storage.getEntity(args.entityId);
    if (!entity) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Entity not found: ${args.entityId}` }) }],
      };
    }

    const concept = entity.name;

    // Use semanticSearch to find related concepts
    const searchResult = await semanticAgent.semanticSearch(concept, 500);
    const allRelated = searchResult.results || [];

    const paginatedResult = paginate(allRelated, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entityId: args.entityId,
              concept,
              relatedCount: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              related: paginatedResult.data,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// ANALYZE STATE CHAOS
// =============================================================================

const AnalyzeStateChaosSchema = z.object({
  projectPath: projectPathParam,
  format: z.enum(["summary", "detailed", "json"]).optional().default("summary"),
});

export class AnalyzeStateChaosToolHandler extends BaseToolHandler<z.infer<typeof AnalyzeStateChaosSchema>> {
  protected parseArgs(args: unknown) {
    return AnalyzeStateChaosSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AnalyzeStateChaosSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    // Find state-related entities (limited to prevent memory issues)
    const entities = await storage.findEntities({
      filters: {},
      limit: 5000,
    });

    // Analyze state management patterns
    const stateEntities = entities.filter(
      (e: ParsedEntity) =>
        e.name.toLowerCase().includes("state") ||
        e.name.toLowerCase().includes("store") ||
        e.name.toLowerCase().includes("context") ||
        e.metadata?.isStateful,
    );

    const analysis = {
      totalStateEntities: stateEntities.length,
      statePatterns: this.detectStatePatterns(stateEntities),
      chaosScore: this.calculateChaosScore(stateEntities),
      recommendations: this.generateRecommendations(stateEntities),
    };

    if (args.format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    }

    const text = args.format === "detailed" ? this.formatDetailed(analysis) : this.formatSummary(analysis);

    return {
      content: [{ type: "text", text }],
    };
  }

  private detectStatePatterns(entities: ParsedEntity[]): string[] {
    const patterns: string[] = [];
    const names = entities.map((e) => e.name.toLowerCase());

    if (names.some((n) => n.includes("redux"))) patterns.push("Redux");
    if (names.some((n) => n.includes("zustand"))) patterns.push("Zustand");
    if (names.some((n) => n.includes("mobx"))) patterns.push("MobX");
    if (names.some((n) => n.includes("context"))) patterns.push("React Context");
    if (names.some((n) => n.includes("vuex"))) patterns.push("Vuex");
    if (names.some((n) => n.includes("pinia"))) patterns.push("Pinia");

    return patterns.length > 0 ? patterns : ["Custom/Unknown"];
  }

  private calculateChaosScore(entities: ParsedEntity[]): number {
    // Higher score = more chaos
    let score = 0;
    score += entities.length > 20 ? 30 : entities.length;
    score += this.detectStatePatterns(entities).length > 2 ? 20 : 0;
    return Math.min(100, score);
  }

  private generateRecommendations(entities: ParsedEntity[]): string[] {
    const recs: string[] = [];
    if (entities.length > 20) {
      recs.push("Consider consolidating state management");
    }
    if (this.detectStatePatterns(entities).length > 2) {
      recs.push("Multiple state patterns detected - consider standardizing");
    }
    return recs;
  }

  private formatSummary(analysis: StateAnalysis): string {
    return `State Analysis Summary:
- Total state entities: ${analysis.totalStateEntities}
- Patterns detected: ${analysis.statePatterns.join(", ")}
- Chaos score: ${analysis.chaosScore}/100
- Recommendations: ${analysis.recommendations.length}`;
  }

  private formatDetailed(analysis: StateAnalysis): string {
    return `${this.formatSummary(analysis)}

Recommendations:
${analysis.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}`;
  }
}

// =============================================================================
// ANALYZE CODE IMPACT
// =============================================================================

const AnalyzeCodeImpactSchema = z.object({
  entityId: z.string().optional(),
  filePath: z.string().optional(),
  projectPath: projectPathParam,
  depth: z.number().optional().default(3),
});

export class AnalyzeCodeImpactToolHandler extends BaseToolHandler<z.infer<typeof AnalyzeCodeImpactSchema>> {
  protected parseArgs(args: unknown) {
    return AnalyzeCodeImpactSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AnalyzeCodeImpactSchema>): Promise<ToolResult> {
    // v3: Ensure correct project context for GraphStorage queries
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    let entityId = args.entityId;

    // Find entity by file path if needed
    if (!entityId && args.filePath) {
      const normalizedPath = this.context.normalizeInputPath(args.filePath);
      const entities = await storage.findEntities({
        filters: { filePath: normalizedPath },
        limit: 1,
      });
      if (entities.length > 0 && entities[0]) {
        entityId = entities[0].id;
      }
    }

    if (!entityId) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Entity not found" }) }],
      };
    }

    // Get entity and its relationships
    const entity = await storage.getEntity(entityId);
    const relationships = await storage.getRelationshipsForEntity(entityId);

    // Calculate impact
    const impactedEntities = new Set<string>();
    const queue = [entityId];
    let currentDepth = 0;

    while (queue.length > 0 && currentDepth < args.depth) {
      const current = queue.shift()!;
      const rels = await storage.getRelationshipsForEntity(current);

      for (const rel of rels) {
        const targetId = rel.fromId === current ? rel.toId : rel.fromId;
        if (!impactedEntities.has(targetId)) {
          impactedEntities.add(targetId);
          queue.push(targetId);
        }
      }
      currentDepth++;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entity: entity ? { id: entity.id, name: entity.name, type: entity.type } : null,
              directRelationships: relationships.length,
              totalImpactedEntities: impactedEntities.size,
              impactDepth: args.depth,
              riskLevel: impactedEntities.size > 50 ? "high" : impactedEntities.size > 20 ? "medium" : "low",
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// DETECT TECHNOLOGY STACK
// =============================================================================

const DetectTechnologyStackSchema = z.object({
  directory: z.string().optional(),
  projectPath: projectPathParam,
});

export class DetectTechnologyStackToolHandler extends BaseToolHandler<z.infer<typeof DetectTechnologyStackSchema>> {
  protected parseArgs(args: unknown) {
    return DetectTechnologyStackSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof DetectTechnologyStackSchema>): Promise<ToolResult> {
    // Use resolveProjectPath for proper path resolution
    const targetDir = args.directory
      ? (this.context.normalizeInputPath(args.directory) ?? this.resolveProjectPath({}))
      : this.resolveProjectPath({ projectPath: args.projectPath });

    try {
      const { TechnologyDetector } = await import("../../analysis/technology-detector.js");
      const graphStorage = await this.context.getGraphStorage();
      // CRITICAL: Set project context to target directory before querying
      graphStorage.setProject(targetDir);
      const detector = new TechnologyDetector(graphStorage, targetDir);
      const stack: TechnologyStack = await detector.detectStack();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                directory: targetDir,
                languages: stack.languages,
                frameworks: stack.frameworks,
                buildTools: stack.buildTools,
                dependencies: stack.dependencies,
                confidence: stack.confidence,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}
