/**
 * Get Tools For Task Handler
 *
 * Recommends relevant tools based on task description.
 * Uses keyword matching and agent tags to find the best tools.
 */

import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { getToolsList } from "../tool-definitions.js";

const GetToolsForTaskSchema = z.object({
  task: z.string().describe("Description of what you want to do (e.g. 'find duplicates', 'refactor safely')"),
  agentType: z
    .enum(["explore", "plan", "modify", "analyze", "any"])
    .optional()
    .describe("Your agent type for filtered recommendations"),
});

type GetToolsForTaskArgs = z.infer<typeof GetToolsForTaskSchema>;

interface ToolMatch {
  name: string;
  description: string;
  tags: string[];
  score: number;
  reason: string;
}

export class GetToolsForTaskHandler extends BaseToolHandler<GetToolsForTaskArgs> {
  protected parseArgs(args: unknown): GetToolsForTaskArgs {
    return GetToolsForTaskSchema.parse(args);
  }

  protected async execute(args: GetToolsForTaskArgs): Promise<ToolResult> {
    const { task, agentType } = args;

    const tools = getToolsList();
    const taskLower = task.toLowerCase();
    const matches: ToolMatch[] = [];

    // Extract tags from descriptions
    const extractTags = (desc: string): string[] => {
      const tagMatch = desc.match(/^\[([^\]]+)\]/);
      if (!tagMatch || !tagMatch[1]) return [];
      return [tagMatch[1]];
    };

    // Keyword patterns for common tasks
    const patterns: Record<string, { keywords: string[]; tools: string[] }> = {
      "find duplicates": {
        keywords: ["duplicate", "similar", "clone"],
        tools: ["semantic_search", "find_duplicates", "jscpd_detect_clones"],
      },
      "refactor safely": {
        keywords: ["refactor", "safe", "impact"],
        tools: ["analyze_code_impact", "create_snapshot", "modify_code", "rename_symbol"],
      },
      search: {
        keywords: ["search", "find", "locate"],
        tools: ["semantic_search", "pattern_search", "find_similar_code"],
      },
      "understand flow": {
        keywords: ["flow", "trace", "path", "execution"],
        tools: ["trace_flow", "trace_backwards", "trace_data_flow"],
      },
      rename: {
        keywords: ["rename"],
        tools: ["rename_symbol", "rename_file"],
      },
      "check impact": {
        keywords: ["impact", "break", "depend", "affect"],
        tools: ["analyze_code_impact", "trace_backwards"],
      },
      modify: {
        keywords: ["modify", "change", "edit"],
        tools: ["modify_code", "create_snapshot", "analyze_code_impact"],
      },
      complex: {
        keywords: ["complex", "hotspot", "technical debt"],
        tools: ["analyze_hotspots", "semantic_search"],
      },
      "find anti-patterns": {
        keywords: ["anti-pattern", "antipattern", "bad practice", "smell", "code smell"],
        tools: ["detect_patterns", "analyze_hotspots"],
      },
      "optimize performance": {
        keywords: ["optimize", "performance", "slow", "fast", "speed", "memory"],
        tools: ["detect_patterns", "analyze_hotspots"],
      },
      "code quality": {
        keywords: ["quality", "pattern", "best practice", "review"],
        tools: ["detect_patterns", "suggest_refactoring", "analyze_hotspots"],
      },
    };

    // Score each tool
    for (const tool of tools) {
      let score = 0;
      const reasons: string[] = [];
      const tags = extractTags(tool.description);
      const descLower = tool.description.toLowerCase();

      // 1. Direct keyword match in description
      const keywords = taskLower.split(/\s+/).filter((w) => w.length > 3);
      for (const keyword of keywords) {
        if (descLower.includes(keyword) || tool.name.includes(keyword)) {
          score += 3;
          reasons.push(`matches '${keyword}'`);
        }
      }

      // 2. Pattern matching
      for (const [patternName, pattern] of Object.entries(patterns)) {
        const matchesPattern = pattern.keywords.some((kw) => taskLower.includes(kw));
        if (matchesPattern && pattern.tools.includes(tool.name)) {
          score += 5;
          reasons.push(`recommended for '${patternName}'`);
        }
      }

      // 3. Agent type filtering
      if (agentType && agentType !== "any") {
        const agentTagMap: Record<string, string[]> = {
          explore: ["EXPLORE", "INFO"],
          plan: ["PLAN", "ANALYZE"],
          modify: ["MODIFY"],
          analyze: ["ANALYZE"],
        };

        const relevantTags = agentTagMap[agentType] || [];
        if (tags.some((tag) => relevantTags.includes(tag))) {
          score += 2;
          reasons.push(`matches agent type '${agentType}'`);
        }
      }

      // 4. Special boost for essential tools
      if (tool.name === "index" && taskLower.includes("start")) {
        score += 10;
        reasons.push("required first step");
      }
      if (tool.name === "get_help") {
        score += 1; // Always somewhat relevant
      }

      if (score > 0) {
        matches.push({
          name: tool.name,
          description: tool.description,
          tags,
          score,
          reason: reasons.join(", "),
        });
      }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    // Take top 10
    const topMatches = matches.slice(0, 10);

    // Format response
    const recommendations = topMatches.map((match, idx) => ({
      rank: idx + 1,
      tool: match.name,
      tags: match.tags,
      score: match.score,
      reason: match.reason,
      description: match.description.substring(0, 200) + (match.description.length > 200 ? "..." : ""),
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              task,
              agentType: agentType || "any",
              recommendations,
              tip:
                recommendations.length === 0
                  ? "No specific tools found. Try 'semantic_search' or 'get_help' for general guidance."
                  : `Found ${recommendations.length} relevant tools. Start with #1 (highest score).`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
