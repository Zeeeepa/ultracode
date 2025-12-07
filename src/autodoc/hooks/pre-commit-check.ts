/**
 * Pre-commit Hook for AutoDoc
 *
 * Validates documentation references before commit.
 * Ensures no broken links are committed.
 *
 * Architecture References:
 * - Types: src/autodoc/types.ts
 * - RFC: docs/design/documentation-layer-rfc.md
 */

import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileExists, readText } from "../../utils/file-ops.js";
import { collectParallel, mapParallel } from "../../utils/parallel.js";

const execAsync = promisify(exec);

export interface PreCommitCheckResult {
  success: boolean;
  brokenRefs: Array<{
    file: string;
    line: number;
    target: string;
    error: string;
  }>;
  warnings: string[];
}

/**
 * Get staged .md files from git
 */
export async function getStagedMdFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --cached --name-only --diff-filter=ACM", { cwd });
    return stdout
      .split("\n")
      .filter((f) => f.trim() && f.endsWith(".md"))
      .map((f) => path.join(cwd, f));
  } catch {
    return [];
  }
}

/**
 * Get staged code files (for reference validation)
 */
export async function getStagedCodeFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --cached --name-only --diff-filter=ACM", { cwd });
    const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rs", ".cs"];
    return stdout
      .split("\n")
      .filter((f) => f.trim() && codeExtensions.some((ext) => f.endsWith(ext)))
      .map((f) => path.join(cwd, f));
  } catch {
    return [];
  }
}

/**
 * Extract references from markdown content
 */
export function extractReferences(content: string): Array<{ line: number; target: string; syntax: string }> {
  const refs: Array<{ line: number; target: string; syntax: string }> = [];
  const lines = content.split("\n");

  // Match [→ text](target) style links
  const linkRegex = /\[→?\s*([^\]]+)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      if (match[2]) {
        refs.push({
          line: i + 1,
          target: match[2],
          syntax: match[0],
        });
      }
    }
  }

  return refs;
}

/**
 * Check if a reference target exists
 */
export async function checkReferenceTarget(
  target: string,
  basePath: string,
  entityExists: (id: string) => Promise<boolean>,
): Promise<{ valid: boolean; error?: string }> {
  // Entity reference: entity:MyClass.myMethod
  if (target.startsWith("entity:")) {
    const entityId = target.slice(7);
    const exists = await entityExists(entityId);
    if (!exists) {
      return { valid: false, error: `Entity not found: ${entityId}` };
    }
    return { valid: true };
  }

  // Doc reference: docs://path/to/doc.md
  if (target.startsWith("docs://")) {
    const docPath = target.slice(7);
    const fullPath = path.join(basePath, ".autodoc", docPath);
    if (await fileExists(fullPath)) {
      return { valid: true };
    }
    return { valid: false, error: `Documentation file not found: ${docPath}` };
  }

  // File reference with line range: file.ts:L10-L20
  if (target.includes(":L")) {
    const filePart = target.split(":L")[0] || target;
    const fullPath = path.join(basePath, filePart);
    if (await fileExists(fullPath)) {
      return { valid: true };
    }
    return { valid: false, error: `File not found: ${filePart}` };
  }

  // Regular file/URL reference
  if (target.startsWith("http://") || target.startsWith("https://")) {
    // Don't validate external URLs in pre-commit
    return { valid: true };
  }

  // Relative file reference
  const fullPath = path.isAbsolute(target) ? target : path.join(basePath, target);
  if (await fileExists(fullPath)) {
    return { valid: true };
  }
  return { valid: false, error: `File not found: ${target}` };
}

/** Max parallel file checks */
const MAX_FILE_CONCURRENCY = 8;
/** Max parallel reference checks per file */
const MAX_REF_CONCURRENCY = 4;

/**
 * Run pre-commit check on staged files
 * Optimized: processes files and references in parallel
 */
export async function runPreCommitCheck(
  cwd: string,
  entityExists: (id: string) => Promise<boolean>,
): Promise<PreCommitCheckResult> {
  const result: PreCommitCheckResult = {
    success: true,
    brokenRefs: [],
    warnings: [],
  };

  const stagedMdFiles = await getStagedMdFiles(cwd);

  if (stagedMdFiles.length === 0) {
    return result;
  }

  // Process files in parallel (up to 8 concurrent)
  const fileResults = await collectParallel(
    stagedMdFiles,
    async (filePath) => {
      const content = await readText(filePath);
      const refs = extractReferences(content);

      // Validate references in parallel (up to 4 concurrent per file)
      const refChecks = await mapParallel(
        refs,
        async (ref) => {
          const check = await checkReferenceTarget(ref.target, cwd, entityExists);
          return { ref, check };
        },
        MAX_REF_CONCURRENCY,
      );

      const brokenRefs: PreCommitCheckResult["brokenRefs"] = [];
      for (const { ref, check } of refChecks) {
        if (!check.valid) {
          brokenRefs.push({
            file: path.relative(cwd, filePath),
            line: ref.line,
            target: ref.target,
            error: check.error ?? "Unknown error",
          });
        }
      }

      return brokenRefs;
    },
    MAX_FILE_CONCURRENCY,
  );

  // Aggregate results
  for (const { value: brokenRefs } of fileResults.results) {
    result.brokenRefs.push(...brokenRefs);
  }

  // Aggregate errors as warnings
  for (const { item: filePath, error } of fileResults.errors) {
    result.warnings.push(`Failed to check ${path.relative(cwd, filePath)}: ${error.message}`);
  }

  result.success = result.brokenRefs.length === 0;

  return result;
}

/**
 * Format pre-commit check result for console output
 */
export function formatPreCommitResult(result: PreCommitCheckResult): string {
  if (result.success && result.warnings.length === 0) {
    return "✓ AutoDoc: All references valid\n";
  }

  const lines: string[] = [];

  if (result.brokenRefs.length > 0) {
    lines.push("✗ AutoDoc: Broken references found!\n");
    for (const ref of result.brokenRefs) {
      lines.push(`  ${ref.file}:${ref.line}`);
      lines.push(`    → ${ref.target}`);
      lines.push(`    Error: ${ref.error}\n`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("⚠ AutoDoc warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ${warning}`);
    }
  }

  return lines.join("\n");
}
