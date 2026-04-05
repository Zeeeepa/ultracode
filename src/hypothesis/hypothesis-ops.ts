/**
 * Hypothesis Storage Operations — SQLite CRUD for cache.db hypotheses table
 *
 * Ported from ultracode.zig/src/hypothesis/hypothesis_ops.zig
 */

import { log } from "../logging/index.js";
import type { Client } from "../storage/libsql/types.js";
import type { Hypothesis, HypothesisStore, HypothesisType } from "./types.js";

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/** Delete all hypotheses for a project/branch (before re-generation) */
export async function clearHypotheses(client: Client, projectHash: string, branchName: string): Promise<void> {
  await client.execute({
    sql: "DELETE FROM hypotheses WHERE project_hash = ? AND branch_name = ?",
    args: [projectHash, branchName],
  });
}

/** Persist hypotheses to cache.db in batch */
export async function persistBatch(
  client: Client,
  hypotheses: Hypothesis[],
  projectHash: string,
  branchName: string,
): Promise<number> {
  if (hypotheses.length === 0) return 0;

  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < hypotheses.length; i += BATCH) {
    const batch = hypotheses.slice(i, i + BATCH);
    const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args: (string | number)[] = [];

    for (const h of batch) {
      args.push(
        h.id,
        projectHash,
        branchName,
        h.fromId,
        h.toId,
        h.hypothesisType,
        h.confidence,
        h.relType,
        h.evidence,
        h.strategy,
        Date.now(),
      );
    }

    await client.execute({
      sql: `INSERT OR REPLACE INTO hypotheses
            (id, project_hash, branch_name, from_id, to_id, hypothesis_type, confidence, rel_type, evidence, strategy, created_at)
            VALUES ${values}`,
      args,
    });
    total += batch.length;
  }

  log.i("HYPOTHESIS", "persisted", { count: total });
  return total;
}

/** Load all hypotheses from cache.db into memory store */
export async function loadAll(
  client: Client,
  store: HypothesisStore,
  projectHash: string,
  branchName: string,
): Promise<number> {
  const result = await client.execute({
    sql: `SELECT id, from_id, to_id, hypothesis_type, confidence, rel_type, evidence, strategy
          FROM hypotheses
          WHERE project_hash = ? AND branch_name = ?
          ORDER BY confidence DESC`,
    args: [projectHash, branchName],
  });

  let count = 0;
  for (const row of result.rows) {
    const h: Hypothesis = {
      id: row["id"] as string,
      fromId: row["from_id"] as string,
      toId: row["to_id"] as string,
      hypothesisType: row["hypothesis_type"] as string as HypothesisType,
      confidence: row["confidence"] as number,
      relType: row["rel_type"] as string,
      evidence: (row["evidence"] as string) || "",
      strategy: (row["strategy"] as string) || "",
    };
    store.add(h);
    count++;
  }

  if (count > 0) {
    log.i("HYPOTHESIS", "loaded_cached", { count });
  }
  return count;
}

/** Count hypotheses for a project/branch */
export async function countHypotheses(client: Client, projectHash: string, branchName: string): Promise<number> {
  const result = await client.execute({
    sql: "SELECT COUNT(*) as cnt FROM hypotheses WHERE project_hash = ? AND branch_name = ?",
    args: [projectHash, branchName],
  });
  return (result.rows[0]?.["cnt"] as number) || 0;
}
