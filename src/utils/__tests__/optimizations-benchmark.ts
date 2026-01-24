/**
 * Benchmark: Performance impact of optimizations
 *
 * Measures O(n²) → O(n) deduplication, RegExp caching, binary search, etc.
 */

// ============================================================================
// 1. O(n²) vs O(n) Deduplication (layered-graph-index.ts)
// ============================================================================

interface Entity {
  id: string;
  name: string;
}

function deduplicateOld(baseResults: Entity[], added: Map<string, Entity>): Entity[] {
  const result = [...baseResults];
  for (const addedEntity of added.values()) {
    // O(n) find inside O(m) loop = O(n*m)
    if (!result.find((e) => e.id === addedEntity.id)) {
      result.push(addedEntity);
    }
  }
  return result;
}

function deduplicateNew(baseResults: Entity[], added: Map<string, Entity>): Entity[] {
  const result: Entity[] = [];
  const seenIds = new Set<string>();

  for (const entity of baseResults) {
    result.push(entity);
    seenIds.add(entity.id);
  }

  for (const addedEntity of added.values()) {
    // O(1) Set lookup
    if (!seenIds.has(addedEntity.id)) {
      seenIds.add(addedEntity.id);
      result.push(addedEntity);
    }
  }
  return result;
}

// ============================================================================
// 2. RegExp Compilation Caching (knowledge-bus.ts)
// ============================================================================

function matchTopicOld(storedTopic: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    // Creates new RegExp on every call
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(storedTopic);
  }
  return storedTopic === pattern;
}

const regexCache = new Map<string, RegExp>();
function matchTopicNew(storedTopic: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    let regex = regexCache.get(pattern);
    if (!regex) {
      regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      regexCache.set(pattern, regex);
    }
    return regex.test(storedTopic);
  }
  return storedTopic === pattern;
}

// ============================================================================
// 3. O(n) Filter vs O(log n) Binary Search (resource-manager.ts)
// ============================================================================

interface Snapshot {
  timestamp: number;
  value: number;
}

function getHistoryOld(snapshots: Snapshot[], cutoff: number): Snapshot[] {
  return snapshots.filter((s) => s.timestamp >= cutoff);
}

function getHistoryNew(snapshots: Snapshot[], cutoff: number): Snapshot[] {
  let left = 0;
  let right = snapshots.length;

  while (left < right) {
    const mid = (left + right) >>> 1;
    if (snapshots[mid]!.timestamp < cutoff) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return snapshots.slice(left);
}

// ============================================================================
// 4. O(n*m) vs O(1) Unsubscribe (knowledge-bus.ts)
// ============================================================================

interface Subscription {
  id: string;
  topic: string;
}

function unsubscribeOld(subscriptions: Map<string, Subscription[]>, subscriptionId: string): boolean {
  for (const [, subs] of subscriptions) {
    const index = subs.findIndex((s) => s.id === subscriptionId);
    if (index !== -1) {
      subs.splice(index, 1);
      return true;
    }
  }
  return false;
}

function unsubscribeNew(
  subscriptions: Map<string, Subscription[]>,
  subscriptionToTopic: Map<string, string>,
  subscriptionId: string,
): boolean {
  const topicKey = subscriptionToTopic.get(subscriptionId);
  if (!topicKey) return false;

  const subs = subscriptions.get(topicKey);
  if (subs) {
    const index = subs.findIndex((s) => s.id === subscriptionId);
    if (index !== -1) {
      subs.splice(index, 1);
      subscriptionToTopic.delete(subscriptionId);
      return true;
    }
  }
  return false;
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

function benchmark(name: string, fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations / 10); i++) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  const avgUs = (elapsed / iterations) * 1000;

  return avgUs;
}

function formatSpeedup(oldTime: number, newTime: number): string {
  const speedup = oldTime / newTime;
  if (speedup >= 1) {
    return `${speedup.toFixed(1)}x faster`;
  } else {
    return `${(1 / speedup).toFixed(1)}x slower`;
  }
}

// ============================================================================
// RUN BENCHMARKS
// ============================================================================

console.log("=".repeat(70));
console.log("PERFORMANCE BENCHMARK: Optimizations Impact");
console.log("=".repeat(70));
console.log();

// Test 1: Deduplication
{
  const sizes = [100, 1000, 5000];

  console.log("1. DEDUPLICATION: O(n²) .find() vs O(n) Set");
  console.log("-".repeat(50));

  for (const n of sizes) {
    const baseResults: Entity[] = Array.from({ length: n }, (_, i) => ({
      id: `base-${i}`,
      name: `Entity ${i}`,
    }));

    const added = new Map<string, Entity>();
    // 20% overlap + 10% new
    for (let i = 0; i < n * 0.2; i++) {
      added.set(`base-${i}`, { id: `base-${i}`, name: `Modified ${i}` });
    }
    for (let i = 0; i < n * 0.1; i++) {
      added.set(`new-${i}`, { id: `new-${i}`, name: `New ${i}` });
    }

    const iterations = n <= 100 ? 10000 : n <= 1000 ? 1000 : 100;

    const oldTime = benchmark("old", () => deduplicateOld(baseResults, added), iterations);
    const newTime = benchmark("new", () => deduplicateNew(baseResults, added), iterations);

    console.log(
      `  n=${n.toString().padStart(5)}: Old=${oldTime.toFixed(1).padStart(8)}µs, ` +
        `New=${newTime.toFixed(1).padStart(8)}µs → ${formatSpeedup(oldTime, newTime)}`,
    );
  }
  console.log();
}

