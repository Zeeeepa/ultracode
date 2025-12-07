/**
 * AutoDoc Generator
 *
 * Automatically generates documentation for the codebase:
 * - General docs in .autodoc/ (architecture, overview)
 * - Module docs as AUTODOC.md next to code
 */

import path from "node:path";
import { fileExists, readdir, readText } from "../../utils/file-ops.js";
import { mapParallel } from "../../utils/parallel.js";

export interface ModuleInfo {
  name: string;
  path: string;
  files: string[];
  hasIndex: boolean;
  exports: string[];
  description?: string;
}

export interface GenerateOptions {
  /** Root directory to scan */
  rootDir: string;
  /** Output directory for general docs (default: .autodoc) */
  autodocDir?: string;
  /** Patterns to exclude */
  exclude?: string[];
  /** Max depth to scan */
  maxDepth?: number;
  /** Concurrency for parallel operations */
  concurrency?: number;
}

export interface GenerateResult {
  /** Modules found */
  modules: ModuleInfo[];
  /** Files that would be generated */
  files: Array<{
    path: string;
    type: "general" | "module";
    content: string;
  }>;
}

const DEFAULT_EXCLUDE = ["node_modules", "dist", "build", ".git", "__tests__", "fixtures", ".autodoc"];

/** Module documentation filename */
const MODULE_DOC_FILENAME = "AUTODOC.md";

/**
 * Scan directory for modules (folders with .ts/.js files)
 */
export async function scanModules(
  rootDir: string,
  options: {
    exclude?: string[];
    maxDepth?: number;
    concurrency?: number;
  } = {},
): Promise<ModuleInfo[]> {
  const exclude = options.exclude || DEFAULT_EXCLUDE;
  const maxDepth = options.maxDepth ?? 4;
  const concurrency = options.concurrency ?? 8;

  const modules: ModuleInfo[] = [];

  // BFS scan
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0) {
    // Process directories in parallel batches
    const batch = queue.splice(0, concurrency);

    const results = await mapParallel(
      batch,
      async ({ dir, depth }) => {
        if (depth > maxDepth) return { subdirs: [], module: null };

        const entries = await readdir(dir, { withFileTypes: true });
        const subdirs: Array<{ dir: string; depth: number }> = [];
        const tsFiles: string[] = [];
        let hasIndex = false;

        for (const entry of entries) {
          const name = entry.name;
          const fullPath = path.join(dir, name);

          if (entry.isDirectory()) {
            if (!exclude.includes(name) && !name.startsWith(".")) {
              subdirs.push({ dir: fullPath, depth: depth + 1 });
            }
          } else if (entry.isFile()) {
            const isCodeFile =
              name.endsWith(".ts") || name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs");
            const isTestFile =
              name.endsWith(".test.ts") ||
              name.endsWith(".spec.ts") ||
              name.endsWith(".test.js") ||
              name.endsWith(".spec.js");
            if (isCodeFile && !isTestFile) {
              tsFiles.push(name);
              if (name === "index.ts" || name === "index.js" || name === "index.mjs" || name === "index.cjs") {
                hasIndex = true;
              }
            }
          }
        }

        // If directory has code files, it's a module
        let module: ModuleInfo | null = null;
        if (tsFiles.length > 0) {
          const exports = hasIndex ? await extractExports(path.join(dir, "index.ts")) : [];
          module = {
            name: path.basename(dir),
            path: dir,
            files: tsFiles,
            hasIndex,
            exports,
          };
        }

        return { subdirs, module };
      },
      concurrency,
    );

    for (const { subdirs, module } of results) {
      queue.push(...subdirs);
      if (module) {
        modules.push(module);
      }
    }
  }

  return modules;
}

/**
 * Extract export names from index.ts
 */
