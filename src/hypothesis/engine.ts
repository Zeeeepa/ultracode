/**
 * Hypothesis Engine — Orchestrates hypothesis generation pipeline
 *
 * Runs Tiers 1–3 strategies, persists results to cache.db.
 * Tier 4 (proximity) is on-demand only, called from bridge.ts.
 *
 * Ported from ultracode.zig/src/hypothesis/engine.zig
 */

import { log } from "../logging/index.js";
import type { Client } from "../storage/libsql/types.js";
import type { GraphStorage } from "../types/storage.js";
import { clearHypotheses, loadAll, persistBatch } from "./hypothesis-ops.js";
import * as callbackArg from "./strategies/callback-arg.js";
import * as interfaceNarrow from "./strategies/interface-narrow.js";
import * as stringKey from "./strategies/string-key.js";
import { HypothesisStore } from "./types.js";

// =============================================================================
// RESULT TYPE
// =============================================================================

export interface GenerateResult {
  total: number;
  tier1: number;
  tier2: number;
  tier3: number;
  durationMs: number;
}

// =============================================================================
// GENERATION
// =============================================================================

/**
 * Generate hypotheses by running Tiers 1–3 strategies.
 * Clears previous hypotheses, runs inference, persists to cache.db.
 */
export async function generateHypotheses(
  storage: GraphStorage,
  cacheClient: Client,
  store: HypothesisStore,
  projectHash: string,
  branchName: string,
): Promise<GenerateResult> {
  const start = Date.now();

  // Clear previous
  store.clear();
  await clearHypotheses(cacheClient, projectHash, branchName);

  // Run tiers
  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;

  try {
    tier1 = await stringKey.generate(storage, store);
  } catch (e) {
    log.w("HYPOTHESIS", "tier1_error", { err: (e as Error).message });
  }

  try {
    tier2 = await callbackArg.generate(storage, store);
  } catch (e) {
    log.w("HYPOTHESIS", "tier2_error", { err: (e as Error).message });
  }

  try {
    tier3 = await interfaceNarrow.generate(storage, store);
  } catch (e) {
    log.w("HYPOTHESIS", "tier3_error", { err: (e as Error).message });
  }

  const total = store.count();

  // Persist to cache.db
  if (total > 0) {
    await persistBatch(cacheClient, store.getAll(), projectHash, branchName);
  }

  const durationMs = Date.now() - start;
  log.i("HYPOTHESIS", "generated", { total, tier1, tier2, tier3, ms: durationMs });

  return { total, tier1, tier2, tier3, durationMs };
}

/**
 * Load cached hypotheses from cache.db into memory store.
 * Called on daemon startup to avoid regeneration.
 */
export async function loadCachedHypotheses(
  cacheClient: Client,
  store: HypothesisStore,
  projectHash: string,
  branchName: string,
): Promise<number> {
  return loadAll(cacheClient, store, projectHash, branchName);
}

/** Singleton store instance */
let globalStore: HypothesisStore | null = null;

export function getHypothesisStore(): HypothesisStore {
  if (!globalStore) {
    globalStore = new HypothesisStore();
  }
  return globalStore;
}
