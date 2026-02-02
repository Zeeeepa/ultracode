/**
 * Validation Tool Schemas
 * Schemas for code validation and technology detection
 */

import { z } from "zod";

export const ValidateFileSchema = z.object({
  filePath: z.string().describe("Path to file to validate"),
  projectPath: z.string().optional().describe("Project root path (defaults to file directory)"),
  validators: z.array(z.string()).optional().describe("Validators to use (oxlint, tsc, pylint, etc.)"),
  fixable: z.boolean().optional().default(false).describe("Apply automatic fixes where possible (biome/oxlint --fix)"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Show what would be fixed without applying changes (dry-run mode)"),
});

export const ValidateDirectorySchema = z.object({
  directory: z.string().optional().describe("Directory to validate (defaults to project root)"),
  projectPath: z.string().optional().describe("Project root path"),
  validators: z.array(z.string()).optional().describe("Validators to use"),
  extensions: z.array(z.string()).optional().describe("File extensions to validate (.ts, .js, .py, etc.)"),
  maxFiles: z.number().optional().default(100).describe("Maximum files to validate"),
  parallel: z.boolean().optional().default(true).describe("Validate files in parallel"),
  fixable: z.boolean().optional().default(false).describe("Apply automatic fixes where possible"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Show what would be fixed without applying changes (dry-run mode)"),
});

export const DetectTechnologyStackSchema = z.object({
  generateContext: z.boolean().optional().default(false).describe("Generate tech context string for embeddings"),
});
