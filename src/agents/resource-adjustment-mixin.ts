/**
 * Resource Adjustment Mixin
 *
 * Template Method pattern for resource adjustment logic
 * Eliminates ~70 lines of duplication between dev-agent.ts and semantic-agent.ts
 */

import type { KnowledgeEntry } from "../core/knowledge-bus.js";

export interface ResourceAdjustmentCapable {
  id: string;
  capabilities: {
    maxConcurrency: number;
  };
  adjustConcurrency(newLimit: number): void;
  adjustBatchSize(newMemoryLimit: number): void;
}

export class ResourceAdjustmentMixin {
  protected defaultMaxConcurrency: number = 3;
  protected defaultMemoryLimit: number = 1024;

  /**
   * Handle resource adjustment events from knowledge bus
   * Template method - delegates to concrete implementations
   */
  public handleResourceAdjustment(this: ResourceAdjustmentCapable, entry: KnowledgeEntry): void {
    const data = entry.data as {
      newMemoryLimit?: number;
      newAgentLimit?: number;
    };

    // Adjust concurrency
    if (typeof data.newAgentLimit === "number" && Number.isFinite(data.newAgentLimit)) {
      this.adjustConcurrency(data.newAgentLimit);
    }

    // Adjust batch size
    if (typeof data.newMemoryLimit === "number" && Number.isFinite(data.newMemoryLimit)) {
      this.adjustBatchSize(data.newMemoryLimit);
    }
  }
}

/**
 * Usage in dev-agent.ts:
 *
 * class DevAgent extends BaseAgent implements ResourceAdjustmentCapable {
 *   private resourceMixin = new ResourceAdjustmentMixin();
 *
 *   adjustConcurrency(newLimit: number): void {
 *     const adjusted = Math.max(1, Math.min(this.defaultMaxConcurrency * 2, Math.floor(newLimit)));
 *     if (this.capabilities.maxConcurrency !== adjusted) {
 *       console.log(`[DevAgent ${this.id}] Adjusting concurrency to ${adjusted}`);
 *       this.capabilities.maxConcurrency = adjusted;
 *     }
 *   }
 *
 *   adjustBatchSize(newMemoryLimit: number): void {
 *     const ratio = Math.max(0.5, Math.min(2, newMemoryLimit / this.defaultMemoryLimit));
 *     const newBatchSize = Math.max(10, Math.round(this.defaultBatchSize * ratio));
 *     if (this.indexBatchSize !== newBatchSize) {
 *       console.log(`[DevAgent ${this.id}] Adjusting batch size to ${newBatchSize}`);
 *       this.indexBatchSize = newBatchSize;
 *     }
 *   }
 * }
 */
