/**
 * Co-occurrence Operations for LibSQL Graph Adapter
 *
 * Handles all co-occurrence table operations:
 * - Batch update of term pairs from indexed content
 * - Retrieval of related terms for query expansion
 * - PMI (Pointwise Mutual Information) calculation
 * - Term frequency management
 */

import { log } from "../../logging/index.js";
import type { ClientGetter, ContextGetter, WriteMutexFn } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface RelatedTerm {
  term: string;
  score: number;
  count: number;
}

export interface CooccurrenceStats {
  totalPairs: number;
  totalTerms: number;
  avgPairCount: number;
}

// =============================================================================
// COOCCURRENCE OPERATIONS CLASS
// =============================================================================

export class CooccurrenceOperations {
  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
    private writeMutex?: WriteMutexFn,
  ) {}

  /** Route write through per-DB mutex if available */
  private _w<T>(fn: () => Promise<T>): Promise<T> {
    return this.writeMutex ? this.writeMutex(fn) : fn();
  }

  // ===========================================================================
  // BATCH UPDATE
  // ===========================================================================

  /**
   * Batch update co-occurrence counts from extracted term pairs.
   * Uses UPSERT (INSERT OR REPLACE) for atomic updates.
   * Entire loop is inside the mutex — prevents partial writes from interleaving.
   *
   * @param pairs - Map of "term1|term2" → count (terms must be sorted alphabetically)
   */
  async batchUpdateCooccurrence(pairs: Map<string, number>): Promise<void> {
    if (pairs.size === 0) return;
    return this._w(async () => {
      const client = this.getClient();
      if (!client) throw new Error("Client not initialized");

      const { projectHash, branchName } = this.getContext();

      // Batch size for INSERT statements (avoid too large queries)
      const BATCH_SIZE = 100;
      const entries = Array.from(pairs.entries());

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);

        // Build VALUES clause (5 cols: term1, term2, project_hash, branch_name, count)
        const values: string[] = [];
        const args: (string | number)[] = [];

        for (const [key, count] of batch) {
          const [term1, term2] = key.split("|");
          if (!term1 || !term2) continue;

          values.push("(?, ?, ?, ?, ?)");
          args.push(term1, term2, projectHash, branchName, count);
        }

        if (values.length === 0) continue;

        // UPSERT: increment count on conflict (Zig-compatible schema)
        await client.execute({
          sql: `
          INSERT INTO cooccurrence (term1, term2, project_hash, branch_name, count)
          VALUES ${values.join(", ")}
          ON CONFLICT(term1, term2, project_hash, branch_name)
          DO UPDATE SET count = cooccurrence.count + excluded.count
        `,
          args,
        });
      }
    }); // end _w
  }

  /**
   * Update per-entity term frequencies (Zig-compatible schema).
   * Stores (term, entity_id, frequency) — one row per (term, entity) pair.
   *
   * @param entries - Array of {term, entityId, frequency} tuples
   */
  async updateTermFrequencies(entries: Array<{ term: string; entityId: string; frequency: number }>): Promise<void> {
    if (entries.length === 0) return;
    return this._w(async () => {
      const client = this.getClient();
      if (!client) throw new Error("Client not initialized");

      const { projectHash, branchName } = this.getContext();
      const BATCH_SIZE = 100;

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);

        const values: string[] = [];
        const args: (string | number)[] = [];

        for (const { term, entityId, frequency } of batch) {
          values.push("(?, ?, ?, ?, ?)");
          args.push(term, entityId, projectHash, branchName, frequency);
        }

        if (values.length === 0) continue;

        await client.execute({
          sql: `
          INSERT INTO term_frequency (term, entity_id, project_hash, branch_name, frequency)
          VALUES ${values.join(", ")}
          ON CONFLICT(term, entity_id, project_hash, branch_name)
          DO UPDATE SET frequency = excluded.frequency
        `,
          args,
        });
      }
    }); // end _w
  }

  /**
   * Legacy adapter: convert Map<string, number> to per-entity format.
   * Used by callers that don't have entity context yet.
   */
  async updateTermFrequenciesLegacy(termCounts: Map<string, number>, _isNewDocument = true): Promise<void> {
    if (termCounts.size === 0) return;
    // Without entity context, store with a placeholder entity_id
    const entries = Array.from(termCounts.entries()).map(([term, count]) => ({
      term,
      entityId: "_aggregate",
      frequency: count,
    }));
    return this.updateTermFrequencies(entries);
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Get related terms for query expansion.
   * Returns terms that frequently co-occur with the input term,
   * sorted by PMI score (if available) or raw count.
   *
   * @param term - The term to find related terms for
   * @param limit - Maximum number of related terms to return
   */
  async getRelatedTerms(term: string, limit = 5): Promise<RelatedTerm[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const normalizedTerm = term.toLowerCase();

    // Query co-occurrences where term appears as either term1 or term2
    // Sort by count (no PMI column in Zig-compatible schema)
    const results: RelatedTerm[] = [];
    for (const row of client.executeIterator({
      sql: `
        SELECT
          CASE WHEN term1 = ? THEN term2 ELSE term1 END as related_term,
          count
        FROM cooccurrence
        WHERE project_hash = ? AND branch_name = ?
          AND (term1 = ? OR term2 = ?)
        ORDER BY count DESC
        LIMIT ?
      `,
      args: [normalizedTerm, projectHash, branchName, normalizedTerm, normalizedTerm, limit],
    })) {
      const r = row as Record<string, unknown>;
      const count = r["count"] as number;
      results.push({
        term: r["related_term"] as string,
        score: count,
        count,
      });
    }

    return results;
  }

  /**
   * Get multiple related terms for a set of input terms.
   * More efficient than calling getRelatedTerms multiple times.
   *
   * @param terms - Array of terms to find related terms for
   * @param limitPerTerm - Maximum related terms per input term
   */
  async getRelatedTermsBatch(terms: string[], limitPerTerm = 3): Promise<Map<string, RelatedTerm[]>> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    if (terms.length === 0) return new Map();

    const { projectHash, branchName } = this.getContext();
    const normalizedTerms = terms.map((t) => t.toLowerCase());

    // Single query for all terms
    const placeholders = normalizedTerms.map(() => "?").join(", ");

    // Group by source term and limit
    const grouped = new Map<string, RelatedTerm[]>();
    for (const term of normalizedTerms) {
      grouped.set(term, []);
    }

    for (const row of client.executeIterator({
      sql: `
        SELECT
          CASE WHEN term1 IN (${placeholders}) THEN term1 ELSE term2 END as source_term,
          CASE WHEN term1 IN (${placeholders}) THEN term2 ELSE term1 END as related_term,
          count
        FROM cooccurrence
        WHERE project_hash = ? AND branch_name = ?
          AND (term1 IN (${placeholders}) OR term2 IN (${placeholders}))
        ORDER BY count DESC
        LIMIT 2000
      `,
      args: [...normalizedTerms, ...normalizedTerms, projectHash, branchName, ...normalizedTerms, ...normalizedTerms],
    })) {
      const r = row as Record<string, unknown>;
      const sourceTerm = r["source_term"] as string;
      const relatedTerm = r["related_term"] as string;
      const count = r["count"] as number;
      const arr = grouped.get(sourceTerm);

      if (arr && arr.length < limitPerTerm) {
        arr.push({
          term: relatedTerm,
          score: count,
          count,
        });
      }
    }

    return grouped;
  }

  // ===========================================================================
  // PMI CALCULATION (in-memory, no longer stored in DB)
  // ===========================================================================

  /**
   * Recalculate PMI — no-op in Zig-compatible schema (PMI column removed).
   * PMI can be computed on-the-fly via getRelatedTerms using count-based scoring.
   */
  async recalculatePMI(): Promise<void> {
    // No-op: PMI column removed in Zig-compatible schema
  }

  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================

  /**
   * Get statistics about the co-occurrence index.
   */
  async getStats(): Promise<CooccurrenceStats> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    const [pairsResult, termsResult, avgResult] = await Promise.all([
      client.execute({
        sql: `SELECT COUNT(*) as cnt FROM cooccurrence WHERE project_hash = ? AND branch_name = ?`,
        args: [projectHash, branchName],
      }),
      client.execute({
        sql: `SELECT COUNT(*) as cnt FROM term_frequency WHERE project_hash = ? AND branch_name = ?`,
        args: [projectHash, branchName],
      }),
      client.execute({
        sql: `SELECT AVG(count) as avg FROM cooccurrence WHERE project_hash = ? AND branch_name = ?`,
        args: [projectHash, branchName],
      }),
    ]);

    return {
      totalPairs: (pairsResult.rows[0]?.["cnt"] as number) || 0,
      totalTerms: (termsResult.rows[0]?.["cnt"] as number) || 0,
      avgPairCount: (avgResult.rows[0]?.["avg"] as number) || 0,
    };
  }

  /**
   * Clear all co-occurrence data for current project/branch.
   */
  async clear(): Promise<void> {
    return this._w(async () => {
      const client = this.getClient();
      if (!client) throw new Error("Client not initialized");

      const { projectHash, branchName } = this.getContext();

      await client.batch(
        [
          {
            sql: "DELETE FROM cooccurrence WHERE project_hash = ? AND branch_name = ?",
            args: [projectHash, branchName],
          },
          {
            sql: "DELETE FROM term_frequency WHERE project_hash = ? AND branch_name = ?",
            args: [projectHash, branchName],
          },
        ],
        "write",
      );

      log.i("COOCOPS", "cleared", { projectHash, branchName });
    }); // end _w
  }

  /**
   * Prune low-frequency pairs to reduce index size.
   * Removes pairs with count below threshold.
   *
   * @param minCount - Minimum count to keep (default: 2)
   */
  async pruneRarePairs(minCount = 2): Promise<number> {
    return this._w(async () => {
      const client = this.getClient();
      if (!client) throw new Error("Client not initialized");

      const { projectHash, branchName } = this.getContext();

      const result = await client.execute({
        sql: `
        DELETE FROM cooccurrence
        WHERE project_hash = ? AND branch_name = ? AND count < ?
      `,
        args: [projectHash, branchName, minCount],
      });

      const deleted = result.rowsAffected || 0;
      if (deleted > 0) {
        log.i("COOCOPS", "pruned", { deleted, minCount });
      }

      return deleted;
    }); // end _w
  }
}
