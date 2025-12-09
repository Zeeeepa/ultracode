/**
 * Semantic Trace Engine
 *
 * Main engine for static code flow analysis.
 * Coordinates PathBuilder, StateTracker, and ConditionAnalyzer.
 *
 * Architecture References:
 * - Tracing Types: src/tracing/types.ts
 * - Path Builder: src/tracing/path-builder.ts
 * - Graph Storage: src/storage/graph-storage.ts
 */

import type { Entity, GraphStorage } from "../types/storage.js";
import { PathBuilder } from "./path-builder.js";
import type {
  BlockingCondition,
  CallChain,
  CallerInfo,
  ConditionsSummary,
  Diagnosis,
  StateDependency,
  StatesSummary,
  TraceBackwardsParams,
  TraceBackwardsResult,
  TraceFlowParams,
  TraceFlowResult,
  TracePath,
} from "./types.js";

// Semantic search service interface (optional dependency)
interface SemanticSearchService {
  search(query: string, options: { limit: number; minSimilarity: number }): Promise<Array<{ entityId: string }>>;
}

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const DEFAULT_MAX_DEPTH = 15;
const DEFAULT_MAX_PATHS = 5;

// =============================================================================
// 2. TRACE ENGINE CLASS
// =============================================================================

export class TraceEngine {
  private storage: GraphStorage;
  private semanticSearch?: SemanticSearchService;
  private pathBuilder: PathBuilder;

  constructor(storage: GraphStorage, semanticSearch?: SemanticSearchService) {
    this.storage = storage;
    this.semanticSearch = semanticSearch;
    this.pathBuilder = new PathBuilder(storage);
  }

  // ===========================================================================
  // 3. TRACE FLOW (A → B)
  // ===========================================================================

  /**
   * Trace execution flow from point A to point B.
   * Finds all possible paths and analyzes state changes along each.
   */
  async traceFlow(params: TraceFlowParams): Promise<TraceFlowResult> {
    const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;

    // 1. Resolve source and target entities
    const sourceEntity = await this.resolveEntity(params.from);
    const targetEntity = await this.resolveEntity(params.to);

    if (!sourceEntity) {
      throw new Error(`Could not find source entity: ${params.from}`);
    }
    if (!targetEntity) {
      throw new Error(`Could not find target entity: ${params.to}`);
    }

    // 2. Find all paths
    const rawPaths = await this.pathBuilder.findPathsForward(sourceEntity.id, targetEntity.id, {
      maxDepth,
      maxPaths: DEFAULT_MAX_PATHS,
    });

    if (rawPaths.length === 0) {
      return {
        from: params.from,
        to: params.to,
        paths: [],
        statesSummary: { modified: [], read: [], critical: [] },
        conditionsSummary: { guards: 0, branches: 0, criticalConditions: [] },
      };
    }

    // 3. Build adjacency graph for enrichment
    const graph = await this.pathBuilder.buildAdjacencyGraph([sourceEntity.id, targetEntity.id], maxDepth);

    // 4. Enrich paths with full information
    const paths = await this.pathBuilder.enrichPaths(rawPaths, graph);

    // 5. Analyze states if requested
    let statesSummary: StatesSummary = { modified: [], read: [], critical: [] };
    if (params.trackStates) {
      statesSummary = await this.analyzeStatesInPaths(paths);
    }

    // 6. Analyze conditions if requested
    let conditionsSummary: ConditionsSummary = { guards: 0, branches: 0, criticalConditions: [] };
    if (params.trackConditions) {
      conditionsSummary = this.analyzeConditionsInPaths(paths);
    }

    // 7. Generate Mermaid diagram if requested
    let mermaid: string | undefined;
    if (params.format === "mermaid") {
      mermaid = this.generateMermaidDiagram(paths, sourceEntity.name, targetEntity.name);
    }

    return {
      from: params.from,
      to: params.to,
      paths,
      statesSummary,
      conditionsSummary,
      mermaid,
    };
  }

  // ===========================================================================
  // 4. TRACE BACKWARDS (Why not called?)
  // ===========================================================================

