/**
 * File Merkle Tree - Merkle Tree for File System
 *
 * Provides fast change detection for file system.
 * Used for:
 * - Quick startup: verify root hash instead of full scan
 * - Incremental sync: find changed files in O(log n)
 * - Branch diff: compare file trees between branches
 *
 * Structure:
 * - Leaf nodes: file content hash
 * - Internal nodes: hash of sorted child hashes
 * - Root: single hash representing entire project state
 */

import { dirname, relative } from "node:path";
import { log } from "../logging/index.js";
import type { Client } from "../storage/libsql/types.js";
import type { FileChange, FileDiff, FileMerkleNode, MerkleFileInfo } from "../storage/prolly/types.js";
import { hashText64, initHasher } from "../utils/fast-hash.js";

// =============================================================================
// FILE MERKLE TREE
// =============================================================================

export class FileMerkleTree {
  private client: Client | null = null;
  private projectHash: string = "";
  private branchName: string = "";
  private rootPath: string = "";
  private isInitialized = false;

  /**
   * Initialize the file merkle tree
   */
  async initialize(client: Client): Promise<void> {
    this.client = client;
    await initHasher();
    await this.createTable();
    this.isInitialized = true;
    log.i("FILE_MERKLE", "initialized");
  }

  /**
   * Create the file_merkle table
   */
  private async createTable(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS file_merkle (
          id TEXT PRIMARY KEY,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          path TEXT NOT NULL,
          hash TEXT NOT NULL,
          parent_path TEXT,
          is_leaf INTEGER NOT NULL,
          children_count INTEGER DEFAULT 0,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_hash, branch_name, path)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_file_merkle_project ON file_merkle(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_file_merkle_parent ON file_merkle(project_hash, branch_name, parent_path)`,
        `CREATE INDEX IF NOT EXISTS idx_file_merkle_hash ON file_merkle(hash)`,
      ],
      "write",
    );
  }

  /**
   * Set context for operations
   */
  setContext(projectHash: string, branchName: string, rootPath: string): void {
    this.projectHash = projectHash;
    this.branchName = branchName;
    this.rootPath = rootPath.replace(/\\/g, "/");
  }

  // ===========================================================================
  // BUILD OPERATIONS
  // ===========================================================================

  /**
   * Build Merkle tree from list of files.
   * Returns the root hash.
   */
  async build(files: MerkleFileInfo[]): Promise<string> {
    if (!this.client) throw new Error("Client not initialized");

    const start = Date.now();

    // Clear existing tree for this project/branch
    await this.clear();

    if (files.length === 0) {
      // Empty project - create empty root
      const emptyHash = hashText64("");
      await this.insertNode(".", emptyHash, null, false, 0);
      return emptyHash;
    }

    // Build directory structure
    const dirChildren = new Map<string, Set<string>>(); // dir -> set of child paths
    const fileHashes = new Map<string, string>(); // path -> hash

    // Normalize paths and collect files
    for (const file of files) {
      const normalizedPath = this.normalizePath(file.path);
      fileHashes.set(normalizedPath, file.hash);

      // Build directory hierarchy
      let current = dirname(normalizedPath);
      let child = normalizedPath;

      while (current !== "." && current !== child) {
        let set = dirChildren.get(current);
        if (!set) {
          set = new Set();
          dirChildren.set(current, set);
        }
        set.add(child);

        child = current;
        current = dirname(current);
      }

      // Add to root
      if (child !== ".") {
        let rootSet = dirChildren.get(".");
        if (!rootSet) {
          rootSet = new Set();
          dirChildren.set(".", rootSet);
        }
        rootSet.add(child);
      }
    }

    // Insert file nodes (leaves)
    const nodesToInsert: Array<{
      path: string;
      hash: string;
      parentPath: string | null;
      isLeaf: boolean;
      childrenCount: number;
    }> = [];

    for (const [path, hash] of fileHashes) {
      const parentPath = dirname(path);
      nodesToInsert.push({
        path,
        hash,
        parentPath: parentPath === "." ? null : parentPath,
        isLeaf: true,
        childrenCount: 0,
      });
    }

    // Compute directory hashes bottom-up
    const dirHashes = new Map<string, string>();
    const processedDirs = new Set<string>();

    // Process directories from deepest to root
    const allDirs = Array.from(dirChildren.keys());
    const sortedDirs = allDirs.sort((a, b) => b.split("/").length - a.split("/").length);

    for (const dir of sortedDirs) {
      const children = dirChildren.get(dir);
      if (!children) continue;

      // Collect child hashes
      const childHashes: string[] = [];
      for (const child of children) {
        const childHash = fileHashes.get(child) || dirHashes.get(child);
        if (childHash) {
          childHashes.push(childHash);
        }
      }

      // Compute directory hash from sorted child hashes
      const sortedHashes = childHashes.sort();
      const dirHash = hashText64(sortedHashes.join("|"));
      dirHashes.set(dir, dirHash);

      const parentPath = dirname(dir);
      nodesToInsert.push({
        path: dir,
        hash: dirHash,
        parentPath: parentPath === dir || parentPath === "." ? null : parentPath,
        isLeaf: false,
        childrenCount: children.size,
      });

      processedDirs.add(dir);
    }

    // Batch insert all nodes
    await this.insertNodes(nodesToInsert);

    // Get root hash
    const rootHash = dirHashes.get(".") || fileHashes.values().next().value || "";

    log.i("FILE_MERKLE", "build_complete", {
      files: files.length,
      dirs: dirHashes.size,
      rootHash: rootHash.slice(0, 8),
      ms: Date.now() - start,
    });

    return rootHash;
  }

  /**
   * Insert a single node
   */
  private async insertNode(
    path: string,
    hash: string,
    parentPath: string | null,
    isLeaf: boolean,
    childrenCount: number,
  ): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const id = hashText64(`${this.projectHash}|${this.branchName}|${path}`);
    const now = Date.now();

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO file_merkle
            (id, project_hash, branch_name, path, hash, parent_path, is_leaf, children_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, this.projectHash, this.branchName, path, hash, parentPath, isLeaf ? 1 : 0, childrenCount, now],
    });
  }

  /**
   * Batch insert nodes
   */
  private async insertNodes(
    nodes: Array<{
      path: string;
      hash: string;
      parentPath: string | null;
      isLeaf: boolean;
      childrenCount: number;
    }>,
  ): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    if (nodes.length === 0) return;

    const now = Date.now();
    const batchSize = 500;

    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const args: (string | number | null)[] = [];

      for (const node of batch) {
        const id = hashText64(`${this.projectHash}|${this.branchName}|${node.path}`);
        args.push(
          id,
          this.projectHash,
          this.branchName,
          node.path,
          node.hash,
          node.parentPath,
          node.isLeaf ? 1 : 0,
          node.childrenCount,
          now,
        );
      }

      await this.client.execute({
        sql: `INSERT OR REPLACE INTO file_merkle
              (id, project_hash, branch_name, path, hash, parent_path, is_leaf, children_count, updated_at)
              VALUES ${values}`,
        args,
      });
    }
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Get root hash for current project/branch
   */
  async getRootHash(): Promise<string | null> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: `SELECT hash FROM file_merkle
            WHERE project_hash = ? AND branch_name = ? AND path = '.'`,
      args: [this.projectHash, this.branchName],
    });

    const row = result.rows[0];
    if (!row) return null;
    return row["hash"] as string;
  }

  /**
   * Get node by path
   */
  async getNode(path: string): Promise<FileMerkleNode | null> {
    if (!this.client) throw new Error("Client not initialized");

    const normalizedPath = this.normalizePath(path);

    const result = await this.client.execute({
      sql: `SELECT * FROM file_merkle
            WHERE project_hash = ? AND branch_name = ? AND path = ?`,
      args: [this.projectHash, this.branchName, normalizedPath],
    });

    const row = result.rows[0];
    if (!row) return null;
    return this.rowToNode(row as Record<string, unknown>);
  }

  /**
   * Get children of a directory
   */
  async getChildren(dirPath: string): Promise<FileMerkleNode[]> {
    if (!this.client) throw new Error("Client not initialized");

    const normalizedPath = this.normalizePath(dirPath);
    const parentPath = normalizedPath === "." ? null : normalizedPath;

    const result = await this.client.execute({
      sql: `SELECT * FROM file_merkle
            WHERE project_hash = ? AND branch_name = ?
            AND parent_path ${parentPath === null ? "IS NULL" : "= ?"}`,
      args: parentPath === null ? [this.projectHash, this.branchName] : [this.projectHash, this.branchName, parentPath],
    });

    return result.rows.map((row) => this.rowToNode(row));
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Update a single file's hash and propagate changes up
   */
  async updateFile(filePath: string, newHash: string): Promise<string> {
    if (!this.client) throw new Error("Client not initialized");

    const normalizedPath = this.normalizePath(filePath);

    // Update the file node
    await this.insertNode(normalizedPath, newHash, dirname(normalizedPath), true, 0);

    // Propagate hash changes up to root
    let currentDir = dirname(normalizedPath);

    while (currentDir !== "" && currentDir !== ".") {
      const newDirHash = await this.recomputeDirHash(currentDir);
      const parentDir = dirname(currentDir);
      await this.insertNode(currentDir, newDirHash, parentDir === "." ? null : parentDir, false, 0);
      currentDir = parentDir;
    }

    // Update root
    const rootHash = await this.recomputeDirHash(".");
    await this.insertNode(".", rootHash, null, false, 0);

    return rootHash;
  }

  /**
   * Delete a file and propagate changes up
   */
  async deleteFile(filePath: string): Promise<string> {
    if (!this.client) throw new Error("Client not initialized");

    const normalizedPath = this.normalizePath(filePath);

    // Delete the file node
    await this.client.execute({
      sql: `DELETE FROM file_merkle
            WHERE project_hash = ? AND branch_name = ? AND path = ?`,
      args: [this.projectHash, this.branchName, normalizedPath],
    });

    // Propagate hash changes up to root
    let currentDir = dirname(normalizedPath);

    while (currentDir !== "" && currentDir !== ".") {
      const children = await this.getChildren(currentDir);
      if (children.length === 0) {
        // Directory is now empty - delete it
        await this.client.execute({
          sql: `DELETE FROM file_merkle
                WHERE project_hash = ? AND branch_name = ? AND path = ?`,
          args: [this.projectHash, this.branchName, currentDir],
        });
      } else {
        // Recompute hash
        const newDirHash = await this.recomputeDirHash(currentDir);
        const parentDir = dirname(currentDir);
        await this.insertNode(currentDir, newDirHash, parentDir === "." ? null : parentDir, false, children.length);
      }
      currentDir = dirname(currentDir);
    }

    // Update root
    const rootHash = await this.recomputeDirHash(".");
    await this.insertNode(".", rootHash, null, false, 0);

    return rootHash;
  }

  /**
   * Recompute hash for a directory from its children
   */
  private async recomputeDirHash(dirPath: string): Promise<string> {
    const children = await this.getChildren(dirPath);
    const childHashes = children.map((c) => c.hash).sort();
    return hashText64(childHashes.join("|"));
  }

  // ===========================================================================
  // DIFF OPERATIONS
  // ===========================================================================

  /**
   * Diff current tree with a set of files from the file system.
   * Returns files that have changed.
   */
  async diffWithFS(currentFiles: MerkleFileInfo[]): Promise<FileDiff> {
    const start = Date.now();
    const changes: FileChange[] = [];

    // Build map of current files
    const currentMap = new Map<string, string>();
    for (const file of currentFiles) {
      const normalizedPath = this.normalizePath(file.path);
      currentMap.set(normalizedPath, file.hash);
    }

    // Get all stored file nodes
    const storedFiles = await this.getAllLeaves();
    const storedMap = new Map<string, string>();
    for (const node of storedFiles) {
      storedMap.set(node.path, node.hash);
    }

    // Find additions and modifications
    for (const [path, hash] of currentMap) {
      const storedHash = storedMap.get(path);

      if (!storedHash) {
        changes.push({ path, type: "add", newHash: hash });
      } else if (storedHash !== hash) {
        changes.push({ path, type: "modify", oldHash: storedHash, newHash: hash });
      }
    }

    // Find deletions
    for (const [path, hash] of storedMap) {
      if (!currentMap.has(path)) {
        changes.push({ path, type: "delete", oldHash: hash });
      }
    }

    return {
      changes,
      stats: {
        dirsCompared: 0,
        dirsSkipped: 0,
        timeMs: Date.now() - start,
      },
    };
  }

  /**
   * Diff with another branch's Merkle tree
   */
  async diffBranches(otherBranchName: string): Promise<FileDiff> {
    const start = Date.now();
    const changes: FileChange[] = [];
    const dirsCompared = 0;
    const dirsSkipped = 0;

    // Get root hashes
    const currentRoot = await this.getRootHash();

    // Temporarily switch context to get other branch's root
    const savedBranch = this.branchName;
    this.branchName = otherBranchName;
    const otherRoot = await this.getRootHash();
    this.branchName = savedBranch;

    // If roots are equal, no changes
    if (currentRoot === otherRoot) {
      return {
        changes: [],
        stats: { dirsCompared: 1, dirsSkipped: 1, timeMs: Date.now() - start },
      };
    }

    // Get all leaves from both branches and compare
    const currentLeaves = await this.getAllLeaves();

    this.branchName = otherBranchName;
    const otherLeaves = await this.getAllLeaves();
    this.branchName = savedBranch;

    const currentMap = new Map(currentLeaves.map((n) => [n.path, n.hash]));
    const otherMap = new Map(otherLeaves.map((n) => [n.path, n.hash]));

    // Find changes
    for (const [path, hash] of currentMap) {
      const otherHash = otherMap.get(path);
      if (!otherHash) {
        changes.push({ path, type: "add", newHash: hash });
      } else if (otherHash !== hash) {
        changes.push({ path, type: "modify", oldHash: otherHash, newHash: hash });
      }
    }

    for (const [path, hash] of otherMap) {
      if (!currentMap.has(path)) {
        changes.push({ path, type: "delete", oldHash: hash });
      }
    }

    return {
      changes,
      stats: {
        dirsCompared,
        dirsSkipped,
        timeMs: Date.now() - start,
      },
    };
  }

  /**
   * Get all leaf nodes (files)
   */
  private async getAllLeaves(): Promise<FileMerkleNode[]> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: `SELECT * FROM file_merkle
            WHERE project_hash = ? AND branch_name = ? AND is_leaf = 1`,
      args: [this.projectHash, this.branchName],
    });

    return result.rows.map((row) => this.rowToNode(row));
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * Verify tree integrity
   */
  async verify(): Promise<{
    valid: boolean;
    errors: string[];
    nodeCount: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const errors: string[] = [];

    // Get all nodes
    const result = await this.client.execute({
      sql: `SELECT * FROM file_merkle WHERE project_hash = ? AND branch_name = ?`,
      args: [this.projectHash, this.branchName],
    });

    const nodes = result.rows.map((row) => this.rowToNode(row));
    const nodeMap = new Map(nodes.map((n) => [n.path, n]));

    // Verify each non-leaf node's hash
    for (const node of nodes) {
      if (!node.isLeaf) {
        const children = nodes.filter((n) => n.parentPath === node.path);
        const childHashes = children.map((c) => c.hash).sort();
        const expectedHash = hashText64(childHashes.join("|"));

        if (node.hash !== expectedHash) {
          errors.push(
            `Hash mismatch at ${node.path}: expected ${expectedHash.slice(0, 8)}, got ${node.hash.slice(0, 8)}`,
          );
        }
      }
    }

    // Verify parent references
    for (const node of nodes) {
      if (node.parentPath && !nodeMap.has(node.parentPath)) {
        errors.push(`Missing parent ${node.parentPath} for ${node.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      nodeCount: nodes.length,
    };
  }

  // ===========================================================================
  // CLEAR OPERATIONS
  // ===========================================================================

  /**
   * Clear tree for current project/branch
   */
  async clear(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.execute({
      sql: `DELETE FROM file_merkle WHERE project_hash = ? AND branch_name = ?`,
      args: [this.projectHash, this.branchName],
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Normalize a file path relative to root
   */
  private normalizePath(filePath: string): string {
    // Handle absolute paths
    let normalized = filePath.replace(/\\/g, "/");

    if (this.rootPath && normalized.startsWith(this.rootPath)) {
      normalized = relative(this.rootPath, normalized).replace(/\\/g, "/");
    }

    // Remove leading ./
    if (normalized.startsWith("./")) {
      normalized = normalized.slice(2);
    }

    return normalized || ".";
  }

  private rowToNode(row: Record<string, unknown>): FileMerkleNode {
    return {
      id: row["id"] as string,
      projectHash: row["project_hash"] as string,
      branchName: row["branch_name"] as string,
      path: row["path"] as string,
      hash: row["hash"] as string,
      parentPath: (row["parent_path"] as string) || null,
      isLeaf: Boolean(row["is_leaf"]),
      childrenCount: (row["children_count"] as number) || 0,
      updatedAt: row["updated_at"] as number,
    };
  }

  /**
   * Check if tree is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalNodes: number;
    fileNodes: number;
    dirNodes: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN is_leaf = 1 THEN 1 ELSE 0 END) as files,
              SUM(CASE WHEN is_leaf = 0 THEN 1 ELSE 0 END) as dirs
            FROM file_merkle
            WHERE project_hash = ? AND branch_name = ?`,
      args: [this.projectHash, this.branchName],
    });

    const row = result.rows[0] as Record<string, unknown> | undefined;
    return {
      totalNodes: Number(row?.["total"] ?? 0),
      fileNodes: Number(row?.["files"] ?? 0),
      dirNodes: Number(row?.["dirs"] ?? 0),
    };
  }
}
