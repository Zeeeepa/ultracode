/**
 * Hypothesis Bridge — Phase 4 trace fallback
 *
 * When Phases 1–3 (BFS, DFS, multi-segment) fail to find a path,
 * this module uses stored hypotheses to bridge the gap.
 *
 * Algorithm:
 *   1. Forward BFS from source (real edges)
 *   2. Backward BFS from target (real edges)
 *   3. Check if stored hypotheses connect forward↔backward frontiers
 *   4. If no match → Tier 4 proximity bridge (on-demand)
 *   5. Stitch path with hypothesis step marked
 *
 * Ported from ultracode.zig/src/hypothesis/hypothesis_bridge.zig
 */

import type { GraphStorage } from "../types/storage.js";
import { generateForPair } from "./strategies/proximity-bridge.js";
import type { HypothesisRef, HypothesisStore } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface BridgePath {
  steps: BridgeStep[];
  totalConfidence: number;
}

export interface BridgeStep {
  entityId: string;
  entityName?: string | undefined;
  edgeType?: string | undefined;
  hypothesis?: HypothesisRef | undefined;
}

// =============================================================================
// PATH FINDING WITH HYPOTHESES
// =============================================================================

/**
 * Find paths between source and target using hypothesis bridges.
 * Returns up to maxPaths paths, each with hypothesis step(s) marked.
 */
export async function findPathWithHypotheses(
  storage: GraphStorage,
  store: HypothesisStore,
  sourceId: string,
  targetId: string,
  maxPaths: number = 3,
  maxDepth: number = 8,
): Promise<BridgePath[]> {
  const halfDepth = Math.ceil(maxDepth / 2);

  // Forward BFS from source
  const fwdVisited = new Map<string, string | null>(); // id → parent
  let fwdFrontier = [sourceId];
  fwdVisited.set(sourceId, null);

  for (let d = 0; d < halfDepth && fwdFrontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of fwdFrontier) {
      const rels = await storage.getRelationshipsForEntity(id);
      for (const rel of rels) {
        if (rel.fromId === id && !fwdVisited.has(rel.toId)) {
          fwdVisited.set(rel.toId, id);
          next.push(rel.toId);
        }
      }
    }
    fwdFrontier = next;
  }

  // Backward BFS from target
  const bwdVisited = new Map<string, string | null>(); // id → child (reverse parent)
  let bwdFrontier = [targetId];
  bwdVisited.set(targetId, null);

  for (let d = 0; d < halfDepth && bwdFrontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of bwdFrontier) {
      const rels = await storage.getRelationshipsForEntity(id);
      for (const rel of rels) {
        if (rel.toId === id && !bwdVisited.has(rel.fromId)) {
          bwdVisited.set(rel.fromId, id);
          next.push(rel.fromId);
        }
      }
    }
    bwdFrontier = next;
  }

  // Check stored hypotheses: forward frontier → hypothesis → backward frontier
  const paths: BridgePath[] = [];

  for (const fwdId of fwdVisited.keys()) {
    const outHyps = store.getFromSource(fwdId);
    for (const hyp of outHyps) {
      if (bwdVisited.has(hyp.toId)) {
        const path = await stitchPath(storage, store, fwdVisited, bwdVisited, fwdId, hyp.toId, hyp);
        if (path) {
          paths.push(path);
          if (paths.length >= maxPaths) return paths;
        }
      }
    }
  }

  // Also check: backward frontier → hypothesis.target in forward set
  for (const bwdId of bwdVisited.keys()) {
    const inHyps = store.getToTarget(bwdId);
    for (const hyp of inHyps) {
      if (fwdVisited.has(hyp.fromId)) {
        const path = await stitchPath(storage, store, fwdVisited, bwdVisited, hyp.fromId, bwdId, hyp);
        if (path) {
          paths.push(path);
          if (paths.length >= maxPaths) return paths;
        }
      }
    }
  }

  // Fallback: Tier 4 proximity bridge (on-demand)
  if (paths.length === 0) {
    const generated = await generateForPair(storage, store, sourceId, targetId, halfDepth);
    if (generated > 0) {
      // Retry with newly generated hypotheses
      for (const fwdId of fwdVisited.keys()) {
        const outHyps = store.getFromSource(fwdId);
        for (const hyp of outHyps) {
          if (bwdVisited.has(hyp.toId)) {
            const path = await stitchPath(storage, store, fwdVisited, bwdVisited, fwdId, hyp.toId, hyp);
            if (path) {
              paths.push(path);
              if (paths.length >= maxPaths) return paths;
            }
          }
        }
      }
    }
  }

  return paths;
}

// =============================================================================
// PATH STITCHING
// =============================================================================

async function stitchPath(
  storage: GraphStorage,
  store: HypothesisStore,
  fwdVisited: Map<string, string | null>,
  bwdVisited: Map<string, string | null>,
  bridgeFrom: string,
  bridgeTo: string,
  hyp: { fromId: string; toId: string; confidence: number; hypothesisType: any; relType: string; evidence: string },
): Promise<BridgePath | null> {
  const steps: BridgeStep[] = [];

  // Reconstruct forward path: source → bridgeFrom
  const fwdPath: string[] = [];
  let cur: string | null = bridgeFrom;
  while (cur !== null) {
    fwdPath.unshift(cur);
    cur = fwdVisited.get(cur) ?? null;
  }

  // Reconstruct backward path: bridgeTo → target
  const bwdPath: string[] = [];
  cur = bridgeTo;
  while (cur !== null) {
    bwdPath.push(cur);
    cur = bwdVisited.get(cur) ?? null;
  }

  // Build steps
  for (const id of fwdPath) {
    const entity = await storage.getEntity(id);
    steps.push({ entityId: id, entityName: entity?.name });
  }

  // Add hypothesis bridge step
  const bridgeEntity = await storage.getEntity(bridgeTo);
  steps.push({
    entityId: bridgeTo,
    entityName: bridgeEntity?.name,
    edgeType: hyp.relType,
    hypothesis: store.toRef(hyp as any),
  });

  // Add backward path (skip bridgeTo — already added)
  for (let i = 1; i < bwdPath.length; i++) {
    const entity = await storage.getEntity(bwdPath[i]!);
    steps.push({ entityId: bwdPath[i]!, entityName: entity?.name });
  }

  return {
    steps,
    totalConfidence: hyp.confidence,
  };
}