  /**
   * Trace backwards from a target to find why it might not be called.
   * Identifies all callers, blocking conditions, and state dependencies.
   */
  async traceBackwards(params: TraceBackwardsParams): Promise<TraceBackwardsResult> {
    const maxDepth = params.depth ?? DEFAULT_MAX_DEPTH;

    // 1. Resolve target entity
    const targetEntity = await this.resolveEntity(params.target);

    if (!targetEntity) {
      throw new Error(`Could not find target entity: ${params.target}`);
    }

    // 2. Get direct callers
    const callersWithProbability = await this.pathBuilder.getCallers(targetEntity.id);

    // 3. Convert to CallerInfo
    const callers: CallerInfo[] = await Promise.all(
      callersWithProbability.map(async ({ entity, probability }) => {
        const callerInfo: CallerInfo = {
          name: entity.name,
          entityId: entity.id,
          file: entity.filePath,
          line: entity.location.start.line,
          probability,
        };

        // Get condition from metadata
        const meta = entity.metadata as Record<string, any>;
        if (meta.controlFlow?.branches) {
          const branches = meta.controlFlow.branches;
          if (branches.length > 0) {
            callerInfo.condition = branches[0]?.condition;
          }
        }

        return callerInfo;
      }),
    );

    // 4. Find blocking conditions
    const blockingConditions = await this.findBlockingConditions(targetEntity, callers);

    // 5. Find state dependencies
    let statesDependencies: StateDependency[] = [];
    if (params.includeStates) {
      statesDependencies = await this.findStateDependencies(targetEntity);
    }

    // 6. Build call chains
    const rawPaths = await this.pathBuilder.findPathsBackward(targetEntity.id, {
      maxDepth,
      maxPaths: DEFAULT_MAX_PATHS,
    });

    const callChains: CallChain[] = rawPaths.map((raw) => {
      const graph = this.pathBuilder["adjacencyCache"].values().next().value;
      const guards: string[] = [];

      // Extract guards from nodes
      for (const id of raw.entityIds) {
        const node = graph?.nodes.get(id);
        if (node?.controlFlow?.branches) {
          for (const branch of node.controlFlow.branches) {
            if (branch.target === "return" || branch.target === "throw") {
              guards.push(`${node.name}: ${branch.condition}`);
            }
          }
        }
      }

      // Find entry point (first node with no callers)
      let entryPoint: string | undefined;
      if (graph) {
        const firstId = raw.entityIds[0];
        const firstNode = graph.nodes.get(firstId!);
        if (firstNode && (!graph.backward.get(firstId!) || graph.backward.get(firstId!)!.length === 0)) {
          entryPoint = firstNode.name;
        }
      }

      return {
        chain: raw.entityIds.map((id) => {
          const node = graph?.nodes.get(id);
          return node?.name || id;
        }),
        guards,
        likelihood: this.pathBuilder.getConfidenceLevel(1 - raw.weight),
        entryPoint,
      };
    });

    // 7. Generate diagnosis
    const diagnosis = this.generateDiagnosis(
      params.question,
      callers,
      blockingConditions,
      statesDependencies,
      callChains,
    );

    return {
      target: {
        name: targetEntity.name,
        entityId: targetEntity.id,
        file: targetEntity.filePath,
        signature: this.getEntitySignature(targetEntity),
      },
      callers,
      blockingConditions,
      statesDependencies,
      callChains,
      diagnosis,
    };
  }

  // ===========================================================================
  // 5. ENTITY RESOLUTION
  // ===========================================================================

  /**
   * Resolve entity by name or semantic search query.
   * Uses decomposed queries for 512-token efficiency.
   */
  private async resolveEntity(nameOrQuery: string): Promise<Entity | null> {
    // 1. Try exact name match first (fastest)
    const exactMatch = await this.pathBuilder.findEntityByName(nameOrQuery);
    if (exactMatch) return exactMatch;

    // 2. Try partial name match
    const entities = await this.storage.searchEntities({
      namePattern: nameOrQuery,
    });
    if (entities.length > 0) {
      return entities[0]!;
    }

    // 3. Use semantic search if available (decomposed query)
    if (this.semanticSearch) {
      try {
        const results = await this.semanticSearch.search(nameOrQuery, {
          limit: 1,
          minSimilarity: 0.6,
        });
        if (results.length > 0) {
          return this.storage.getEntity(results[0]!.entityId);
        }
      } catch {
        // Semantic search not available or failed
      }
    }

    return null;
  }

  // ===========================================================================
  // 6. STATE ANALYSIS
  // ===========================================================================

  /**
   * Analyze state changes across all paths
   */
  private async analyzeStatesInPaths(paths: TracePath[]): Promise<StatesSummary> {
    const modified = new Set<string>();
    const read = new Set<string>();
    const critical = new Set<string>();

    for (const path of paths) {
      for (const step of path.steps) {
        // Get entity metadata
        const entity = await this.storage.getEntity(step.entityId);
        if (!entity?.metadata) continue;

        const meta = entity.metadata as Record<string, any>;

        // Check for state modifications
        if (Array.isArray(meta.stateModifications)) {
          for (const state of meta.stateModifications) {
            modified.add(state);
          }
        }

        // Check for state reads
        if (Array.isArray(meta.stateReads)) {
          for (const state of meta.stateReads) {
            read.add(state);
          }
        }

        // States used in conditions are critical
        if (step.condition && Array.isArray(meta.stateReads)) {
          for (const state of meta.stateReads) {
            critical.add(state);
          }
        }
      }
    }

    return {
      modified: Array.from(modified),
      read: Array.from(read),
      critical: Array.from(critical),
    };
  }

