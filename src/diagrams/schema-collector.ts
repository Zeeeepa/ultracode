/**
 * Schema Collector — BFS graph traversal for diagram generation
 *
 * Pipeline: Graph → SchemaCollector → DiagramIR → Renderer
 *
 * Key design decisions:
 * - Own BFS with CONTAINS-only structural traversal (NOT getSubgraph)
 * - Phase 1: collect nodes via CONTAINS hierarchy
 * - Phase 2: add inter-node edges (CALLS/IMPORTS/EXTENDS/IMPLEMENTS)
 * - Data flow enrichment via TraceEngine.getBatchNodeContext() (2 SQL queries)
 * - LRU cache on DiagramIR (key = params hash, TTL 5min, max 20 entries)
 */

import { createHash } from "node:crypto";

import { log } from "../logging/index.js";
import type { TraceEngine } from "../tracing/trace-engine.js";
import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import type {
  DataAnnotation,
  DiagramDirection,
  DiagramEdge,
  DiagramGroup,
  DiagramIR,
  DiagramNode,
  DiagramType,
  EdgeStyle,
} from "./diagram-ir.js";
import { analyzeFieldMappings } from "./field-mapper.js";

// -- Constants ---------------------------------------------------------------

const MAX_DIAGRAM_NODES = 500;
const MAX_DIAGRAM_EDGES = 1000;
const MAX_NODES_PER_LEVEL = 100;
const RELATIONSHIP_CHUNK_SIZE = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 20;

// Relationship types for phase 2 (inter-node edges)
const INTER_NODE_REL_TYPES: string[] = ["calls", "imports", "extends", "implements"];
// Structural relationship for phase 1 (hierarchy traversal)
const STRUCTURAL_REL_TYPE = "contains";

// Code file extensions (filter out docs, config, assets)
import { SUPPORTED_CODE_EXTENSIONS_SET } from "../agents/dev/file-extensions.js";

const CODE_EXTENSIONS = SUPPORTED_CODE_EXTENSIONS_SET;

function isCodeFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

/** Filter to real code entities (not external stubs, not docs) */
function isCodeEntity(entity: Entity): boolean {
  if (entity.id.startsWith("external:")) return false;
  if (entity.filePath?.includes("external://")) return false;
  if (!entity.filePath) return false;
  return isCodeFile(entity.filePath);
}

// Directories to deprioritize in project-wide diagrams
const NON_SOURCE_DIRS =
  /[/\\](scripts|tests|test|__tests__|spec|node_modules|dist|build|\.git|grammar|external|generated|gen|swagger|openapi|proto-gen|__generated__|__snapshots__|fixtures|mocks|stubs|e2e|benchmark|examples|docs)[/\\]/i;

// Files to exclude (generated, spec, config)
const NON_SOURCE_FILES =
  /\.(spec|test|stories|mock|fixture|d)\.[tj]sx?$|swagger\.|openapi\.|\.generated\.|\.gen\.|\.pb\./i;

/** Prefer src/ and lib/ directories over scripts/tests/generated */
function isSourceEntity(entity: Entity): boolean {
  if (!entity.filePath) return false;
  if (NON_SOURCE_DIRS.test(entity.filePath)) return false;
  if (NON_SOURCE_FILES.test(entity.filePath)) return false;
  return true;
}

// -- Collector Options -------------------------------------------------------

export interface CollectorOptions {
  entryPoint?: string | undefined;
  depth: number;
  dataFlowLevel: number;
  diagramType?: DiagramType | undefined;
  direction?: DiagramDirection | undefined;
}

// -- LRU Cache ---------------------------------------------------------------

interface CacheEntry {
  ir: DiagramIR;
  createdAt: number;
}

const irCache = new Map<string, CacheEntry>();

function getCacheKey(options: CollectorOptions, projectKey: string): string {
  const raw = `${options.entryPoint || "root"}:${options.depth}:${options.dataFlowLevel}:${options.diagramType || "auto"}:${projectKey}`;
  return createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

function getCachedIR(key: string): DiagramIR | null {
  const entry = irCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    irCache.delete(key);
    return null;
  }
  return entry.ir;
}

