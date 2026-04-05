/**
 * Tier 2: Callback Argument Resolution
 *
 * Detects callback patterns: setTimeout(fn), promise.then(fn), array.map(fn)
 * Scans "calls" to known callback APIs, then checks adjacent edges for referenced functions.
 *
 * Ported from ultracode.zig/src/hypothesis/strategies/callback_arg.zig
 */

import type { GraphStorage } from "../../types/storage.js";
import { findCallbackEntry } from "../catalogs.js";
import { type Hypothesis, type HypothesisStore, HypothesisType } from "../types.js";

const FUNCTION_TYPES = new Set(["function", "method", "middleware", "hook", "constructor", "async_function"]);

let idCounter = 0;
function nextId(): string {
  return `hyp_cb_${++idCounter}`;
}

export async function generate(storage: GraphStorage, store: HypothesisStore): Promise<number> {
  const allRels = await storage.getAllRelationships();
  let count = 0;

  // Group relationships by source (caller)
  const bySource = new Map<string, typeof allRels>();
  for (const rel of allRels) {
    const list = bySource.get(rel.fromId) ?? [];
    list.push(rel);
    bySource.set(rel.fromId, list);
  }

  for (const rel of allRels) {
    if (rel.type !== "calls") continue;

    // Check if target is a known callback API
    const targetEntity = await storage.getEntity(rel.toId);
    if (!targetEntity) continue;

    const entry = findCallbackEntry(targetEntity.name, targetEntity.language);
    if (!entry) continue;

    // Check other edges from same caller for referenced functions
    const callerRels = bySource.get(rel.fromId) ?? [];
    for (const otherRel of callerRels) {
      if (otherRel === rel) continue;
      if (otherRel.type !== "references" && otherRel.type !== "calls") continue;

      const refEntity = await storage.getEntity(otherRel.toId);
      if (!refEntity || !FUNCTION_TYPES.has(refEntity.type)) continue;

      const h: Hypothesis = {
        id: nextId(),
        fromId: rel.fromId,
        toId: refEntity.id,
        hypothesisType: HypothesisType.CallbackArgument,
        confidence: entry.confidence,
        relType: entry.relType,
        evidence: `${targetEntity.name}(${refEntity.name})`,
        strategy: "callback_argument",
      };
      store.add(h);
      count++;
    }
  }

  return count;
}
