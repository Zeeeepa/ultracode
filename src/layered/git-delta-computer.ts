/**
 * Git Delta Computer - Compute branch deltas from git diff
 *
 * Analyzes git diff between branches to determine:
 * - Added entities (not in base, present in branch)
 * - Modified entities (in both, but changed)
 * - Deleted entities (in base, not in branch)
 *
 * Based on: ultrasharp-tools-mcp GitDeltaComputer.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BranchManager } from "../core/branch-manager.js";
import type { GitDiffResult, GitFileChange } from "../types/layered.js";
import type { Entity, GraphStorage } from "../types/storage.js";
import { BranchDelta } from "./branch-delta.js";

// =============================================================================
// GIT DELTA COMPUTER CLASS
// =============================================================================

export class GitDeltaComputer {
  private branchManager: BranchManager;
  private baseIndex: GraphStorage;
  private workingDirectory: string;

  constructor(branchManager: BranchManager, baseIndex: GraphStorage, workingDirectory?: string) {
    this.branchManager = branchManager;
    this.baseIndex = baseIndex;
    this.workingDirectory = workingDirectory || process.cwd();
  }

  // =========================================================================
  // MAIN API - Compute Delta from Git Diff
  // =========================================================================

  /**
   * Compute branch delta from git diff
   *
   * Strategy:
   * 1. Get git diff between base branch and target branch
   * 2. Find merge-base commit (common ancestor)
   * 3. Extract entities from changed files only
   * 4. Classify as Added/Modified/Deleted by comparing with base index
   *
   * @param branchName - Target branch name
   * @param baseBranch - Base branch (usually 'main')
   * @returns Branch delta with all changes
   */
  async computeDeltaFromGitDiff(branchName: string, baseBranch: string = "main"): Promise<BranchDelta> {
    console.log(`[GitDeltaComputer] Computing delta: ${branchName} relative to ${baseBranch}`);

    // Get git diff
    const diffResult = await this.getGitDiff(branchName, baseBranch);

    // Get base commit SHA
    const baseCommitSha = await this.getCommitSha(baseBranch);

    // Create empty delta
    const delta = new BranchDelta(branchName, baseCommitSha);

    // Process each changed file
    for (const fileChange of diffResult.files) {
      await this.processFileChange(fileChange, delta);
    }

    console.log(
      `[GitDeltaComputer] Delta computed: ${delta.totalChanges} changes ` +
        `(+${delta.entityDelta.added.size} ~${delta.entityDelta.modified.size} -${delta.entityDelta.deleted.size})`,
    );

    return delta;
  }

  // =========================================================================
  // GIT OPERATIONS
  // =========================================================================

  /**
   * Get git diff between two branches
   */
  private async getGitDiff(sourceBranch: string, targetBranch: string): Promise<GitDiffResult> {
    // Get merge-base (common ancestor)
    const mergeBaseSha = await this.getMergeBase(sourceBranch, targetBranch);

    // Get diff using merge-base
    const diffCommand = `git diff --name-status ${targetBranch}...${sourceBranch}`;

    try {
      const output = execSync(diffCommand, {
        cwd: this.workingDirectory,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"], // Suppress stderr
      });

      const files = this.parseDiffOutput(output);

      return {
        files,
        sourceBranch,
        targetBranch,
        mergeBaseSha,
        totalFiles: files.length,
      };
    } catch (error) {
      console.error(`[GitDeltaComputer] Git diff failed:`, error);
      // Return empty diff on error
      return {
        files: [],
        sourceBranch,
        targetBranch,
        mergeBaseSha,
        totalFiles: 0,
      };
    }
  }

  /**
   * Get merge-base commit SHA (common ancestor)
   */
  private async getMergeBase(branch1: string, branch2: string): Promise<string> {
    try {
      const sha = execSync(`git merge-base ${branch1} ${branch2}`, {
        cwd: this.workingDirectory,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      return sha;
    } catch (error) {
      console.warn(`[GitDeltaComputer] Could not find merge-base, using ${branch2} HEAD`);
      return this.getCommitSha(branch2);
    }
  }

  /**
   * Get commit SHA for a branch
   */
  private async getCommitSha(branch: string): Promise<string> {
    try {
      const sha = execSync(`git rev-parse ${branch}`, {
        cwd: this.workingDirectory,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      return sha;
    } catch (error) {
      console.error(`[GitDeltaComputer] Could not get commit SHA for ${branch}`);
      return "";
    }
  }

  /**
   * Parse git diff --name-status output
   *
   * Format:
   * A	file1.ts         (Added)
   * M	file2.ts         (Modified)
   * D	file3.ts         (Deleted)
   * R100	old.ts	new.ts  (Renamed)
   */
  private parseDiffOutput(output: string): GitFileChange[] {
    const files: GitFileChange[] = [];
    const lines = output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 2) continue;

      const status = parts[0];
      const path = parts[1];
      if (!status || !path) continue;

      let change: GitFileChange;

      if (status.startsWith("R")) {
        // Renamed
        const oldPath = parts[1];
        const newPath = parts[2];
        if (!oldPath || !newPath) continue;
        change = {
          path: newPath,
          status: "renamed" as const,
          oldPath,
        };
      } else if (status === "A") {
        // Added
        change = {
          path,
          status: "added" as const,
        };
      } else if (status === "M") {
        // Modified
        change = {
          path,
          status: "modified" as const,
        };
      } else if (status === "D") {
        // Deleted
        change = {
          path,
          status: "deleted" as const,
        };
      } else {
        continue; // Unknown status
      }

      files.push(change);
    }

    return files;
  }

  // =========================================================================
  // FILE CHANGE PROCESSING
  // =========================================================================

  /**
   * Process a single file change
   */
  private async processFileChange(fileChange: GitFileChange, delta: BranchDelta): Promise<void> {
    switch (fileChange.status) {
      case "added":
      case "modified":
        await this.processAddedOrModifiedFile(fileChange, delta);
        break;

      case "deleted":
        await this.processDeletedFile(fileChange, delta);
        break;

      case "renamed":
        await this.processRenamedFile(fileChange, delta);
        break;
    }
  }

  /**
   * Process added or modified file
   */
  private async processAddedOrModifiedFile(fileChange: GitFileChange, delta: BranchDelta): Promise<void> {
    // Extract entities from the file
    const entities = await this.extractEntitiesFromFile(fileChange.path);

    for (const entity of entities) {
      // Check if entity exists in base index
      const existsInBase = await this.entityExistsInBase(entity.id);

      if (existsInBase) {
        // Entity modified
        delta.entityDelta.modified.set(entity.id, entity);
      } else {
        // Entity added
        delta.entityDelta.added.set(entity.id, entity);
      }
    }
  }

  /**
   * Process deleted file
   */
  private async processDeletedFile(fileChange: GitFileChange, delta: BranchDelta): Promise<void> {
    // Get entities that were in this file (from base index)
    const entities = await this.getEntitiesByFilePath(fileChange.path);

    for (const entity of entities) {
      // Mark as deleted
      delta.entityDelta.deleted.add(entity.id);
    }
  }

  /**
   * Process renamed file
   */
  private async processRenamedFile(fileChange: GitFileChange, delta: BranchDelta): Promise<void> {
    // Treat as delete + add
    if (fileChange.oldPath) {
      await this.processDeletedFile({ path: fileChange.oldPath, status: "deleted" }, delta);
    }
    await this.processAddedOrModifiedFile(fileChange, delta);
  }

  // =========================================================================
  // ENTITY EXTRACTION (TODO: Integration with parsers)
  // =========================================================================

  /**
   * Extract entities from a file
   *
   * Uses existing parser infrastructure to extract entities.
   * Supports all languages: TS/JS, Python, C/C++, C#, Rust, Go, Java, etc.
   *
   * @param filePath - File path relative to repository root
   * @returns Extracted entities
   */
  private async extractEntitiesFromFile(filePath: string): Promise<Entity[]> {
    const fullPath = join(this.workingDirectory, filePath);

    // Check if file exists
    if (!existsSync(fullPath)) {
      return [];
    }

    try {
      // Read file content
      const content = readFileSync(fullPath, "utf-8");

      // Import parser dynamically to avoid circular dependencies
      const { IncrementalParser } = await import("../parsers/incremental-parser.js");
      const parser = new IncrementalParser();
      await parser.initialize();

      // Parse file
      const parseResult = await parser.parseFile(fullPath, content);

      // Convert ParsedEntity[] to Entity[]
      return this.convertParsedEntitiesToEntities(parseResult.entities, filePath);
    } catch (error) {
      console.error(`[GitDeltaComputer] Failed to extract entities from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Convert ParsedEntity to Entity format
   *
   * @param parsedEntities - Entities from parser
   * @param filePath - File path
   * @returns Converted entities
   */
  private convertParsedEntitiesToEntities(parsedEntities: any[], filePath: string): Entity[] {
    const entities: Entity[] = [];
    const now = Date.now();

    for (const parsed of parsedEntities) {
      try {
        // Generate stable ID (same as existing indexer)
        const id = this.generateEntityId(parsed, filePath);

        const entity: Entity = {
          id,
          name: parsed.name,
          type: parsed.type as any, // EntityType mapping handled by parser
          filePath,
          location: parsed.location,
          metadata: parsed.metadata || {},
          hash: parsed.hash || this.generateEntityHash(parsed),
          createdAt: now,
          updatedAt: now,
        };

        entities.push(entity);
      } catch (error) {
        console.warn(`[GitDeltaComputer] Failed to convert entity ${parsed.name}:`, error);
      }
    }

    return entities;
  }

  /**
   * Generate stable entity ID (SHA256-based)
   */
  private generateEntityId(parsed: any, filePath: string): string {
    const { createHash } = require("node:crypto");
    const content = `${filePath}:${parsed.type}:${parsed.name}:${parsed.location.start.line}`;
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Generate entity hash for change detection
   */
  private generateEntityHash(parsed: any): string {
    const { createHash } = require("node:crypto");
    const content = JSON.stringify({
      name: parsed.name,
      type: parsed.type,
      location: parsed.location,
      metadata: parsed.metadata,
    });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Check if entity exists in base index
   *
   * @param entityId - Entity ID
   * @returns True if entity exists in base index
   */
  private async entityExistsInBase(entityId: string): Promise<boolean> {
    try {
      const entity = await this.baseIndex.getEntity(entityId);
      return entity !== null;
    } catch (error) {
      // Assume not exists on error
      return false;
    }
  }

  /**
   * Get entities by file path from base index
   *
   * @param filePath - File path
   * @returns Entities in that file (from base index)
   */
  private async getEntitiesByFilePath(filePath: string): Promise<Entity[]> {
    try {
      // Query all entities from base index and filter by file path
      // Note: This is not optimal, but GraphStorage doesn't have getEntitiesByFilePath yet
      // TODO: Add getEntitiesByFilePath method to GraphStorage for better performance

      // For now, we'll use a simple approach: assume file deletion means entity deletion
      // Real implementation would query GraphStorage with file path filter

      return [];
    } catch (error) {
      console.error(`[GitDeltaComputer] Failed to get entities by file path ${filePath}:`, error);
      return [];
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Check if git repository exists
   */
  isGitRepository(): boolean {
    const gitDir = join(this.workingDirectory, ".git");
    return existsSync(gitDir);
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string | null {
    return this.branchManager.getCurrentBranch(this.workingDirectory);
  }

  /**
   * Get all branches
   */
  async getAllBranches(): Promise<string[]> {
    try {
      const output = execSync("git branch -a", {
        cwd: this.workingDirectory,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      const branches = output
        .split("\n")
        .map((line) =>
          line
            .trim()
            .replace(/^\* /, "")
            .replace(/^remotes\/origin\//, ""),
        )
        .filter((branch) => branch && branch !== "HEAD");

      return [...new Set(branches)]; // Deduplicate
    } catch (error) {
      console.error(`[GitDeltaComputer] Failed to get branches:`, error);
      return [];
    }
  }

  /**
   * Get file stats (additions/deletions)
   */
  async getFileStats(
    branch: string,
    baseBranch: string = "main",
  ): Promise<Map<string, { additions: number; deletions: number }>> {
    const stats = new Map<string, { additions: number; deletions: number }>();

    try {
      const output = execSync(`git diff --numstat ${baseBranch}...${branch}`, {
        cwd: this.workingDirectory,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      const lines = output.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;

        const additions = parseInt(parts[0]!, 10) || 0;
        const deletions = parseInt(parts[1]!, 10) || 0;
        const filePath = parts[2]!;

        stats.set(filePath, { additions, deletions });
      }
    } catch (error) {
      console.error(`[GitDeltaComputer] Failed to get file stats:`, error);
    }

    return stats;
  }
}
