/**
 * Index Tool Schemas
 * Schemas for indexing and graph management tools
 */

import { z } from "zod";

// Default exclude patterns for large codebases
export const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "out/**",
  ".next/**",
  ".nuxt/**",
  "coverage/**",
  ".nyc_output/**",
  "__pycache__/**",
  "*.pyc",
  ".pytest_cache/**",
  "venv/**",
  "env/**",
  ".venv/**",
  ".env/**",
  "vendor/**",
  "target/**",
  ".gradle/**",
  ".idea/**",
  ".vscode/**",
  "**/.memory_bank/**",
  "tmp/**",
  "temp/**",
  "**/tmp/**",
  "**/temp/**",
  "*.log",
  "*.tmp",
  "*.cache",
  "**/*.md",
  "*.zip",
  "*.tar",
  "*.tar.gz",
  "*.tgz",
  "*.gz",
  "*.bz2",
  "*.xz",
  "*.7z",
  "*.rar",
  "*.zst",
  ".DS_Store",
  "Thumbs.db",
];

export const IndexToolSchema = z.object({
  directory: z.string().describe("Directory to index").optional(),
  incremental: z.boolean().describe("Perform incremental indexing").optional().default(false),
  reset: z.boolean().describe("Clear existing graph before indexing").optional().default(false),
  excludePatterns: z.array(z.string()).describe("Patterns to exclude").optional().default(DEFAULT_EXCLUDE_PATTERNS),
  fullScan: z.boolean().optional().default(false),
});

export const CleanIndexSchema = z.object({
  directory: z.string().describe("Directory to index after reset").optional(),
  excludePatterns: z.array(z.string()).describe("Patterns to exclude during indexing").optional().default([]),
  fullScan: z.boolean().optional().default(false),
});

export const GetAgentMetricsSchema = z.object({});
