/**
 * Tier 4: Proximity Bridge — On-demand only
 *
 * NOT called during batch generation. Called from hypothesis_bridge during
 * Phase 4 trace fallback when no stored hypotheses connect source↔target.
 *
 * Uses bidirectional BFS frontier → gap detection → proximity scoring.
 * Scoring: same file +0.20, same dir +0.15, shared lexeme +0.10.
 *
 * Ported from ultracode.zig/src/hypothesis/strategies/proximity_bridge.zig
 */

import { dirname } from "node:path";
import type { GraphStorage } from "../../types/storage.js";
import { type Hypothesis, type HypothesisStore, HypothesisType } from "../types.js";

const MAX_RESULTS = 3;
const MIN_SCORE = 0.25;
const MAX_SCORE = 0.75;
const MIN_LEXEME_LEN = 4;

let idCounter = 0;
function nextId(): string {
  return `hyp_px_${++idCounter}`;
}

/** Generate proximity-based hypotheses for a specific source→target pair (on-demand). */
export async function generateForPair(
  storage: GraphStorage,
  store: HypothesisStore,
  sourceId: string,
  targetId: string,
  maxDepth: number = 5,
): Promise<number> {
  // Forward BFS from source
  const fwdVisited = new Set<string>();
  let fwdFrontier = [sourceId];
  for (let d = 0; d < maxDepth && fwdFrontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const id of fwdFrontier) {
      if (fwdVisited.has(id)) continue;
      fwdVisited.add(id);
      const rels = await storage.getRelationshipsForEntity(id);
      for (const rel of rels) {
        if (rel.fromId === id && !fwdVisited.has(rel.toId)) {
          nextFrontier.push(rel.toId);
        }
      }
    }
    fwdFrontier = nextFrontier;
  }

  // Backward BFS from target
  const bwdVisited = new Set<string>();
  let bwdFrontier = [targetId];
  for (let d = 0; d < maxDepth && bwdFrontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const id of bwdFrontier) {
      if (bwdVisited.has(id)) continue;
      bwdVisited.add(id);
      const rels = await storage.getRelationshipsForEntity(id);
      for (const rel of rels) {
        if (rel.toId === id && !bwdVisited.has(rel.fromId)) {
          nextFrontier.push(rel.fromId);
        }
      }
    }
    bwdFrontier = nextFrontier;
  }

  // Find gap candidates: forward frontier nodes not in backward set and vice versa
  const candidates: Array<{ fwdId: string; bwdId: string; score: number }> = [];

  for (const fwdId of fwdVisited) {
    for (const bwdId of bwdVisited) {
      if (fwdId === bwdId) continue;
      if (fwdVisited.has(bwdId) && bwdVisited.has(fwdId)) continue; // Already connected

      const score = await scorePair(storage, fwdId, bwdId);
      if (score >= MIN_SCORE) {
        candidates.push({ fwdId, bwdId, score });
      }
    }
  }

  // Sort by score, take top N
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, MAX_RESULTS);

  let count = 0;
  for (const { fwdId, bwdId, score } of top) {
    const fwdEntity = await storage.getEntity(fwdId);
    const bwdEntity = await storage.getEntity(bwdId);

    const h: Hypothesis = {
      id: nextId(),
      fromId: fwdId,
      toId: bwdId,
      hypothesisType: HypothesisType.ProximityBridge,
      confidence: Math.min(score, MAX_SCORE),
      relType: "references",
      evidence: `proximity: ${fwdEntity?.name ?? fwdId} → ${bwdEntity?.name ?? bwdId}`,
      strategy: "proximity_bridge",
    };
    store.add(h);
    count++;
  }

  return count;
}

/** Score a pair of entities by proximity heuristics */
async function scorePair(storage: GraphStorage, fwdId: string, bwdId: string): Promise<number> {
  const fwd = await storage.getEntity(fwdId);
  const bwd = await storage.getEntity(bwdId);
  if (!fwd || !bwd) return 0;

  let score = 0.1; // base

  // Same file: +0.20
  if (fwd.filePath === bwd.filePath) {
    score += 0.2;
  }
  // Same directory: +0.15
  else if (dirname(fwd.filePath) === dirname(bwd.filePath)) {
    score += 0.15;
  }

  // Shared meaningful lexeme: +0.10
  if (sharesMeaningfulLexeme(fwd.name, bwd.name)) {
    score += 0.1;
  }

  return score;
}

/** Check if two names share a substring ≥ MIN_LEXEME_LEN chars (case-insensitive) */
function sharesMeaningfulLexeme(a: string, b: string): boolean {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();

  for (let i = 0; i <= aLow.length - MIN_LEXEME_LEN; i++) {
    const sub = aLow.slice(i, i + MIN_LEXEME_LEN);
    if (bLow.includes(sub)) return true;
  }
  return false;
}
