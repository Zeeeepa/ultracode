/**
 * Multi-Pass Parser Module
 *
 * Tiered parsing strategy for maximum performance:
 * - Pass 1 (SWC): Fast structural analysis (~1-5ms/file)
 * - Pass 2 (TS API): Full type analysis (always follows, parallel workers)
 */

export * from "./multipass-orchestrator.js";
export * from "./swc-fast-parser.js";
export * from "./types.js";
