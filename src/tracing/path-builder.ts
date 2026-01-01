/**
 * Path Builder for Semantic Tracing
 *
 * Optimized graph traversal algorithms for code flow analysis.
 * Uses BFS/DFS with loop unrolling for hot paths.
 *
 * Architecture References:
 * - Tracing Types: src/tracing/types.ts
 * - Graph Storage: src/storage/graph-storage.ts
 * - SIMD Ops: src/utils/simd-vector-ops.ts
 */

import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";
import type {
  AdjacencyGraph,
  CallProbability,
  ConfidenceLevel,
  GraphNode,
  PathFindingOptions,
  RawPath,
  TraceActionType,
  TracePath,
  TraceStep,
} from "./types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const DEFAULT_MAX_DEPTH = 15;
const DEFAULT_MAX_PATHS = 10;
const CONDITION_WEIGHT = 0.3; // Penalty for conditional paths
const CALL_WEIGHT = 0.1; // Base weight for calls
const ASYNC_WEIGHT = 0.2; // Penalty for async boundaries

// NgRx relationship types that should be traversed in flow tracing
const NGRX_RELATIONSHIP_TYPES = new Set([
  RelationType.LISTENS_TO_ACTION, // effect -> action (ofType)
  RelationType.HANDLES_ACTION, // reducer -> action (on)
  RelationType.SELECTS_STATE, // component -> selector
  RelationType.DISPATCHES_ACTION, // component/effect -> action
  RelationType.MODIFIES_STATE, // reducer -> state slice
]);

// =============================================================================
// 2. PATH BUILDER CLASS
// =============================================================================

export class PathBuilder {
  private storage: GraphStorage;
  private adjacencyCache: Map<string, AdjacencyGraph> = new Map();
  private nodeCache: Map<string, GraphNode> = new Map();

  constructor(storage: GraphStorage) {
    this.storage = storage;
  }

  // ===========================================================================
  // 3. ADJACENCY GRAPH BUILDING
  // ===========================================================================

