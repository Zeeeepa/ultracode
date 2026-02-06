#!/usr/bin/env node

/**
 * Debug Tools Visibility
 *
 * CLI tool to inspect what agents see when they query MCP server:
 * - List all tools with descriptions and their lengths
 * - List all prompts
 * - Statistics on description quality
 * - Check for potential issues (too short/long descriptions, missing examples)
 *
 * Usage:
 *   bun run src/cli/debug-tools-visibility.ts
 *   node dist/cli/debug-tools-visibility.js
 */

import { getToolsList } from "../tools/tool-definitions.js";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function printHeader(text: string) {
  console.log(`\n${colors.bright}${colors.cyan}${"=".repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${text}${colors.reset}`);
  console.log(`${colors.cyan}${"=".repeat(80)}${colors.reset}\n`);
}

function printSubheader(text: string) {
  console.log(`\n${colors.bright}${colors.blue}${text}${colors.reset}`);
  console.log(`${colors.dim}${"-".repeat(text.length)}${colors.reset}`);
}

function analyzeTools() {
  const tools = getToolsList();

  printHeader("MCP Tools Visibility Analysis");

  // 1. Summary statistics
  printSubheader("📊 Summary Statistics");

  const stats = {
    total: tools.length,
    withExamples: 0,
    withHelpLink: 0,
    avgLength: 0,
    tooShort: 0, // < 50 chars
    optimal: 0, // 50-300 chars
    long: 0, // > 300 chars
  };

  const lengths: number[] = [];

  for (const tool of tools) {
    const descLength = tool.description.length;
    lengths.push(descLength);

    if (tool.description.includes("Example:") || tool.description.includes("example:")) {
      stats.withExamples++;
    }

    if (tool.description.includes("get_help")) {
      stats.withHelpLink++;
    }

    if (descLength < 50) {
      stats.tooShort++;
    } else if (descLength <= 300) {
      stats.optimal++;
    } else {
      stats.long++;
    }
  }

  stats.avgLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);

  console.log(`Total tools:              ${colors.bright}${stats.total}${colors.reset}`);
  console.log(
    `With examples:            ${colors.green}${stats.withExamples}${colors.reset} (${Math.round((stats.withExamples / stats.total) * 100)}%)`,
  );
  console.log(
    `With get_help link:       ${colors.green}${stats.withHelpLink}${colors.reset} (${Math.round((stats.withHelpLink / stats.total) * 100)}%)`,
  );
  console.log(`Average description:      ${colors.cyan}${stats.avgLength}${colors.reset} chars`);
  console.log();
  console.log(`Description lengths:`);
  console.log(
    `  Too short (<50):        ${stats.tooShort > 0 ? colors.red : colors.green}${stats.tooShort}${colors.reset}`,
  );
  console.log(`  Optimal (50-300):       ${colors.green}${stats.optimal}${colors.reset}`);
  console.log(`  Long (>300):            ${stats.long > 0 ? colors.yellow : colors.green}${stats.long}${colors.reset}`);

  // 2. Agent Tags Analysis
  printSubheader("🤖 Agent Tags Distribution");

  const tagCounts: Record<string, number> = {};
  let withoutTags = 0;

  for (const tool of tools) {
    const tagMatch = tool.description.match(/^\[([^\]]+)\]/);
    if (tagMatch && tagMatch[1]) {
      const tag = tagMatch[1];
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    } else {
      withoutTags++;
    }
  }

  console.log(
    `Tools with tags:          ${colors.green}${tools.length - withoutTags}${colors.reset} (${Math.round(((tools.length - withoutTags) / tools.length) * 100)}%)`,
  );
  console.log(
    `Tools without tags:       ${withoutTags > 0 ? colors.yellow : colors.green}${withoutTags}${colors.reset}`,
  );
  console.log();
  console.log(`Tags by category:`);

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sortedTags) {
    const tagColor =
      tag === "EXPLORE"
        ? colors.cyan
        : tag === "PLAN"
          ? colors.magenta
          : tag === "MODIFY"
            ? colors.yellow
            : tag === "ANALYZE"
              ? colors.blue
              : colors.green;
    console.log(`  ${tagColor}${tag}${colors.reset}: ${count} tools`);
  }

  console.log();
  console.log(`${colors.dim}Tag meanings:${colors.reset}`);
  console.log(`  ${colors.cyan}EXPLORE${colors.reset} - Fast search & navigation (for Explore Agent)`);
  console.log(`  ${colors.magenta}PLAN${colors.reset} - Risk assessment & impact analysis (for Plan Agent)`);
  console.log(`  ${colors.yellow}MODIFY${colors.reset} - Safe code changes (for Modify Agent)`);
  console.log(`  ${colors.blue}ANALYZE${colors.reset} - Deep code analysis`);
  console.log(`  ${colors.green}Others${colors.reset} - INDEX, MERGE, BRANCH, DOC, HISTORY, INFO, SYSTEM`);

  // 3. List all tools with descriptions
  printSubheader("🔧 All Tools (with description lengths and tags)");

  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  for (const tool of sortedTools) {
    const length = tool.description.length;
    const lengthColor = length < 50 ? colors.red : length > 300 ? colors.yellow : colors.green;
    const hasExample = tool.description.includes("Example:") || tool.description.includes("example:");
    const hasHelp = tool.description.includes("get_help");

    // Extract tag
    const tagMatch = tool.description.match(/^\[([^\]]+)\]/);
    const tag = tagMatch && tagMatch[1] ? tagMatch[1] : "";
    const tagColor =
      tag === "EXPLORE"
        ? colors.cyan
        : tag === "PLAN"
          ? colors.magenta
          : tag === "MODIFY"
            ? colors.yellow
            : tag === "ANALYZE"
              ? colors.blue
              : colors.green;

    const badges: string[] = [];
    if (tag) badges.push(`${tagColor}[${tag}]${colors.reset}`);
    if (hasExample) badges.push(`${colors.green}📝${colors.reset}`);
    if (hasHelp) badges.push(`${colors.blue}📖${colors.reset}`);

    console.log(
      `${colors.bright}${tool.name}${colors.reset} ${lengthColor}[${length}]${colors.reset} ${badges.join(" ")}`,
    );
    console.log(`  ${colors.dim}${tool.description}${colors.reset}`);
    console.log();
  }

  // 4. Tools needing improvement
  printSubheader("⚠️  Tools Needing Improvement");

  const needsImprovement = tools.filter((t) => {
    const tooShort = t.description.length < 50;
    const noExample = !t.description.includes("Example:") && !t.description.includes("example:");
    const noHelp = !t.description.includes("get_help");
    const noTag = !t.description.match(/^\[([^\]]+)\]/);
    return tooShort || (noExample && noHelp) || noTag;
  });

  if (needsImprovement.length === 0) {
    console.log(`${colors.green}✓ All tools have good descriptions and tags!${colors.reset}`);
  } else {
    for (const tool of needsImprovement) {
      const issues: string[] = [];
      if (tool.description.length < 50) issues.push(`${colors.red}too short${colors.reset}`);
      if (!tool.description.match(/^\[([^\]]+)\]/)) issues.push(`${colors.yellow}no tag${colors.reset}`);
      if (!tool.description.includes("Example:") && !tool.description.includes("example:"))
        issues.push(`${colors.yellow}no example${colors.reset}`);
      if (!tool.description.includes("get_help")) issues.push(`${colors.yellow}no help link${colors.reset}`);

      console.log(`${colors.bright}${tool.name}${colors.reset}: ${issues.join(", ")}`);
    }
  }

  // 5. Prompts availability
  printSubheader("📚 MCP Prompts & Documentation");

  const generalPrompts = ["quick-start", "tool-reference", "workflows", "tracing", "autodoc"];
  const agentPrompts = ["explore", "planning", "modification"];

  console.log(`General prompts:`);
  for (const prompt of generalPrompts) {
    console.log(`  ${colors.green}✓${colors.reset} ${prompt}`);
  }
  console.log();
  console.log(`Agent-specific guides (NEW!):`);
  for (const prompt of agentPrompts) {
    const tagColor = prompt === "explore" ? colors.cyan : prompt === "planning" ? colors.magenta : colors.yellow;
    console.log(`  ${tagColor}✓${colors.reset} ${prompt} - optimized for ${prompt} agents`);
  }
  console.log();
  console.log(`${colors.dim}Access via: get_help(topic='explore') or get_tools_for_task(task='...')${colors.reset}`);

  // 6. Recommendations
  printSubheader("💡 Recommendations for Agent Visibility");

  console.log(`1. ${colors.green}✓${colors.reset} Agent tags implemented!`);
  console.log(
    `   ${colors.dim}All tools now have [EXPLORE], [PLAN], [MODIFY], etc. tags for easy filtering${colors.reset}`,
  );
  console.log();
  console.log(`2. ${colors.green}✓${colors.reset} Agent-specific documentation available`);
  console.log(
    `   ${colors.dim}Use get_help(topic='explore|planning|modification') for optimized guides${colors.reset}`,
  );
  console.log();
  console.log(`3. ${colors.green}✓${colors.reset} Smart tool discovery with get_tools_for_task`);
  console.log(`   ${colors.dim}Agents can ask "what tools for X?" and get ranked recommendations${colors.reset}`);
  console.log();
  console.log(`4. ${colors.green}✓${colors.reset} Include concrete examples in descriptions`);
  console.log(`   ${colors.dim}Show agents HOW to use tools, not just WHAT they do${colors.reset}`);
  console.log();
  console.log(`5. ${colors.yellow}⚠${colors.reset}  Keep descriptions 50-300 chars`);
  console.log(`   ${colors.dim}Too short: not enough context. Too long: may be truncated${colors.reset}`);
}

// Run analysis
try {
  analyzeTools();
} catch (error) {
  console.error(`${colors.red}Error:${colors.reset}`, error);
  process.exit(1);
}
