/**
 * State Tracker for Semantic Tracing
 *
 * Tracks state changes along execution paths.
 * Detects mutations, reads, and critical state dependencies.
 *
 * Architecture References:
 * - Tracing Types: src/tracing/types.ts
 * - Chaos Analysis: src/analysis/chaos/chaos-analyzer.ts
 */

import type { Entity, GraphStorage } from "../types/storage.js";
import { RelationType } from "../types/storage.js";
import type {
  AnalyzeStateImpactParams,
  AnalyzeStateImpactResult,
  ScenarioAnalysis,
  StateChange,
  StateConflict,
  StateDependency,
  StateUsage,
} from "./types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const STATE_PATTERNS = {
  SETTER: /^set[A-Z]/,
  GETTER: /^get[A-Z]/,
  BOOLEAN: /^(is|has|should|can|will)[A-Z]/,
};

// =============================================================================
// 2. STATE TRACKER CLASS
// =============================================================================

export class StateTracker {
  private storage: GraphStorage;

  constructor(storage: GraphStorage) {
    this.storage = storage;
  }

  // ===========================================================================
  // 3. STATE CHANGE DETECTION
  // ===========================================================================

  /**
   * Detect state changes in an entity
   */
  async detectStateChanges(entity: Entity): Promise<StateChange[]> {
    const changes: StateChange[] = [];
    const meta = entity.metadata as Record<string, any>;

    // Check explicit state modifications from metadata
    if (Array.isArray(meta["stateModifications"])) {
      for (const state of meta["stateModifications"]) {
        changes.push({
          variable: state,
          isMutation: true,
        });
      }
    }

    // Check assignments in code (from metadata or source)
    if (Array.isArray(meta["assignments"])) {
      for (const assignment of meta["assignments"]) {
        changes.push({
          variable: assignment.target,
          from: assignment.from,
          to: assignment.to,
          isMutation: assignment.isMutation ?? false,
        });
      }
    }

    // Analyze method calls for mutations
    if (Array.isArray(meta["calls"])) {
      for (const call of meta["calls"]) {
        if (this.isMutatingCall(call.name)) {
          const target = this.extractMutationTarget(call);
          if (target) {
            changes.push({
              variable: target,
              isMutation: true,
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Detect state reads in an entity
   */
  async detectStateReads(entity: Entity): Promise<string[]> {
    const reads = new Set<string>();
    const meta = entity.metadata as Record<string, any>;

    // Check explicit state reads from metadata
    if (Array.isArray(meta["stateReads"])) {
      for (const state of meta["stateReads"]) {
        reads.add(state);
      }
    }

    // Check parameters (inputs are state reads)
    if (Array.isArray(meta["parameters"])) {
      for (const param of meta["parameters"]) {
        reads.add(param.name);
      }
    }

    // Check conditions (state used in conditions)
    if (meta["controlFlow"]?.branches && Array.isArray(meta["controlFlow"].branches)) {
      for (const branch of meta["controlFlow"].branches) {
        const statesInCondition = this.extractStatesFromCondition(branch.condition);
        for (const state of statesInCondition) {
          reads.add(state);
        }
      }
    }

    return Array.from(reads);
  }

  /**
   * Check if a call is mutating
   */
  private isMutatingCall(callName: string): boolean {
    const mutatingMethods = [
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "set",
      "delete",
      "clear",
      "add",
      "remove",
      "assign",
      "extend",
      "update",
      "modify",
    ];

    const lowerName = callName.toLowerCase();
    return mutatingMethods.some((m) => lowerName.includes(m)) || STATE_PATTERNS.SETTER.test(callName);
  }

  /**
   * Extract mutation target from a call
   */
  private extractMutationTarget(call: { name: string; target?: string }): string | null {
    if (call.target) return call.target;

    // Try to infer from method name
    const match = call.name.match(/^set([A-Z]\w*)/);
    if (match) {
      return match[1]!.charAt(0).toLowerCase() + match[1]!.slice(1);
    }

    return null;
  }

  /**
   * Extract state variables from a condition expression
   */
  private extractStatesFromCondition(condition: string): string[] {
    if (!condition) return [];

    const states: string[] = [];
    const varPattern = /\b([a-z_][a-zA-Z0-9_]*)\b/g;
    const keywords = new Set([
      "if",
      "else",
      "true",
      "false",
      "null",
      "undefined",
      "and",
      "or",
      "not",
      "in",
      "of",
      "typeof",
      "instanceof",
    ]);

    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(condition)) !== null) {
      if (!keywords.has(match[1]!)) {
        states.push(match[1]!);
      }
    }

    return states;
  }

  // ===========================================================================
  // 4. STATE IMPACT ANALYSIS
  // ===========================================================================

  /**
   * Analyze the impact of a state variable
   */
  async analyzeStateImpact(params: AnalyzeStateImpactParams): Promise<AnalyzeStateImpactResult> {
    const { state, scenarios } = params;

    // 1. Find all usages of this state
    const usages = await this.findStateUsages(state);

    // 2. Analyze each scenario
    const scenarioAnalysis: Record<string, ScenarioAnalysis> = {};
    for (const scenario of scenarios) {
      scenarioAnalysis[scenario.label] = await this.analyzeScenario(state, scenario.value, usages);
    }

    // 3. Detect conflicts
    const conflicts = this.detectConflicts(state, usages);

    // 4. Calculate ripple effects
    const rippleEffects = await this.calculateRippleEffects(state, usages);

    return {
      state,
      usages,
      scenarioAnalysis,
      conflicts,
      rippleEffects,
    };
  }

  /**
   * Find all usages of a state variable
   */
  private async findStateUsages(state: string): Promise<StateUsage[]> {
    const usages: StateUsage[] = [];

    // Search in metadata (entities that read/modify this state)
    const allEntities = await this.storage.getAllEntities();

    for (const entity of allEntities) {
      const meta = entity.metadata as Record<string, any>;

      // Check reads
      if (Array.isArray(meta["stateReads"]) && meta["stateReads"].includes(state)) {
        usages.push({
          location: `${entity.filePath}:${entity.location.start.line}`,
          usage: "read",
          code: entity.name,
          entityName: entity.name,
        });
      }

      // Check modifications
      if (Array.isArray(meta["stateModifications"]) && meta["stateModifications"].includes(state)) {
        usages.push({
          location: `${entity.filePath}:${entity.location.start.line}`,
          usage: "assignment",
          code: entity.name,
          entityName: entity.name,
        });
      }

      // Check conditions
      if (meta["controlFlow"]?.branches && Array.isArray(meta["controlFlow"].branches)) {
        for (const branch of meta["controlFlow"].branches) {
          if (branch.condition?.includes(state)) {
            usages.push({
              location: `${entity.filePath}:${entity.location.start.line}`,
              usage: "condition",
              code: branch.condition,
              entityName: entity.name,
            });
          }
        }
      }

      // Check parameters
      if (
        Array.isArray(meta["parameters"]) &&
        meta["parameters"].some(
          (p: unknown) => p !== null && typeof p === "object" && "name" in p && (p as { name: unknown }).name === state,
        )
      ) {
        usages.push({
          location: `${entity.filePath}:${entity.location.start.line}`,
          usage: "parameter",
          code: entity.name,
          entityName: entity.name,
        });
      }
    }

    return usages;
  }

  /**
   * Analyze a specific scenario
   */
  private async analyzeScenario(_state: string, value: unknown, usages: StateUsage[]): Promise<ScenarioAnalysis> {
    const reachablePaths: string[] = [];
    const blockedPaths: string[] = [];
    const enabledFeatures: string[] = [];
    const stateChanges: string[] = [];

    for (const usage of usages) {
      if (usage.usage === "condition") {
        // Simulate condition evaluation
        const wouldPass = this.simulateCondition(usage.code, value);

        if (wouldPass) {
          reachablePaths.push(`${usage.entityName}: ${usage.code} → true`);
        } else {
          blockedPaths.push(`${usage.entityName}: ${usage.code} → false`);
        }
      }

      if (usage.usage === "assignment") {
        stateChanges.push(`${usage.entityName} modifies state`);
      }
    }

    // Infer enabled features from reachable paths
    for (const path of reachablePaths) {
      const feature = this.inferFeatureFromPath(path);
      if (feature) {
        enabledFeatures.push(feature);
      }
    }

    return {
      reachablePaths,
      blockedPaths,
      enabledFeatures,
      stateChanges,
    };
  }

  /**
   * Simulate a condition with given state value
   */
  private simulateCondition(condition: string, value: unknown): boolean {
    // Check for direct comparisons
    if (condition.includes("=== true") || condition.includes("== true")) {
      return value === true;
    }
    if (condition.includes("=== false") || condition.includes("== false")) {
      return value === false;
    }
    if (condition.includes("!")) {
      return !value;
    }
    return !!value;
  }

  /**
   * Infer feature name from path description
   */
  private inferFeatureFromPath(path: string): string | null {
    const match = path.match(/^(\w+):/);
    return match ? match[1]! : null;
  }

  /**
   * Detect conflicts in state usage
   */
  private detectConflicts(state: string, usages: StateUsage[]): StateConflict[] {
    const conflicts: StateConflict[] = [];

    // Find multiple assignments without clear order
    const assignments = usages.filter((u) => u.usage === "assignment");
    if (assignments.length > 1) {
      conflicts.push({
        description: `Multiple assignment points for '${state}'`,
        location: assignments.map((a) => a.location).join(", "),
        risk: "medium",
        recommendation: "Ensure clear assignment order or use single source of truth",
      });
    }

    // Find reads before writes
    const conditionUsages = usages.filter((u) => u.usage === "condition");
    const hasAssignment = assignments.length > 0;

    if (conditionUsages.length > 0 && !hasAssignment) {
      conflicts.push({
        description: `State '${state}' read but never set in analyzed scope`,
        location: conditionUsages[0]!.location,
        risk: "high",
        recommendation: "Verify state is initialized before use",
      });
    }

    return conflicts;
  }

  /**
   * Calculate ripple effects of state changes
   */
  private async calculateRippleEffects(
    _state: string,
    usages: StateUsage[],
  ): Promise<{ directEffects: number; indirectEffects: number; affectedComponents: string[] }> {
    const components = new Set<string>();

    // Direct effects: entities that directly use this state
    for (const usage of usages) {
      if (usage.entityName) {
        components.add(usage.entityName);
      }
    }

    const directEffects = components.size;

    // Indirect effects: entities called by direct users
    let indirectEffects = 0;
    for (const component of components) {
      const entity = await this.storage.searchEntities({ namePattern: component });
      if (entity.length > 0) {
        const rels = await this.storage.getRelationshipsForEntity(entity[0]!.id, RelationType.CALLS);
        indirectEffects += rels.length;
      }
    }

    return {
      directEffects,
      indirectEffects,
      affectedComponents: Array.from(components),
    };
  }

  // ===========================================================================
  // 5. STATE DEPENDENCY TRACKING
  // ===========================================================================

  /**
   * Build complete state dependency graph for an entity
   */
  async buildStateDependencies(entityId: string): Promise<StateDependency[]> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) return [];

    const dependencies: StateDependency[] = [];
    const reads = await this.detectStateReads(entity);

    for (const state of reads) {
      const modifiers = await this.findModifiers(state);

      dependencies.push({
        state,
        modifiedBy: modifiers,
        stateType: this.inferType(state),
      });
    }

    return dependencies;
  }

  /**
   * Find all entities that modify a state
   */
  private async findModifiers(state: string): Promise<string[]> {
    const modifiers: string[] = [];
    const entities = await this.storage.getAllEntities();

    for (const entity of entities) {
      const meta = entity.metadata as Record<string, any>;
      if (Array.isArray(meta["stateModifications"]) && meta["stateModifications"].includes(state)) {
        modifiers.push(entity.name);
      }

      // Check for setter methods
      if (STATE_PATTERNS.SETTER.test(entity.name)) {
        const targetState = entity.name.replace(/^set/, "").toLowerCase();
        if (targetState === state.toLowerCase()) {
          modifiers.push(entity.name);
        }
      }
    }

    return modifiers;
  }

  /**
   * Infer state type from name
   */
  private inferType(state: string): string {
    if (STATE_PATTERNS.BOOLEAN.test(state)) return "boolean";
    if (state.endsWith("Count") || state.endsWith("Index")) return "number";
    if (state.endsWith("List") || state.endsWith("Array")) return "array";
    if (state.endsWith("Map") || state.endsWith("Dict")) return "object";
    return "unknown";
  }

  // ===========================================================================
  // 6. CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Clear state cache
   */
  clearCache(): void {
    // No cache for now
  }
}

// =============================================================================
// 7. EXPORTS
// =============================================================================

export default StateTracker;
