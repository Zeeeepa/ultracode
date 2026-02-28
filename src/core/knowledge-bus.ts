/**
 * Knowledge Sharing Bus for inter-agent communication
 * Implements pub/sub pattern with topic-based routing
 */

import { EventEmitter } from "node:events";
import { log } from "../logging/index.js";
import type { AgentMessage } from "../types/agent.js";
import { BloomFilter } from "../utils/bloom-filter.js";

// Event-driven architecture: lazy cleanup on access, no polling loops

export interface KnowledgeEntry {
  id: string;
  topic: string;
  data: unknown;
  source: string;
  timestamp: number;
  ttl?: number | undefined; // Time to live in milliseconds
}

export interface Subscription {
  id: string;
  agentId: string;
  topic: string | RegExp;
  handler: (entry: KnowledgeEntry) => void | Promise<void>;
}

/** Atomic counter for generating unique IDs without relying on Math.random collisions */
let idSequence = 0;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${(++idSequence).toString(36)}`;
}

export class KnowledgeBus extends EventEmitter {
  private topicStore = new Map<string, KnowledgeEntry[]>();
  private handlersByTopic = new Map<string, Subscription[]>();
  private msgQueue: AgentMessage[] = [];
  private readonly queueCap = 1000;
  private readonly entryCap = 100;

  // Bloom filter for O(1) topic existence check
  private bloom = new BloomFilter(1024);

  // RegExp cache for O(1) pattern matching instead of compiling on each call
  private patternCache = new Map<string, RegExp>();

  // Reverse index for O(1) unsubscribe: subscriptionId -> topicKey
  private subIdToKey = new Map<string, string>();

  constructor() {
    super();
    // Event-driven: cleanup happens lazily on query(), not via polling
  }

  /**
   * Dispose of the knowledge bus and clear resources
   */
  dispose(): void {
    this.topicStore.clear();
    this.handlersByTopic.clear();
    this.msgQueue.length = 0;
    this.bloom.clear();
    this.patternCache.clear();
    this.subIdToKey.clear();
    this.removeAllListeners();
  }

  /**
   * Publish knowledge to a topic
   */
  publish(topic: string, data: unknown, source: string, ttl?: number): void {
    const entry: KnowledgeEntry = {
      id: generateId("ke"),
      topic,
      data,
      source,
      timestamp: Date.now(),
      ttl,
    };

    // Add topic to bloom filter for fast existence check
    this.bloom.add(topic);

    // Store knowledge, evicting oldest if over capacity
    let bucket = this.topicStore.get(topic);
    if (!bucket) {
      bucket = [];
      this.topicStore.set(topic, bucket);
    }
    bucket.push(entry);

    // Limit entries per topic
    while (bucket.length > this.entryCap) {
      bucket.shift();
    }

    // Debug logging for index:completed event
    if (topic === "index:completed") {
      const handlers = this.handlersByTopic.get(topic);
      log.i("KNOWLEDGEBUS", "index_completed_publish", { source, subsCount: handlers ? handlers.length : 0 });
    }

    // Notify subscribers (fire-and-forget but log errors)
    this.dispatchToSubscribers(entry).catch((err) => {
      log.e("KNOWLEDGEBUS", "notify_fail", { topic, err: String(err) });
    });

    this.emit("knowledge:published", entry);
  }

  /**
   * Subscribe to knowledge updates
   */
  subscribe(agentId: string, topic: string | RegExp, handler: (entry: KnowledgeEntry) => void | Promise<void>): string {
    const sub: Subscription = {
      id: generateId("sub"),
      agentId,
      topic,
      handler,
    };

    const key = topic instanceof RegExp ? "*" : topic;

    let list = this.handlersByTopic.get(key);
    if (!list) {
      list = [];
      this.handlersByTopic.set(key, list);
    }
    list.push(sub);

    // Track subscription location for O(1) unsubscribe
    this.subIdToKey.set(sub.id, key);

    this.emit("subscription:created", sub);

    return sub.id;
  }

  /**
   * Unsubscribe from knowledge updates
   * O(1) lookup via reverse index instead of O(n*m) iteration
   */
  unsubscribe(subscriptionId: string): void {
    const key = this.subIdToKey.get(subscriptionId);
    if (!key) return;

    const list = this.handlersByTopic.get(key);
    if (list) {
      const idx = list.findIndex((s) => s.id === subscriptionId);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.emit("subscription:removed", subscriptionId);
      }
    }

    this.subIdToKey.delete(subscriptionId);
  }

  /**
   * Query existing knowledge
   * Event-driven: lazy cleanup of expired entries on access
   */
  query(topic: string | RegExp, limit = 10): KnowledgeEntry[] {
    // Fast path: exact string topic that's definitely not in bloom filter
    if (typeof topic === "string" && !topic.includes("*")) {
      if (!this.bloom.mightContain(topic)) {
        return []; // Definitely no such topic
      }
    }

    const collected: KnowledgeEntry[] = [];
    const now = Date.now();

    for (const [storedTopic, bucket] of this.topicStore) {
      if (!this.topicMatches(storedTopic, topic)) continue;

      // Lazy cleanup: partition into live and expired
      let pruned = false;
      let writeIdx = 0;
      for (let readIdx = 0; readIdx < bucket.length; readIdx++) {
        const entry = bucket[readIdx]!;
        if (entry.ttl && now - entry.timestamp > entry.ttl) {
          pruned = true;
          continue; // Skip expired
        }
        if (writeIdx !== readIdx) {
          bucket[writeIdx] = entry;
        }
        collected.push(entry);
        writeIdx++;
      }

      if (pruned) {
        bucket.length = writeIdx;
        if (writeIdx === 0) {
          this.topicStore.delete(storedTopic);
        }
      }
    }

    // Sort by timestamp descending and limit
    collected.sort((a, b) => b.timestamp - a.timestamp);
    return collected.length > limit ? collected.slice(0, limit) : collected;
  }

  /**
   * Send a direct message between agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    if (this.msgQueue.length >= this.queueCap) {
      this.msgQueue.shift(); // Remove oldest message
    }

    this.msgQueue.push(message);
    this.emit("message:sent", message);

    // If it's a broadcast, publish to knowledge bus
    if (message.to === "*") {
      this.publish(`message:${message.type}`, message.payload, message.from);
    }
  }

  /**
   * Get recent messages
   */
  getRecentMessages(limit = 10): AgentMessage[] {
    return this.msgQueue.slice(-limit);
  }

  /**
   * Clear knowledge for a specific topic
   */
  clearTopic(topic: string): void {
    this.topicStore.delete(topic);
    this.emit("topic:cleared", topic);
  }

  /**
   * Get statistics about the knowledge bus
   */
  getStats(): {
    topicCount: number;
    entryCount: number;
    subscriptionCount: number;
    messageQueueSize: number;
  } {
    let totalEntries = 0;
    let totalSubs = 0;

    for (const bucket of this.topicStore.values()) {
      totalEntries += bucket.length;
    }

    for (const list of this.handlersByTopic.values()) {
      totalSubs += list.length;
    }

    return {
      topicCount: this.topicStore.size,
      entryCount: totalEntries,
      subscriptionCount: totalSubs,
      messageQueueSize: this.msgQueue.length,
    };
  }

  /**
   * Reset bloom filter and rebuild from current topics
   * Use when too many false positives accumulate (after many deletions)
   */
  resetBloomFilter(): void {
    this.bloom.clear();
    for (const t of this.topicStore.keys()) {
      this.bloom.add(t);
    }
  }

  // Private methods

  /**
   * Get or create cached RegExp for wildcard pattern
   * O(1) amortized instead of O(pattern) on every call
   */
  private compileWildcard(pattern: string): RegExp {
    let compiled = this.patternCache.get(pattern);
    if (!compiled) {
      compiled = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      this.patternCache.set(pattern, compiled);
    }
    return compiled;
  }

  private topicMatches(storedTopic: string, pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      if (pattern.includes("*")) {
        return this.compileWildcard(pattern).test(storedTopic);
      }
      return storedTopic === pattern;
    }
    return pattern.test(storedTopic);
  }

  private async dispatchToSubscribers(entry: KnowledgeEntry): Promise<void> {
    // Notify exact topic subscribers
    const direct = this.handlersByTopic.get(entry.topic) || [];

    // Debug logging for semantic events
    if (entry.topic === "semantic:new_entities") {
      log.d("KNOWLEDGEBUS", "semantic_event", { topic: entry.topic, subs: direct.length });
      log.d("KNOWLEDGEBUS", "sub_keys", { keys: Array.from(this.handlersByTopic.keys()).join(",") });
      for (const s of direct) {
        log.d("KNOWLEDGEBUS", "subscriber", { agent: s.agentId, id: s.id });
      }
    }

    // Execute handlers sequentially to ensure proper error handling
    for (const sub of direct) {
      await this.invokeHandler(sub, entry);
    }

    // Notify wildcard/regex subscribers
    const wildcardList = this.handlersByTopic.get("*") || [];
    for (const sub of wildcardList) {
      if (this.topicMatches(entry.topic, sub.topic)) {
        await this.invokeHandler(sub, entry);
      }
    }
  }

  private async invokeHandler(sub: Subscription, entry: KnowledgeEntry): Promise<void> {
    try {
      await sub.handler(entry);
    } catch (err) {
      log.e("KNOWLEDGEBUS", "handler_error", { agent: sub.agentId, err: String(err) });
      this.emit("subscription:error", { subscription: sub, error: err });
    }
  }

  // Event-driven: cleanup happens lazily in query() method
  // No polling loop needed - expired entries filtered on access
}

// Singleton instance
export const knowledgeBus = new KnowledgeBus();
