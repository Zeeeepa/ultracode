import type { ConductorOrchestrator } from "../../agents/conductor-orchestrator.js";
import type { BranchManager } from "../../core/branch-manager.js";
import { ConflictDetector } from "../analysis/conflict-detector.js";
import { IntentClassifier } from "../analysis/intent-classifier.js";
import { type EmbeddingGeneratorFn, LazyEmbeddingCache } from "../indexing/lazy-embedding-cache.js";
import { MultiVersionIndexer } from "../indexing/multi-version-indexer.js";
import type { GitIntegration } from "../integration/git-integration.js";
import { FastPathMatcher } from "../matching/fast-path-matcher.js";
import { SemanticMatcher } from "../matching/semantic-matcher.js";
import type { ChangeIntent } from "../models/change-intent.js";
import type { CodeUnit } from "../models/code-unit.js";
import type { MergeAction, MergeResult } from "../models/merge-result.js";
import type { SemanticConflict } from "../models/semantic-conflict.js";
import type { VersionedIndex } from "../models/versioned-index.js";

/**
 * Three-Way Merger - Основной 3-way merge engine
 *
 * Выполняет semantic merge в 5 фаз:
 * 1. Multi-Version Indexing - индексация base + branchA + branchB
 * 2. Fast Path Matching - O(1) matching через hashes
 * 3. Semantic Matching - vector similarity для unmapped units
 * 4. Intent Classification - определение намерений изменений
 * 5. Conflict Detection - детекция и разрешение конфликтов
 */

export interface ThreeWayMergerConfig {
  // Fast Path settings
  fastPathEnabled: boolean; // default: true

  // Semantic matching settings
  semanticMatchingEnabled: boolean; // default: true
  semanticThreshold: number; // default: 0.7
  embeddingGenerator?: EmbeddingGeneratorFn;

  // Intent classification settings
  classifyIntents: boolean; // default: true

  // Conflict detection settings
  detectConflicts: boolean; // default: true
  autoResolveConflicts: boolean; // default: false (requires manual review)
}

export class ThreeWayMerger {
  private branchManager: BranchManager;
  private gitIntegration: GitIntegration;
  private conductor: ConductorOrchestrator;
  private config: ThreeWayMergerConfig;

  // Components
  private multiVersionIndexer: MultiVersionIndexer;
  private fastPathMatcher: FastPathMatcher;
  private semanticMatcher: SemanticMatcher;
  private intentClassifier: IntentClassifier;
  private conflictDetector: ConflictDetector;

  constructor(
    _branchManager: BranchManager,
    _gitIntegration: GitIntegration,
    _conductor: ConductorOrchestrator,
    config: Partial<ThreeWayMergerConfig> = {},
  ) {
    this.branchManager = _branchManager;
    this.gitIntegration = _gitIntegration;
    this.conductor = _conductor;

    // Default config
    this.config = {
      fastPathEnabled: true,
      semanticMatchingEnabled: true,
      semanticThreshold: 0.7,
      classifyIntents: true,
      detectConflicts: true,
      autoResolveConflicts: false,
      ...config,
    };

    // Initialize components
    this.multiVersionIndexer = new MultiVersionIndexer(this.branchManager, this.gitIntegration, this.conductor);
    this.fastPathMatcher = new FastPathMatcher();
    this.semanticMatcher = new SemanticMatcher();
    this.intentClassifier = new IntentClassifier();
    this.conflictDetector = new ConflictDetector();
  }