  /**
   * Find state dependencies for a target entity
   */
  private async findStateDependencies(target: Entity): Promise<StateDependency[]> {
    const dependencies: StateDependency[] = [];
    const meta = target.metadata as Record<string, any>;

    // Check what states this entity reads
    const stateReads: string[] = Array.isArray(meta.stateReads) ? meta.stateReads : [];

    for (const state of stateReads) {
      // Find who modifies this state
      const modifiers = await this.findStateModifiers(state);

      dependencies.push({
        state,
        modifiedBy: modifiers.map((e) => e.name),
        stateType: this.inferStateType(state),
      });
    }

    return dependencies;
  }

  /**
   * Find entities that modify a given state
   */
  private async findStateModifiers(stateName: string): Promise<Entity[]> {
    // Search for entities that modify this state
    const entities = await this.storage.searchEntities({
      namePattern: stateName,
    });

    // Filter to those that actually modify state
    return entities.filter((e) => {
      const meta = e.metadata as Record<string, any>;
      const mods: string[] = Array.isArray(meta.stateModifications) ? meta.stateModifications : [];
      return mods.includes(stateName) || e.name.toLowerCase().includes("set");
    });
  }

  /**
   * Infer state type from context
   */
  private inferStateType(state: string): string {
    // Common patterns
    if (state.startsWith("is") || state.startsWith("has") || state.startsWith("should")) {
      return "boolean";
    }
    if (state.endsWith("Count") || state.endsWith("Index") || state.endsWith("Id")) {
      return "number";
    }
    if (state.endsWith("List") || state.endsWith("Array") || state.endsWith("s")) {
      return "array";
    }
    return "unknown";
  }

  // ===========================================================================
  // 7. CONDITION ANALYSIS
  // ===========================================================================

  /**
   * Analyze conditions across all paths
   */
  private analyzeConditionsInPaths(paths: TracePath[]): ConditionsSummary {
    let guards = 0;
    let branches = 0;
    const criticalConditions = new Set<string>();

    for (const path of paths) {
      for (const step of path.steps) {
        if (step.action === "condition") {
          branches++;

          // Check if this is a guard (early return/throw)
          if (step.branches) {
            const outcomes = Object.values(step.branches);
            if (outcomes.some((o) => o === "return" || o === "throw")) {
              guards++;
            }
          }

          // Conditions on main path are critical
          if (step.condition) {
            criticalConditions.add(step.condition);
          }
        }

        if (step.action === "guard") {
          guards++;
        }
      }
    }

    return {
      guards,
      branches,
      criticalConditions: Array.from(criticalConditions),
    };
  }

  /**
   * Find conditions that might block execution
   */
  private async findBlockingConditions(target: Entity, callers: CallerInfo[]): Promise<BlockingCondition[]> {
    const blocking: BlockingCondition[] = [];

    for (const caller of callers) {
      if (caller.condition && caller.probability === "conditional") {
        blocking.push({
          condition: caller.condition,
          location: `${caller.file}:${caller.line}`,
          currentValue: "unknown (static analysis)",
          recommendation: `Check if condition '${caller.condition}' evaluates to true`,
        });
      }
    }

    // Check target's own preconditions
    const targetMeta = target.metadata as Record<string, any>;
    if (Array.isArray(targetMeta.preconditions)) {
      for (const pre of targetMeta.preconditions) {
        blocking.push({
          condition: pre,
          location: `${target.filePath}:${target.location.start.line}`,
          currentValue: "required",
          recommendation: `Ensure precondition '${pre}' is satisfied`,
        });
      }
    }

    return blocking;
  }

  // ===========================================================================
  // 8. DIAGNOSIS GENERATION
  // ===========================================================================

