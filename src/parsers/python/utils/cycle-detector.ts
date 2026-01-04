/**
 * Python Circular Dependency Detector
 *
 * Detects and analyzes circular dependencies in Python imports.
 */

import type { AnalysisContext } from "../types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface CycleInfo {
  path: string[];
  edges: Array<{ from: string; to: string }>;
}

export interface CycleAnalysisResult {
  cycle: string[];
  type: "import" | "inheritance" | "reference";
  severity: "warning" | "error";
  description: string;
  suggestedFix: string;
}

// =============================================================================
// CYCLE DETECTOR CLASS
// =============================================================================

export class CycleDetector {
  private dependencyCache: Map<string, Set<string>>;

  constructor(dependencyCache?: Map<string, Set<string>>) {
    this.dependencyCache = dependencyCache || new Map();
  }

  /**
   * Detect circular dependencies in the analysis context
   */
  detectCircularDependencies(context: AnalysisContext): CycleAnalysisResult[] {
    const dependencyGraph = this.buildDependencyGraph(context);
    const cycles = this.findAllCycles(dependencyGraph);

    return cycles.map((cycle) => ({
      cycle: cycle.path,
      type: this.determineCycleType(cycle, context),
      severity: this.calculateCycleSeverity(cycle),
      description: this.generateCycleDescription(cycle),
      suggestedFix: this.suggestCycleFix(cycle),
    }));
  }

  /**
   * Build a dependency graph from the analysis context
   */
  buildDependencyGraph(context: AnalysisContext): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    const currentFile = this.normalizeFilePath(context.filePath);
    if (!graph.has(currentFile)) {
      graph.set(currentFile, new Set());
    }

    for (const imp of context.imports) {
      const from = currentFile;
      const to = this.resolveImportPath(imp.targetModule, context.filePath);

      if (!to) continue;

      if (!graph.has(from)) {
        graph.set(from, new Set());
      }
      graph.get(from)?.add(to);

      if (!graph.has(to)) {
        graph.set(to, new Set());
      }
    }

    this.addCachedDependencies(graph, currentFile);

