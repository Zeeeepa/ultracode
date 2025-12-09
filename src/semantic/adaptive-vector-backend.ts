/**
 * Adaptive Vector Backend Selector
 *
 * Automatically selects the optimal vector backend based on codebase size:
 * - Small/Medium (<10k vectors): sqlite-vec (exact search, fast insert)
 * - Large (>10k vectors): vectorlite (HNSW, 3-100x faster search)
 * - Fallback: plain SQLite (no ML acceleration)
 *
 * Provides seamless switching and graceful degradation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SQLiteDatabase } from "../storage/sqlite-adapter.js";
import type { VectorBackend, VectorStoreConfig } from "../types/semantic.js";

export interface BackendInfo {
  backend: VectorBackend;
  vectorCount: number;
  reason: string;
  recommended: boolean;
}

export interface BackendCapabilities {
  sqliteVec: boolean;
  vectorlite: boolean;
  fallbackOnly: boolean;
}

/**
 * Adaptive backend selector
 */
export class AdaptiveVectorBackend {
  private config: VectorStoreConfig;
  private db: SQLiteDatabase;
  private capabilities: BackendCapabilities = {
    sqliteVec: false,
    vectorlite: false,
    fallbackOnly: false,
  };

  constructor(db: SQLiteDatabase, config: VectorStoreConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Detect available backend capabilities
   */
  async detectCapabilities(): Promise<BackendCapabilities> {
    // Check sqlite-vec
    this.capabilities.sqliteVec = this.checkSqliteVec();

    // Check vectorlite
    this.capabilities.vectorlite = await this.checkVectorlite();

    // Fallback if neither available
    this.capabilities.fallbackOnly = !this.capabilities.sqliteVec && !this.capabilities.vectorlite;

    return this.capabilities;
  }

  /**
   * Check if sqlite-vec extension is available
   */
  private checkSqliteVec(): boolean {
    try {
      const result = this.db.prepare("SELECT vec_version()").get();
      return result !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Check if vectorlite extension is available
   */
  private async checkVectorlite(): Promise<boolean> {
    try {
      // @ts-expect-error - vectorlite has no type definitions
      const vectorlite = await import("vectorlite");
      const extensionPath = vectorlite.default.vectorlitePath();

      this.db.loadExtension(extensionPath);

      // Verify
      const info = this.db.prepare("SELECT vectorlite_info()").get();
      return info !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get current vector count from database
   */
  getVectorCount(): number {
    try {
      // Try vec_doc_embeddings (sqlite-vec table)
      const vecResult = this.db.prepare("SELECT COUNT(*) as count FROM vec_doc_embeddings").get() as
        | { count: number }
        | undefined;
      if (vecResult) return vecResult.count;
    } catch {
      // Table doesn't exist or error
    }

    try {
      // Try vectorlite_embeddings_metadata (vectorlite table)
      const vlResult = this.db.prepare("SELECT COUNT(*) as count FROM vectorlite_embeddings_metadata").get() as
        | { count: number }
        | undefined;
      if (vlResult) return vlResult.count;
    } catch {
      // Table doesn't exist
    }

    try {
      // Try doc_embeddings (fallback table)
      const fallbackResult = this.db.prepare("SELECT COUNT(*) as count FROM doc_embeddings").get() as
        | { count: number }
        | undefined;
      if (fallbackResult) return fallbackResult.count;
    } catch {
      // No table exists yet
    }

    return 0;
  }

  /**
   * Estimate final vector count based on codebase size
   */
  estimateVectorCount(fileCount: number): number {
    // Heuristic: average ~5 entities per file
    // (functions, classes, methods, etc.)
    return fileCount * 5;
  }

  /**
   * Quick count of source files in working directory
   * Fast heuristic - doesn't recurse deeply
   */
  quickCountFiles(workingDir: string): number {
    if (!fs.existsSync(workingDir)) {
      return 0;
    }

    const extensions = [
      ".ts",
      ".js",
      ".tsx",
      ".jsx",
      ".py",
      ".c",
      ".cpp",
      ".java",
      ".go",
      ".rs",
      ".kt",
      ".kts",
      ".swift",
      ".css",
      ".scss",
      ".sass",
      ".less",
      ".html",
      ".htm",
      ".xml",
    ];
    const excludeDirs = ["node_modules", ".git", "dist", "build", "bin", "obj", ".vs", "packages"];

    let count = 0;
    const maxDepth = 10; // Limit recursion depth for speed

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              walk(path.join(dir, entry.name), depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              count++;
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    };

    walk(workingDir, 0);
    return count;
  }

  /**
   * Select optimal backend based on size and capabilities
   */
  selectBackend(vectorCount?: number, estimatedFileCount?: number): BackendInfo {
    const actualCount = vectorCount ?? this.getVectorCount();

    // If estimatedFileCount not provided but workingDirectory is, count files quickly
    let fileCount = estimatedFileCount;
    if (!fileCount && this.config.workingDirectory) {
      const startTime = Date.now();
      fileCount = this.quickCountFiles(this.config.workingDirectory);
      const elapsed = Date.now() - startTime;
      console.error(`[AdaptiveVectorBackend] Quick counted ${fileCount} source files in ${elapsed}ms`);
    }

    const estimatedCount = fileCount ? this.estimateVectorCount(fileCount) : actualCount;
    const finalCount = Math.max(actualCount, estimatedCount);

    const threshold = this.config.autoSwitchThreshold ?? 10000;
    const userPreference = this.config.backend;

    // User explicitly set backend
    if (userPreference && userPreference !== "auto") {
      return this.selectExplicitBackend(userPreference, finalCount);
    }

    // Auto selection
    if (finalCount >= threshold) {
      // Large codebase - prefer vectorlite for fast search
      if (this.capabilities.vectorlite) {
        return {
          backend: "vectorlite",
          vectorCount: finalCount,
          reason: `Large codebase (${finalCount} vectors >= ${threshold} threshold). Vectorlite provides 3-100x faster search with HNSW.`,
          recommended: true,
        };
      }

      // Fallback to sqlite-vec
      if (this.capabilities.sqliteVec) {
        return {
          backend: "sqlite-vec",
          vectorCount: finalCount,
          reason: `Large codebase (${finalCount} vectors), but vectorlite unavailable. Using sqlite-vec (slower search).`,
          recommended: false,
        };
      }
    } else {
      // Small/medium codebase - prefer sqlite-vec for fast insert
      if (this.capabilities.sqliteVec) {
        return {
          backend: "sqlite-vec",
          vectorCount: finalCount,
          reason: `Small/medium codebase (${finalCount} vectors < ${threshold} threshold). Sqlite-vec provides fast inserts.`,
          recommended: true,
        };
      }

      // Vectorlite also works fine
      if (this.capabilities.vectorlite) {
        return {
          backend: "vectorlite",
          vectorCount: finalCount,
          reason: `Small/medium codebase (${finalCount} vectors), but sqlite-vec unavailable. Using vectorlite.`,
          recommended: false,
        };
      }
    }

    // No extensions available - fallback
    return {
      backend: "fallback",
      vectorCount: finalCount,
      reason: "No vector extensions available. Using fallback implementation (slower).",
      recommended: false,
    };
  }

  /**
   * Select backend when user explicitly specified preference
   */
  private selectExplicitBackend(backend: VectorBackend, vectorCount: number): BackendInfo {
    const threshold = this.config.autoSwitchThreshold ?? 10000;

    switch (backend) {
      case "vectorlite":
        if (!this.capabilities.vectorlite) {
          console.warn("[AdaptiveBackend] Vectorlite requested but unavailable, falling back to sqlite-vec");
          return this.selectBackend(vectorCount);
        }
        return {
          backend: "vectorlite",
          vectorCount,
          reason: "User explicitly set vectorlite backend",
          recommended: vectorCount >= threshold,
        };

      case "sqlite-vec":
        if (!this.capabilities.sqliteVec) {
          console.warn("[AdaptiveBackend] Sqlite-vec requested but unavailable, falling back to vectorlite");
          return this.selectBackend(vectorCount);
        }
        return {
          backend: "sqlite-vec",
          vectorCount,
          reason: "User explicitly set sqlite-vec backend",
          recommended: vectorCount < threshold,
        };

      case "fallback":
        return {
          backend: "fallback",
          vectorCount,
          reason: "User explicitly set fallback backend",
          recommended: false,
        };

      default:
        // Shouldn't reach here
        return this.selectBackend(vectorCount);
    }
  }

  /**
   * Check if migration is needed (backend switch recommended)
   */
  shouldMigrate(currentBackend: VectorBackend): {
    migrate: boolean;
    from: VectorBackend;
    to: VectorBackend;
    reason: string;
  } {
    const vectorCount = this.getVectorCount();
    const recommended = this.selectBackend(vectorCount);

    if (recommended.backend !== currentBackend) {
      return {
        migrate: true,
        from: currentBackend,
        to: recommended.backend,
        reason: recommended.reason,
      };
    }

    return {
      migrate: false,
      from: currentBackend,
      to: currentBackend,
      reason: "Current backend is optimal",
    };
  }

  /**
   * Get performance stats for current selection
   */
  getPerformanceEstimate(
    backend: VectorBackend,
    vectorCount: number,
  ): {
    insertSpeed: "fast" | "medium" | "slow";
    searchSpeed: "fast" | "medium" | "slow";
    accuracy: "exact" | "approximate";
    memoryUsage: "low" | "medium" | "high";
  } {
    if (vectorCount < 1000) {
      // Small codebase - all backends perform similarly
      return {
        insertSpeed: "fast",
        searchSpeed: "fast",
        accuracy: backend === "fallback" ? "exact" : "exact",
        memoryUsage: "low",
      };
    }

    switch (backend) {
      case "vectorlite":
        return {
          insertSpeed: vectorCount > 10000 ? "slow" : "medium", // 4-5x slower insert due to HNSW
          searchSpeed: "fast", // 3-100x faster search
          accuracy: "approximate", // HNSW is approximate
          memoryUsage: vectorCount > 50000 ? "high" : "medium", // HNSW index in memory
        };

      case "sqlite-vec":
        return {
          insertSpeed: "fast", // Simple BLOB insert
          searchSpeed: vectorCount > 10000 ? "slow" : "fast", // Brute-force slows down
          accuracy: "exact",
          memoryUsage: "low",
        };

      case "fallback":
        return {
          insertSpeed: "medium",
          searchSpeed: "slow", // Manual similarity calculation
          accuracy: "exact",
          memoryUsage: "low",
        };

      default:
        return {
          insertSpeed: "medium",
          searchSpeed: "medium",
          accuracy: "exact",
          memoryUsage: "medium",
        };
    }
  }
}
