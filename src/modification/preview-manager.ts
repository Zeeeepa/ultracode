/**
 * Preview Manager - Universal Preview for Destructive Operations
 *
 * Provides preview functionality for all code modifications:
 * - Code entity modifications
 * - File operations (copy, rename, split, synthesize)
 * - Batch operations
 *
 * Features:
 * - SIMD-accelerated diff (via WASM)
 * - Impact estimation (entities, embeddings, relationships)
 * - Unified diff format output
 *
 * Architecture References:
 * - WASM Diff: external-tools/wasm/diff-simd
 * - Graph Storage: src/storage/graph-storage.ts
 */

import { readFile } from "node:fs/promises";
import type { VectorStore } from "../semantic/vector-store.js";
import type { Entity, GraphStorage } from "../types/storage.js";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface DiffPreview {
  operation: string;
  filesAffected: string[];
  changes: FileDiff[];
  stats: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  estimatedImpact: {
    entitiesAffected: number;
    embeddingsToUpdate: number;
    relationshipsAffected: number;
  };
}

export interface FileDiff {
  path: string;
  before: string;
  after: string;
  diff: string; // unified diff format
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// =============================================================================
// PREVIEW MANAGER IMPLEMENTATION
// =============================================================================

export class PreviewManager {
  private wasmDiffAvailable: boolean = false;

  constructor(
    private graphStorage: GraphStorage,
    _vectorStore: VectorStore | null = null, // Reserved for future use
  ) {}

  /**
   * Initialize Preview Manager (load WASM modules)
   */
  async initialize(): Promise<void> {
    try {
      // Try to load WASM diff module (built separately, may not exist during typecheck)
      const { compute_diff_simd } = await import("../../dist/external-tools/wasm/diff-simd/diff_simd.js");
      // Verify function is actually callable
      if (typeof compute_diff_simd === "function") {
        this.wasmDiffAvailable = true;
        console.log("[PreviewManager] WASM diff-simd loaded successfully");
      }
    } catch (error) {
      console.warn("[PreviewManager] WASM diff-simd not available, using fallback");
      this.wasmDiffAvailable = false;
    }
  }

  /**
   * Preview code modification (entity replacement)
   */
  async previewCodeModification(entityId: string, newCode: string): Promise<DiffPreview> {
    const entity = await this.graphStorage.getEntity(entityId);

    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Read current file content
    const currentContent = await readFile(entity.filePath, "utf-8");
    const lines = currentContent.split("\n");

    // Extract current entity code
    const oldCode = lines.slice(entity.location.start.line - 1, entity.location.end.line).join("\n");

    // Generate diff
    const diff = await this.computeDiff(oldCode, newCode);

    // Estimate impact
    const impact = await this.estimateImpact(entity, newCode);

    return {
      operation: "code-modification",
      filesAffected: [entity.filePath],
      changes: [
        {
          path: entity.filePath,
          before: oldCode,
          after: newCode,
          diff,
          hunks: this.parseDiffHunks(diff),
        },
      ],
      stats: {
        additions: this.countAdditions(diff),
        deletions: this.countDeletions(diff),
        modifications: 1,
      },
      estimatedImpact: impact,
    };
  }

  /**
   * Preview file operation
   */
  async previewFileOperation(operation: "copy" | "rename" | "split" | "synthesize", params: any): Promise<DiffPreview> {
    switch (operation) {
      case "copy":
        return this.previewCopy(params.source, params.target);
      case "rename":
        return this.previewRename(params.oldPath, params.newPath);
      case "split":
        return this.previewSplit(params.filePath, params.entityIds);
      case "synthesize":
        return this.previewSynthesize(params.files, params.targetPath);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // =============================================================================
  // PRIVATE: DIFF COMPUTATION
  // =============================================================================

  /**
   * Compute diff using WASM SIMD or fallback
   */
  private async computeDiff(oldCode: string, newCode: string): Promise<string> {
    if (this.wasmDiffAvailable) {
      try {
        const { compute_diff_simd } = await import("../../dist/external-tools/wasm/diff-simd/diff_simd.js");
        return compute_diff_simd(oldCode, newCode);
      } catch (error) {
        console.warn("[PreviewManager] WASM diff failed, using fallback:", error);
      }
    }

    // Fallback to JavaScript implementation
    return this.computeDiffFallback(oldCode, newCode);
  }

  /**
   * JavaScript fallback diff (simple line-by-line)
   */
  private computeDiffFallback(oldCode: string, newCode: string): string {
    const oldLines = oldCode.split("\n");
    const newLines = newCode.split("\n");

    let diff = "--- old\n+++ new\n";
    const oldStart = 1;
    const newStart = 1;
    let oldCount = 0;
    let newCount = 0;
    const hunkLines: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        // Insertion
        hunkLines.push(`+${newLine}`);
        newCount++;
      } else if (newLine === undefined) {
        // Deletion
        hunkLines.push(`-${oldLine}`);
        oldCount++;
      } else if (oldLine !== newLine) {
        // Modification
        hunkLines.push(`-${oldLine}`);
        hunkLines.push(`+${newLine}`);
        oldCount++;
        newCount++;
      } else {
        // Equal
        hunkLines.push(` ${oldLine}`);
        oldCount++;
        newCount++;
      }
    }

    // Generate hunk header
    diff += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;
    diff += hunkLines.join("\n") + "\n";

    return diff;
  }

