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

export class KnowledgeBus extends EventEmitter {
  private knowledge: Map<string, KnowledgeEntry[]> = new Map();
  private subscriptions: Map<string, Subscription[]> = new Map();
  private messageQueue: AgentMessage[] = [];
  private maxQueueSize = 1000;
  private maxKnowledgePerTopic = 100;

  // Bloom filter for O(1) topic existence check
  private topicBloom = new BloomFilter(1024);

  // RegExp cache for O(1) pattern matching instead of compiling on each call
  private regexCache = new Map<string, RegExp>();

  // Reverse index for O(1) unsubscribe: subscriptionId -> topicKey
  private subscriptionToTopic = new Map<string, string>();

  constructor() {
    super();
    // Event-driven: cleanup happens lazily on query(), not via polling
  }

  /**
   * Dispose of the knowledge bus and clear resources
   */
  dispose(): void {
    this.knowledge.clear();
    this.subscriptions.clear();
    this.messageQueue.length = 0;
    this.topicBloom.clear();
    this.regexCache.clear();
    this.subscriptionToTopic.clear();
    this.removeAllListeners();
  }

  /**
   * Publish knowledge to a topic
   */
  publish(topic: string, data: unknown, source: string, ttl?: number): void {
    const entry: KnowledgeEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      topic,
      data,
      source,
      timestamp: Date.now(),
      ttl,
    };

    // Add topic to bloom filter for fast existence check
    this.topicBloom.add(topic);

    // Store knowledge
    let entries = this.knowledge.get(topic);
    if (!entries) {
      entries = [];
      this.knowledge.set(topic, entries);
    }
    entries.push(entry);

    // Limit entries per topic
    if (entries.length > this.maxKnowledgePerTopic) {
      entries.shift(); // Remove oldest
    }

    // Debug logging for index:completed event
    if (topic === "index:completed") {
      const subs = this.subscriptions.get(topic) || [];
      log.i("KNOWLEDGEBUS", "index_completed_publish", { source, subsCount: subs.length });
    }

    // Notify subscribers (fire-and-forget but log errors)
    this.notifySubscribers(entry).catch((error) => {
      log.e("KNOWLEDGEBUS", "notify_fail", { topic, err: String(error) });
    });

