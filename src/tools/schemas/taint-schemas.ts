import { z } from "zod";

export const TaintAnalysisSchema = z.object({
  projectPath: z.string().optional().describe("Project directory path"),
  category: z
    .enum(["sql_injection", "xss", "command_injection", "path_traversal", "ssrf", "prototype_pollution", "all"])
    .optional()
    .default("all")
    .describe("Vulnerability category to analyze, or 'all' for full scan"),
  maxDepth: z.number().optional().default(15).describe("Maximum path depth for flow tracing"),
  includeTests: z.boolean().optional().default(false).describe("Include test files in analysis"),
  offset: z.number().optional().default(0).describe("Number of vulnerabilities to skip (for pagination)"),
  limit: z.number().optional().default(20).describe("Maximum vulnerabilities to return (max 200)"),
});
