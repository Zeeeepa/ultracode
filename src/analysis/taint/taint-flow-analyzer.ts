import type Graph from "graphology";
import { log } from "../../logging/index.js";
import type { GraphEdgeAttributes, GraphNodeAttributes } from "../../tracing/graphology-path-builder.js";
import { GraphologyPathBuilder } from "../../tracing/graphology-path-builder.js";
import type { Entity, GraphStorage } from "../../types/storage.js";
import { classifyAsSanitizer, classifyAsSink, classifyAsSource } from "./catalogs.js";
import type {
  TaintAnalysisParams,
  TaintAnalysisResult,
  TaintCategory,
  TaintFlowStep,
  TaintSanitizer,
  TaintSeverity,
  TaintSink,
  TaintSource,
  TaintVulnerability,
} from "./types.js";

const TEST_FILE_PATTERNS = /\.(test|spec|e2e|__tests__|__mocks__)\./i;
const MAX_VULNERABILITIES = 100;
const MAX_SOURCES = 100;
const MAX_SINKS = 150;
const TIMEOUT_MS = 25_000; // 25s — margin before MCP timeout
const TAINT_EDGE_TYPES = new Set(["calls", "imports", "references"]);

// Reuse pathBuilder across sequential calls with the same storage.
// Eliminates redundant loadGraph() (2 × ~100K row queries per call).
// WeakMap: GC-safe — entry is cleaned when storage instance is collected.
const pathBuilderCache = new WeakMap<GraphStorage, GraphologyPathBuilder>();

// Cache entities across sequential calls. Without this, each call does
// getAllEntities() (~100K rows) even when the data hasn't changed.
// Invalidated when storage instance is GC'd (WeakMap).
const entitiesCache = new WeakMap<GraphStorage, Entity[]>();

export class TaintFlowAnalyzer {
  private storage: GraphStorage;
  private pathBuilder: GraphologyPathBuilder;
  private sanitizerIdSet: Set<string> = new Set();

  constructor(storage: GraphStorage) {
    this.storage = storage;
    let cached = pathBuilderCache.get(storage);
    if (!cached) {
      cached = new GraphologyPathBuilder(storage);
      pathBuilderCache.set(storage, cached);
    }
    this.pathBuilder = cached;
  }

