/**
 * Module Resolver
 *
 * Resolves file paths to their parent modules and extracts export information.
 */

import path from "node:path";
import { fileExists, readdir, readText } from "../../utils/file-ops.js";

/**
 * Find the module directory that contains a file.
 * A module is a directory with code files (optionally with index.ts).
 */
export async function getModuleForFile(filePath: string, rootDir: string): Promise<string | null> {
  // Normalize paths
  const normalizedFile = path.normalize(filePath);
  const normalizedRoot = path.normalize(rootDir);

  // Check if file is within root
  if (!normalizedFile.startsWith(normalizedRoot)) {
    return null;
  }

  // Get directory of the file
  let currentDir = path.dirname(normalizedFile);

  // Walk up until we find a module boundary or reach root
  while (currentDir.length >= normalizedRoot.length) {
    // Check for index.ts/js which indicates module root
    const hasIndex = await hasIndexFile(currentDir);

    if (hasIndex) {
      return currentDir;
    }

    // If we're at a directory that looks like a module (has code files),
    // and the parent has an index.ts, the parent is the module
    const parentDir = path.dirname(currentDir);
    if (parentDir.length >= normalizedRoot.length) {
      const parentHasIndex = await hasIndexFile(parentDir);
      if (parentHasIndex) {
        // Current dir is a submodule of parent
        return currentDir;
      }
    }

    // Move up one level
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break; // Reached filesystem root
    currentDir = nextDir;
  }

  // If no index.ts found, return the immediate directory of the file
  return path.dirname(normalizedFile);
}

// Pre-compiled Set for faster index file checks
const INDEX_FILES = new Set(["index.ts", "index.js", "index.mjs", "index.cjs"]);

/**
 * Check if a directory has an index file (single readdir instead of 4 fileExists)
 */
async function hasIndexFile(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    for (const name of entries) {
      if (INDEX_FILES.has(name)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract export names from a file
 */
export async function extractExportsFromFile(filePath: string): Promise<string[]> {
  if (!(await fileExists(filePath))) {
    return [];
  }

  try {
    const content = await readText(filePath);
    return extractExportsFromContent(content);
  } catch {
    return [];
  }
}

/**
 * Extract export names from file content
 */
export function extractExportsFromContent(content: string): string[] {
  const exports: string[] = [];

  // Match: export { Foo, Bar } from
  // Match: export { Foo as FooAlias, Bar }
  const reExportMatch = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const match of reExportMatch) {
    if (match[1]) {
      const names = match[1]
        .split(",")
        .map((n) => {
          const trimmed = n.trim();
          // Handle "Foo as Bar" - take original name
          const asMatch = trimmed.match(/^(\w+)\s+as\s+\w+/);
          if (asMatch) return asMatch[1];
          // Handle "type Foo" - skip types
          if (trimmed.startsWith("type ")) return null;
          // Take first word (name)
          return trimmed.split(/\s/)[0];
        })
        .filter((n): n is string => !!n);
      exports.push(...names);
    }
  }

  // Match: export class/function/const/interface/type/enum Foo
  const directMatch = content.matchAll(
    /export\s+(?:default\s+)?(?:abstract\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g,
  );
  for (const match of directMatch) {
    if (match[1]) {
      exports.push(match[1]);
    }
  }

  // Match: export default Foo
  const defaultMatch = content.match(/export\s+default\s+(\w+)/);
  if (defaultMatch?.[1] && !exports.includes(defaultMatch[1])) {
    exports.push(defaultMatch[1]);
  }

  // Match: export * from (re-exports all, we can't resolve without following imports)
  // For now, mark as having re-exports
  if (/export\s+\*\s+from/.test(content)) {
    exports.push("*"); // Marker for "has star exports"
  }

  return [...new Set(exports)].slice(0, 50); // Limit and dedupe
}

/**
 * Get all code files in a module directory
 */
export async function getModuleFiles(modulePath: string): Promise<string[]> {
  try {
    const entries = await readdir(modulePath, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
      if (
        e.isFile() &&
        /\.(ts|js|tsx|jsx|mjs|cjs)$/.test(e.name) &&
        !e.name.includes(".test.") &&
        !e.name.includes(".spec.")
      ) {
        files.push(e.name);
      }
    }
    return files;
  } catch {
    return [];
  }
}

/**
 * Parse a file to extract entity information (functions, classes, etc.)
 * This is a lightweight parser for AUTODOC updates, not full AST parsing.
 */
export function extractEntitiesFromContent(
  content: string,
  _fileName: string,
): Array<{
  name: string;
  type: "function" | "class" | "interface" | "type" | "const" | "enum";
  exported: boolean;
  line: number;
}> {
  const entities: Array<{
    name: string;
    type: "function" | "class" | "interface" | "type" | "const" | "enum";
    exported: boolean;
    line: number;
  }> = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Export detection
    const isExported = line.includes("export ");

    // Class
    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch?.[1]) {
      entities.push({ name: classMatch[1], type: "class", exported: isExported, line: lineNum });
      continue;
    }

    // Interface
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch?.[1]) {
      entities.push({ name: interfaceMatch[1], type: "interface", exported: isExported, line: lineNum });
      continue;
    }

    // Type alias
    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*[=<]/);
    if (typeMatch?.[1]) {
      entities.push({ name: typeMatch[1], type: "type", exported: isExported, line: lineNum });
      continue;
    }

    // Enum
    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch?.[1]) {
      entities.push({ name: enumMatch[1], type: "enum", exported: isExported, line: lineNum });
      continue;
    }

    // Function (including arrow functions assigned to const)
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch?.[1]) {
      entities.push({ name: funcMatch[1], type: "function", exported: isExported, line: lineNum });
      continue;
    }

    // Arrow function or const
    const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*[=:]/);
    if (constMatch?.[1]) {
      // Check if it's a function
      const restOfLine = line.slice(line.indexOf(constMatch[1]));
      const isFunction = /=\s*(?:async\s*)?\(|=\s*(?:async\s*)?(?:\w+|\([^)]*\))\s*=>/.test(restOfLine);
      entities.push({
        name: constMatch[1],
        type: isFunction ? "function" : "const",
        exported: isExported,
        line: lineNum,
      });
    }
  }

  return entities;
}

/**
 * Find line number of an entity in file content
 */
export function findEntityLine(content: string, entityName: string, entityType?: string): number | null {
  const lines = content.split("\n");

  // Build pattern based on type (once, outside loop)
  let pattern: RegExp;
  if (entityType === "class") {
    pattern = new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${entityName}\\b`);
  } else if (entityType === "interface") {
    pattern = new RegExp(`(?:export\\s+)?interface\\s+${entityName}\\b`);
  } else if (entityType === "function") {
    pattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${entityName}\\b|const\\s+${entityName}\\s*=`);
  } else {
    // Generic - look for name after common keywords
    pattern = new RegExp(`(?:class|interface|type|enum|function|const|let|var)\\s+${entityName}\\b`);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (pattern.test(line)) {
      return i + 1; // 1-based line number
    }
  }

  return null;
}
