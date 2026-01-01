#!/usr/bin/env node
/**
 * Replace all console.* calls with logger.* in index.ts
 * Maps console methods to appropriate logger categories
 */

import { readFileSync, writeFileSync } from "node:fs";

const filePath = "src/index.ts";

// Read file
const content = readFileSync(filePath, "utf-8");

// Mapping console.* to logger.* with categories
const replacements = [
  // console.error() -> logger.info() with SYSTEM category (most are informational in --pipe mode)
  {
    pattern: /console\.error\(\s*`\[([^\]]+)\]\s+([^`]*)`/g,
    replacement: (match, tag, message) => {
      const category = tag.toUpperCase().replace(/[\s-]/g, "_");
      return `logger.info("${category}", \`${message}\``;
    },
  },
  // console.error() with string interpolation
  {
    pattern: /console\.error\(\s*`([^`]*)`/g,
    replacement: (match, message) => {
      // Extract category from message if present, default to SYSTEM
      const category = message.match(/^\[([^\]]+)\]/)
        ? message
            .match(/^\[([^\]]+)\]/)[1]
            .toUpperCase()
            .replace(/[\s-]/g, "_")
        : "SYSTEM";
      const cleanMessage = message.replace(/^\[[^\]]+\]\s*/, "");
      return `logger.info("${category}", \`${cleanMessage}\``;
    },
  },
  // console.error() with simple strings
  {
    pattern: /console\.error\(\s*"([^"]*)"/g,
    replacement: 'logger.info("SYSTEM", "$1"',
  },
  // console.warn() -> logger.warn()
  {
    pattern: /console\.warn\(/g,
    replacement: 'logger.warn("SYSTEM", ',
  },
  // console.log() -> logger.debug()
  {
    pattern: /console\.log\(/g,
    replacement: 'logger.debug("SYSTEM", ',
  },
  // console.info() -> logger.info()
  {
    pattern: /console\.info\(/g,
    replacement: 'logger.info("SYSTEM", ',
  },
];

// Apply all replacements
let modified = content;
for (const { pattern, replacement } of replacements) {
  if (typeof replacement === "function") {
    modified = modified.replace(pattern, replacement);
  } else {
    modified = modified.replace(pattern, replacement);
  }
}

// Count changes
const originalConsoleCount = (content.match(/console\.(error|warn|log|info)\(/g) || []).length;
const newConsoleCount = (modified.match(/console\.(error|warn|log|info)\(/g) || []).length;

console.log(`Original console.* calls: ${originalConsoleCount}`);
console.log(`Remaining console.* calls: ${newConsoleCount}`);
console.log(`Replaced: ${originalConsoleCount - newConsoleCount}`);

// Write back
writeFileSync(filePath, modified, "utf-8");
console.log(`✓ Updated ${filePath}`);
