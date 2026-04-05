/**
 * Hypothesis Inference Types — Zig-compatible
 *
 * Hypotheses represent inferred runtime relationships that static AST analysis
 * cannot detect: event emitters, callbacks, interface dispatch, proximity.
 *
 * Ported from ultracode.zig/src/hypothesis/hypothesis.zig
 */

// =============================================================================
// ENUMS
// =============================================================================

export enum HypothesisType {
  StringKeyMatch = "string_key_match",
  CallbackArgument = "callback_argument",
  InterfaceNarrowing = "interface_narrowing",
  ProximityBridge = "proximity_bridge",
  FrameworkConvention = "framework_convention",
}

// =============================================================================
// DATA TYPES
// =============================================================================

export interface Hypothesis {
  id: string;
  fromId: string;
  toId: string;
  hypothesisType: HypothesisType;
  confidence: number; // 0.0–1.0
  relType: string;
  evidence: string;
  strategy: string;
}

/** Lightweight reference for PathStep (no string ownership) */
export interface HypothesisRef {
  confidence: number;
  marker: string; // "?" (≥0.4) or "??" (<0.4)
  evidence: string;
  type: HypothesisType;
}

// =============================================================================
// HYPOTHESIS STORE — In-memory 3-index lookup
// =============================================================================

const CONFIDENCE_THRESHOLD = 0.4;

export class HypothesisStore {
  /** entity_id → outgoing hypotheses */
  private bySource = new Map<string, Hypothesis[]>();
  /** entity_id → incoming hypotheses */
  private byTarget = new Map<string, Hypothesis[]>();
  /** "from\0to" → best hypothesis (highest confidence) */
  private byPair = new Map<string, Hypothesis>();
  /** Flat list for iteration */
  private all: Hypothesis[] = [];

  /** Add hypothesis. Deduplicates by pair — keeps highest confidence. */
  add(h: Hypothesis): void {
    const pairKey = `${h.fromId}\0${h.toId}`;
    const existing = this.byPair.get(pairKey);
    if (existing && existing.confidence >= h.confidence) return;

    this.byPair.set(pairKey, h);
    this.all.push(h);

    const srcList = this.bySource.get(h.fromId);
    if (srcList) srcList.push(h);
    else this.bySource.set(h.fromId, [h]);

    const tgtList = this.byTarget.get(h.toId);
    if (tgtList) tgtList.push(h);
    else this.byTarget.set(h.toId, [h]);
  }

  /** O(1) lookup: best hypothesis bridging from → to */
  getBridge(fromId: string, toId: string): Hypothesis | null {
    return this.byPair.get(`${fromId}\0${toId}`) ?? null;
  }

  /** All outgoing hypotheses from entity */
  getFromSource(id: string): Hypothesis[] {
    return this.bySource.get(id) ?? [];
  }

  /** All incoming hypotheses to entity */
  getToTarget(id: string): Hypothesis[] {
    return this.byTarget.get(id) ?? [];
  }

  count(): number {
    return this.byPair.size;
  }

  getAll(): Hypothesis[] {
    return this.all;
  }

  clear(): void {
    this.bySource.clear();
    this.byTarget.clear();
    this.byPair.clear();
    this.all = [];
  }

  /** Create lightweight reference for PathStep */
  toRef(h: Hypothesis): HypothesisRef {
    return {
      confidence: h.confidence,
      marker: h.confidence >= CONFIDENCE_THRESHOLD ? "?" : "??",
      evidence: h.evidence,
      type: h.hypothesisType,
    };
  }

  /** Static helper: confidence marker */
  static confidenceMarker(confidence: number): string {
    return confidence >= CONFIDENCE_THRESHOLD ? "?" : "??";
  }

  /** Confidence bar: ▪▪▪▪ / ▪▪▪░ / ▪▪░░ / ▪░░░ */
  static confidenceBar(confidence: number): string {
    const filled = Math.round(confidence * 4);
    return "▪".repeat(filled) + "░".repeat(4 - filled);
  }
}