  /**
   * Generate diagnosis based on analysis results
   */
  private generateDiagnosis(
    question: string,
    callers: CallerInfo[],
    blocking: BlockingCondition[],
    states: StateDependency[],
    chains: CallChain[],
  ): Diagnosis {
    const possibleReasons: string[] = [];
    const suggestedDebugPoints: string[] = [];
    let mostLikely: string | undefined;

    switch (question) {
      case "why_not_called":
        // No callers
        if (callers.length === 0) {
          possibleReasons.push("No callers found - method may be unused");
          mostLikely = "Dead code - no call sites exist";
        } else {
          // All callers are conditional
          const conditionalCallers = callers.filter((c) => c.probability !== "always");
          if (conditionalCallers.length === callers.length) {
            possibleReasons.push("All call sites are conditional");
            mostLikely = "Conditions not met at runtime";

            for (const caller of conditionalCallers) {
              suggestedDebugPoints.push(`${caller.file}:${caller.line} - ${caller.condition || "check condition"}`);
            }
          }

          // Blocking conditions
          if (blocking.length > 0) {
            possibleReasons.push(`${blocking.length} blocking condition(s) detected`);
            for (const b of blocking) {
              suggestedDebugPoints.push(`${b.location} - ${b.condition}`);
            }
          }

          // State dependencies
          if (states.length > 0) {
            possibleReasons.push(`Depends on ${states.length} state(s)`);
            for (const s of states) {
              if (s.modifiedBy.length === 0) {
                possibleReasons.push(`State '${s.state}' has no known modifiers`);
              }
            }
          }
        }
        break;

      case "what_affects":
        // List all dependencies
        if (states.length > 0) {
          possibleReasons.push(`Direct state dependencies: ${states.map((s) => s.state).join(", ")}`);
        }
        if (blocking.length > 0) {
          possibleReasons.push(`Guard conditions: ${blocking.map((b) => b.condition).join(", ")}`);
        }
        if (chains.length > 0) {
          const entryPoints = chains.filter((c) => c.entryPoint).map((c) => c.entryPoint);
          if (entryPoints.length > 0) {
            possibleReasons.push(`Entry points: ${entryPoints.join(", ")}`);
          }
        }
        break;

      case "dependencies":
        // Full dependency analysis
        for (const chain of chains) {
          possibleReasons.push(`Call chain: ${chain.chain.join(" → ")}`);
          if (chain.guards.length > 0) {
            possibleReasons.push(`  Guards: ${chain.guards.join("; ")}`);
          }
        }
        break;
    }

    // Default suggestions
    if (suggestedDebugPoints.length === 0 && callers.length > 0) {
      suggestedDebugPoints.push(`${callers[0]!.file}:${callers[0]!.line} - First caller`);
    }

    return {
      possibleReasons,
      suggestedDebugPoints,
      mostLikely,
    };
  }

  // ===========================================================================
  // 9. OUTPUT GENERATION
  // ===========================================================================

  /**
   * Generate Mermaid sequence diagram
   */
  private generateMermaidDiagram(paths: TracePath[], sourceName: string, targetName: string): string {
    const lines: string[] = ["sequenceDiagram"];
    lines.push(`  participant S as ${this.sanitizeMermaidId(sourceName)}`);
    lines.push(`  participant T as ${this.sanitizeMermaidId(targetName)}`);

    // Add participants for intermediate nodes
    const participants = new Set<string>();
    for (const path of paths) {
      for (const step of path.steps) {
        if (step.entity !== sourceName && step.entity !== targetName) {
          participants.add(step.entity);
        }
      }
    }

    let idx = 1;
    const participantMap = new Map<string, string>();
    participantMap.set(sourceName, "S");
    participantMap.set(targetName, "T");

    for (const p of participants) {
      const id = `P${idx++}`;
      participantMap.set(p, id);
      lines.push(`  participant ${id} as ${this.sanitizeMermaidId(p)}`);
    }

    // Add path flows
    for (let i = 0; i < Math.min(paths.length, 3); i++) {
      const path = paths[i]!;
      lines.push(`  Note over S,T: Path ${i + 1} (confidence: ${Math.round(path.confidence * 100)}%)`);

      for (let j = 0; j < path.steps.length - 1; j++) {
        const from = path.steps[j]!;
        const to = path.steps[j + 1]!;
        const fromId = participantMap.get(from.entity) || "S";
        const toId = participantMap.get(to.entity) || "T";

        let arrow = "->>";
        if (from.awaits) arrow = "-->>"; // Async

        const label = from.condition ? `${from.action}[${from.condition}]` : from.action;
        lines.push(`  ${fromId}${arrow}${toId}: ${label}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Sanitize string for Mermaid ID
   */
  private sanitizeMermaidId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 30);
  }

  /**
   * Get entity signature for display
   */
  private getEntitySignature(entity: Entity): string {
    const params = entity.metadata.parameters || [];
    const paramStr = params.map((p: any) => `${p.name}: ${p.type || "any"}`).join(", ");
    const returnType = entity.metadata.returnType || "void";
    return `${entity.name}(${paramStr}): ${returnType}`;
  }

  // ===========================================================================
  // 10. CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.pathBuilder.clearCache();
  }
}

// =============================================================================
// 11. EXPORTS
// =============================================================================

export default TraceEngine;
