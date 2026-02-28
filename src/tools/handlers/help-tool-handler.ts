/**
 * Help Tool Handler
 *
 * Provides access to documentation and guides about UltraCode.
 * This is a lightweight tool that reads markdown files from the prompts/ directory.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

const GetHelpSchema = z.object({
  topic: z
    .enum(["quick-start", "tool-reference", "workflows", "tracing", "autodoc", "explore", "planning", "modification"])
    .describe("Documentation topic"),
});

type HelpArgs = z.infer<typeof GetHelpSchema>;

export class GetHelpToolHandler extends BaseToolHandler<HelpArgs> {
  protected parseArgs(args: unknown): HelpArgs {
    return GetHelpSchema.parse(args);
  }

  protected async execute(args: HelpArgs): Promise<ToolResult> {
    const { topic } = GetHelpSchema.parse(args);

    try {
      // Resolve path to prompts directory
      // Bundled output is dist/index.js, so one level up = project root
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const projectRoot = join(currentDir, "..");
      const promptsDir = join(projectRoot, "prompts");

      // Map topic to filename
      const filenameMap: Record<string, string> = {
        "quick-start": "quick-start.md",
        "tool-reference": "tool-reference.md",
        workflows: "workflows.md",
        tracing: "tracing-guide.md",
        autodoc: "autodoc-guide.md",
        explore: "explore-guide.md",
        planning: "planning-guide.md",
        modification: "modification-guide.md",
      };

      const filename = filenameMap[topic];
      if (!filename) {
        throw new Error(`Unknown topic: ${topic}`);
      }

      const filepath = join(promptsDir, filename);
      const content = readFileSync(filepath, "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                topic,
                documentation: content,
                message: `📖 ${topic} documentation loaded. Read this guide to understand how to use UltraCode effectively.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Failed to load documentation for topic '${topic}': ${errorMessage}`,
                availableTopics: [
                  "quick-start",
                  "tool-reference",
                  "workflows",
                  "tracing",
                  "autodoc",
                  "explore",
                  "planning",
                  "modification",
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }
}