// Test 2: RegExp Caching
{
  console.log("2. REGEXP CACHING: Compile every time vs Cache");
  console.log("-".repeat(50));

  const topics = Array.from({ length: 100 }, (_, i) => `agent.${i}.status`);
  const patterns = ["agent.*.status", "agent.5*.*", "*.42.*"];

  regexCache.clear();
  const iterations = 50000;

  const oldTime = benchmark(
    "old",
    () => {
      for (const topic of topics) {
        for (const pattern of patterns) {
          matchTopicOld(topic, pattern);
        }
      }
    },
    iterations / 100,
  );

  const newTime = benchmark(
    "new",
    () => {
      for (const topic of topics) {
        for (const pattern of patterns) {
          matchTopicNew(topic, pattern);
        }
      }
    },
    iterations / 100,
  );

  console.log(
    `  100 topics × 3 patterns: Old=${oldTime.toFixed(1).padStart(8)}µs, ` +
      `New=${newTime.toFixed(1).padStart(8)}µs → ${formatSpeedup(oldTime, newTime)}`,
  );
  console.log();
}

// Test 3: Binary Search vs Filter
{
  console.log("3. HISTORY LOOKUP: O(n) filter vs O(log n) binary search");
  console.log("-".repeat(50));

  const sizes = [60, 600, 6000];

  for (const n of sizes) {
    const now = Date.now();
    const snapshots: Snapshot[] = Array.from({ length: n }, (_, i) => ({
      timestamp: now - (n - i) * 1000,
      value: Math.random(),
    }));

    // Query last 10% of history
    const cutoff = now - n * 100;
    const iterations = n <= 60 ? 100000 : n <= 600 ? 10000 : 1000;

    const oldTime = benchmark("old", () => getHistoryOld(snapshots, cutoff), iterations);
    const newTime = benchmark("new", () => getHistoryNew(snapshots, cutoff), iterations);

    console.log(
      `  n=${n.toString().padStart(5)}: Old=${oldTime.toFixed(1).padStart(8)}µs, ` +
        `New=${newTime.toFixed(1).padStart(8)}µs → ${formatSpeedup(oldTime, newTime)}`,
    );
  }
  console.log();
}

// Test 4: Unsubscribe O(n*m) vs O(1)
{
  console.log("4. UNSUBSCRIBE: O(n*m) iteration vs O(1) reverse index");
  console.log("-".repeat(50));

  const topicCounts = [10, 50, 100];
  const subsPerTopic = 20;

  for (const numTopics of topicCounts) {
    // Setup subscriptions
    const subscriptions = new Map<string, Subscription[]>();
    const subscriptionToTopic = new Map<string, string>();
    const allSubIds: string[] = [];

    for (let t = 0; t < numTopics; t++) {
      const topic = `topic-${t}`;
      const subs: Subscription[] = [];
      for (let s = 0; s < subsPerTopic; s++) {
        const sub = { id: `sub-${t}-${s}`, topic };
        subs.push(sub);
        allSubIds.push(sub.id);
        subscriptionToTopic.set(sub.id, topic);
      }
      subscriptions.set(topic, subs);
    }

    // Pick random subscriptions to unsubscribe
    const toUnsubscribe = allSubIds.slice(0, Math.min(100, allSubIds.length));
    const iterations = 1000;

    // Clone for fair comparison
    const subsOld = new Map(Array.from(subscriptions.entries()).map(([k, v]) => [k, [...v]]));
    const subsNew = new Map(Array.from(subscriptions.entries()).map(([k, v]) => [k, [...v]]));
    const indexNew = new Map(subscriptionToTopic);

    const oldTime = benchmark(
      "old",
      () => {
        for (const id of toUnsubscribe) {
          unsubscribeOld(subsOld, id);
        }
      },
      iterations / toUnsubscribe.length,
    );

    const newTime = benchmark(
      "new",
      () => {
        for (const id of toUnsubscribe) {
          unsubscribeNew(subsNew, indexNew, id);
        }
      },
      iterations / toUnsubscribe.length,
    );

    console.log(
      `  ${numTopics} topics × ${subsPerTopic} subs: Old=${oldTime.toFixed(1).padStart(8)}µs, ` +
        `New=${newTime.toFixed(1).padStart(8)}µs → ${formatSpeedup(oldTime, newTime)}`,
    );
  }
  console.log();
}

console.log("=".repeat(70));
console.log("SUMMARY: All optimizations reduce algorithmic complexity");
console.log("=".repeat(70));
