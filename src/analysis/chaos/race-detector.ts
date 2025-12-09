/**
 * Race Condition Detector
 *
 * Analyzes state mutations to detect potential race conditions:
 * - Multiple writers without synchronization
 * - Check-then-act patterns
 * - Competing resets
 * - Async boundaries without locks
 */

import type {
  MutationPoint,
  RaceAnalysis,
  RaceConflict,
  RaceRisk,
  RaceRiskFactors,
  StateOperation,
} from "../../types/chaos-analysis.js";
import type { Entity, GraphStorage } from "../../types/storage.js";
import { RelationType } from "../../types/storage.js";

/**
 * Extended entity with optional code content
 */
interface EntityWithCode extends Entity {
  code?: string;
}

/**
 * Known async/problematic browser APIs that appear synchronous but have hidden async behavior
 * or can cause race conditions due to I/O delays
 */
const HIDDEN_ASYNC_APIS = [
  // Storage APIs - synchronous but with I/O delays
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches", // Cache API

  // DOM APIs with async rendering effects
  "requestAnimationFrame",
  "requestIdleCallback",
  "IntersectionObserver",
  "MutationObserver",
  "ResizeObserver",
  "PerformanceObserver",

  // Network/Communication
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "BroadcastChannel",
  "SharedWorker",
  "ServiceWorker",

  // Timers
  "setTimeout",
  "setInterval",
  "queueMicrotask",

  // History API - can trigger events async
  "history.pushState",
  "history.replaceState",

  // Clipboard API
  "navigator.clipboard",

  // Geolocation
  "navigator.geolocation",

  // Media APIs
  "MediaRecorder",
  "RTCPeerConnection",

  // File APIs
  "FileReader",
  "FileWriter",
];

/**
 * Patterns that indicate potential async behavior even without explicit async/await
 */
