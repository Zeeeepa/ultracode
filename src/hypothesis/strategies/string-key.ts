/**
 * Tier 1: String Key Match — Event register/dispatch + decorator patterns
 *
 * Strategy A: Decorator-based — scan "annotated_by" edges, match catalog decorators
 * Strategy B: Name-based — match register/dispatch calls in same directory
 *
 * Ported from ultracode.zig/src/hypothesis/strategies/string_key.zig
 */

import { dirname } from "node:path";
import type { GraphStorage } from "../../types/storage.js";
import { findDispatchPair, findRegisterPair } from "../catalogs.js";
import { type Hypothesis, type HypothesisStore, HypothesisType } from "../types.js";

let idCounter = 0;
function nextId(): string {
  return `hyp_sk_${++idCounter}`;
}

export async function generate(storage: GraphStorage, store: HypothesisStore): Promise<number> {
  let count = 0;
  count += await generateDecoratorHypotheses(storage, store);
  count += await generateNameMatchHypotheses(storage, store);
  return count;
}

/** Strategy A: Decorator-based patterns (Flask @route, NestJS @Get, Spring @RequestMapping) */
async function generateDecoratorHypotheses(storage: GraphStorage, store: HypothesisStore): Promise<number> {
  const allRels = await storage.getAllRelationships();
  let count = 0;

  for (const rel of allRels) {
    if (rel.type !== "references" && rel.type !== "contains") continue;

    // Check if target entity name matches a decorator pattern
    const targetEntity = await storage.getEntity(rel.toId);
    if (!targetEntity) continue;

    const pair = findRegisterPair(targetEntity.name, targetEntity.language);
    if (!pair || !pair.decoratorOnNextFn) continue;

    // Source is the handler function annotated by this decorator
    const h: Hypothesis = {
      id: nextId(),
      fromId: targetEntity.id,
      toId: rel.fromId,
      hypothesisType: HypothesisType.StringKeyMatch,
      confidence: pair.confidence,
      relType: pair.relType,
      evidence: `decorator ${targetEntity.name} → handler`,
      strategy: "decorator_match",
    };
    store.add(h);
    count++;
  }

  return count;
}

/** Strategy B: Name-based register/dispatch matching in same directory */
async function generateNameMatchHypotheses(storage: GraphStorage, store: HypothesisStore): Promise<number> {
  const allRels = await storage.getAllRelationships();
  let count = 0;

  // Collect calls to register/dispatch methods, grouped by "method:directory"
  const registerCalls = new Map<string, { callerId: string; callerFile: string }[]>();
  const dispatchCalls = new Map<string, { callerId: string; callerFile: string }[]>();

  for (const rel of allRels) {
    if (rel.type !== "calls") continue;

    const targetEntity = await storage.getEntity(rel.toId);
    if (!targetEntity) continue;

    const callerEntity = await storage.getEntity(rel.fromId);
    if (!callerEntity) continue;

    const callerDir = dirname(callerEntity.filePath);
    const groupKey = `${targetEntity.name}:${callerDir}`;

    if (findRegisterPair(targetEntity.name, targetEntity.language)) {
      const list = registerCalls.get(groupKey) ?? [];
      list.push({ callerId: callerEntity.id, callerFile: callerEntity.filePath });
      registerCalls.set(groupKey, list);
    }

    if (findDispatchPair(targetEntity.name, targetEntity.language)) {
      const list = dispatchCalls.get(groupKey) ?? [];
      list.push({ callerId: callerEntity.id, callerFile: callerEntity.filePath });
      dispatchCalls.set(groupKey, list);
    }
  }

  // Match register and dispatch calls in same directory
  for (const [regKey, regCallers] of registerCalls) {
    const [methodName, dir] = regKey.split(":");
    if (!methodName || !dir) continue;

    const pair = findRegisterPair(methodName);
    if (!pair?.dispatch) continue;

    const dispKey = `${pair.dispatch}:${dir}`;
    const dispCallers = dispatchCalls.get(dispKey);
    if (!dispCallers) continue;

    for (const disp of dispCallers) {
      for (const reg of regCallers) {
        if (disp.callerId === reg.callerId) continue;
        const h: Hypothesis = {
          id: nextId(),
          fromId: disp.callerId,
          toId: reg.callerId,
          hypothesisType: HypothesisType.StringKeyMatch,
          confidence: pair.confidence * 0.7, // Reduced: directory match, not key match
          relType: pair.relType,
          evidence: `${pair.dispatch}() → ${methodName}() in ${dir}`,
          strategy: "name_directory_match",
        };
        store.add(h);
        count++;
      }
    }
  }

  return count;
}