  async analyze(params: TaintAnalysisParams): Promise<TaintAnalysisResult> {
    const startTime = performance.now();

    await this.pathBuilder.loadGraph();

    let allEntities = entitiesCache.get(this.storage);
    if (!allEntities) {
      allEntities = await this.storage.getAllEntities();
      entitiesCache.set(this.storage, allEntities);
    }
    const entities = params.includeTests
      ? allEntities
      : allEntities.filter((e) => !TEST_FILE_PATTERNS.test(e.filePath));

    // Discover sources, sinks, sanitizers (with metadata cache)
    const { sources, sinks, sanitizers, cachedCount, newlyClassified } = this.discoverAll(entities);

    log.i("TAINT", "discovery_complete", {
      sources: sources.length,
      sinks: sinks.length,
      sanitizers: sanitizers.length,
      cachedClassifications: cachedCount,
    });

    // Pre-compute sanitizer ID set for O(1) lookup in buildFlowSteps
    this.sanitizerIdSet = new Set(sanitizers.map((s) => s.id));

    // Determine category filter early — needed before slicing sinks
    const targetCategory = params.category === "all" || !params.category ? null : params.category;

    // Apply priority sort and limits
    const sourcesTotal = sources.length;
    const sinksTotal = sinks.length;
    sources.sort((a, b) => a.priority - b.priority);
    sinks.sort((a, b) => a.priority - b.priority);
    const limitedSources = sources.slice(0, MAX_SOURCES);

    // Filter sinks by category BEFORE slicing to avoid wasting slots
    // on sinks irrelevant to the requested category
    const categorySinks = targetCategory ? sinks.filter((s) => s.categories.includes(targetCategory)) : sinks;
    const limitedSinks = categorySinks.slice(0, MAX_SINKS);

    // Find vulnerable flows
    const vulnerabilities: TaintVulnerability[] = [];
    const maxDepth = params.maxDepth ?? 15;
    const graph = this.pathBuilder.getGraph();

    let reachedLimit = false;
    let timeoutReached = false;

    for (const source of limitedSources) {
      if (reachedLimit) break;
      if (performance.now() - startTime > TIMEOUT_MS) {
        timeoutReached = true;
        reachedLimit = true;
        break;
      }

      // Phase 1: One BFS from source — O(reachable_nodes)
      const reachable = this.computeReachableSet(graph, source.id, maxDepth);

      for (const sink of limitedSinks) {
        if (vulnerabilities.length >= MAX_VULNERABILITIES) {
          reachedLimit = true;
          break;
        }
        if (performance.now() - startTime > TIMEOUT_MS) {
          timeoutReached = true;
          reachedLimit = true;
          break;
        }

        // O(1) reachability check — skip disconnected pairs
        if (!reachable.has(sink.id)) continue;

        // Filter by category if specified
        const matchingCategories = targetCategory
          ? sink.categories.filter((c) => c === targetCategory)
          : sink.categories;

        if (matchingCategories.length === 0) continue;
        if (source.file === sink.file && source.id === sink.id) continue;

        // Phase 1: BFS path reconstruction (only for reachable pairs)
        const pathIds = this.reconstructPath(graph, source.id, sink.id, maxDepth);
        if (!pathIds) continue;

        // Phase 3: Batch fetch for flow steps
        const flow = await this.buildFlowSteps(pathIds, source, sink);

        // Check for sanitizers on path
        const sanitizersOnPath = this.findSanitizersOnPath(flow, sanitizers);

        for (const category of matchingCategories) {
          if (vulnerabilities.length >= MAX_VULNERABILITIES) break;

          const relevantSanitizers = sanitizersOnPath.filter((s) => s.protectsAgainst.includes(category));

          const isSanitized = relevantSanitizers.length > 0;
          const missingSanitizers = isSanitized ? [] : this.suggestSanitizers(category);

          vulnerabilities.push({
            category,
            severity: this.calculateSeverity(category, isSanitized, flow.length),
            source,
            sink,
            flow,
            sanitized: isSanitized,
            missingSanitizers,
            confidence: this.calculateConfidence(flow, isSanitized),
          });
        }
      }
    }

    // Sort by severity, then confidence
    const severityOrder: Record<TaintSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    vulnerabilities.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.confidence - a.confidence,
    );

    const elapsed = Math.round(performance.now() - startTime);
    log.i("TAINT", "analysis_complete", {
      vulnerabilities: vulnerabilities.length,
      limited: reachedLimit,
      timeoutReached,
      timeMs: elapsed,
    });

    // Build summary
    const bySeverity: Record<TaintSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Partial<Record<TaintCategory, number>> = {};
    let sanitizedFlows = 0;
    let unsanitizedFlows = 0;

    for (const v of vulnerabilities) {
      bySeverity[v.severity]++;
      byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
      if (v.sanitized) sanitizedFlows++;
      else unsanitizedFlows++;
    }

    // Phase 4: Persist classifications for next run
    // MUST await — fire-and-forget escapes pLimit(1) boundary and causes
    // SQLITE_BUSY when the next queued call starts reading (exclusive mode, no WAL)
    const entityMap = new Map(allEntities.map((e) => [e.id, e]));
    await this.persistTaintClassifications(sources, sinks, sanitizers, newlyClassified, entityMap).catch(() => {});

