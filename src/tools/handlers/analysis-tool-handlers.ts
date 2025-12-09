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
 * - lerna_project_graph
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, paginate, SAFE_LIMITS } from "../response-limits.js";

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
    const semanticAgent = await this.context.getSemanticAgent();
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    const allSuggestions = await semanticAgent.suggestRefactoring({
      entityId: args.entityId,
      filePath: args.filePath ? this.context.normalizeInputPath(args.filePath) : undefined,
      type: args.type,
    });

    const paginatedResult = paginate(allSuggestions, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              suggestionsFound: paginatedResult.data.length,
              pagination: paginatedResult.pagination,
              suggestions: paginatedResult.data.map((s: any) => ({
                type: s.type,
                priority: s.priority,
                description: s.description,
                entityId: s.entityId,
                filePath: s.filePath,
                suggestedChange: s.suggestedChange,
              })),
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
  type: z.enum(["complexity", "changes", "coupling", "all"]).optional().default("all"),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.hotspots),
});

export class AnalyzeHotspotsToolHandler extends BaseToolHandler<z.infer<typeof AnalyzeHotspotsSchema>> {
  protected parseArgs(args: unknown) {
    return AnalyzeHotspotsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AnalyzeHotspotsSchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Get all entities (limited to prevent memory issues)
    const entities = await storage.findEntities({ filters: {}, limit: 5000 });

    // Analyze hotspots based on type
    const hotspots: any[] = [];

    for (const entity of entities) {
      const score = this.calculateHotspotScore(entity, args.type);
      if (score > 0) {
        hotspots.push({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          filePath: entity.filePath,
          score,
          metrics: entity.metadata?.metrics || {},
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
              type: args.type,
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

  private calculateHotspotScore(entity: any, type: string): number {
    const metrics = entity.metadata?.metrics || {};
    let score = 0;

    if (type === "complexity" || type === "all") {
      score += metrics.cyclomaticComplexity || 0;
      score += (metrics.linesOfCode || 0) / 100;
    }

    if (type === "changes" || type === "all") {
      score += (metrics.changeFrequency || 0) * 10;
    }

    if (type === "coupling" || type === "all") {
      score += metrics.couplingScore || 0;
      score += (metrics.dependencyCount || 0) / 5;
    }

    return score;
  }
}

// =============================================================================
// FIND RELATED CONCEPTS
// =============================================================================

const FindRelatedConceptsSchema = z.object({
  concept: z.string(),
  projectPath: projectPathParam,
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.searchResults),
});

export class FindRelatedConceptsToolHandler extends BaseToolHandler<z.infer<typeof FindRelatedConceptsSchema>> {
  protected parseArgs(args: unknown) {
    return FindRelatedConceptsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof FindRelatedConceptsSchema>): Promise<ToolResult> {
    const semanticAgent = await this.context.getSemanticAgent();
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);

    // Fetch more for pagination
    const allRelated = await semanticAgent.findRelatedConcepts(args.concept, {
      limit: 500,
    });

    const paginatedResult = paginate(allRelated, args.offset, safeLimit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              concept: args.concept,
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
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

    // Find state-related entities (limited to prevent memory issues)
    const entities = await storage.findEntities({
      filters: {},
      limit: 5000,
    });

    // Analyze state management patterns
    const stateEntities = entities.filter(
      (e: any) =>
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

  private detectStatePatterns(entities: any[]): string[] {
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

  private calculateChaosScore(entities: any[]): number {
    // Higher score = more chaos
    let score = 0;
    score += entities.length > 20 ? 30 : entities.length;
    score += this.detectStatePatterns(entities).length > 2 ? 20 : 0;
    return Math.min(100, score);
  }

  private generateRecommendations(entities: any[]): string[] {
    const recs: string[] = [];
    if (entities.length > 20) {
      recs.push("Consider consolidating state management");
    }
    if (this.detectStatePatterns(entities).length > 2) {
      recs.push("Multiple state patterns detected - consider standardizing");
    }
    return recs;
  }

  private formatSummary(analysis: any): string {
    return `State Analysis Summary:
- Total state entities: ${analysis.totalStateEntities}
- Patterns detected: ${analysis.statePatterns.join(", ")}
- Chaos score: ${analysis.chaosScore}/100
- Recommendations: ${analysis.recommendations.length}`;
  }

  private formatDetailed(analysis: any): string {
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
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

    let entityId = args.entityId;

    // Find entity by file path if needed
    if (!entityId && args.filePath) {
      const normalizedPath = this.context.normalizeInputPath(args.filePath);
      const entities = await storage.findEntities({
        filters: { filePath: normalizedPath },
        limit: 1,
      });
      if (entities.length > 0) {
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
    const targetDir = args.directory || this.context.config.directory;

    try {
      const { TechnologyDetector } = await import("../../analysis/technology-detector.js");
      const detector = new TechnologyDetector(targetDir, this.context.config.directory);
      const stack = await detector.detectStack();

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
                // Include additional properties if available
                ...((stack as any).packageManagers && { packageManagers: (stack as any).packageManagers }),
                ...((stack as any).testingFrameworks && { testingFrameworks: (stack as any).testingFrameworks }),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// LERNA PROJECT GRAPH
// =============================================================================

const LernaProjectGraphSchema = z.object({
  directory: z.string().optional(),
  projectPath: projectPathParam,
});

export class LernaProjectGraphToolHandler extends BaseToolHandler<z.infer<typeof LernaProjectGraphSchema>> {
  protected parseArgs(args: unknown) {
    return LernaProjectGraphSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof LernaProjectGraphSchema>): Promise<ToolResult> {
    const targetDir = args.directory || this.context.config.directory;

    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      // Check for lerna.json
      const lernaPath = join(targetDir, "lerna.json");
      const lernaConfig = JSON.parse(await readFile(lernaPath, "utf-8"));

      // Find packages
      const { glob } = await import("../../utils/glob.js");
      const packagePatterns = lernaConfig.packages || ["packages/*"];

      const packages: any[] = [];
      for (const pattern of packagePatterns) {
        const pkgDirs = await glob(pattern, { cwd: targetDir, onlyDirectories: true });
        for (const pkgDir of pkgDirs) {
          try {
            const pkgJsonPath = join(targetDir, pkgDir, "package.json");
            const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
            packages.push({
              name: pkgJson.name,
              version: pkgJson.version,
              path: pkgDir,
              dependencies: Object.keys(pkgJson.dependencies || {}),
              devDependencies: Object.keys(pkgJson.devDependencies || {}),
            });
          } catch {
            // Skip invalid packages
          }
        }
      }

      // Build dependency graph
      const graph: Record<string, string[]> = {};
      const packageNames = new Set(packages.map((p) => p.name));

      for (const pkg of packages) {
        const internalDeps = [...pkg.dependencies, ...pkg.devDependencies].filter((d: string) => packageNames.has(d));
        graph[pkg.name] = internalDeps;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                lernaVersion: lernaConfig.version,
                packagesCount: packages.length,
                packages,
                dependencyGraph: graph,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: (error as Error).message,
              hint: "Make sure lerna.json exists in the target directory",
            }),
          },
        ],
      };
    }
  }
}
