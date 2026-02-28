/**
 * Impact Analyzer for Code Modifications
 *
 * Automatically analyzes the impact of code changes and provides
 * AI-friendly insights about what might be affected.
 *
 * Used by modification tools to enrich their responses with:
 * - Direct dependencies (what calls/uses this code)
 * - State impact (what states are affected)
 * - Potential breaking changes
 * - Suggested review points
 */

import type { Entity, GraphStorage } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ImpactAnalysisResult {
  /** Whether analysis was performed */
  analyzed: boolean;

  /** Direct callers of the modified entity */
  directCallers: Array<{
    name: string;
    file: string;
    line: number;
  }>;

  /** Entities that depend on states modified by this code */
  stateImpact: Array<{
    state: string;
    affectedEntities: string[];
    risk: "low" | "medium" | "high";
  }>;

  /** Potential breaking changes detected */
  breakingChanges: Array<{
    description: string;
    location: string;
    severity: "warning" | "error";
  }>;

  /** Suggested points for review */
  reviewSuggestions: string[];

  /** Human-readable summary */
  summary: string;

  /** Confidence of the analysis (0-1) */
  confidence: number;
}

export interface ImpactAnalyzerOptions {
  /** Maximum depth for caller search */
  maxCallerDepth?: number;
  /** Include state impact analysis */
  analyzeStates?: boolean;
  /** Minimum confidence to include in results */
  minConfidence?: number;
}

// =============================================================================
// IMPACT ANALYZER
// =============================================================================

export class ImpactAnalyzer {
  private storage: GraphStorage;
  private semanticSearch?: {
    search(
      query: string,
      options: { limit: number; minSimilarity: number },
    ): Promise<Array<{ entityId: string; similarity: number }>>;
  };

  constructor(
    storage: GraphStorage,
    semanticSearch?: {
      search(
        query: string,
        options: { limit: number; minSimilarity: number },
      ): Promise<Array<{ entityId: string; similarity: number }>>;
    },
  ) {
    this.storage = storage;
    this.semanticSearch = semanticSearch;
  }

  /**
   * Analyze the impact of modifying an entity
   */
  async analyzeModificationImpact(
    entityId: string,
    options: ImpactAnalyzerOptions = {},
  ): Promise<ImpactAnalysisResult> {
    const { maxCallerDepth = 2, analyzeStates = true, minConfidence = 0.5 } = options;

    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      return this.emptyResult("Entity not found");
    }

    const directCallers = await this.findDirectCallers(entityId, maxCallerDepth);
    const stateImpact = analyzeStates ? await this.analyzeStateImpact(entity) : [];
    const breakingChanges = await this.detectBreakingChanges(entity, directCallers);
    const reviewSuggestions = this.generateReviewSuggestions(entity, directCallers, stateImpact);

    // Calculate confidence based on data completeness
    const confidence = this.calculateConfidence(directCallers.length, stateImpact.length);

    if (confidence < minConfidence) {
      return this.emptyResult("Insufficient data for reliable analysis");
    }

    const summary = this.generateSummary(entity, directCallers, stateImpact, breakingChanges);