  /**
   * Parse unified diff into hunks
   */
  private parseDiffHunks(diff: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diff.split("\n");

    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        // New hunk
        const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
        if (match) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }

          currentHunk = {
            oldStart: parseInt(match[1] ?? "0"),
            oldLines: parseInt(match[2] ?? "0"),
            newStart: parseInt(match[3] ?? "0"),
            newLines: parseInt(match[4] ?? "0"),
            lines: [],
          };
        }
      } else if (currentHunk) {
        currentHunk.lines.push(line);
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Count additions in diff
   */
  private countAdditions(diff: string): number {
    return diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  }

  /**
   * Count deletions in diff
   */
  private countDeletions(diff: string): number {
    return diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  }

  // =============================================================================
  // PRIVATE: IMPACT ESTIMATION
  // =============================================================================

  /**
   * Estimate impact of code modification
   */
  private async estimateImpact(entity: Entity, newCode: string): Promise<DiffPreview["estimatedImpact"]> {
    // Check if signature changed (affects relationships)
    const signatureChanged = await this.detectSignatureChange(entity, newCode);

    // Count relationships
    const relationships = await this.graphStorage.getRelationshipsForEntity(entity.id);

    return {
      entitiesAffected: 1,
      embeddingsToUpdate: 1,
      relationshipsAffected: signatureChanged ? relationships.length : 0,
    };
  }

  /**
   * Detect if entity signature changed
   */
  private async detectSignatureChange(entity: Entity, newCode: string): Promise<boolean> {
    try {
      // Parse new code and extract signature
      const { IncrementalParser } = await import("../parsers/incremental-parser.js");
      const parser = new IncrementalParser();
      await parser.initialize();

      // Create temporary file for parsing
      const tempContent = `${entity.type} ${entity.name} ${newCode}`;
      const parseResult = await parser.parseFile(entity.filePath, tempContent);

      if (parseResult.entities.length === 0) {
        return false;
      }

      const newEntity = parseResult.entities[0];

      // Compare signatures
      const oldSignature = entity.metadata.signature || "";
      const newSignature = newEntity?.signature || "";

      return oldSignature !== newSignature;
    } catch (error) {
      console.warn("[PreviewManager] Failed to detect signature change:", error);
      return false;
    }
  }

  // =============================================================================
  // PRIVATE: FILE OPERATION PREVIEWS
  // =============================================================================

  /**
   * Preview file copy
   */
  private async previewCopy(source: string, target: string): Promise<DiffPreview> {
    const content = await readFile(source, "utf-8");

    return {
      operation: "copy",
      filesAffected: [source, target],
      changes: [
        {
          path: target,
          before: "",
          after: content,
          diff: `+++ ${target}\n${content
            .split("\n")
            .map((line) => `+${line}`)
            .join("\n")}`,
          hunks: [],
        },
      ],
      stats: {
        additions: 1,
        deletions: 0,
        modifications: 0,
      },
      estimatedImpact: {
        entitiesAffected: 0,
        embeddingsToUpdate: 1,
        relationshipsAffected: 0,
      },
    };
  }

  /**
   * Preview file rename
   */
  private async previewRename(oldPath: string, newPath: string): Promise<DiffPreview> {
    return {
      operation: "rename",
      filesAffected: [oldPath, newPath],
      changes: [
        {
          path: oldPath,
          before: oldPath,
          after: newPath,
          diff: `--- ${oldPath}\n+++ ${newPath}\n`,
          hunks: [],
        },
      ],
      stats: {
        additions: 0,
        deletions: 0,
        modifications: 1,
      },
      estimatedImpact: {
        entitiesAffected: 0,
        embeddingsToUpdate: 0,
        relationshipsAffected: 0,
      },
    };
  }

  /**
   * Preview file split
   */
  private async previewSplit(filePath: string, entityIds: string[]): Promise<DiffPreview> {
    const entities = await Promise.all(entityIds.map((id) => this.graphStorage.getEntity(id)));

    const validEntities = entities.filter((e) => e !== null) as Entity[];

    return {
      operation: "split",
      filesAffected: [filePath, ...validEntities.map((e) => `${e.name}.ts`)],
      changes: [],
      stats: {
        additions: validEntities.length,
        deletions: 0,
        modifications: 1,
      },
      estimatedImpact: {
        entitiesAffected: validEntities.length,
        embeddingsToUpdate: validEntities.length,
        relationshipsAffected: 0,
      },
    };
  }

  /**
   * Preview file synthesize
   */
  private async previewSynthesize(files: string[], targetPath: string): Promise<DiffPreview> {
    return {
      operation: "synthesize",
      filesAffected: [...files, targetPath],
      changes: [],
      stats: {
        additions: 1,
        deletions: files.length,
        modifications: 0,
      },
      estimatedImpact: {
        entitiesAffected: files.length,
        embeddingsToUpdate: 1,
        relationshipsAffected: 0,
      },
    };
  }
}
