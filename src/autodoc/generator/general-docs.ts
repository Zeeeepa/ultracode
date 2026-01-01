/**
 * General Documentation Handler (.autodoc/ files)
 *
 * These files contain high-level project documentation that is NOT auto-generated.
 * This module:
 * - Creates template files if they don't exist
 * - Updates file references (paths with line numbers) in existing docs
 * - NEVER overwrites user content
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractReferences } from "./incremental-updater.js";

/** Files that should exist in .autodoc/ */
export const GENERAL_DOC_FILES = [
  "architecture.md",
  "dependencies.md",
  "deployment.md",
  "flow.md",
  "glossary.md",
  "processes.md",
] as const;

export type GeneralDocFile = (typeof GENERAL_DOC_FILES)[number];

/**
 * Templates for .autodoc/ files (used only when file doesn't exist)
 */
export const TEMPLATES: Record<GeneralDocFile, string> = {
  "architecture.md": `# Architecture

## Overview

*Describe the high-level architecture of your project here.*

## Core Components

| Component | Location | Description |
|-----------|----------|-------------|
| Example | [\`src/example.ts\`](../src/example.ts) | Description |

## Data Flow

\`\`\`
[Request] → [Handler] → [Service] → [Storage]
\`\`\`

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Example | Reason |

## Related Documents

- [→ dependencies.md](./dependencies.md)
- [→ deployment.md](./deployment.md)
- [→ processes.md](./processes.md)
`,

  "dependencies.md": `# Dependencies

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| example | ^1.0.0 | Description |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.0.0 | Type checking |

## System Requirements

- Node.js 18+
- *Add other requirements*

## Optional Dependencies

*List optional dependencies and when they are needed.*
`,

  "deployment.md": `# Deployment

## Build

\`\`\`bash
npm run build
\`\`\`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Environment |

## Installation

\`\`\`bash
npm install
\`\`\`

## Production Setup

*Describe production deployment steps.*
`,

  "flow.md": `# Data Flow

## Request Flow

\`\`\`
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │ ──► │ Handler │ ──► │ Service │
└─────────┘     └─────────┘     └─────────┘
\`\`\`

## Key Processes

### Process 1

1. Step one
2. Step two
3. Step three

## State Management

*Describe how state is managed.*
`,

  "glossary.md": `# Glossary

## Terms

| Term | Definition |
|------|------------|
| **Entity** | A code element (function, class, variable) tracked in the graph |
| **Relationship** | A connection between entities (imports, calls, extends) |

## Abbreviations

| Abbr | Full Form |
|------|-----------|
| AST | Abstract Syntax Tree |
| MCP | Model Context Protocol |
`,

  "processes.md": `# Processes

## Development Workflow

1. Create feature branch
2. Implement changes
3. Run tests
4. Create PR

## Testing

\`\`\`bash
npm test
\`\`\`

## Code Style

*Describe code style guidelines.*

## Release Process

1. Update version
2. Update changelog
3. Create release tag
`,
};

/**
 * Ensure .autodoc/ directory and all template files exist
 */
export function ensureGeneralDocs(autodocDir: string): void {
  // Create directory if needed
  if (!existsSync(autodocDir)) {
    mkdirSync(autodocDir, { recursive: true });
  }

  // Create missing template files
  for (const filename of GENERAL_DOC_FILES) {
    const filePath = path.join(autodocDir, filename);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, TEMPLATES[filename], "utf-8");
    }
  }
}

/**
 * Update file references in a general doc file
 * Only updates paths with line numbers, preserves all other content
 */
export function updateGeneralDocReferences(
  filePath: string,
  lineNumberUpdates: Map<string, { oldLine: number; newLine: number }>,
): { updated: boolean; changes: string[] } {
  if (!existsSync(filePath)) {
    return { updated: false, changes: [] };
  }

  const content = readFileSync(filePath, "utf-8");
  const refs = extractReferences(content);
  const changes: string[] = [];

  if (refs.length === 0 || lineNumberUpdates.size === 0) {
    return { updated: false, changes: [] };
  }

  let updatedContent = content;

  // Sort refs by position descending to update from end to start
  const sortedRefs = [...refs].sort((a, b) => b.startIndex - a.startIndex);

  for (const ref of sortedRefs) {
    if (!ref.lineNumber) continue;

    // Check if this file:line needs updating
    const key = `${ref.filePath}:${ref.lineNumber}`;
    const update = lineNumberUpdates.get(key);

    if (update && update.oldLine === ref.lineNumber) {
      // Build updated reference
      const newRef = ref.original.replace(`:${ref.lineNumber}`, `:${update.newLine}`);
      updatedContent = updatedContent.slice(0, ref.startIndex) + newRef + updatedContent.slice(ref.endIndex);
      changes.push(`${ref.filePath}: line ${update.oldLine} → ${update.newLine}`);
    }
  }

  if (changes.length > 0) {
    writeFileSync(filePath, updatedContent, "utf-8");
  }

  return { updated: changes.length > 0, changes };
}

/**
 * Update all general docs in .autodoc/ directory
 */
export function updateAllGeneralDocs(
  autodocDir: string,
  lineNumberUpdates: Map<string, { oldLine: number; newLine: number }>,
): { totalUpdated: number; allChanges: Array<{ file: string; changes: string[] }> } {
  const allChanges: Array<{ file: string; changes: string[] }> = [];
  let totalUpdated = 0;

  for (const filename of GENERAL_DOC_FILES) {
    const filePath = path.join(autodocDir, filename);
    const result = updateGeneralDocReferences(filePath, lineNumberUpdates);

    if (result.updated) {
      totalUpdated++;
      allChanges.push({ file: filename, changes: result.changes });
    }
  }

  return { totalUpdated, allChanges };
}
