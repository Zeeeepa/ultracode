/**
 * NgRx Trace Engine
 *
 * Specialized trace engine for NgRx/Redux event-driven architectures.
 * Follows action dispatch chains through Effects, Reducers, and Selectors.
 *
 * NgRx Flow Pattern:
 * Component.dispatch(action) → Effect.ofType(action) → Effect.dispatch(newAction)
 * → Reducer.on(newAction) → State.slice → Selector → Component.select(selector)
 *
 * This engine understands these relationships:
 * - DISPATCHES_ACTION: Component/Effect → Action
 * - LISTENS_TO_ACTION: Effect → Action (ofType)
 * - HANDLES_ACTION: Reducer → Action (on)
 * - SELECTS_STATE: Component → Selector
 * - MODIFIES_STATE: Reducer → State slice
 */

import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * NgRx flow step type
 */
export type NgRxFlowStepType =
  | "dispatch" // Component/Effect dispatches action
  | "effect" // Effect handles action
  | "reducer" // Reducer handles action
  | "state" // State is modified
  | "selector" // Selector reads state
  | "subscribe"; // Component subscribes to selector

/**
 * Single step in NgRx flow
 */
export interface NgRxFlowStep {
  order: number;
  type: NgRxFlowStepType;
  entityName: string;
  entityId: string;
  file: string;
  line: number;
  actionType?: string | undefined;
  stateProperty?: string;
  description: string;
}

/**
 * Complete NgRx flow path
 */
export interface NgRxFlowPath {
  id: string;
  confidence: number;
  steps: NgRxFlowStep[];
  summary: string;
  actionChain: string[]; // Action types traversed
}

/**
 * Parameters for trace_ngrx_flow
 */
export interface TraceNgRxFlowParams {
  /** Starting point (component method, effect, or action name) */
  from: string;
  /** Ending point (component property, selector, or state property) */
  to: string;
  /** Maximum depth of traversal */
  maxDepth?: number | undefined;
  /** Include intermediate action details */
  includeActions?: boolean;
  /** Output format */
  format?: "sequence" | "mermaid" | "json";
}

/**
 * Result of trace_ngrx_flow
 */
export interface TraceNgRxFlowResult {
  from: string;
  to: string;
  paths: NgRxFlowPath[];
  actionFlow: {
    dispatched: string[];
    handled: string[];
    stateChanges: string[];
  };
  mermaid?: string | undefined;
}

// =============================================================================
// NgRx TRACE ENGINE
// =============================================================================

export class NgRxTraceEngine {
  private storage: GraphStorage;

  constructor(storage: GraphStorage) {
    this.storage = storage;
  }

  /**
   * Trace NgRx flow from source to target
   */
  async traceNgRxFlow(params: TraceNgRxFlowParams): Promise<TraceNgRxFlowResult> {
    const maxDepth = params.maxDepth ?? 20;

    // 1. Resolve source entity
    const sourceEntity = await this.resolveNgRxEntity(params.from);
    if (!sourceEntity) {
      throw new Error(`Could not find NgRx source entity: ${params.from}`);
    }

    // 2. Resolve target entity
    const targetEntity = await this.resolveNgRxEntity(params.to);
    if (!targetEntity) {
      throw new Error(`Could not find NgRx target entity: ${params.to}`);
    }

    // 3. Find all paths through NgRx flow
    const paths = await this.findNgRxPaths(sourceEntity, targetEntity, maxDepth);

    // 4. Analyze action flow
    const actionFlow = this.analyzeActionFlow(paths);

    // 5. Generate Mermaid diagram if requested
    let mermaid: string | undefined;
    if (params.format === "mermaid") {
      mermaid = this.generateMermaidDiagram(paths, sourceEntity.name, targetEntity.name);
    }

    return {
      from: params.from,
      to: params.to,
      paths,
      actionFlow,
      mermaid,
    };
  }

