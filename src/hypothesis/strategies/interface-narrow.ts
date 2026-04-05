/**
 * Tier 3: Interface/Trait Implementation Narrowing
 *
 * When code calls interface.method(), infers which concrete implementations
 * could be invoked. Confidence = max(0.2, 1.0 - (N-1)*0.2) where N = implementor count.
 *
 * Ported from ultracode.zig/src/hypothesis/strategies/interface_narrow.zig
 */

import type { GraphStorage } from "../../types/storage.js";
import { type Hypothesis, type HypothesisStore, HypothesisType } from "../types.js";

const INTERFACE_TYPES = new Set(["interface", "trait", "class"]);

let idCounter = 0;
function nextId(): string {
  return `hyp_in_${++idCounter}`;
}

export async function generate(storage: GraphStorage, store: HypothesisStore): Promise<number> {
  const allRels = await storage.getAllRelationships();
  let count = 0;

  // Build interface → implementors map
  const implementors = new Map<string, string[]>();
  for (const rel of allRels) {
    if (rel.type !== "implements" && rel.type !== "extends") continue;
    const list = implementors.get(rel.toId) ?? [];
    list.push(rel.fromId);
    implementors.set(rel.toId, list);
  }

  // Find calls to interface methods
  for (const rel of allRels) {
    if (rel.type !== "calls" && rel.type !== "references") continue;

    const targetEntity = await storage.getEntity(rel.toId);
    if (!targetEntity) continue;

    // Check if target's parent is an interface-like entity
    const parentRels = await storage.getRelationshipsForEntity(rel.toId, "member_of" as any);
    for (const parentRel of parentRels) {
      const parentEntity = await storage.getEntity(parentRel.toId);
      if (!parentEntity || !INTERFACE_TYPES.has(parentEntity.type)) continue;

      const impls = implementors.get(parentEntity.id);
      if (!impls || impls.length === 0) continue;

      // Confidence inversely proportional to implementation count
      const n = impls.length;
      const confidence = Math.max(0.2, 1.0 - (n - 1) * 0.2);

      for (const implId of impls) {
        // Find matching method in implementor
        const implRels = await storage.getRelationshipsForEntity(implId, "contains" as any);
        for (const implRel of implRels) {
          const implMethod = await storage.getEntity(implRel.toId);
          if (!implMethod || implMethod.name !== targetEntity.name) continue;

          const h: Hypothesis = {
            id: nextId(),
            fromId: rel.fromId,
            toId: implMethod.id,
            hypothesisType: HypothesisType.InterfaceNarrowing,
            confidence,
            relType: "calls",
            evidence: `${parentEntity.name}.${targetEntity.name} → ${n} impls`,
            strategy: "interface_narrowing",
          };
          store.add(h);
          count++;
        }
      }
    }
  }

  return count;
}
