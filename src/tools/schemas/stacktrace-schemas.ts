/**
 * Zod Schema for analyze_stacktrace tool
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";

export const AnalyzeStacktraceSchema = z.object({
  stacktrace: z.string().min(10).describe("Full stacktrace text (error message + frames)"),
  language: z
    .enum(["javascript", "python", "java", "csharp", "go", "rust", "c/c++", "zig"])
    .optional()
    .describe("Language hint for parser selection. Auto-detected if omitted."),
  depth: z.number().optional().default(10).describe("Max depth for backwards trace analysis"),
  includeImpactAnalysis: z.boolean().optional().default(true).describe("Run impact analysis on crash entity"),
  includeBackwardsTrace: z.boolean().optional().default(true).describe("Run backwards trace from crash point"),
  format: z
    .enum(["text", "json", "mermaid"])
    .optional()
    .default("text")
    .describe("Output format: text (human-readable), json (structured), mermaid (diagram)"),
  projectPath: projectPathParam,
});