  /**
   * Find paths through NgRx relationships
   */
  private async findNgRxPaths(source: Entity, target: Entity, maxDepth: number): Promise<NgRxFlowPath[]> {
    const paths: NgRxFlowPath[] = [];
    const visited = new Set<string>();

    // BFS through NgRx relationships
    interface QueueItem {
      entityId: string;
      path: NgRxFlowStep[];
      actionChain: string[];
      depth: number;
    }

    const queue: QueueItem[] = [
      {
        entityId: source.id,
        path: [this.entityToStep(source, 1, "dispatch")],
        actionChain: [],
        depth: 0,
      },
    ];

    while (queue.length > 0 && paths.length < 5) {
      const current = queue.shift()!;

      if (current.depth > maxDepth) continue;

      // Found target?
      if (current.entityId === target.id) {
        paths.push({
          id: `ngrx-path-${paths.length + 1}`,
          confidence: 1 - current.depth * 0.05, // Confidence decreases with depth
          steps: current.path,
          summary: this.generatePathSummary(current.path),
          actionChain: current.actionChain,
        });
        continue;
      }

      // Prevent cycles
      const pathKey = `${current.entityId}:${current.depth}`;
      if (visited.has(pathKey)) continue;
      visited.add(pathKey);

      // Get NgRx relationships
      const relationships = await this.getNgRxRelationships(current.entityId);

      for (const rel of relationships) {
        const nextEntityId = rel.fromId === current.entityId ? rel.toId : rel.fromId;
        const nextEntity = await this.storage.getEntity(nextEntityId);
        if (!nextEntity) continue;

        // Determine step type based on relationship and entity
        const stepType = this.determineStepType(rel.type, nextEntity);
        const nextStep = this.entityToStep(nextEntity, current.path.length + 1, stepType);

        // Track action types
        const newActionChain = [...current.actionChain];
        const meta = rel.metadata as Record<string, any> | undefined;
        if (meta?.["actionType"]) {
          newActionChain.push(meta["actionType"]);
        }

        queue.push({
          entityId: nextEntityId,
          path: [...current.path, nextStep],
          actionChain: newActionChain,
          depth: current.depth + 1,
        });
      }
    }

    return paths;
  }

  /**
   * Get NgRx-specific relationships for an entity
   */
  private async getNgRxRelationships(entityId: string): Promise<Relationship[]> {
    const allRels = await this.storage.getRelationshipsForEntity(entityId);

    // Filter to NgRx relationship types
    return allRels.filter((rel) =>
      [
        RelationType.DISPATCHES_ACTION,
        RelationType.LISTENS_TO_ACTION,
        RelationType.HANDLES_ACTION,
        RelationType.SELECTS_STATE,
        RelationType.MODIFIES_STATE,
        RelationType.DEPENDS_ON, // For selector composition
      ].includes(rel.type as RelationType),
    );
  }

  /**
   * Resolve NgRx entity by name pattern
   */
  private async resolveNgRxEntity(namePattern: string): Promise<Entity | null> {
    // Try exact match first
    const entities = await this.storage.searchEntities({
      namePattern,
    });

    if (entities.length > 0) {
      // Prefer NgRx entities
      const ngrxEntity = entities.find((e) => {
        const meta = e.metadata as Record<string, any>;
        return meta?.["ngrxType"];
      });
      return ngrxEntity || entities[0]!;
    }

    // Try partial match
    const partialEntities = await this.storage.searchEntities({
      namePattern: `*${namePattern}*`,
    });

    if (partialEntities.length > 0) {
      return partialEntities[0]!;
    }

    return null;
  }

  /**
   * Convert entity to flow step
   */
  private entityToStep(entity: Entity, order: number, type: NgRxFlowStepType): NgRxFlowStep {
    const meta = entity.metadata as Record<string, any>;

    return {
      order,
      type,
      entityName: entity.name,
      entityId: entity.id,
      file: entity.filePath,
      line: entity.location.start.line,
      actionType: meta?.["actionType"] || meta?.["ngrxType"],
      stateProperty: meta?.["statePath"],
      description: this.generateStepDescription(type, entity.name, meta),
    };
  }