    return graph;
  }

  /**
   * Find all cycles in the dependency graph
   */
  findAllCycles(graph: Map<string, Set<string>>): CycleInfo[] {
    const cycles: CycleInfo[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        this.dfsDetectCycles(node, graph, visited, recursionStack, currentPath, cycles);
      }
    }

    return this.deduplicateCycles(cycles);
  }

  /**
   * DFS-based cycle detection
   */
  private dfsDetectCycles(
    node: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>,
    recursionStack: Set<string>,
    currentPath: string[],
    cycles: CycleInfo[],
  ): void {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = graph.get(node) || new Set();

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.dfsDetectCycles(neighbor, graph, visited, recursionStack, currentPath, cycles);
      } else if (recursionStack.has(neighbor)) {
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cyclePath = currentPath.slice(cycleStartIndex);
          cyclePath.push(neighbor);

          const edges: Array<{ from: string; to: string }> = [];
          for (let i = 0; i < cyclePath.length - 1; i++) {
            const from = cyclePath[i];
            const to = cyclePath[i + 1];
            if (from && to) {
              edges.push({ from, to });
            }
          }

          cycles.push({ path: cyclePath, edges });
        }
      }
    }

    // Backtrack
    currentPath.pop();
    recursionStack.delete(node);
  }

  /**
   * Determine the type of cycle (import, inheritance, or reference)
   */
  determineCycleType(cycle: CycleInfo, context: AnalysisContext): "import" | "inheritance" | "reference" {
    let hasImport = false;
    let hasInheritance = false;

    for (const edge of cycle.edges) {
      if (context.imports.some((imp) => this.resolveImportPath(imp.targetModule, context.filePath) === edge.to)) {
        hasImport = true;
      }

      for (const [_className, classInfo] of context.classes.entries()) {
        if (classInfo.baseClasses?.some((base) => this.resolveClassPath(base, edge.from) === edge.to)) {
          hasInheritance = true;
        }
      }

      if (
        context.relationships.some(
          (rel) => rel.type === "references" && rel.sourceFile === edge.from && rel.targetFile === edge.to,
        )
      ) {
        hasImport = hasImport || false;
      }
    }

    if (hasInheritance) return "inheritance";
    if (hasImport) return "import";
    return "reference";
  }

  /**
   * Calculate the severity of a cycle
   */
  calculateCycleSeverity(cycle: CycleInfo): "warning" | "error" {
    const cycleLength = cycle.path.length - 1;
    if (cycleLength <= 3) {
      return "error";
    }

    const hasCoreModule = cycle.path.some(
      (path) => path.includes("/core/") || path.includes("/base/") || path.includes("__init__"),
    );

    if (hasCoreModule) {
      return "error";
    }
    return "warning";
  }

  /**
   * Generate a human-readable description of the cycle
   */
  generateCycleDescription(cycle: CycleInfo): string {
    const cycleLength = cycle.path.length - 1;
    const fileNames = cycle.path.slice(0, -1).map((p) => this.getFileName(p));

    if (cycleLength === 2) {
      return `Mutual dependency between ${fileNames[0]} and ${fileNames[1]}`;
    } else if (cycleLength === 3) {
      return `Triangular dependency: ${fileNames.join(" → ")} → ${fileNames[0]}`;
    } else {
      return `Circular dependency chain of ${cycleLength} files: ${fileNames.slice(0, 3).join(" → ")}...`;
    }
  }

  /**
   * Suggest a fix for the cycle
   */
  suggestCycleFix(cycle: CycleInfo): string {
    const suggestions: string[] = [];
    const cycleLength = cycle.path.length - 1;

    if (cycleLength === 2) {
      suggestions.push("Consider extracting shared code to a separate module");
      suggestions.push("Use dependency injection or interfaces to break the direct dependency");
    } else {
      const weakLink = this.findWeakLink(cycle);
      if (weakLink) {
        suggestions.push(`Consider refactoring ${this.getFileName(weakLink)} to remove its dependencies`);
      }

      suggestions.push("Apply the Dependency Inversion Principle");
      suggestions.push("Consider using event-driven architecture or mediator pattern");
    }

    return suggestions.join("; ");
  }

  /**
   * Normalize a file path for comparison
   */
  normalizeFilePath(path: string): string {
    return path.replace(/\.py$/, "").replace(/\\/g, "/");
  }

  /**
   * Resolve an import path to a normalized file path
   */
  resolveImportPath(importModule: string, fromFile: string): string | undefined {
    if (!importModule) return undefined;

    const toPosix = (p: string) => p.replace(/\\/g, "/");
    const norm = (p: string) =>
      toPosix(p)
        .replace(/\/+/g, "/")
        .replace(/^\/+|\/+$/g, "");

    const fromModuleId = this.normalizeFilePath(fromFile);
    const fromDir = fromModuleId.includes("/") ? fromModuleId.slice(0, fromModuleId.lastIndexOf("/")) : "";

    const rel = /^\.+/.exec(importModule);
    if (rel) {
      const dots = rel[0].length;

      let base = fromDir;
      for (let i = 1; i < dots; i++) {
        base = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
      }

      const remainder = importModule.slice(dots).replace(/\./g, "/");
      let combined = remainder ? [base, remainder].filter(Boolean).join("/") : base;

      if (!combined) {
        combined = fromModuleId.split("/")[0] || "";
      }

      return norm(combined);
    }

    return norm(importModule.replace(/\./g, "/"));
  }

  /**
   * Resolve a class path
   */
  resolveClassPath(className: string, fromFile: string): string {
    const name = (className || "").trim();
    if (name.includes(".")) {
      const parts = name.split(".");
      parts.pop();
      const modulePart = parts.join(".");
      if (modulePart) {
        return modulePart.replace(/\./g, "/");
      }
    }
    return this.normalizeFilePath(fromFile);
  }

  /**
   * Get the file name from a path
   */
  getFileName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  }

  /**
   * Deduplicate cycles by their node sets
   */
  private deduplicateCycles(cycles: CycleInfo[]): CycleInfo[] {
    const uniqueCycles = new Map<string, CycleInfo>();

    for (const cycle of cycles) {
      const nodes = cycle.path.slice(0, -1).sort();
      const key = nodes.join("|");

      if (!uniqueCycles.has(key)) {
        uniqueCycles.set(key, cycle);
      }
    }

    return Array.from(uniqueCycles.values());
  }

  /**
   * Find the weakest link in a cycle (node with fewest edges)
   */
  private findWeakLink(cycle: CycleInfo): string | undefined {
    const edgeCount = new Map<string, number>();

    for (const edge of cycle.edges) {
      edgeCount.set(edge.from, (edgeCount.get(edge.from) || 0) + 1);
    }

    let minEdges = Infinity;
    let weakLink: string | undefined;

    for (const [node, count] of edgeCount.entries()) {
      if (count < minEdges) {
        minEdges = count;
        weakLink = node;
      }
    }

    return weakLink;
  }

  /**
   * Add cached dependencies to the graph
   */
  private addCachedDependencies(graph: Map<string, Set<string>>, currentFile: string): void {
    for (const [node, targets] of this.dependencyCache.entries()) {
      if (!graph.has(node)) {
        graph.set(node, new Set());
      }
      const bucket = graph.get(node)!;
      for (const t of targets) bucket.add(t);
    }

    const currentEdges = graph.get(currentFile) || new Set<string>();
    this.dependencyCache.set(currentFile, new Set(currentEdges));
  }

  /**
   * Update the dependency cache
   */
  updateCache(filePath: string, dependencies: Set<string>): void {
    this.dependencyCache.set(this.normalizeFilePath(filePath), dependencies);
  }

  /**
   * Get the dependency cache
   */
  getCache(): Map<string, Set<string>> {
    return this.dependencyCache;
  }
}
