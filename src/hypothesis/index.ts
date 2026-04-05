/**
 * Hypothesis Inference Module — Public API
 *
 * Provides 4-tier runtime relationship inference for code that
 * static AST analysis cannot connect (events, callbacks, interface dispatch).
 */

export { type BridgePath, type BridgeStep, findPathWithHypotheses } from "./bridge.js";
export { CALLBACK_ENTRIES, REGISTER_DISPATCH_PAIRS } from "./catalogs.js";
export { type GenerateResult, generateHypotheses, getHypothesisStore, loadCachedHypotheses } from "./engine.js";
export { clearHypotheses, countHypotheses } from "./hypothesis-ops.js";
export { type Hypothesis, type HypothesisRef, HypothesisStore, HypothesisType } from "./types.js";
