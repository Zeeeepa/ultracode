/**
 * Multi-Pass Parser Module
 *
 * Tiered parsing strategy for maximum performance:
 * - Pass 1 (OXC): Fast structural analysis (~0.5-2ms/file, 2x faster than SWC)
 * - Pass 2 (TS API): Full type analysis (always follows, parallel workers)
 */

export * from "./multipass-orchestrator.js";
export * from "./oxc-fast-parser.js";
export * from "./types.js";