  /**
   * Выполнить 3-way merge
   *
   * @param branchA - Имя первой ветки для слияния
   * @param branchB - Имя второй ветки для слияния
   * @returns MergeResult с matched units, conflicts, и merge actions
   */
  async performMerge(branchA: string, branchB: string): Promise<MergeResult> {
    console.log(`[ThreeWayMerger] Starting 3-way merge: ${branchA} + ${branchB}`);
    const startTime = Date.now();

    // === Phase 1: Multi-Version Indexing ===
    console.log("[ThreeWayMerger] Phase 1: Indexing 3 branches...");
    const indexResult = await this.multiVersionIndexer.indexThreeBranches(branchA, branchB);

    const { base, branchA: indexA, branchB: indexB, mergeBase } = indexResult;

    console.log(
      `[ThreeWayMerger] Indexed: base=${base.stats.totalUnits}, A=${indexA.stats.totalUnits}, B=${indexB.stats.totalUnits}`,
    );

    // === Phase 2: Fast Path Matching ===
    console.log("[ThreeWayMerger] Phase 2: Fast Path matching...");
    const { matchedUnits, unmatchedA, unmatchedB } = await this.fastPathMatch(base, indexA, indexB);

    console.log(
      `[ThreeWayMerger] Fast Path: ${matchedUnits.length} matched, ${unmatchedA.length} unmapped in A, ${unmatchedB.length} unmapped in B`,
    );

    // === Phase 3: Semantic Matching ===
    let semanticMatches: typeof matchedUnits = [];
    if (this.config.semanticMatchingEnabled && (unmatchedA.length > 0 || unmatchedB.length > 0)) {
      console.log("[ThreeWayMerger] Phase 3: Semantic matching...");
      semanticMatches = await this.semanticMatch(base, unmatchedA, unmatchedB);
      console.log(`[ThreeWayMerger] Semantic: ${semanticMatches.length} matched`);
    }

    const allMatches = [...matchedUnits, ...semanticMatches];

    // === Phase 4: Intent Classification ===
    let intents: Map<string, { branchAIntent?: ChangeIntent; branchBIntent?: ChangeIntent }> = new Map();

    if (this.config.classifyIntents) {
      console.log("[ThreeWayMerger] Phase 4: Classifying intents...");
      intents = this.classifyIntents(allMatches);
      console.log(`[ThreeWayMerger] Classified intents for ${intents.size} unit pairs`);
    }

    // === Phase 5: Conflict Detection ===
    let conflicts: SemanticConflict[] = [];

    if (this.config.detectConflicts) {
      console.log("[ThreeWayMerger] Phase 5: Detecting conflicts...");
      conflicts = this.detectConflicts(allMatches, intents);
      console.log(`[ThreeWayMerger] Detected ${conflicts.length} conflicts`);
    }

    // === Generate Merge Actions ===
    const mergeActions = this.generateMergeActions(allMatches, conflicts);

    const result: MergeResult = {
      branchA,
      branchB,
      mergeBase,
      baseIndex: base,
      branchAIndex: indexA,
      branchBIndex: indexB,
      matchedUnits: allMatches,
      conflicts,
      mergeActions,
      stats: {
        totalUnitsInBase: base.stats.totalUnits,
        totalUnitsInA: indexA.stats.totalUnits,
        totalUnitsInB: indexB.stats.totalUnits,
        matchedCount: allMatches.length,
        conflictCount: conflicts.length,
        autoMergedCount: mergeActions.filter((a) => a.type === "auto-merge").length,
        manualReviewCount: mergeActions.filter((a) => a.type === "manual-review").length,
        mergeTimeMs: Date.now() - startTime,
      },
    };

    console.log(
      `[ThreeWayMerger] Merge completed in ${result.stats.mergeTimeMs}ms: ${result.stats.autoMergedCount} auto-merged, ${result.stats.conflictCount} conflicts`,
    );

    return result;
  }