function setCachedIR(key: string, ir: DiagramIR): void {
  // LRU eviction
  if (irCache.size >= CACHE_MAX_SIZE) {
    const oldest = [...irCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) irCache.delete(oldest[0]);
  }
  irCache.set(key, { ir, createdAt: Date.now() });
}

/** Clear diagram cache (called on file changes) */
export function clearDiagramCache(): void {
  irCache.clear();
}

// -- Schema Collector --------------------------------------------------------

export class SchemaCollector {
  constructor(
    private storage: GraphStorage,
    private traceEngine: TraceEngine,
  ) {}

  async collect(options: CollectorOptions, projectKey = "default"): Promise<DiagramIR> {
    const cacheKey = getCacheKey(options, projectKey);
    const cached = getCachedIR(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    const { dataFlowLevel, direction = "TD" } = options;

    // Phase 1: Structural BFS traversal
    const { nodes, groups } = await this.collectStructure(options);

    // Auto-detect diagram type
    const diagramType = options.diagramType || this.autoDetectDiagramType(nodes);

    // Phase 2: Inter-node edges
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = await this.collectEdges(nodeIds);

    // Phase 3: Data flow enrichment
    if (dataFlowLevel >= 1) {
      await this.enrichWithDataFlow(nodes, edges, nodeIds, dataFlowLevel);
    }

    const ir: DiagramIR = {
      title: options.entryPoint || "Project Architecture",
      direction,
      diagramType,
      nodes,
      edges,
      groups,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        totalGroups: groups.length,
        truncated: nodes.length >= MAX_DIAGRAM_NODES || edges.length >= MAX_DIAGRAM_EDGES,
        collectionTimeMs: Date.now() - startTime,
      },
    };

    setCachedIR(cacheKey, ir);
    return ir;
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Structural BFS via CONTAINS relationships
  // ---------------------------------------------------------------------------

  private async collectStructure(options: CollectorOptions): Promise<{ nodes: DiagramNode[]; groups: DiagramGroup[] }> {
    const nodes: DiagramNode[] = [];
    const groups: DiagramGroup[] = [];

    if (options.entryPoint) {
      // Start from specific entry point
      const rootEntity = await this.resolveEntryPoint(options.entryPoint);
      if (rootEntity) {
        await this.bfsFromEntity(rootEntity, options.depth, nodes, groups);
      }
    } else {
      // Start from project root: collect top-level packages/files
      await this.bfsFromRoot(options.depth, nodes, groups);
    }

    return { nodes, groups };
  }

  private async bfsFromRoot(maxDepth: number, nodes: DiagramNode[], groups: DiagramGroup[]): Promise<void> {
    // Strategy: find architecturally significant entities (classes, interfaces)
    // then group by file to build the diagram. This gives a much better overview
    // than package-based traversal which includes scripts/docs.

    // Step 1: Find classes and interfaces — the structural anchors of architecture
    const classes = await this.storage.findEntities({
      filters: { entityType: ["class", "interface"] as any },
      limit: MAX_NODES_PER_LEVEL * 3,
    });
    const codeClasses = classes.filter(isCodeEntity).filter(isSourceEntity);

    // Step 2: If not enough classes, also grab top-level functions
    let anchors = codeClasses;
    if (anchors.length < 10) {
      const funcs = await this.storage.findEntities({
        filters: { entityType: ["function", "async_function"] as any },
        limit: MAX_NODES_PER_LEVEL * 3,
      });
      const codeFuncs = funcs.filter(isCodeEntity).filter(isSourceEntity);
      anchors = [...anchors, ...codeFuncs];
    }

    if (anchors.length === 0) {
      // Last resort fallback: any code entity from src/
      const allEntities = await this.storage.findEntities({ limit: MAX_NODES_PER_LEVEL * 5 });
      anchors = allEntities.filter(isCodeEntity).filter(isSourceEntity);
    }

    // Group by file, sort by architectural significance (classes count)
    const byFile = new Map<string, Entity[]>();
    for (const e of anchors) {
      if (!byFile.has(e.filePath)) byFile.set(e.filePath, []);
      byFile.get(e.filePath)!.push(e);
    }

    const sortedFiles = [...byFile.entries()]
      .sort((a, b) => {
        // Prioritize files with classes/interfaces over pure-function files
        const aClasses = a[1].filter((e) => e.type === "class" || e.type === "interface").length;
        const bClasses = b[1].filter((e) => e.type === "class" || e.type === "interface").length;
        if (bClasses !== aClasses) return bClasses - aClasses;
        return b[1].length - a[1].length;
      })
      .slice(0, MAX_NODES_PER_LEVEL);

    for (const [filePath, entities] of sortedFiles) {
      if (nodes.length >= MAX_DIAGRAM_NODES) break;
      const fileNode = this.createFileNode(filePath);
      nodes.push(fileNode);

      if (maxDepth >= 2) {
        const meaningful = entities
          .filter((e) => e.type !== "import" && e.type !== "export" && e.type !== "comment")
          .slice(0, MAX_NODES_PER_LEVEL);
        const childNodes = meaningful.map((e) => this.entityToNode(e, fileNode.id));
        nodes.push(...childNodes);

        // depth >= 3: expand class children (methods, properties)
        if (maxDepth >= 3) {
          for (const child of childNodes) {
            if (child.type === "class" || child.type === "interface") {
              const entity = entities.find((e) => e.id === child.id);
              if (entity) {
                await this.expandChildren(entity.id, maxDepth - 2, nodes, groups, child.id);
              }
            }
          }
        }

        if (childNodes.length > 0) {
          groups.push({
            id: `group_${fileNode.id}`,
            label: this.shortPath(filePath),
            nodeIds: [fileNode.id, ...childNodes.map((n) => n.id)],
            filePath,
          });
        }
      }
    }
  }

  private async bfsFromEntity(
    root: Entity,
    maxDepth: number,
    nodes: DiagramNode[],
    groups: DiagramGroup[],
  ): Promise<void> {
    const rootNode = this.entityToNode(root);
    nodes.push(rootNode);

    if (maxDepth >= 2) {
      await this.expandChildren(root.id, maxDepth - 1, nodes, groups, rootNode.id);
    }
  }

  private async expandChildren(
    parentId: string,
    remainingDepth: number,
    nodes: DiagramNode[],
    groups: DiagramGroup[],
    parentNodeId: string,
  ): Promise<void> {
    if (remainingDepth <= 0 || nodes.length >= MAX_DIAGRAM_NODES) return;

    const rels = await this.storage.getRelationshipsForEntity(parentId, STRUCTURAL_REL_TYPE as any);
    const childIds = rels.filter((r) => r.fromId === parentId && r.type === STRUCTURAL_REL_TYPE).map((r) => r.toId);

    if (childIds.length === 0) return;

    // Batch-fetch children
    const childEntities = await this.storage.getEntitiesBatch(childIds);

    // Filter to code entities, skip imports/comments
    let children = [...childEntities.values()].filter(
      (e) => e.type !== "import" && e.type !== "export" && e.type !== "comment",
    );
    const overflow = children.length > MAX_NODES_PER_LEVEL;
    if (overflow) {
      children.sort((a, b) => (b.complexity || 0) - (a.complexity || 0));
      children = children.slice(0, MAX_NODES_PER_LEVEL);
    }

    const childNodeIds: string[] = [];
    for (const child of children) {
      if (nodes.length >= MAX_DIAGRAM_NODES) break;
      const childNode = this.entityToNode(child, parentNodeId);
      nodes.push(childNode);
      childNodeIds.push(childNode.id);

      // Recurse deeper
      if (remainingDepth > 1) {
        await this.expandChildren(child.id, remainingDepth - 1, nodes, groups, childNode.id);
      }
    }

    // Create overflow indicator
    if (overflow) {
      const overflowCount = childEntities.size - MAX_NODES_PER_LEVEL;
      const overflowNode: DiagramNode = {
        id: `overflow_${parentNodeId}`,
        label: `... and ${overflowCount} more`,
        type: "ellipsis",
        inputTypes: [],
        hasTransformation: false,
        fieldMappings: [],
        modifiers: [],
      };
      nodes.push(overflowNode);
      childNodeIds.push(overflowNode.id);
    }

    if (childNodeIds.length > 0) {
      groups.push({
        id: `group_${parentNodeId}`,
        label: nodes.find((n) => n.id === parentNodeId)?.label || parentNodeId,
        nodeIds: childNodeIds,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Inter-node Edges (CALLS, IMPORTS, EXTENDS, IMPLEMENTS)
  // ---------------------------------------------------------------------------

  private async collectEdges(nodeIds: Set<string>): Promise<DiagramEdge[]> {
    if (nodeIds.size === 0) return [];

    // Build child→parent map for relationship lifting:
    // If method A.foo() calls method B.bar(), we want edge A→B on the diagram.
    const childToParent = new Map<string, string>();
    const classNodeIds: string[] = [];
    for (const id of nodeIds) {
      // We'll also collect children of class nodes for lifting
      classNodeIds.push(id);
    }

    // Fetch children of all class/interface nodes to enable lifting
    const expandIds: string[] = [];
    for (let i = 0; i < classNodeIds.length; i += RELATIONSHIP_CHUNK_SIZE) {
      const chunk = classNodeIds.slice(i, i + RELATIONSHIP_CHUNK_SIZE);
      for (const parentId of chunk) {
        const rels = await this.storage.getRelationshipsForEntity(parentId, STRUCTURAL_REL_TYPE as any);
        for (const r of rels) {
          if (r.fromId === parentId && r.type === STRUCTURAL_REL_TYPE) {
            childToParent.set(r.toId, parentId);
            expandIds.push(r.toId);
          }
        }
      }
    }

    // Search for relationships from both direct nodes AND their children
    const searchIds = [...nodeIds, ...expandIds];
    const allRels: Relationship[] = [];

    for (let i = 0; i < searchIds.length; i += RELATIONSHIP_CHUNK_SIZE) {
      const chunk = searchIds.slice(i, i + RELATIONSHIP_CHUNK_SIZE);
      const rels = await this.storage.findRelationships({
        filters: {
          fromId: chunk,
          relationshipType: INTER_NODE_REL_TYPES as any,
        },
        limit: MAX_DIAGRAM_EDGES,
      });
      allRels.push(...rels);
    }

    // Post-filter and lift: resolve both fromId and toId to diagram nodes
    const edges: DiagramEdge[] = [];
    const seenEdges = new Set<string>();

    for (const rel of allRels) {
      // Resolve fromId → diagram node (direct or via parent lifting)
      const fromNode = nodeIds.has(rel.fromId) ? rel.fromId : childToParent.get(rel.fromId);
      // Resolve toId → diagram node (direct or via parent lifting)
      const toNode = nodeIds.has(rel.toId) ? rel.toId : childToParent.get(rel.toId);

      if (!fromNode || !toNode) continue;
      if (fromNode === toNode) continue; // skip self-edges (methods within same class)

      const edgeKey = `${fromNode}-${rel.type}-${toNode}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);

      edges.push({
        fromId: fromNode,
        toId: toNode,
        type: rel.type,
        label: rel.type,
        style: this.edgeStyleForType(rel.type),
      });

      if (edges.length >= MAX_DIAGRAM_EDGES) break;
    }

    return edges;
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Data Flow Enrichment
  // ---------------------------------------------------------------------------

  private async enrichWithDataFlow(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    nodeIds: Set<string>,
    dataFlowLevel: number,
  ): Promise<void> {
    const entityIds = [...nodeIds].filter((id) => !id.startsWith("overflow_") && !id.startsWith("file_"));

    // Batch fetch flow context from TraceEngine
    const contextMap = await this.traceEngine.getBatchNodeContext(entityIds);

    // Enrich nodes
    for (const node of nodes) {
      const ctx = contextMap.get(node.id);
      if (!ctx) continue;
      node.inputTypes = ctx.inputTypes;
      node.outputType = ctx.outputType ?? undefined;
      node.hasTransformation = ctx.hasTransformation;
    }

    // Enrich edges with data annotations
    for (const edge of edges) {
      if (edge.type !== "calls") continue;
      const toCtx = contextMap.get(edge.toId);
      if (!toCtx) continue;

      const annotation: DataAnnotation = {
        inputTypes: toCtx.inputTypes,
        outputType: toCtx.outputType ?? undefined,
        hasConditionalLogic: toCtx.hasConditionalLogic,
      };

      if (dataFlowLevel >= 1) {
        // L1: basic types on edges
        if (toCtx.inputTypes.length > 0 && toCtx.outputType) {
          annotation.transformation = toCtx.hasTransformation ? "transform" : "passthrough";
        }
        if (toCtx.conditionalHint) annotation.conditionalHint = toCtx.conditionalHint;
      }

      if (dataFlowLevel >= 2) {
        // L2: all params + transformation marker
        if (toCtx.hasConditionalLogic) {
          edge.style = "dashed"; // conditional edges get dashed style
        }
      }

      edge.dataAnnotation = annotation;
    }

    // L3: Field-level mapping via source code regex analysis
    if (dataFlowLevel >= 3) {
      await this.enrichFieldMappings(nodes, edges);
    }
  }

  private async enrichFieldMappings(nodes: DiagramNode[], edges: DiagramEdge[]): Promise<void> {
    // Only analyze nodes with transformations
    const transformNodeIds = nodes.filter((n) => n.hasTransformation).map((n) => n.id);
    if (transformNodeIds.length === 0) return;

    const entities = await this.storage.getEntitiesBatch(transformNodeIds);
    const entityList = [...entities.values()];
    const fieldMappings = await analyzeFieldMappings(entityList);

    // Apply field mappings to nodes and edge annotations
    for (const node of nodes) {
      const mappings = fieldMappings.get(node.id);
      if (mappings) {
        node.fieldMappings = mappings;
      }
    }

    for (const edge of edges) {
      if (!edge.dataAnnotation) continue;
      const mappings = fieldMappings.get(edge.toId);
      if (mappings && mappings.length > 0) {
        edge.dataAnnotation.sourceFields = mappings
          .filter((m) => m.sourceField)
          .map((m) => `${m.sourceParam}.${m.sourceField}`)
          .slice(0, 5);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveEntryPoint(entryPoint: string): Promise<Entity | null> {
    // Try as entity ID first
    const direct = await this.storage.getEntity(entryPoint);
    if (direct) return direct;

    // Try as file path
    const byFile = await this.storage.findEntities({
      filters: { filePath: entryPoint },
      limit: 1,
    });
    if (byFile.length > 0) return byFile[0] ?? null;

    // Try as entity name
    const byName = await this.storage.findEntities({
      filters: { name: entryPoint },
      limit: 1,
    });
    if (byName.length > 0) return byName[0] ?? null;

    log.w("diagram", "resolve_entry_point_failed", { entryPoint });
    return null;
  }

  private entityToNode(entity: Entity, parentId?: string | undefined): DiagramNode {
    type Param = NonNullable<Entity["metadata"]["parameters"]>[number];
    const params = entity.metadata.parameters || [];
    return {
      id: entity.id,
      label: entity.name,
      type: entity.type,
      filePath: entity.filePath,
      parentId,
      inputTypes: params.map((p: Param) => p.type || "any"),
      outputType: entity.metadata.returnType ?? undefined,
      hasTransformation: false,
      fieldMappings: [],
      modifiers: (entity.metadata.modifiers as string[]) || [],
      complexityScore: entity.complexity,
    };
  }

  private createFileNode(filePath: string): DiagramNode {
    return {
      id: `file_${filePath.replace(/[^a-zA-Z0-9]/g, "_")}`,
      label: this.shortPath(filePath),
      type: "package",
      filePath,
      inputTypes: [],
      hasTransformation: false,
      fieldMappings: [],
      modifiers: [],
    };
  }

  private shortPath(filePath: string): string {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts.length > 2 ? parts.slice(-2).join("/") : filePath;
  }

  private edgeStyleForType(type: string): EdgeStyle {
    switch (type) {
      case "extends":
      case "implements":
        return "dashed";
      case "imports":
        return "dotted";
      default:
        return "solid";
    }
  }

  private autoDetectDiagramType(nodes: DiagramNode[]): DiagramType {
    const classCount = nodes.filter((n) => n.type === "class" || n.type === "interface").length;
    const funcCount = nodes.filter(
      (n) => n.type === "function" || n.type === "method" || n.type === "async_function",
    ).length;

    if (classCount > funcCount && classCount >= 3) return "class";
    if (nodes.every((n) => n.type === "package")) return "component";
    return "flowchart";
  }
}