  /**
   * Build adjacency graph from storage for efficient traversal.
   * Uses batch loading and caching for performance.
   */
  async buildAdjacencyGraph(startIds: string[], maxDepth: number = DEFAULT_MAX_DEPTH): Promise<AdjacencyGraph> {
    const cacheKey = `${startIds.sort().join(",")}:${maxDepth}`;
    const cached = this.adjacencyCache.get(cacheKey);
    if (cached) return cached;

    const nodes = new Map<string, GraphNode>();
    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    const weights = new Map<string, number>();

    // BFS to collect all relevant nodes
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = startIds.map((id) => ({
      id,
      depth: 0,
    }));

    while (queue.length > 0) {
      // Process in batches of 16 for better cache locality
      const batch = queue.splice(0, Math.min(16, queue.length));

      for (const { id, depth } of batch) {
        if (visited.has(id) || depth > maxDepth) continue;
        visited.add(id);

        // Get entity and relationships
        const entity = await this.storage.getEntity(id);
        if (!entity) continue;

        const node = this.entityToNode(entity);
        nodes.set(id, node);

        // Get outgoing relationships (calls)
        const outRels = await this.storage.getRelationshipsForEntity(id);
        const outgoing: string[] = [];
        const incoming: string[] = [];

        for (const rel of outRels) {
          const weight = this.calculateEdgeWeight(rel, entity);
          const edgeKey = `${rel.fromId}:${rel.toId}`;
          weights.set(edgeKey, weight);

          if (rel.fromId === id) {
            // Outgoing edge - resolve NgRx phantom entities by name
            let targetId = rel.toId;

            if (NGRX_RELATIONSHIP_TYPES.has(rel.type)) {
              // For NgRx relationships, try to resolve target by name
              const resolvedId = await this.resolveNgRxTarget(rel.toId);
              if (resolvedId) {
                targetId = resolvedId;
              }
            }

            outgoing.push(targetId);
            if (depth < maxDepth && !visited.has(targetId)) {
              queue.push({ id: targetId, depth: depth + 1 });
            }
          } else {
            // Incoming edge
            incoming.push(rel.fromId);
            if (depth < maxDepth && !visited.has(rel.fromId)) {
              queue.push({ id: rel.fromId, depth: depth + 1 });
            }
          }
        }

        // Also find incoming NgRx relationships by entity name
        const incomingNgRx = await this.findIncomingNgRxRelationships(entity.name);
        for (const rel of incomingNgRx) {
          // For NgRx flow tracing, we need to INVERT certain relationships:
          // - HANDLES_ACTION: reducer -> action means action TRIGGERS reducer (action -> reducer in flow)
          // - LISTENS_TO_ACTION: effect -> action means action TRIGGERS effect (action -> effect in flow)
          // These are semantically "incoming" to the action but should be "outgoing" in flow graph
          const relType = rel.type;
          const isInvertedRelation =
            relType === RelationType.HANDLES_ACTION || relType === RelationType.LISTENS_TO_ACTION;

          if (isInvertedRelation) {
            // Inverted: action -> reducer/effect (add as outgoing from current entity)
            if (!outgoing.includes(rel.fromId)) {
              outgoing.push(rel.fromId);
              const weight = this.calculateEdgeWeight(rel, entity);
              weights.set(`${id}:${rel.fromId}`, weight);

              if (depth < maxDepth && !visited.has(rel.fromId)) {
                queue.push({ id: rel.fromId, depth: depth + 1 });
              }
            }
          } else {
            // Normal incoming
            if (!incoming.includes(rel.fromId)) {
              incoming.push(rel.fromId);
              const weight = this.calculateEdgeWeight(rel, entity);
              weights.set(`${rel.fromId}:${id}`, weight);

              if (depth < maxDepth && !visited.has(rel.fromId)) {
                queue.push({ id: rel.fromId, depth: depth + 1 });
              }
            }
          }
        }

        forward.set(id, outgoing);
        backward.set(id, incoming);
        node.outgoing = outgoing;
        node.incoming = incoming;
      }
    }

    // Add implicit NgRx reducer -> featureSelector connections
    const reducerSelectorConnections = await this.findReducerToSelectorConnections();
    for (const conn of reducerSelectorConnections) {
      // Only add if both nodes are in the graph
      if (nodes.has(conn.reducerId) || nodes.has(conn.selectorId)) {
        // Ensure both nodes exist in graph
        if (!nodes.has(conn.reducerId)) {
          const reducerEntity = await this.storage.getEntity(conn.reducerId);
          if (reducerEntity) {
            nodes.set(conn.reducerId, this.entityToNode(reducerEntity));
            forward.set(conn.reducerId, []);
            backward.set(conn.reducerId, []);
          }
        }
        if (!nodes.has(conn.selectorId)) {
          const selectorEntity = await this.storage.getEntity(conn.selectorId);
          if (selectorEntity) {
            nodes.set(conn.selectorId, this.entityToNode(selectorEntity));
            forward.set(conn.selectorId, []);
            backward.set(conn.selectorId, []);
          }
        }

        // Add forward edge: reducer -> featureSelector
        const reducerOutgoing = forward.get(conn.reducerId) || [];
        if (!reducerOutgoing.includes(conn.selectorId)) {
          reducerOutgoing.push(conn.selectorId);
          forward.set(conn.reducerId, reducerOutgoing);
        }

        // Add backward edge: featureSelector <- reducer
        const selectorIncoming = backward.get(conn.selectorId) || [];
        if (!selectorIncoming.includes(conn.reducerId)) {
          selectorIncoming.push(conn.reducerId);
          backward.set(conn.selectorId, selectorIncoming);
        }

        // Add weight based on confidence
        const edgeKey = `${conn.reducerId}:${conn.selectorId}`;
        weights.set(edgeKey, CALL_WEIGHT * (2 - conn.confidence)); // Higher confidence = lower weight

        // Update node edges
        const reducerNode = nodes.get(conn.reducerId);
        const selectorNode = nodes.get(conn.selectorId);
        if (reducerNode && !reducerNode.outgoing.includes(conn.selectorId)) {
          reducerNode.outgoing.push(conn.selectorId);
        }
        if (selectorNode && !selectorNode.incoming.includes(conn.reducerId)) {
          selectorNode.incoming.push(conn.reducerId);
        }
      }
    }

    const graph: AdjacencyGraph = { nodes, forward, backward, weights };

    // Cache for reuse
    if (nodes.size < 10000) {
      this.adjacencyCache.set(cacheKey, graph);
    }

    return graph;
  }