    return {
      vulnerabilities,
      sources: limitedSources,
      sinks: limitedSinks,
      sanitizers,
      summary: {
        totalVulnerabilities: vulnerabilities.length,
        bySeverity,
        byCategory,
        sanitizedFlows,
        unsanitizedFlows,
        ...(reachedLimit && { _limitReached: true, _maxVulnerabilities: MAX_VULNERABILITIES }),
        ...(sourcesTotal > MAX_SOURCES && { _sourcesTotal: sourcesTotal }),
        ...(categorySinks.length > MAX_SINKS && { _sinksTotal: categorySinks.length }),
        ...(targetCategory && sinksTotal !== categorySinks.length && { _sinksBeforeFilter: sinksTotal }),
        ...(timeoutReached && { _timeoutReached: true }),
        _elapsedMs: elapsed,
        ...(cachedCount > 0 && { _cachedClassifications: cachedCount }),
      },
    };
  }

  // ===========================================================================
  // Phase 1: Reachability BFS pre-filtering
  // ===========================================================================

  /**
   * BFS from source to compute all reachable nodes via taint-relevant edges.
   * Returns a Set for O(1) sink lookup.
   */
  private computeReachableSet(
    graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>,
    sourceId: string,
    maxDepth: number,
  ): Set<string> {
    const visited = new Set<string>();

    if (!graph.hasNode(sourceId)) return visited;

    let frontier = [sourceId];
    let depth = 0;

    while (frontier.length > 0 && depth < maxDepth) {
      const next: string[] = [];
      for (const node of frontier) {
        if (visited.has(node)) continue;
        visited.add(node);

        for (const edge of graph.outEdges(node)) {
          const edgeType = graph.getEdgeAttribute(edge, "type") as string;
          if (TAINT_EDGE_TYPES.has(edgeType)) {
            const target = graph.target(edge);
            if (!visited.has(target)) next.push(target);
          }
        }
      }
      frontier = next;
      depth++;
    }

    return visited;
  }

  /**
   * BFS path reconstruction — finds shortest path between reachable source-sink pair.
   * Only follows taint-relevant edge types (calls/imports/references).
   */
  private reconstructPath(
    graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>,
    fromId: string,
    toId: string,
    maxDepth: number,
  ): string[] | null {
    if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return null;
    if (fromId === toId) return [fromId];

    const parent = new Map<string, string>();
    const visited = new Set<string>([fromId]);
    let queue = [fromId];
    let depth = 0;

    while (queue.length > 0 && depth < maxDepth) {
      const next: string[] = [];
      for (const node of queue) {
        if (node === toId) {
          // Reconstruct path from parent map
          const path: string[] = [];
          let cur: string | undefined = toId;
          while (cur) {
            path.unshift(cur);
            cur = parent.get(cur);
          }
          return path;
        }

        for (const edge of graph.outEdges(node)) {
          const edgeType = graph.getEdgeAttribute(edge, "type") as string;
          if (TAINT_EDGE_TYPES.has(edgeType)) {
            const target = graph.target(edge);
            if (!visited.has(target)) {
              visited.add(target);
              parent.set(target, node);
              next.push(target);
            }
          }
        }
      }
      queue = next;
      depth++;
    }

    // Check if toId was reached in the last frontier
    if (parent.has(toId)) {
      const path: string[] = [];
      let cur: string | undefined = toId;
      while (cur) {
        path.unshift(cur);
        cur = parent.get(cur);
      }
      return path;
    }

    return null;
  }

  // ===========================================================================
  // Discovery with metadata cache (Phase 4)
  // ===========================================================================

  private discoverAll(entities: Entity[]): {
    sources: TaintSource[];
    sinks: TaintSink[];
    sanitizers: TaintSanitizer[];
    cachedCount: number;
    newlyClassified: Set<string>;
  } {
    const sources: TaintSource[] = [];
    const sinks: TaintSink[] = [];
    const sanitizers: TaintSanitizer[] = [];
    const newlyClassified = new Set<string>();
    let cachedCount = 0;

    for (const entity of entities) {
      // Phase 4: Check metadata cache first
      const cached = entity.metadata?.["taintRole"] as
        | {
            role: string;
            type: string;
            description?: string;
            categories?: TaintCategory[];
            protectsAgainst?: TaintCategory[];
            priority?: number;
          }
        | undefined;

      if (cached) {
        cachedCount++;
        if (cached.role === "source") {
          sources.push({
            id: entity.id,
            name: entity.name,
            file: entity.filePath,
            line: entity.location?.start?.line ?? 0,
            sourceType: cached.type,
            description: cached.description ?? "",
            priority: cached.priority ?? 4,
          });
        } else if (cached.role === "sink") {
          sinks.push({
            id: entity.id,
            name: entity.name,
            file: entity.filePath,
            line: entity.location?.start?.line ?? 0,
            sinkType: cached.type,
            categories: cached.categories ?? [],
            priority: cached.priority ?? 3,
          });
        } else if (cached.role === "sanitizer") {
          sanitizers.push({
            id: entity.id,
            name: entity.name,
            file: entity.filePath,
            line: entity.location?.start?.line ?? 0,
            sanitizerType: cached.type,
            protectsAgainst: cached.protectsAgainst ?? [],
          });
        }
        continue;
      }

      // API contract entities as sources for missing_auth detection
      if (entity.metadata?.["isApiContract"]) {
        const protoType = entity.metadata["protoType"] as string | undefined;
        const graphqlType = entity.metadata["graphqlType"] as string | undefined;
        const swaggerType = entity.metadata["swaggerType"] as string | undefined;

        const isEndpoint =
          protoType === "rpc" ||
          (graphqlType === "field" &&
            ((entity.metadata["parentType"] as string) === "Query" ||
              (entity.metadata["parentType"] as string) === "Mutation")) ||
          swaggerType === "endpoint" ||
          graphqlType === "query" ||
          graphqlType === "mutation";

        if (isEndpoint) {
          newlyClassified.add(entity.id);
          sources.push({
            id: entity.id,
            name: entity.name,
            file: entity.filePath,
            line: entity.location?.start?.line ?? 0,
            sourceType: "api_endpoint",
            description: `API endpoint: ${entity.name}`,
            priority: 1,
          });
          continue;
        }
      }

      // Fallback: regex classification
      const code = (entity.metadata?.signature as string | undefined) ?? entity.name;

      const sourceClass = classifyAsSource(code);
      if (sourceClass) {
        newlyClassified.add(entity.id);
        sources.push({
          id: entity.id,
          name: entity.name,
          file: entity.filePath,
          line: entity.location?.start?.line ?? 0,
          sourceType: sourceClass.type,
          description: sourceClass.description,
          priority: sourceClass.priority,
        });
        continue;
      }

      const sinkClass = classifyAsSink(code);
      if (sinkClass) {
        newlyClassified.add(entity.id);
        sinks.push({
          id: entity.id,
          name: entity.name,
          file: entity.filePath,
          line: entity.location?.start?.line ?? 0,
          sinkType: sinkClass.type,
          categories: sinkClass.categories,
          priority: sinkClass.priority,
        });
        continue;
      }

      const sanClass = classifyAsSanitizer(code);
      if (sanClass) {
        newlyClassified.add(entity.id);
        sanitizers.push({
          id: entity.id,
          name: entity.name,
          file: entity.filePath,
          line: entity.location?.start?.line ?? 0,
          sanitizerType: sanClass.type,
          protectsAgainst: sanClass.protectsAgainst,
        });
      }
    }

    return { sources, sinks, sanitizers, cachedCount, newlyClassified };
  }

  // ===========================================================================
  // Phase 3: Batch fetch for flow steps
  // ===========================================================================

  private async buildFlowSteps(entityIds: string[], source: TaintSource, sink: TaintSink): Promise<TaintFlowStep[]> {
    // Batch fetch all entities at once instead of N+1 queries
    const entityMap = await this.storage.getEntitiesBatch(entityIds);
    const steps: TaintFlowStep[] = [];

    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i]!;
      const entity = entityMap.get(entityId) ?? null;

      let role: TaintFlowStep["role"] = "passthrough";
      if (entityId === source.id) role = "source";
      else if (entityId === sink.id) role = "sink";
      else if (this.sanitizerIdSet.has(entityId)) role = "sanitizer";

      steps.push({
        order: i,
        entityId,
        name: entity?.name ?? entityId,
        file: entity?.filePath ?? "",
        line: entity?.location.start.line ?? 0,
        role,
      });
    }

    return steps;
  }

  private findSanitizersOnPath(flow: TaintFlowStep[], sanitizers: TaintSanitizer[]): TaintSanitizer[] {
    const onPath: TaintSanitizer[] = [];

    for (const step of flow) {
      if (step.role === "sanitizer" || this.sanitizerIdSet.has(step.entityId)) {
        const sanitizer = sanitizers.find((s) => s.id === step.entityId);
        if (sanitizer) onPath.push(sanitizer);
      }
    }

    return onPath;
  }

  // ===========================================================================
  // Phase 4: Persist taint classifications to entity metadata
  // ===========================================================================

  private async persistTaintClassifications(
    sources: TaintSource[],
    sinks: TaintSink[],
    sanitizers: TaintSanitizer[],
    newlyClassified: Set<string>,
    entityMap: Map<string, Entity>,
  ): Promise<void> {
    // Nothing new to persist — all entities already have taintRole in metadata
    if (newlyClassified.size === 0) return;

    const taintRoles = new Map<string, Record<string, unknown>>();

    for (const s of sources) {
      if (newlyClassified.has(s.id)) {
        taintRoles.set(s.id, { role: "source", type: s.sourceType, description: s.description, priority: s.priority });
      }
    }
    for (const s of sinks) {
      if (newlyClassified.has(s.id)) {
        taintRoles.set(s.id, { role: "sink", type: s.sinkType, categories: s.categories, priority: s.priority });
      }
    }
    for (const s of sanitizers) {
      if (newlyClassified.has(s.id)) {
        taintRoles.set(s.id, { role: "sanitizer", type: s.sanitizerType, protectsAgainst: s.protectsAgainst });
      }
    }

    // Build full Entity objects with merged metadata — no DB reads needed
    const entitiesToUpdate: Entity[] = [];
    for (const [id, taintRole] of taintRoles) {
      const entity = entityMap.get(id);
      if (!entity) continue;

      const mergedMetadata = { ...((entity.metadata ?? {}) as Record<string, unknown>), taintRole };
      entitiesToUpdate.push({
        ...entity,
        metadata: mergedMetadata,
        updatedAt: Date.now(),
      });

      // Update cached entity in-place so next call sees taintRole without DB round-trip
      (entity as { metadata: unknown }).metadata = mergedMetadata;
    }

    // Single batch INSERT OR REPLACE instead of N×3 individual queries
    if (entitiesToUpdate.length > 0) {
      await this.storage.insertEntities(entitiesToUpdate);
    }
  }

  // ===========================================================================
  // Severity, confidence, suggestions
  // ===========================================================================

  private calculateSeverity(category: TaintCategory, isSanitized: boolean, pathLength: number): TaintSeverity {
    if (isSanitized) return "low";

    const categorySeverity: Record<TaintCategory, TaintSeverity> = {
      sql_injection: "critical",
      command_injection: "critical",
      xss: "high",
      path_traversal: "high",
      ssrf: "high",
      prototype_pollution: "medium",
      missing_auth: "high",
    };

    const base = categorySeverity[category];

    // Longer paths are less likely to be exploitable
    if (pathLength > 10 && base === "critical") return "high";
    if (pathLength > 10 && base === "high") return "medium";

    return base;
  }

  private calculateConfidence(flow: TaintFlowStep[], isSanitized: boolean): number {
    let confidence = 0.7; // Base confidence

    // Short direct paths are more confident
    if (flow.length <= 3) confidence += 0.2;
    else if (flow.length <= 6) confidence += 0.1;
    else confidence -= 0.1;

    // Sanitized flows have lower vulnerability confidence
    if (isSanitized) confidence -= 0.3;

    return Math.max(0.1, Math.min(1.0, Math.round(confidence * 100) / 100));
  }

  private suggestSanitizers(category: TaintCategory): string[] {
    const suggestions: Record<TaintCategory, string[]> = {
      sql_injection: [
        "Use parameterized queries",
        "Use ORM methods instead of raw SQL",
        "Apply input validation with Zod/Joi",
      ],
      xss: ["Use DOMPurify.sanitize()", "Use textContent instead of innerHTML", "Apply output encoding"],
      command_injection: [
        "Use execFile() instead of exec()",
        "Validate and whitelist commands",
        "Use shell-escape library",
      ],
      path_traversal: [
        "Use path.basename() to strip directory traversal",
        "Validate against allowed paths",
        "Use path.normalize() + startsWith check",
      ],
      ssrf: ["Validate URLs against allowlist", "Block private IP ranges", "Use URL parser to check hostname"],
      prototype_pollution: [
        "Use Object.create(null) for maps",
        "Validate property names",
        "Use Map instead of plain objects",
      ],
      missing_auth: [
        "Add @Authorize/@Auth decorator to endpoint",
        "Add authentication middleware (requireAuth, isAuthenticated)",
        "Add gRPC auth interceptor",
        "Add GraphQL @auth directive",
      ],
    };

    return suggestions[category] ?? [];
  }
}