const ASYNC_BEHAVIOR_PATTERNS = [
  /\.addEventListener\s*\(/,
  /\.on[A-Z]\w+\s*=/,
  /new\s+Promise\s*\(/,
  /\.then\s*\(/,
  /\.catch\s*\(/,
  /\.finally\s*\(/,
  /callback/i,
  /handler/i,
  /listener/i,
  /\.subscribe\s*\(/,
  /\.pipe\s*\(/,
  /rxjs/i,
  /observable/i,
  /subject/i,
  /\$\./, // jQuery async patterns
  /emit/i,
  /dispatch/i,
  /broadcast/i,
];

export class RaceDetector {
  constructor(private storage: GraphStorage) {}

  /**
   * Analyze state operations for race conditions
   */
  async analyzeRaces(stateIdentifier: string, operations: StateOperation[]): Promise<RaceAnalysis> {
    // Separate readers and writers
    const readers = operations.filter((op) => op.operationType === "read" || op.operationType === "check");
    const writers = operations.filter(
      (op) => op.operationType === "write" || op.operationType === "initialize" || op.operationType === "emit",
    );

    // Convert to mutation points with additional analysis
    const mutations = await this.analyzeMutations(writers);

    // Calculate risk factors
    const factors = this.calculateRiskFactors(mutations);

    // Detect specific conflict patterns
    const conflicts = this.detectConflicts(stateIdentifier, mutations, readers);

    // Calculate overall race risk
    const raceRisk = this.calculateRaceRisk(factors, conflicts);

    return {
      stateIdentifier,
      readers: readers.length,
      writers: writers.length,
      asyncWriters: mutations.filter((m) => m.isAsync).length,
      unprotectedWriters: mutations.filter((m) => !m.hasLock).length,
      raceRisk,
      raceReason: this.generateRaceReason(factors, conflicts),
      conflicts,
      mutations,
    };
  }

  /**
   * Convert state operations to detailed mutation points
   */
  private async analyzeMutations(writers: StateOperation[]): Promise<MutationPoint[]> {
    const mutations: MutationPoint[] = [];

    for (const writer of writers) {
      // Analyze the containing entity for async context
      const isAsync = await this.isAsyncContext(writer);
      const hasLock = this.detectLockPattern(writer.code, writer.context);
      const condition = this.extractCondition(writer.context);
      const mutationType = this.classifyMutation(writer);

      mutations.push({
        file: writer.file,
        line: writer.line,
        entityId: writer.entityId,
        entityName: writer.entityName,
        mutationType,
        condition,
        isAsync,
        hasLock,
        code: writer.code,
      });
    }

    return mutations;
  }

  /**
   * Check if operation is in async context
   * Includes detection of hidden async APIs that appear synchronous
   */
  private async isAsyncContext(operation: StateOperation): Promise<boolean> {
    const codeToCheck = `${operation.code}\n${operation.context || ""}`;

    // Check for hidden async APIs (localStorage, etc.)
    for (const api of HIDDEN_ASYNC_APIS) {
      if (codeToCheck.includes(api)) {
        return true;
      }
    }

    // Check for async behavior patterns
    for (const pattern of ASYNC_BEHAVIOR_PATTERNS) {
      if (pattern.test(codeToCheck)) {
        return true;
      }
    }

    // Check explicit async/await/Promise
    if (/async\s|await\s|\.then\(|Promise|setTimeout|setInterval|\.subscribe\(/.test(codeToCheck)) {
      return true;
    }

    if (!operation.entityId) {
      return false;
    }

    try {
      const entity = (await this.storage.getEntity(operation.entityId)) as EntityWithCode | null;
      if (!entity) return false;

      const code = entity.code || "";

      // Check if function is async
      if (/^async\s/.test(code) || /async\s+function/.test(code)) {
        return true;
      }

      // Check for hidden async APIs in full function body
      for (const api of HIDDEN_ASYNC_APIS) {
        if (code.includes(api)) {
          return true;
        }
      }

      // Check for async behavior patterns in full function
      for (const pattern of ASYNC_BEHAVIOR_PATTERNS) {
        if (pattern.test(code)) {
          return true;
        }
      }

      // Check parent for event handler patterns
      const relationships = await this.storage.getRelationshipsForEntity(operation.entityId);
      for (const rel of relationships) {
        if (rel.type === RelationType.CONTAINS) {
          const parent = await this.storage.getEntity(rel.fromId);
          if (parent?.name && /handler|listener|callback|on[A-Z]/i.test(parent.name)) {
            return true;
          }
        }
      }
    } catch {
      // Fallback to code analysis already done above
    }

    return false;
  }

  /**
   * Detect if mutation is protected by lock/mutex pattern
   */
  private detectLockPattern(code: string, context: string): boolean {
    const lockPatterns = [
      /mutex/i,
      /lock\(/i,
      /semaphore/i,
      /synchronized/i,
      /atomic/i,
      /\.lock\(\)/,
      /await\s+.*lock/i,
      /critical\s*section/i,
      /with\s*lock/i,
    ];

    const combined = `${code}\n${context}`;
    return lockPatterns.some((p) => p.test(combined));
  }

  /**
   * Extract guard condition from context
   */
  private extractCondition(context: string): string | undefined {
    // Match if/else conditions
    const ifMatch = context.match(/if\s*\(([^)]+)\)/);
    if (ifMatch?.[1]) {
      return ifMatch[1].trim();
    }

    // Match ternary conditions
    const ternaryMatch = context.match(/([^?]+)\s*\?/);
    if (ternaryMatch?.[1] && ternaryMatch[1].length < 50) {
      return ternaryMatch[1].trim();
    }

    // Match switch case
    const caseMatch = context.match(/case\s+([^:]+):/);
    if (caseMatch?.[1]) {
      return `case ${caseMatch[1].trim()}`;
    }

    return undefined;
  }

  /**
   * Classify mutation type from operation
   */
  private classifyMutation(op: StateOperation): MutationPoint["mutationType"] {
    const code = op.code.toLowerCase();

    // Reset patterns: = null, = undefined, = false, = 0, = '', .clear(), .reset()
    if (/=\s*(null|undefined|false|0|''|""|``)\s*[;,)]/.test(code) || /\.(clear|reset)\(\)/.test(code)) {
      return "reset";
    }

    // Increment/decrement patterns: ++, --, += 1, -= 1
    if (/\+\+|--|\+=\s*1|-=\s*1/.test(code)) {
      return "increment";
    }

    // Toggle patterns: = !state, = !this.state
    if (/=\s*!/.test(code)) {
      return "toggle";
    }

    // Conditional write (inside if block)
    if (op.context && /if\s*\(/.test(op.context)) {
      return "conditional-write";
    }

    return "write";
  }

  /**
   * Calculate risk factors from mutations
   */
  private calculateRiskFactors(mutations: MutationPoint[]): RaceRiskFactors {
    const conditions = mutations.filter((m) => m.condition).map((m) => m.condition!);
    const uniqueConditions = new Set(conditions);

    // Find opposite conditions (e.g., "isReady" vs "!isReady")
    let oppositeConditions = 0;
    for (const cond of uniqueConditions) {
      const negated = cond.startsWith("!") ? cond.slice(1) : `!${cond}`;
      if (uniqueConditions.has(negated)) {
        oppositeConditions++;
      }
    }

    // Count shared conditions (same condition in multiple mutations)
    const conditionCounts = new Map<string, number>();
    for (const cond of conditions) {
      conditionCounts.set(cond, (conditionCounts.get(cond) || 0) + 1);
    }
    const sharedConditions = Array.from(conditionCounts.values()).filter((c) => c > 1).length;

    return {
      writerCount: mutations.length,
      asyncBoundaries: mutations.filter((m) => m.isAsync).length,
      sharedConditions,
      oppositeConditions: oppositeConditions / 2, // Pairs
      hasLocks: mutations.some((m) => m.hasLock),
      resetPoints: mutations.filter((m) => m.mutationType === "reset").length,
    };
  }

  /**
   * Detect specific race conflict patterns
   */
  private detectConflicts(
    stateIdentifier: string,
    mutations: MutationPoint[],
    _readers: StateOperation[],
  ): RaceConflict[] {
    const conflicts: RaceConflict[] = [];

    // 1. Competing resets: multiple places reset the same state
    const resets = mutations.filter((m) => m.mutationType === "reset");
    if (resets.length >= 2) {
      conflicts.push({
        pattern: "competing-resets",
        severity: this.assessConflictSeverity(resets),
        stateIdentifier,
        description: `${resets.length} places reset ${stateIdentifier}`,
        locations: resets,
        explanation: `Multiple functions reset ${stateIdentifier} to initial value. If called concurrently, state may be reset while another function expects it to be set.`,
        suggestion: "Centralize reset logic in a single function or use state machine pattern",
      });
    }

    // 2. Check-then-act: read + conditional write without lock
    const conditionalWrites = mutations.filter((m) => m.mutationType === "conditional-write" && !m.hasLock);
    if (conditionalWrites.length >= 2) {
      // Check if they share conditions
      const conditionGroups = new Map<string, MutationPoint[]>();
      for (const m of conditionalWrites) {
        if (m.condition) {
          const key = m.condition.replace(/\s+/g, "");
          if (!conditionGroups.has(key)) conditionGroups.set(key, []);
          conditionGroups.get(key)!.push(m);
        }
      }

      for (const [condition, group] of conditionGroups) {
        if (group.length >= 2) {
          conflicts.push({
            pattern: "check-then-act",
            severity: "high",
            stateIdentifier,
            description: `${group.length} places check "${condition}" then modify ${stateIdentifier}`,
            locations: group,
            sharedCondition: condition,
            explanation: `Multiple functions check the same condition before modifying state. Between check and act, another function may change the state.`,
            suggestion: "Use atomic compare-and-swap, mutex, or combine into single handler",
          });
        }
      }
    }

    // 3. Async boundary race: async mutations without locks
    const asyncMutations = mutations.filter((m) => m.isAsync && !m.hasLock);
    if (asyncMutations.length >= 2) {
      conflicts.push({
        pattern: "async-boundary",
        severity: "high",
        stateIdentifier,
        description: `${asyncMutations.length} async operations modify ${stateIdentifier} without synchronization`,
        locations: asyncMutations,
        explanation: `Async operations can interleave unpredictably. One operation may overwrite changes from another.`,
        suggestion: "Add mutex/lock or use queue-based state updates",
      });
    }

    // 4. Competing mutations with opposite conditions
    const oppositeGroups = this.findOppositeConditionGroups(mutations);
    for (const group of oppositeGroups) {
      conflicts.push({
        pattern: "competing-mutations",
        severity: "critical",
        stateIdentifier,
        description: `Functions with opposite conditions both modify ${stateIdentifier}`,
        locations: group,
        explanation: `Functions checking opposite conditions (e.g., "if (x)" vs "if (!x)") both modify the state. This is a classic race condition pattern where both may execute simultaneously.`,
        suggestion: "Merge into single handler with exclusive logic, or add explicit synchronization",
      });
    }

    // 5. Event handler race: multiple handlers for same event type
    const handlerMutations = mutations.filter((m) => /handler|listener|on[A-Z]|callback/i.test(m.entityName));
    if (handlerMutations.length >= 2) {
      conflicts.push({
        pattern: "event-handler-race",
        severity: "medium",
        stateIdentifier,
        description: `${handlerMutations.length} event handlers modify ${stateIdentifier}`,
        locations: handlerMutations,
        explanation: `Multiple event handlers modify shared state. Event ordering may vary, causing unpredictable state.`,
        suggestion: "Consolidate handlers or use event queue with single consumer",
      });
    }

    return conflicts;
  }

  /**
   * Find groups of mutations with opposite conditions
   */
  private findOppositeConditionGroups(mutations: MutationPoint[]): MutationPoint[][] {
    const groups: MutationPoint[][] = [];
    const processed = new Set<number>();

    for (let i = 0; i < mutations.length; i++) {
      const mutationI = mutations[i];
      if (processed.has(i) || !mutationI || !mutationI.condition) continue;

      const cond = mutationI.condition;
      const normalizedCond = cond.replace(/\s+/g, "");
      const negatedCond = cond.startsWith("!") ? cond.slice(1).replace(/\s+/g, "") : `!${normalizedCond}`;

      const opposites: MutationPoint[] = [mutationI];
      processed.add(i);

      for (let j = i + 1; j < mutations.length; j++) {
        const mutationJ = mutations[j];
        if (processed.has(j) || !mutationJ || !mutationJ.condition) continue;

        const otherCond = mutationJ.condition.replace(/\s+/g, "");
        if (otherCond === negatedCond || `!${otherCond}` === normalizedCond) {
          opposites.push(mutationJ);
          processed.add(j);
        }
      }

      if (opposites.length >= 2) {
        groups.push(opposites);
      }
    }

    return groups;
  }

  /**
   * Assess severity of a conflict based on mutations
   */
  private assessConflictSeverity(mutations: MutationPoint[]): RaceRisk {
    const hasAsync = mutations.some((m) => m.isAsync);
    const allUnprotected = mutations.every((m) => !m.hasLock);
    const count = mutations.length;

    if (hasAsync && allUnprotected && count >= 3) return "critical";
    if (hasAsync && allUnprotected) return "high";
    if (count >= 3 && allUnprotected) return "high";
    if (count >= 2 && allUnprotected) return "medium";
    return "low";
  }

  /**
   * Calculate overall race risk from factors and conflicts
   */
  private calculateRaceRisk(factors: RaceRiskFactors, conflicts: RaceConflict[]): RaceRisk {
    // Start with writer count baseline
    let risk: RaceRisk = "none";

    if (factors.writerCount === 1) {
      return "none"; // Single writer is safe
    }

    if (factors.writerCount >= 2) {
      risk = "low";
    }

    // Escalate based on factors
    if (factors.asyncBoundaries >= 2 && !factors.hasLocks) {
      risk = "high";
    }

    if (factors.oppositeConditions >= 1) {
      risk = "high";
    }

    if (factors.resetPoints >= 2 && factors.asyncBoundaries >= 1) {
      risk = "critical";
    }

    // Override with conflict severity if higher
    for (const conflict of conflicts) {
      if (this.riskLevel(conflict.severity) > this.riskLevel(risk)) {
        risk = conflict.severity;
      }
    }

    return risk;
  }

  /**
   * Convert risk to numeric level for comparison
   */
  private riskLevel(risk: RaceRisk): number {
    const levels: Record<RaceRisk, number> = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return levels[risk];
  }

  /**
   * Generate human-readable race reason
   */
  private generateRaceReason(factors: RaceRiskFactors, conflicts: RaceConflict[]): string | undefined {
    if (factors.writerCount <= 1) {
      return undefined;
    }

    const parts: string[] = [];

    parts.push(`${factors.writerCount} writers`);

    if (factors.asyncBoundaries > 0) {
      parts.push(`${factors.asyncBoundaries} async`);
    }

    if (!factors.hasLocks && factors.writerCount >= 2) {
      parts.push("no sync");
    }

    if (conflicts.length > 0) {
      const patterns = [...new Set(conflicts.map((c) => c.pattern))];
      parts.push(`patterns: ${patterns.join(", ")}`);
    }

    return parts.join(", ");
  }
}