  /**
   * Convert Entity to GraphNode with control flow info
   */
  private entityToNode(entity: Entity): GraphNode {
    const cached = this.nodeCache.get(entity.id);
    if (cached) return cached;

    const node: GraphNode = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      file: entity.filePath,
      line: entity.location.start.line,
      outgoing: [],
      incoming: [],
    };

    // Extract control flow from metadata
    const meta = entity.metadata as Record<string, any>;

    if (meta["controlFlow"]) {
      node.controlFlow = {
        branches: meta["controlFlow"].branches,
        loops: meta["controlFlow"].loops,
        awaits: meta["controlFlow"].awaits,
        exceptions: meta["controlFlow"].exceptions,
      };
    }

    if (meta["calls"]) {
      node.calls = meta["calls"] as Array<{ name: string; target?: string | undefined; isAwait?: boolean }>;
    }

    if (meta["complexity"]) {
      node.complexity = meta["complexity"];
    }

    this.nodeCache.set(entity.id, node);
    return node;
  }

  // ===========================================================================
  // NgRx RELATIONSHIP RESOLUTION
  // ===========================================================================

  /**
   * Find implicit reducer -> featureSelector connections.
   * NgRx reducers update store state, featureSelectors read from it.
   * We connect them by:
   * 1. Same directory (e.g., store/roles/)
   * 2. Similar file names (roles.reducer.ts -> roles.selector.ts)
   * 3. Feature name matching
   */
  private async findReducerToSelectorConnections(): Promise<
    Array<{ reducerId: string; selectorId: string; confidence: number }>
  > {
    const connections: Array<{ reducerId: string; selectorId: string; confidence: number }> = [];

    // Find all reducers and selectors
    const reducers = await this.storage.findEntities({
      type: "entity",
      filters: { entityType: ["ngrx_reducer"] as any },
      limit: 500,
    });

    const selectors = await this.storage.findEntities({
      type: "entity",
      filters: { entityType: ["ngrx_selector"] as any },
      limit: 500,
    });

    // Consider all selectors - featureSelectors typically have "Feature" or "State" in name
    // or are the first selector in the file (no dependencies on other selectors)
    const featureSelectors = selectors.filter((s) => {
      // Check if name contains Feature or State suffix
      if (s.name.includes("Feature") || s.name.endsWith("State")) {
        return true;
      }
      // Check metadata for featureName (if parser saved it)
      const meta = s.metadata as Record<string, any>;
      if (meta?.["ngrxSelector"]?.featureName) {
        return true;
      }
      return false;
    });

    for (const reducer of reducers) {
      const reducerDir = this.getDirectory(reducer.filePath);
      const reducerBaseName = this.getFeatureBaseName(reducer.filePath);

      for (const selector of featureSelectors) {
        const selectorDir = this.getDirectory(selector.filePath);
        const selectorBaseName = this.getFeatureBaseName(selector.filePath);

        let confidence = 0;

        // Same directory = strong signal
        if (reducerDir === selectorDir) {
          confidence += 0.5;
        }

        // Same parent directory (e.g., store/roles/reducers/ and store/roles/selectors/)
        const reducerParent = this.getDirectory(reducerDir);
        const selectorParent = this.getDirectory(selectorDir);
        if (reducerParent === selectorParent && reducerParent !== "") {
          confidence += 0.3;
        }

        // Similar base names (roles.reducer.ts -> roles.selector.ts)
        if (reducerBaseName && selectorBaseName && reducerBaseName === selectorBaseName) {
          confidence += 0.4;
        }

        // Name contains same feature keyword (rolesReducer -> selectRolesFeature)
        const reducerFeature = this.extractFeatureFromName(reducer.name);
        const selectorFeature = this.extractFeatureFromName(selector.name);
        if (reducerFeature && selectorFeature && reducerFeature.toLowerCase() === selectorFeature.toLowerCase()) {
          confidence += 0.3;
        }

        if (confidence >= 0.5) {
          connections.push({
            reducerId: reducer.id,
            selectorId: selector.id,
            confidence: Math.min(1.0, confidence),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Get directory from file path
   */
  private getDirectory(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    return lastSlash >= 0 ? filePath.slice(0, lastSlash) : "";
  }

  /**
   * Extract feature base name from file path
   * e.g., "roles.reducer.ts" -> "roles", "users.selector.ts" -> "users"
   */
  private getFeatureBaseName(filePath: string): string | null {
    const fileName = filePath.split(/[/\\]/).pop() || "";
    // Match: featureName.reducer.ts, featureName.selector.ts, featureName.reducers.ts, etc.
    const match = fileName.match(/^([a-z0-9-]+)\.(reducer|selector|reducers|selectors|state)/i);
    return match ? match[1]! : null;
  }

  /**
   * Extract feature name from entity name
   * e.g., "rolesReducer" -> "roles", "selectRolesFeature" -> "Roles"
   */
  private extractFeatureFromName(name: string): string | null {
    // rolesReducer -> roles
    let match = name.match(/^([a-z]+)Reducer$/i);
    if (match) return match[1]!;

    // selectRolesFeature -> Roles
    match = name.match(/^select([A-Z][a-z]+)Feature$/);
    if (match) return match[1]!;

    // selectRolesState -> Roles
    match = name.match(/^select([A-Z][a-z]+)State$/);
    if (match) return match[1]!;

    return null;
  }

  /**
   * Resolve NgRx phantom entity target to real entity ID.
   * Phantom entities have names like "file:actionName", we extract the action name
   * and search for real entity with that name.
   */
  private async resolveNgRxTarget(phantomId: string): Promise<string | null> {
    // Get the phantom entity
    const phantomEntity = await this.storage.getEntity(phantomId);
    if (!phantomEntity) return null;

    // Extract the action/selector name from phantom entity name
    // Format: "\\path\\to\\file.ts:actionName" or just "actionName"
    const name = phantomEntity.name;
    const colonIndex = name.lastIndexOf(":");
    const targetName = colonIndex >= 0 ? name.slice(colonIndex + 1) : name;

    // Search for real entity with this name
    const entities = await this.storage.searchEntities({ namePattern: targetName });

    // Find exact match (not phantom)
    for (const entity of entities) {
      if (entity.name === targetName && entity.id !== phantomId) {
        return entity.id;
      }
    }

    return null;
  }

  /**
   * Find incoming NgRx relationships by entity name.
   * Searches for relationships where target name matches this entity.
   */
  private async findIncomingNgRxRelationships(entityName: string): Promise<Relationship[]> {
    const types = Array.from(NGRX_RELATIONSHIP_TYPES) as any[];
    return this.storage.findIncomingRelationshipsByName(entityName, types);
  }

  /**
   * Calculate edge weight based on relationship type and conditions
   */
  private calculateEdgeWeight(rel: Relationship, _fromEntity: Entity): number {
    let weight = CALL_WEIGHT;

    // Conditional calls have higher weight (lower priority)
    if (rel.metadata?.["conditional"]) {
      weight += CONDITION_WEIGHT;
    }

    // Async calls have penalty
    if (rel.metadata?.["isAwait"] || rel.metadata?.["isAsync"]) {
      weight += ASYNC_WEIGHT;
    }

    // Use relationship weight if provided
    if (rel.weight) {
      weight *= rel.weight;
    }

    return weight;
  }

  // ===========================================================================
  // 4. FORWARD PATH FINDING (BFS - Shortest Paths)
  // ===========================================================================

  /**
   * Find all paths from source to target using BFS.
   * Returns paths sorted by weight (shortest/simplest first).
   *
   * Optimized with:
   * - Loop unrolling for neighbor iteration
   * - Early termination when enough paths found
   * - Priority queue simulation via sorted insertion
   */
  async findPathsForward(
    sourceId: string,
    targetId: string,
    options: Partial<PathFindingOptions> = {},
  ): Promise<RawPath[]> {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPaths = options.maxPaths ?? DEFAULT_MAX_PATHS;

    // Build adjacency graph
    const graph = await this.buildAdjacencyGraph([sourceId], maxDepth);

    if (!graph.nodes.has(sourceId)) {
      return [];
    }

    const paths: RawPath[] = [];

    // BFS with path tracking
    const queue: Array<{
      path: string[];
      relationships: string[];
      weight: number;
      conditionCount: number;
    }> = [
      {
        path: [sourceId],
        relationships: [],
        weight: 0,
        conditionCount: 0,
      },
    ];

    const visited = new Map<string, number>(); // node -> best weight to reach it
    visited.set(sourceId, 0);

    while (queue.length > 0 && paths.length < maxPaths) {
      const current = queue.shift()!;
      const currentNode = current.path[current.path.length - 1]!;

      // Found target
      if (currentNode === targetId) {
        paths.push({
          entityIds: current.path,
          relationships: current.relationships,
          weight: current.weight,
          conditionCount: current.conditionCount,
        });
        continue;
      }

      // Check depth
      if (current.path.length >= maxDepth) continue;

      // Get neighbors
      const neighbors = graph.forward.get(currentNode) || [];

      // Loop unrolling: process 4 neighbors at a time
      const len4 = neighbors.length - (neighbors.length % 4);

      for (let i = 0; i < len4; i += 4) {
        this.processNeighbor(neighbors[i]!, current, graph, visited, queue, options);
        this.processNeighbor(neighbors[i + 1]!, current, graph, visited, queue, options);
        this.processNeighbor(neighbors[i + 2]!, current, graph, visited, queue, options);
        this.processNeighbor(neighbors[i + 3]!, current, graph, visited, queue, options);
      }

      // Handle remaining neighbors
      for (let i = len4; i < neighbors.length; i++) {
        this.processNeighbor(neighbors[i]!, current, graph, visited, queue, options);
      }

      // Sort queue by weight for best-first search
      queue.sort((a, b) => a.weight - b.weight);
    }

    return paths.sort((a, b) => a.weight - b.weight);
  }

  /**
   * Process a single neighbor in BFS
   */
  private processNeighbor(
    neighborId: string,
    current: {
      path: string[];
      relationships: string[];
      weight: number;
      conditionCount: number;
    },
    graph: AdjacencyGraph,
    visited: Map<string, number>,
    queue: Array<{
      path: string[];
      relationships: string[];
      weight: number;
      conditionCount: number;
    }>,
    options: Partial<PathFindingOptions>,
  ): void {
    // Skip if already in path (avoid cycles)
    if (current.path.includes(neighborId)) return;

    const currentNode = current.path[current.path.length - 1]!;
    const edgeKey = `${currentNode}:${neighborId}`;
    const edgeWeight = graph.weights.get(edgeKey) ?? CALL_WEIGHT;
    const newWeight = current.weight + edgeWeight;

    // Skip if we found a better path to this node
    const bestWeight = visited.get(neighborId);
    if (bestWeight !== undefined && bestWeight <= newWeight) return;

    // Skip if weight exceeds threshold
    if (options.weightThreshold && newWeight > options.weightThreshold) return;

    visited.set(neighborId, newWeight);

    // Check if this is a conditional edge
    const node = graph.nodes.get(neighborId);
    const isConditional = node?.controlFlow?.branches && node.controlFlow.branches.length > 0;

    queue.push({
      path: [...current.path, neighborId],
      relationships: [...current.relationships, edgeKey],
      weight: newWeight,
      conditionCount: current.conditionCount + (isConditional ? 1 : 0),
    });
  }

  // ===========================================================================
  // 5. BACKWARD PATH FINDING (DFS - All Callers)
  // ===========================================================================

  /**
   * Find all paths leading to target using DFS (backwards traversal).
   * Used for "why doesn't X get called?" analysis.
   */
  async findPathsBackward(targetId: string, options: Partial<PathFindingOptions> = {}): Promise<RawPath[]> {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPaths = options.maxPaths ?? DEFAULT_MAX_PATHS;

    // Build adjacency graph centered on target
    const graph = await this.buildAdjacencyGraph([targetId], maxDepth);

    if (!graph.nodes.has(targetId)) {
      return [];
    }

    const paths: RawPath[] = [];
    const currentPath: string[] = [];
    const currentRels: string[] = [];

    // DFS helper
    const dfs = (nodeId: string, depth: number, weight: number, conditionCount: number): void => {
      if (depth > maxDepth || paths.length >= maxPaths) return;

      currentPath.push(nodeId);

      // Get callers (backward edges)
      const callers = graph.backward.get(nodeId) || [];

      if (callers.length === 0 && currentPath.length > 1) {
        // Found an entry point - save path (reversed)
        paths.push({
          entityIds: [...currentPath].reverse(),
          relationships: [...currentRels].reverse(),
          weight,
          conditionCount,
        });
      } else {
        // Loop unrolling for callers
        const len4 = callers.length - (callers.length % 4);

        for (let i = 0; i < len4; i += 4) {
          this.processCallerDFS(
            callers[i]!,
            nodeId,
            depth,
            weight,
            conditionCount,
            currentPath,
            currentRels,
            graph,
            dfs,
          );
          this.processCallerDFS(
            callers[i + 1]!,
            nodeId,
            depth,
            weight,
            conditionCount,
            currentPath,
            currentRels,
            graph,
            dfs,
          );
          this.processCallerDFS(
            callers[i + 2]!,
            nodeId,
            depth,
            weight,
            conditionCount,
            currentPath,
            currentRels,
            graph,
            dfs,
          );
          this.processCallerDFS(
            callers[i + 3]!,
            nodeId,
            depth,
            weight,
            conditionCount,
            currentPath,
            currentRels,
            graph,
            dfs,
          );
        }

        for (let i = len4; i < callers.length; i++) {
          this.processCallerDFS(
            callers[i]!,
            nodeId,
            depth,
            weight,
            conditionCount,
            currentPath,
            currentRels,
            graph,
            dfs,
          );
        }
      }

      currentPath.pop();
    };

    dfs(targetId, 0, 0, 0);

    return paths.sort((a, b) => a.weight - b.weight);
  }

  /**
   * Process a single caller in DFS
   */
  private processCallerDFS(
    callerId: string,
    currentId: string,
    depth: number,
    weight: number,
    conditionCount: number,
    currentPath: string[],
    currentRels: string[],
    graph: AdjacencyGraph,
    dfs: (nodeId: string, depth: number, weight: number, conditionCount: number) => void,
  ): void {
    // Skip cycles
    if (currentPath.includes(callerId)) return;

    const edgeKey = `${callerId}:${currentId}`;
    const edgeWeight = graph.weights.get(edgeKey) ?? CALL_WEIGHT;
    const newWeight = weight + edgeWeight;

    // Check if conditional
    const node = graph.nodes.get(callerId);
    const isConditional = node?.controlFlow?.branches && node.controlFlow.branches.length > 0;

    currentRels.push(edgeKey);
    dfs(callerId, depth + 1, newWeight, conditionCount + (isConditional ? 1 : 0));
    currentRels.pop();
  }

  // ===========================================================================
  // 6. PATH ENRICHMENT
  // ===========================================================================

  /**
   * Convert raw paths to enriched TracePaths with full information
   */
  async enrichPaths(rawPaths: RawPath[], graph: AdjacencyGraph): Promise<TracePath[]> {
    const enriched: TracePath[] = [];

    for (let i = 0; i < rawPaths.length; i++) {
      const raw = rawPaths[i]!;
      const steps: TraceStep[] = [];

      for (let j = 0; j < raw.entityIds.length; j++) {
        const nodeId = raw.entityIds[j]!;
        const node = graph.nodes.get(nodeId);

        if (!node) continue;

        const step: TraceStep = {
          order: j + 1,
          entity: node.name,
          entityId: nodeId,
          file: node.file,
          line: node.line,
          action: this.determineAction(node, j, raw.entityIds.length),
        };

        // Add condition info if present
        if (node.controlFlow?.branches && node.controlFlow.branches.length > 0) {
          step.condition = node.controlFlow.branches[0]?.condition;
          step.branches = {};
          for (const branch of node.controlFlow.branches) {
            step.branches[branch.condition] = branch.target || "continue";
          }
        }

        // Add await info if present
        if (node.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
          step.awaits = true;
          step.awaitTarget = node.controlFlow.awaits[0]?.target;
        }

        steps.push(step);
      }

      const confidence = this.calculateConfidence(raw);

      enriched.push({
        id: `path-${i + 1}`,
        confidence,
        steps,
        summary: this.generatePathSummary(steps),
        warnings: this.generateWarnings(raw, graph),
      });
    }

    return enriched;
  }

  /**
   * Determine action type for a step
   */
  private determineAction(node: GraphNode, position: number, totalLength: number): TraceActionType {
    // Last step is typically a return
    if (position === totalLength - 1) {
      return "return";
    }

    // Check for specific patterns
    if (node.controlFlow?.branches && node.controlFlow.branches.length > 0) {
      return "condition";
    }

    if (node.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
      return "await";
    }

    if (node.controlFlow?.loops && node.controlFlow.loops.length > 0) {
      return "loop";
    }

    if (node.controlFlow?.exceptions && node.controlFlow.exceptions.length > 0) {
      return "throw";
    }

    return "call";
  }

  /**
   * Calculate confidence score for a path
   */
  private calculateConfidence(raw: RawPath): number {
    // Base confidence
    let confidence = 1.0;

    // Reduce for longer paths
    confidence -= raw.entityIds.length * 0.02;

    // Reduce for conditional paths
    confidence -= raw.conditionCount * 0.1;

    // Reduce for high weight
    confidence -= raw.weight * 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate human-readable path summary
   */
  private generatePathSummary(steps: TraceStep[]): string {
    if (steps.length === 0) return "Empty path";

    if (steps.length === 1) {
      return `Direct call to ${steps[0]!.entity}`;
    }

    const first = steps[0]!;
    const last = steps[steps.length - 1]!;
    const conditions = steps.filter((s) => s.action === "condition").length;
    const awaits = steps.filter((s) => s.awaits).length;

    let summary = `${first.entity} → ${last.entity} (${steps.length} steps)`;

    if (conditions > 0) {
      summary += `, ${conditions} condition${conditions > 1 ? "s" : ""}`;
    }

    if (awaits > 0) {
      summary += `, ${awaits} await${awaits > 1 ? "s" : ""}`;
    }

    return summary;
  }

  /**
   * Generate warnings for a path
   */
  private generateWarnings(raw: RawPath, graph: AdjacencyGraph): string[] {
    const warnings: string[] = [];

    // Warn about long paths
    if (raw.entityIds.length > 10) {
      warnings.push("Long call chain - may indicate design issues");
    }

    // Warn about many conditions
    if (raw.conditionCount > 5) {
      warnings.push("Many conditional branches - path may be rarely executed");
    }

    // Warn about async boundaries
    let asyncCount = 0;
    for (const id of raw.entityIds) {
      const node = graph.nodes.get(id);
      if (node?.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
        asyncCount++;
      }
    }
    if (asyncCount > 3) {
      warnings.push("Multiple async boundaries - consider timing issues");
    }

    return warnings;
  }

  // ===========================================================================
  // 7. UTILITY METHODS
  // ===========================================================================

  /**
   * Clear caches (call after graph changes)
   */
  clearCache(): void {
    this.adjacencyCache.clear();
    this.nodeCache.clear();
  }

  /**
   * Get call probability based on conditions
   */
  getCallProbability(node: GraphNode): CallProbability {
    if (!node.controlFlow?.branches || node.controlFlow.branches.length === 0) {
      return "always";
    }

    // Check for guard patterns (early returns)
    const hasGuard = node.controlFlow.branches.some((b) => b.target === "return" || b.target === "throw");

    if (hasGuard) {
      return "rare";
    }

    return "conditional";
  }

  /**
   * Get confidence level from numeric score
   */
  getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.7) return "high";
    if (score >= 0.4) return "medium";
    return "low";
  }

  /**
   * Find entity by name using semantic search
   * Decomposed query for 512-token models
   */
  async findEntityByName(name: string, type?: string): Promise<Entity | null> {
    // Try exact match first
    const entities = await this.storage.searchEntities({
      namePattern: name,
      types: type ? [type as any] : undefined,
    });

    if (entities.length > 0) {
      // Return best match (exact name match preferred)
      const exact = entities.find((e) => e.name === name);
      return exact || entities[0]!;
    }

    return null;
  }

  /**
   * Get all callers of an entity
   */
  async getCallers(entityId: string): Promise<Array<{ entity: Entity; probability: CallProbability }>> {
    const rels = await this.storage.getRelationshipsForEntity(entityId, RelationType.CALLS);
    const callers: Array<{ entity: Entity; probability: CallProbability }> = [];

    for (const rel of rels) {
      if (rel.toId === entityId) {
        const caller = await this.storage.getEntity(rel.fromId);
        if (caller) {
          const node = this.entityToNode(caller);
          callers.push({
            entity: caller,
            probability: this.getCallProbability(node),
          });
        }
      }
    }

    return callers;
  }

  /**
   * Get all callees of an entity
   */
  async getCallees(entityId: string): Promise<Entity[]> {
    const rels = await this.storage.getRelationshipsForEntity(entityId, RelationType.CALLS);
    const callees: Entity[] = [];

    for (const rel of rels) {
      if (rel.fromId === entityId) {
        const callee = await this.storage.getEntity(rel.toId);
        if (callee) {
          callees.push(callee);
        }
      }
    }

    return callees;
  }
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

export default PathBuilder;