async function extractExports(indexPath: string): Promise<string[]> {
  if (!(await fileExists(indexPath))) {
    return [];
  }

  try {
    const content = await readText(indexPath);
    const exports: string[] = [];

    // Match: export { Foo, Bar } from
    const reExportMatch = content.matchAll(/export\s*\{([^}]+)\}/g);
    for (const match of reExportMatch) {
      if (match[1]) {
        const names = match[1].split(",").map((n) => n.trim().split(" ")[0]);
        exports.push(...names.filter((n): n is string => !!n && !n.startsWith("type")));
      }
    }

    // Match: export class/function/const Foo
    const directMatch = content.matchAll(/export\s+(?:class|function|const|interface|type)\s+(\w+)/g);
    for (const match of directMatch) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }

    return [...new Set(exports)].slice(0, 20); // Limit to 20
  } catch {
    return [];
  }
}

/**
 * Generate README content for a module
 */
export function generateModuleReadme(module: ModuleInfo): string {
  const lines: string[] = [];

  // Title
  const title = module.name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  lines.push(`# ${title}`);
  lines.push("");

  // Description placeholder
  if (module.description) {
    lines.push(module.description);
  } else {
    lines.push(`Module for ${module.name} functionality.`);
  }
  lines.push("");

  // Exports
  if (module.exports.length > 0) {
    lines.push("## Exports");
    lines.push("");
    for (const exp of module.exports) {
      lines.push(`- \`${exp}\``);
    }
    lines.push("");
  }

  // Files
  lines.push("## Files");
  lines.push("");
  for (const file of module.files.slice(0, 15)) {
    lines.push(`- \`${file}\``);
  }
  if (module.files.length > 15) {
    lines.push(`- ... and ${module.files.length - 15} more`);
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate general architecture doc
 */
export function generateArchitectureDoc(projectName: string, modules: ModuleInfo[]): string {
  const lines: string[] = [];

  lines.push(`# ${projectName} Architecture`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push(`This project contains ${modules.length} modules.`);
  lines.push("");

  // Group modules by parent directory
  const groups = new Map<string, ModuleInfo[]>();
  for (const mod of modules) {
    const parent = path.basename(path.dirname(mod.path));
    if (!groups.has(parent)) {
      groups.set(parent, []);
    }
    groups.get(parent)!.push(mod);
  }

  lines.push("## Module Structure");
  lines.push("");

  for (const [group, mods] of groups) {
    if (mods.length > 1) {
      lines.push(`### ${group}/`);
      for (const mod of mods) {
        lines.push(`- **${mod.name}**: ${mod.files.length} files`);
      }
      lines.push("");
    }
  }

  // Top-level modules
  const firstModulePath = modules[0]?.path;
  const topLevel = firstModulePath ? modules.filter((m) => path.dirname(m.path) === path.dirname(firstModulePath)) : [];
  if (topLevel.length > 0) {
    lines.push("## Core Modules");
    lines.push("");
    for (const mod of topLevel) {
      lines.push(`- **${mod.name}**: ${mod.exports.slice(0, 5).join(", ") || "internal"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate all documentation files (preview mode)
 */
export async function generateDocs(options: GenerateOptions): Promise<GenerateResult> {
  const autodocDir = options.autodocDir || path.join(options.rootDir, ".autodoc");
  const modules = await scanModules(options.rootDir, {
    exclude: options.exclude,
    maxDepth: options.maxDepth,
    concurrency: options.concurrency,
  });

  const files: GenerateResult["files"] = [];

  // Generate architecture doc
  const projectName = path.basename(options.rootDir);
  files.push({
    path: path.join(autodocDir, "architecture.md"),
    type: "general",
    content: generateArchitectureDoc(projectName, modules),
  });

  // Generate module AUTODOC.md files
  for (const mod of modules) {
    const autodocPath = path.join(mod.path, MODULE_DOC_FILENAME);
    files.push({
      path: autodocPath,
      type: "module",
      content: generateModuleReadme(mod),
    });
  }

  return { modules, files };
}