  /**
   * Determine step type from relationship type and entity
   */
  private determineStepType(relType: RelationType | string, entity: Entity): NgRxFlowStepType {
    const meta = entity.metadata as Record<string, any>;
    const ngrxType = meta?.["ngrxType"];

    // Based on NgRx entity type
    if (ngrxType === "effect") return "effect";
    if (ngrxType === "reducer") return "reducer";
    if (ngrxType === "selector") return "selector";
    if (ngrxType === "action") return "dispatch";

    // Based on relationship type
    switch (relType) {
      case RelationType.DISPATCHES_ACTION:
        return "dispatch";
      case RelationType.LISTENS_TO_ACTION:
        return "effect";
      case RelationType.HANDLES_ACTION:
        return "reducer";
      case RelationType.MODIFIES_STATE:
        return "state";
      case RelationType.SELECTS_STATE:
        return "subscribe";
      default:
        return "dispatch";
    }
  }

  /**
   * Generate human-readable step description
   */
  private generateStepDescription(type: NgRxFlowStepType, entityName: string, meta: Record<string, any>): string {
    switch (type) {
      case "dispatch":
        return `Dispatches action: ${meta?.["actionType"] || entityName}`;
      case "effect":
        return `Effect ${entityName} handles action via ofType()`;
      case "reducer":
        return `Reducer ${entityName} processes action via on()`;
      case "state":
        return `State modified: ${meta?.["stateChanges"]?.join(", ") || "unknown"}`;
      case "selector":
        return `Selector ${entityName} reads state`;
      case "subscribe":
        return `Component subscribes to ${entityName}`;
      default:
        return entityName;
    }
  }

  /**
   * Generate path summary
   */
  private generatePathSummary(steps: NgRxFlowStep[]): string {
    const parts = steps.map((s) => {
      switch (s.type) {
        case "dispatch":
          return `dispatch(${s.entityName})`;
        case "effect":
          return `→ Effect.${s.entityName}`;
        case "reducer":
          return `→ Reducer.on()`;
        case "state":
          return `→ state.${s.stateProperty || "?"}`;
        case "selector":
          return `→ ${s.entityName}`;
        case "subscribe":
          return `→ select()`;
        default:
          return `→ ${s.entityName}`;
      }
    });
    return parts.join(" ");
  }

  /**
   * Analyze action flow from paths
   */
  private analyzeActionFlow(paths: NgRxFlowPath[]): {
    dispatched: string[];
    handled: string[];
    stateChanges: string[];
  } {
    const dispatched = new Set<string>();
    const handled = new Set<string>();
    const stateChanges = new Set<string>();

    for (const path of paths) {
      for (const action of path.actionChain) {
        dispatched.add(action);
      }

      for (const step of path.steps) {
        if (step.type === "reducer" && step.actionType) {
          handled.add(step.actionType);
        }
        if (step.type === "state" && step.stateProperty) {
          stateChanges.add(step.stateProperty);
        }
      }
    }

    return {
      dispatched: Array.from(dispatched),
      handled: Array.from(handled),
      stateChanges: Array.from(stateChanges),
    };
  }

  /**
   * Generate Mermaid sequence diagram
   */
  private generateMermaidDiagram(paths: NgRxFlowPath[], sourceName: string, targetName: string): string {
    const lines: string[] = ["sequenceDiagram"];
    lines.push(`  participant C as Component`);
    lines.push(`  participant A as Action`);
    lines.push(`  participant E as Effect`);
    lines.push(`  participant R as Reducer`);
    lines.push(`  participant S as Store`);
    lines.push(`  participant SEL as Selector`);
    lines.push(`  Note over C,SEL: ${this.sanitize(sourceName)} → ${this.sanitize(targetName)}`);

    for (let i = 0; i < Math.min(paths.length, 2); i++) {
      const path = paths[i]!;
      lines.push(`  Note over C,SEL: Path ${i + 1}`);

      for (const step of path.steps) {
        switch (step.type) {
          case "dispatch":
            lines.push(`  C->>A: dispatch(${this.sanitize(step.entityName)})`);
            break;
          case "effect":
            lines.push(`  A->>E: ofType()`);
            lines.push(`  E->>A: dispatch new action`);
            break;
          case "reducer":
            lines.push(`  A->>R: on(action)`);
            lines.push(`  R->>S: update state`);
            break;
          case "selector":
            lines.push(`  S->>SEL: state change`);
            break;
          case "subscribe":
            lines.push(`  SEL->>C: select()`);
            break;
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Sanitize string for Mermaid
   */
  private sanitize(str: string): string {
    return str.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 20);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default NgRxTraceEngine;
