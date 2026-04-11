/**
 * Schemas for tools ported from Zig that were missing in TS.
 * Synced with ultracode.zig/src/tools/registry.zig parameter definitions.
 */

import { z } from "zod";

// =============================================================================
// grep_index — Trigram-accelerated text search
// =============================================================================

export const GrepIndexSchema = z.object({
  pattern: z.string().describe("Search pattern (text or regex)"),
  is_regex: z.boolean().optional().default(false).describe("Treat pattern as regex"),
  file_pattern: z.string().optional().describe("Glob filter for file paths (e.g. '*.ts', 'src/**/*.zig')"),
  case_insensitive: z.boolean().optional().default(false).describe("Case-insensitive search"),
  context_lines: z.number().optional().default(2).describe("Lines of context before/after match"),
  max_results: z.number().optional().default(100).describe("Maximum matches to return"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// batch_modify — Mass-modify entities
// =============================================================================

export const BatchModifySchema = z.object({
  action: z.enum(["rename", "replace", "remove", "wrap"]).describe("Action: rename, replace, remove, wrap"),
  pattern: z.string().optional().describe("Text/pattern to find in matched entities"),
  replacement: z.string().optional().describe("Replacement text"),
  preview: z.boolean().optional().default(true).describe("Preview mode (dry-run). Set false to execute"),
  apply: z.boolean().optional().describe("Execute changes (opposite of preview)"),
  max_changes: z.number().optional().default(100).describe("Maximum entities to modify"),
  where: z
    .object({
      entity_type: z.string().optional().describe("Filter by type: function, method, class, interface"),
      name_matches: z.string().optional().describe("Filter by name substring or glob"),
      file_pattern: z.string().optional().describe("Filter by file path glob"),
      is_exported: z.boolean().optional().describe("Filter exported/public only"),
      is_async: z.boolean().optional().describe("Filter async only"),
      min_complexity: z.number().optional().describe("Minimum complexity threshold"),
      semantic: z.string().optional().describe("Natural language query for filtering"),
    })
    .optional()
    .describe("Filter conditions"),
  semantic: z.string().optional().describe("Shorthand: same as where.semantic"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// batch_rename — Mass-rename symbols
// =============================================================================

export const BatchRenameSchema = z.object({
  find: z.string().describe("Symbol name or pattern to find"),
  replace: z.string().describe("New name"),
  preview: z.boolean().optional().default(true).describe("Preview mode (default true)"),
  apply: z.boolean().optional().describe("Set true to execute"),
  where: z
    .object({
      entity_type: z.string().optional().describe("Filter by type"),
      file_pattern: z.string().optional().describe("Filter by file path glob"),
      semantic: z.string().optional().describe("Natural language filter"),
    })
    .optional()
    .describe("Additional filters"),
  semantic: z.string().optional().describe("Shorthand: same as where.semantic"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// security_scan — Vulnerability scanning
// =============================================================================

export const SecurityScanSchema = z.object({
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// get_review_context — PR review context
// =============================================================================

export const GetReviewContextSchema = z.object({
  changed_files: z.array(z.string()).describe("Array of changed file paths to analyze"),
  max_depth: z.number().optional().default(3).describe("Maximum dependency depth"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// detect_architecture_layers — Layer classification
// =============================================================================

export const DetectArchitectureLayersSchema = z.object({
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// generate_onboarding — Project tour
// =============================================================================

export const GenerateOnboardingSchema = z.object({
  max_steps: z.number().optional().default(15).describe("Maximum tour steps (default 15, max 50)"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// autodoc_batch_generate — Batch doc generation
// =============================================================================

export const AutoDocBatchGenerateSchema = z.object({
  force: z.boolean().optional().default(false).describe("Force regeneration of all directories"),
  enrich: z.boolean().optional().default(false).describe("Rewrite docs with LLM (background)"),
  target: z.string().optional().describe("Target directory path (e.g. src/tools) or entity_id"),
  projectPath: z.string().optional().describe("Project path"),
});

// =============================================================================
// setup_embedding — Configure embedding inference
// =============================================================================

export const SetupEmbeddingSchema = z.object({
  model_id: z
    .string()
    .optional()
    .default("multilingual-e5-small")
    .describe(
      "Model ID: multilingual-e5-small, bge-small-en-v1.5, bge-micro-v2, snowflake-arctic-embed-xs, all-MiniLM-L6-v2, nomic-embed-text-v1.5",
    ),
  quantization: z.enum(["fp32", "fp16", "int8"]).optional().default("int8").describe("Quantization"),
  download: z.boolean().optional().default(true).describe("Download model if not cached"),
});
