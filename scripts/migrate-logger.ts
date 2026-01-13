#!/usr/bin/env npx tsx
/**
 * Logger Migration Script
 *
 * Migrates old logger.* calls to new log.* format
 *
 * Usage:
 *   npx tsx scripts/migrate-logger.ts --dry-run     # Preview changes
 *   npx tsx scripts/migrate-logger.ts --apply       # Apply changes
 *   npx tsx scripts/migrate-logger.ts --file src/agents/semantic-agent.ts  # Single file
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { glob } from "glob";
import { basename } from "path";

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--apply");
const SINGLE_FILE =
  args.find((a) => a.startsWith("--file="))?.split("=")[1] ||
  (args.includes("--file") ? args[args.indexOf("--file") + 1] : null);
const VERBOSE = args.includes("--verbose") || args.includes("-v");

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(color: string, ...msg: string[]) {
  console.log(color + msg.join(" ") + colors.reset);
}

// Statistics
const stats = {
  filesScanned: 0,
  filesModified: 0,
  replacements: 0,
  byPattern: new Map<string, number>(),
};

/**
 * Extract event name from message
 * "[Component] some message" → "some_message"
 * "Some Message Here" → "some_message_here"
 */
function extractEventName(msg: string): string {
  // Remove [Component] prefix
  let clean = msg.replace(/^\[?[A-Za-z_]+\]?\s*/, "");
  // Remove special chars, convert to snake_case
  clean = clean
    .replace(/[▶◀→←]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .slice(0, 20); // Max 20 chars for event
  return clean || "event";
}

/**
 * Convert template literal to KV pairs
 * `message ${var1} and ${var2}` → { var1, var2 }
 */
function extractVarsFromTemplate(template: string): string {
  const matches = template.match(/\$\{([^}]+)\}/g);
  if (!matches) return "{}";

  const vars = matches.map((m) => {
    const expr = m.slice(2, -1).trim();
    // Handle simple vars: ${foo} → foo
    // Handle expressions: ${foo.bar} → bar: foo.bar
    if (expr.includes(".") || expr.includes("(")) {
      const name = expr.split(".").pop()?.replace(/[()]/g, "") || "val";
      return `${name}: ${expr}`;
    }
    return expr;
  });

  return `{ ${vars.join(", ")} }`;
}

// Replacement patterns
interface Pattern {
  name: string;
  from: RegExp;
  replacer: (match: string, ...groups: string[]) => string;
}