    this.emit("knowledge:published", entry);
  }

  /**
   * Subscribe to knowledge updates
   */
  subscribe(agentId: string, topic: string | RegExp, handler: (entry: KnowledgeEntry) => void | Promise<void>): string {
    const subscription: Subscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      topic,
      handler,
    };

    const topicKey = topic instanceof RegExp ? "*" : topic;

    let subs = this.subscriptions.get(topicKey);
    if (!subs) {
      subs = [];
      this.subscriptions.set(topicKey, subs);
    }
    subs.push(subscription);

    // Track subscription location for O(1) unsubscribe
    this.subscriptionToTopic.set(subscription.id, topicKey);

    this.emit("subscription:created", subscription);

    return subscription.id;
  }

  /**
   * Unsubscribe from knowledge updates
   * O(1) lookup via reverse index instead of O(n*m) iteration
   */
  unsubscribe(subscriptionId: string): void {
    const topicKey = this.subscriptionToTopic.get(subscriptionId);
    if (!topicKey) return;

    const subs = this.subscriptions.get(topicKey);
    if (subs) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        this.emit("subscription:removed", subscriptionId);
      }
    }

    this.subscriptionToTopic.delete(subscriptionId);
  }

  /**
   * Query existing knowledge
   * Event-driven: lazy cleanup of expired entries on access
   */
  query(topic: string | RegExp, limit = 10): KnowledgeEntry[] {
    // Fast path: exact string topic that's definitely not in bloom filter
    if (typeof topic === "string" && !topic.includes("*")) {
      if (!this.topicBloom.mightContain(topic)) {
        return []; // Definitely no such topic
      }
    }

    const results: KnowledgeEntry[] = [];
    const now = Date.now();

    for (const [storedTopic, entries] of this.knowledge) {
      if (this.matchesTopic(storedTopic, topic)) {
        // Lazy cleanup: filter out expired entries
        const validEntries = entries.filter((entry) => {
          if (entry.ttl && now - entry.timestamp > entry.ttl) {
            return false; // Expired
          }
          return true;
        });

        // Update stored entries if any were expired
        if (validEntries.length !== entries.length) {
          if (validEntries.length === 0) {
            this.knowledge.delete(storedTopic);
          } else {
            this.knowledge.set(storedTopic, validEntries);
          }
        }

        results.push(...validEntries);
      }
    }

    // Sort by timestamp descending and limit
    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Send a direct message between agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }

    this.messageQueue.push(message);
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
    return this.messageQueue.slice(-limit);
  }

  /**
   * Clear knowledge for a specific topic
   */
  clearTopic(topic: string): void {
    this.knowledge.delete(topic);
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
    let entryCount = 0;
    let subscriptionCount = 0;

    for (const entries of this.knowledge.values()) {
      entryCount += entries.length;
    }

    for (const subs of this.subscriptions.values()) {
      subscriptionCount += subs.length;
    }

    return {
      topicCount: this.knowledge.size,
      entryCount,
      subscriptionCount,
      messageQueueSize: this.messageQueue.length,
    };
  }

  /**
   * Reset bloom filter and rebuild from current topics
   * Use when too many false positives accumulate (after many deletions)
   */
  resetBloomFilter(): void {
    this.topicBloom.clear();
    for (const topic of this.knowledge.keys()) {
      this.topicBloom.add(topic);
    }
  }

  // Private methods

  /**
   * Get or create cached RegExp for wildcard pattern
   * O(1) amortized instead of O(pattern) on every call
   */
  private getOrCreateRegex(pattern: string): RegExp {
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      this.regexCache.set(pattern, regex);
    }
    return regex;
  }

  private matchesTopic(storedTopic: string, pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      // Support wildcards in string patterns
      if (pattern.includes("*")) {
        return this.getOrCreateRegex(pattern).test(storedTopic);
      }
      return storedTopic === pattern;
    }
    return pattern.test(storedTopic);
  }

  private async notifySubscribers(entry: KnowledgeEntry): Promise<void> {
    // Notify exact topic subscribers
    const exactSubs = this.subscriptions.get(entry.topic) || [];

    // Debug logging for semantic events
    if (entry.topic === "semantic:new_entities") {
      log.d("KNOWLEDGEBUS", "semantic_event", { topic: entry.topic, subs: exactSubs.length });
      log.d("KNOWLEDGEBUS", "sub_keys", { keys: Array.from(this.subscriptions.keys()).join(",") });
      for (const sub of exactSubs) {
        log.d("KNOWLEDGEBUS", "subscriber", { agent: sub.agentId, id: sub.id });
      }
    }

    // Execute handlers sequentially to ensure proper error handling
    for (const sub of exactSubs) {
      await this.callHandler(sub, entry);
    }

    // Notify wildcard/regex subscribers
    const wildcardSubs = this.subscriptions.get("*") || [];
    for (const sub of wildcardSubs) {
      if (this.matchesTopic(entry.topic, sub.topic)) {
        await this.callHandler(sub, entry);
      }
    }
  }

  private async callHandler(subscription: Subscription, entry: KnowledgeEntry): Promise<void> {
    try {
      await subscription.handler(entry);
    } catch (error) {
      log.e("KNOWLEDGEBUS", "handler_error", { agent: subscription.agentId, err: String(error) });
      this.emit("subscription:error", { subscription, error });
    }
  }

  // Event-driven: cleanup happens lazily in query() method
  // No polling loop needed - expired entries filtered on access
}

// Singleton instance
export const knowledgeBus = new KnowledgeBus();