  /**
   * Phase 2: Fast Path Matching
   */
  private async fastPathMatch(
    base: VersionedIndex,
    indexA: VersionedIndex,
    indexB: VersionedIndex,
  ): Promise<{
    matchedUnits: Array<{ baseUnit: CodeUnit | null; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>;
    unmatchedA: CodeUnit[];
    unmatchedB: CodeUnit[];
  }> {
    const matchedUnits: Array<{
      baseUnit: CodeUnit | null;
      branchAUnit: CodeUnit;
      branchBUnit: CodeUnit;
    }> = [];
    const unmatchedA: CodeUnit[] = [];
    const unmatchedB: CodeUnit[] = [];

    const unitsA = Array.from(indexA.units.values());
    const unitsB = Array.from(indexB.units.values());

    // Match units from branchA
    for (const unitA of unitsA) {
      const matchResult = this.fastPathMatcher.findMatch(unitA, indexB);

      if (matchResult) {
        const baseUnit = base.units.get(unitA.id) || null;
        matchedUnits.push({
          baseUnit,
          branchAUnit: unitA,
          branchBUnit: matchResult.baseUnit!,
        });
      } else {
        unmatchedA.push(unitA);
      }
    }

    // Match units from branchB (только те, что ещё не matched)
    const matchedBIds = new Set(matchedUnits.map((m) => m.branchBUnit.id));
    for (const unitB of unitsB) {
      if (!matchedBIds.has(unitB.id)) {
        unmatchedB.push(unitB);
      }
    }

    return { matchedUnits, unmatchedA, unmatchedB };
  }

  /**
   * Phase 3: Semantic Matching
   */
  private async semanticMatch(
    base: VersionedIndex,
    unmatchedA: CodeUnit[],
    unmatchedB: CodeUnit[],
  ): Promise<Array<{ baseUnit: CodeUnit | null; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>> {
    // Generate embeddings for unmatched units (lazy)
    if (this.config.embeddingGenerator) {
      const cache = new LazyEmbeddingCache(this.config.embeddingGenerator);

      await cache.generateEmbeddings(base, unmatchedA);
      await cache.generateEmbeddings(base, unmatchedB);
    }

    // Semantic matching
    const matches: Array<{
      baseUnit: CodeUnit | null;
      branchAUnit: CodeUnit;
      branchBUnit: CodeUnit;
    }> = [];

    // Create temporary index for unmatchedB
    const tempIndexB: VersionedIndex = {
      ...base,
      units: new Map(unmatchedB.map((u) => [u.id, u])),
    };

    for (const unitA of unmatchedA) {
      const matchResult = this.semanticMatcher.findMatch(unitA, tempIndexB, this.config.semanticThreshold);

      if (matchResult) {
        const baseUnit = base.units.get(unitA.id) || null;
        matches.push({
          baseUnit,
          branchAUnit: unitA,
          branchBUnit: matchResult.baseUnit!,
        });
      }
    }

    return matches;
  }

  /**
   * Phase 4: Intent Classification
   */
  private classifyIntents(
    matches: Array<{ baseUnit: CodeUnit | null; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>,
  ): Map<string, { branchAIntent?: ChangeIntent; branchBIntent?: ChangeIntent }> {
    const intents = new Map<string, { branchAIntent?: ChangeIntent; branchBIntent?: ChangeIntent }>();

    for (const match of matches) {
      const branchAIntent = this.intentClassifier.classifyIntent(match.baseUnit, match.branchAUnit);
      const branchBIntent = this.intentClassifier.classifyIntent(match.baseUnit, match.branchBUnit);

      intents.set(match.branchAUnit.id, { branchAIntent, branchBIntent });
    }

    return intents;
  }

  /**
   * Phase 5: Conflict Detection
   */
  private detectConflicts(
    matches: Array<{ baseUnit: CodeUnit | null; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>,
    intents: Map<string, { branchAIntent?: ChangeIntent; branchBIntent?: ChangeIntent }>,
  ): SemanticConflict[] {
    const conflictsToDetect = matches.map((match) => {
      const intentPair = intents.get(match.branchAUnit.id);
      return {
        ...match,
        branchAIntent: intentPair?.branchAIntent,
        branchBIntent: intentPair?.branchBIntent,
      };
    });

    return this.conflictDetector.detectConflicts(conflictsToDetect);
  }

  /**
   * Generate Merge Actions
   */
  private generateMergeActions(
    matches: Array<{ baseUnit: CodeUnit | null; branchAUnit: CodeUnit; branchBUnit: CodeUnit }>,
    conflicts: SemanticConflict[],
  ): MergeAction[] {
    const actions: MergeAction[] = [];
    const conflictIds = new Set(conflicts.map((c) => c.branchAUnit.id));

    for (const match of matches) {
      // If conflict exists for this unit - manual review
      if (conflictIds.has(match.branchAUnit.id)) {
        const conflict = conflicts.find((c) => c.branchAUnit.id === match.branchAUnit.id);

        actions.push({
          type: "manual-review",
          unitId: match.branchAUnit.id,
          description: `Conflict detected: ${conflict?.description}`,
          conflict,
        });
        continue;
      }

      // If both branches made identical changes - auto-merge
      if (match.branchAUnit.contentHash === match.branchBUnit.contentHash) {
        actions.push({
          type: "auto-merge",
          unitId: match.branchAUnit.id,
          description: "Identical changes in both branches",
          mergedUnit: match.branchAUnit, // Use either (they're identical)
        });
        continue;
      }

      // Default: manual review for non-identical changes
      actions.push({
        type: "manual-review",
        unitId: match.branchAUnit.id,
        description: "Different changes in both branches",
      });
    }

    return actions;
  }
}