    return {
      analyzed: true,
      directCallers,
      stateImpact,
      breakingChanges,
      reviewSuggestions,
      summary,
      confidence,
    };
  }

  /**
   * Analyze impact of creating a new file
   */
  async analyzeNewFileImpact(filePath: string, entityNames: string[]): Promise<ImpactAnalysisResult> {
    // For new files, check if similar code exists
    const similarCode: Array<{ name: string; file: string; similarity: number }> = [];

    if (this.semanticSearch) {
      for (const name of entityNames.slice(0, 3)) {
        try {
          const results = await this.semanticSearch.search(name, {
            limit: 3,
            minSimilarity: 0.7,
          });

          for (const result of results) {
            const entity = await this.storage.getEntity(result.entityId);
            if (entity && entity.filePath !== filePath) {
              similarCode.push({
                name: entity.name,
                file: entity.filePath,
                similarity: result.similarity,
              });
            }
          }
        } catch {
          // Semantic search not available
        }
      }
    }

    const reviewSuggestions: string[] = [];
    if (similarCode.length > 0) {
      reviewSuggestions.push(`Found ${similarCode.length} similar entities - consider reusing existing code`);
      for (const s of similarCode.slice(0, 3)) {
        reviewSuggestions.push(`  • ${s.name} in ${s.file} (${Math.round(s.similarity * 100)}% similar)`);
      }
    }

    return {
      analyzed: similarCode.length > 0,
      directCallers: [],
      stateImpact: [],
      breakingChanges: [],
      reviewSuggestions,
      summary: similarCode.length > 0 ? `⚠️ Similar code exists: ${similarCode.map((s) => s.name).join(", ")}` : "",
      confidence: similarCode.length > 0 ? 0.7 : 0,
    };
  }

  /**
   * Analyze impact of renaming a symbol
   */
  async analyzeRenameImpact(entityId: string, oldName: string, newName: string): Promise<ImpactAnalysisResult> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      return this.emptyResult("Entity not found");
    }

    // Find all references
    const references = await this.findAllReferences(entityId);
    const affectedFiles = new Set(references.map((r) => r.file));

    const breakingChanges: ImpactAnalysisResult["breakingChanges"] = [];

    // Check for potential naming conflicts
    const conflicts = await this.storage.searchEntities({ namePattern: newName });
    if (conflicts.length > 0) {
      breakingChanges.push({
        description: `Name "${newName}" already exists in ${conflicts.length} place(s)`,
        location: conflicts[0]!.filePath,
        severity: "warning",
      });
    }

    const reviewSuggestions = [`Rename will affect ${references.length} reference(s) in ${affectedFiles.size} file(s)`];

    if (references.length > 10) {
      reviewSuggestions.push("⚠️ Large refactoring - consider reviewing changes before applying");
    }

    return {
      analyzed: true,
      directCallers: references,
      stateImpact: [],
      breakingChanges,
      reviewSuggestions,
      summary: `Renaming ${oldName} → ${newName} affects ${references.length} references`,
      confidence: 0.9,
    };
  }

  /**
   * Detect if a modification breaks swagger API contracts.
   * Checks if the entity has PRODUCES_API relationships and analyzes the change.
   */
  async detectSwaggerContractBreaks(entityId: string): Promise<{
    affectsContract: boolean;
    contractBreaks: Array<{
      rule: string;
      change: "breaking" | "non-breaking" | "unknown";
      endpoint?: string;
      message: string;
    }>;
    isGeneratedCode: boolean;
    generatedFromSwagger: string | null;
  }> {
    const result = {
      affectsContract: false,
      contractBreaks: [] as Array<{
        rule: string;
        change: "breaking" | "non-breaking" | "unknown";
        endpoint?: string;
        message: string;
      }>,
      isGeneratedCode: false,
      generatedFromSwagger: null as string | null,
    };

    const entity = await this.storage.getEntity(entityId);
    if (!entity) return result;

    const relationships = await this.storage.getRelationshipsForEntity(entityId);

    for (const rel of relationships) {
      // Check if entity produces API (is a controller/route handler)
      if (rel.type === RelationType.PRODUCES_API && rel.fromId === entityId) {
        result.affectsContract = true;
        const swaggerEntity = await this.storage.getEntity(rel.toId);
        if (swaggerEntity) {
          const endpoint =
            `${swaggerEntity.metadata?.["httpMethod"] || ""} ${swaggerEntity.metadata?.["path"] || ""}`.trim();
          result.contractBreaks.push({
            rule: "controller-modified",
            change: "unknown",
            endpoint: endpoint || swaggerEntity.name,
            message: `API contract may be affected: controller produces ${endpoint || swaggerEntity.name}`,
          });
        }
      }

      // Check if entity is generated from swagger (generated code)
      if (rel.type === RelationType.GENERATED_FROM && rel.fromId === entityId) {
        result.isGeneratedCode = true;
        const swaggerEntity = await this.storage.getEntity(rel.toId);
        result.generatedFromSwagger = swaggerEntity?.filePath || null;
      }

      // Check if entity consumes API (is a generated client)
      if (rel.type === RelationType.CONSUMES_API && rel.fromId === entityId) {
        result.isGeneratedCode = true;
        const swaggerEntity = await this.storage.getEntity(rel.toId);
        result.generatedFromSwagger = swaggerEntity?.filePath || null;
      }
    }

    return result;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async findDirectCallers(entityId: string, maxDepth: number): Promise<ImpactAnalysisResult["directCallers"]> {
    const callers: ImpactAnalysisResult["directCallers"] = [];
    const visited = new Set<string>();

    const findCallers = async (id: string, depth: number) => {
      if (depth > maxDepth || visited.has(id)) return;
      visited.add(id);

      const rels = await this.storage.getRelationshipsForEntity(id, RelationType.CALLS);

      for (const rel of rels) {
        // We want callers, so look for relationships where this entity is the target
        if (rel.toId === id && !visited.has(rel.fromId)) {
          const caller = await this.storage.getEntity(rel.fromId);
          if (caller) {
            callers.push({
              name: caller.name,
              file: caller.filePath,
              line: caller.location.start.line,
            });

            // Recursively find callers of callers
            if (depth < maxDepth) {
              await findCallers(rel.fromId, depth + 1);
            }
          }
        }
      }
    };

    await findCallers(entityId, 0);
    return callers;
  }

  private async findAllReferences(entityId: string): Promise<Array<{ name: string; file: string; line: number }>> {
    const refs: Array<{ name: string; file: string; line: number }> = [];

    const rels = await this.storage.getRelationshipsForEntity(entityId);

    for (const rel of rels) {
      const otherId = rel.fromId === entityId ? rel.toId : rel.fromId;
      const other = await this.storage.getEntity(otherId);
      if (other) {
        refs.push({
          name: other.name,
          file: other.filePath,
          line: other.location.start.line,
        });
      }
    }

    return refs;
  }

  private async analyzeStateImpact(entity: Entity): Promise<ImpactAnalysisResult["stateImpact"]> {
    const impact: ImpactAnalysisResult["stateImpact"] = [];
    const meta = entity.metadata as Record<string, any>;

    // Get states modified by this entity
    const modifiedStates: string[] = Array.isArray(meta["stateModifications"]) ? meta["stateModifications"] : [];

    for (const state of modifiedStates) {
      // Find other entities that read this state
      const allEntities = await this.storage.getAllEntities();
      const affected: string[] = [];

      for (const e of allEntities) {
        if (e.id === entity.id) continue;
        const eMeta = e.metadata as Record<string, any>;

        const reads = Array.isArray(eMeta["stateReads"]) ? eMeta["stateReads"] : [];
        if (reads.includes(state)) {
          affected.push(e.name);
        }

        // Also check conditions
        if (eMeta["controlFlow"]?.branches && Array.isArray(eMeta["controlFlow"].branches)) {
          for (const branch of eMeta["controlFlow"].branches) {
            if (branch.condition?.includes(state)) {
              if (!affected.includes(e.name)) {
                affected.push(e.name);
              }
            }
          }
        }
      }

      if (affected.length > 0) {
        impact.push({
          state,
          affectedEntities: affected.slice(0, 10), // Limit to 10
          risk: affected.length > 5 ? "high" : affected.length > 2 ? "medium" : "low",
        });
      }
    }

    return impact;
  }

  private async detectBreakingChanges(
    entity: Entity,
    callers: ImpactAnalysisResult["directCallers"],
  ): Promise<ImpactAnalysisResult["breakingChanges"]> {
    const changes: ImpactAnalysisResult["breakingChanges"] = [];
    const meta = entity.metadata as Record<string, any>;

    // Check if this is a public API
    const isExported = meta["exported"] === true || entity.name.startsWith("export");
    if (isExported && callers.length > 3) {
      changes.push({
        description: `Exported entity with ${callers.length} callers - signature changes may break consumers`,
        location: `${entity.filePath}:${entity.location.start.line}`,
        severity: "warning",
      });
    }

    // Check for parameter changes
    const params = Array.isArray(meta["parameters"]) ? meta["parameters"] : [];
    if (params.length > 0 && callers.length > 0) {
      changes.push({
        description: `Function has ${params.length} parameters - changes may require updating ${callers.length} call sites`,
        location: `${entity.filePath}:${entity.location.start.line}`,
        severity: "warning",
      });
    }

    return changes;
  }

  private generateReviewSuggestions(
    _entity: Entity,
    callers: ImpactAnalysisResult["directCallers"],
    stateImpact: ImpactAnalysisResult["stateImpact"],
  ): string[] {
    const suggestions: string[] = [];

    if (callers.length > 0) {
      const uniqueFiles = new Set(callers.map((c) => c.file));
      suggestions.push(`📍 Review ${callers.length} caller(s) in ${uniqueFiles.size} file(s)`);

      // Show top 3 callers
      for (const caller of callers.slice(0, 3)) {
        suggestions.push(`   • ${caller.name} (${caller.file}:${caller.line})`);
      }
      if (callers.length > 3) {
        suggestions.push(`   ... and ${callers.length - 3} more`);
      }
    }

    if (stateImpact.length > 0) {
      const highRisk = stateImpact.filter((s) => s.risk === "high");
      if (highRisk.length > 0) {
        suggestions.push(`⚠️ High-risk state changes: ${highRisk.map((s) => s.state).join(", ")}`);
      }

      for (const impact of stateImpact.slice(0, 2)) {
        suggestions.push(
          `   State "${impact.state}" affects: ${impact.affectedEntities.slice(0, 3).join(", ")}${impact.affectedEntities.length > 3 ? "..." : ""}`,
        );
      }
    }

    return suggestions;
  }

  private generateSummary(
    entity: Entity,
    callers: ImpactAnalysisResult["directCallers"],
    stateImpact: ImpactAnalysisResult["stateImpact"],
    breakingChanges: ImpactAnalysisResult["breakingChanges"],
  ): string {
    const parts: string[] = [];

    if (callers.length === 0 && stateImpact.length === 0) {
      return `✅ No significant impact detected for ${entity.name}`;
    }

    if (callers.length > 0) {
      parts.push(`${callers.length} caller(s)`);
    }

    if (stateImpact.length > 0) {
      const totalAffected = stateImpact.reduce((sum, s) => sum + s.affectedEntities.length, 0);
      parts.push(`${totalAffected} state-dependent entities`);
    }

    if (breakingChanges.length > 0) {
      parts.push(`${breakingChanges.length} potential breaking change(s)`);
    }

    const prefix = breakingChanges.length > 0 ? "⚠️" : "ℹ️";
    return `${prefix} Modification of ${entity.name} may affect: ${parts.join(", ")}`;
  }

  private calculateConfidence(callerCount: number, stateImpactCount: number): number {
    // Base confidence starts at 0.6
    let confidence = 0.6;

    // More callers found = higher confidence in the analysis
    if (callerCount > 0) confidence += 0.1;
    if (callerCount > 5) confidence += 0.1;

    // State impact analysis adds confidence
    if (stateImpactCount > 0) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private emptyResult(reason: string): ImpactAnalysisResult {
    return {
      analyzed: false,
      directCallers: [],
      stateImpact: [],
      breakingChanges: [],
      reviewSuggestions: [],
      summary: reason,
      confidence: 0,
    };
  }
}

// =============================================================================
// HELPER FUNCTION FOR TOOL HANDLERS
// =============================================================================

/**
 * Format impact analysis result for inclusion in tool response
 */
export function formatImpactForResponse(impact: ImpactAnalysisResult): string | null {
  if (!impact.analyzed || impact.confidence < 0.5) {
    return null;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("─── Impact Analysis ───");
  lines.push(impact.summary);

  if (impact.reviewSuggestions.length > 0) {
    lines.push("");
    for (const suggestion of impact.reviewSuggestions) {
      lines.push(suggestion);
    }
  }

  if (impact.breakingChanges.length > 0) {
    lines.push("");
    lines.push("⚠️ Potential Issues:");
    for (const change of impact.breakingChanges) {
      lines.push(`  ${change.severity === "error" ? "❌" : "⚠️"} ${change.description}`);
    }
  }

  return lines.join("\n");
}