const patterns: Pattern[] = [
  // ========================================
  // logger.trace patterns
  // ========================================
  {
    name: "trace-template",
    // logger.trace("CAT", `message ${var}`)
    from: /logger\.trace\(\s*"([A-Z_]+)"\s*,\s*`([^`]+)`\s*\)/g,
    replacer: (_, cat, msg) => {
      const event = extractEventName(msg);
      const kv = extractVarsFromTemplate(msg);
      return `log.t("${cat}", "${event}", ${kv})`;
    },
  },
  {
    name: "trace-string",
    // logger.trace("CAT", "message")
    from: /logger\.trace\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\)/g,
    replacer: (_, cat, msg) => {
      const event = extractEventName(msg);
      return `log.t("${cat}", "${event}", {})`;
    },
  },

  // ========================================
  // logger.info patterns
  // ========================================
  {
    name: "info-with-data",
    // logger.info("CAT", "message", { data })
    from: /logger\.info\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*,\s*(\{[^}]+\})\s*\)/g,
    replacer: (_, cat, msg, data) => {
      const event = extractEventName(msg);
      return `log.i("${cat}", "${event}", ${data})`;
    },
  },
  {
    name: "info-with-data-multiline",
    // logger.info("CAT", "message", {\n  data\n})
    from: /logger\.info\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*,\s*(\{[\s\S]*?\})\s*\)/g,
    replacer: (_, cat, msg, data) => {
      const event = extractEventName(msg);
      // Flatten multiline data
      const flatData = data.replace(/\s+/g, " ");
      return `log.i("${cat}", "${event}", ${flatData})`;
    },
  },
  {
    name: "info-simple",
    // logger.info("CAT", "message")
    from: /logger\.info\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\)/g,
    replacer: (_, cat, msg) => {
      const event = extractEventName(msg);
      return `log.i("${cat}", "${event}", {})`;
    },
  },

  // ========================================
  // logger.warn patterns
  // ========================================
  {
    name: "warn-with-data",
    // logger.warn("CAT", "message", { data })
    from: /logger\.warn\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*,\s*(\{[^}]+\})\s*\)/g,
    replacer: (_, cat, msg, data) => {
      const event = extractEventName(msg);
      return `log.w("${cat}", "${event}", ${data})`;
    },
  },
  {
    name: "warn-simple",
    // logger.warn("CAT", "message")
    from: /logger\.warn\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\)/g,
    replacer: (_, cat, msg) => {
      const event = extractEventName(msg);
      return `log.w("${cat}", "${event}", {})`;
    },
  },

  // ========================================
  // logger.error patterns
  // ========================================
  {
    name: "error-with-data",
    // logger.error("CAT", "message", { error: ... })
    from: /logger\.error\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*,\s*(\{[^}]+\})\s*\)/g,
    replacer: (_, cat, msg, data) => {
      const event = extractEventName(msg);
      return `log.e("${cat}", "${event}", ${data})`;
    },
  },
  {
    name: "error-simple",
    // logger.error("CAT", "message")
    from: /logger\.error\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\)/g,
    replacer: (_, cat, msg) => {
      const event = extractEventName(msg);
      return `log.e("${cat}", "${event}", {})`;
    },
  },

  // ========================================
  // logger.systemEvent → log.i("SYSTEM", ...)
  // ========================================
  {
    name: "systemEvent-with-data",
    // logger.systemEvent("Event Name", { data })
    from: /logger\.systemEvent\(\s*"([^"]+)"\s*,\s*(\{[^}]+\})\s*\)/g,
    replacer: (_, msg, data) => {
      const event = extractEventName(msg);
      return `log.i("SYSTEM", "${event}", ${data})`;
    },
  },
  {
    name: "systemEvent-simple",
    // logger.systemEvent("Event Name")
    from: /logger\.systemEvent\(\s*"([^"]+)"\s*\)/g,
    replacer: (_, msg) => {
      const event = extractEventName(msg);
      return `log.i("SYSTEM", "${event}", {})`;
    },
  },

  // ========================================
  // logger.mcpRequest/mcpResponse
  // ========================================
  {
    name: "mcpRequest",
    // logger.mcpRequest(name, args, requestId)
    from: /logger\.mcpRequest\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    replacer: (_, name, args, reqId) => {
      return `log.i("MCP", "request", { tool: ${name}, req: ${reqId} })`;
    },
  },
  {
    name: "mcpResponse",
    // logger.mcpResponse(name, result, requestId, duration)
    from: /logger\.mcpResponse\(\s*(\w+)\s*,\s*\w+\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    replacer: (_, name, reqId, dur) => {
      return `log.i("MCP", "response", { tool: ${name}, req: ${reqId}, dur: ${dur} })`;
    },
  },

  // ========================================
  // logger.mcpError
  // ========================================
  {
    name: "mcpError",
    // logger.mcpError(name, error, requestId)
    from: /logger\.mcpError\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    replacer: (_, name, err, reqId) => {
      return `log.e("MCP", "error", { tool: ${name}, req: ${reqId}, err: ${err}?.message })`;
    },
  },
];

/**
 * Add import for log if not present
 */
function ensureLogImport(content: string, filePath: string): string {
  // Check if already has import
  if (content.includes("import { log }") || content.includes("import {log}")) {
    return content;
  }

  // Find logger import and add log import after it
  const loggerImportRegex =
    /import\s*\{[^}]*logger[^}]*\}\s*from\s*["']\.\.\/utils\/logger\.js["'];?/;
  const match = content.match(loggerImportRegex);

  if (match) {
    // Determine relative path to logging
    const depth = (filePath.match(/\//g) || []).length - 1;
    const prefix = "../".repeat(Math.max(1, depth));
    const importPath = `${prefix}logging/index.js`;

    return content.replace(match[0], `${match[0]}\nimport { log } from "${importPath}";`);
  }

  return content;
}

/**
 * Process a single file
 */
function processFile(filePath: string): { modified: boolean; changes: string[] } {
  if (!existsSync(filePath)) {
    log(colors.red, `File not found: ${filePath}`);
    return { modified: false, changes: [] };
  }

  let content = readFileSync(filePath, "utf-8");
  const originalContent = content;
  const changes: string[] = [];

  // Apply each pattern
  for (const pattern of patterns) {
    const matches = content.match(pattern.from);
    if (matches) {
      for (const match of matches) {
        const replacement = match.replace(pattern.from, pattern.replacer as any);
        if (VERBOSE) {
          changes.push(
            `  ${colors.red}- ${match.slice(0, 80)}${match.length > 80 ? "..." : ""}${colors.reset}`,
          );
          changes.push(
            `  ${colors.green}+ ${replacement.slice(0, 80)}${replacement.length > 80 ? "..." : ""}${colors.reset}`,
          );
        }
        stats.replacements++;
        stats.byPattern.set(pattern.name, (stats.byPattern.get(pattern.name) || 0) + 1);
      }
      content = content.replace(pattern.from, pattern.replacer as any);
    }
  }

  // Add import if needed and content was modified
  if (content !== originalContent) {
    content = ensureLogImport(content, filePath);
  }

  const modified = content !== originalContent;

  if (modified && !DRY_RUN) {
    writeFileSync(filePath, content);
  }

  return { modified, changes };
}

/**
 * Main entry point
 */
async function main() {
  console.log("");
  log(colors.cyan, "=".repeat(60));
  log(colors.cyan, "Logger Migration Script");
  log(colors.cyan, DRY_RUN ? "(DRY RUN - no files will be modified)" : "(APPLYING CHANGES)");
  log(colors.cyan, "=".repeat(60));
  console.log("");

  // Get files to process
  let files: string[];
  if (SINGLE_FILE) {
    files = [SINGLE_FILE];
    log(colors.blue, `Processing single file: ${SINGLE_FILE}`);
  } else {
    files = await glob("src/**/*.ts", {
      ignore: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
      cwd: process.cwd(),
    });
    log(colors.blue, `Found ${files.length} TypeScript files`);
  }

  console.log("");

  // Process each file
  for (const file of files) {
    stats.filesScanned++;
    const { modified, changes } = processFile(file);

    if (modified) {
      stats.filesModified++;
      const icon = DRY_RUN ? colors.yellow + "[WOULD MODIFY]" : colors.green + "[MODIFIED]";
      log(colors.reset, `${icon} ${basename(file)}${colors.reset}`);

      if (VERBOSE && changes.length > 0) {
        changes.forEach((c) => console.log(c));
        console.log("");
      }
    }
  }

  // Print summary
  console.log("");
  log(colors.cyan, "=".repeat(60));
  log(colors.cyan, "Summary");
  log(colors.cyan, "=".repeat(60));
  console.log(`  Files scanned:  ${stats.filesScanned}`);
  console.log(`  Files modified: ${stats.filesModified}`);
  console.log(`  Replacements:   ${stats.replacements}`);
  console.log("");

  if (stats.byPattern.size > 0) {
    console.log("  By pattern:");
    for (const [name, count] of stats.byPattern.entries()) {
      console.log(`    ${name}: ${count}`);
    }
  }

  console.log("");
  if (DRY_RUN) {
    log(colors.yellow, "To apply changes, run with --apply flag");
  } else {
    log(colors.green, "Migration complete!");
    log(colors.blue, 'Next: run "npm run build" to verify');
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
