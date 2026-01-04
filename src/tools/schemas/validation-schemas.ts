/**
 * Validation Tool Schemas
 * Schemas for code validation and technology detection
 */

import { z } from "zod";

export const ValidateFileSchema = z.object({
  filePath: z.string().describe("File to validate"),
  linter: z.string().optional().describe("Specific linter to use (auto-detect if not specified): eslint, pylint"),
});

export const ValidateDirectorySchema = z.object({
  dirPath: z.string().describe("Directory to validate"),
  extensions: z.array(z.string()).optional().describe("File extensions to validate (e.g., ['.ts', '.js', '.py'])"),
  recursive: z.boolean().optional().default(true).describe("Recursively validate subdirectories"),
});

export const DetectTechnologyStackSchema = z.object({
  generateContext: z.boolean().optional().default(false).describe("Generate tech context string for embeddings"),
});
