/**
 * Oxlint Linter Integration
 *
 * Fast linter for TypeScript/JavaScript files using oxlint binary.
 * ~100x faster than ESLint.
 */

import { copyFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../../logging/index.js";
import { exec } from "../../utils/shell.js";
import type { Linter, ValidationProblem } from "../code-validator.js";

export class OxlintLinter implements Linter {
  name = "oxlint";
  private binPath: string | null = null;

  /**
   * Lint file with oxlint
   * @param filePath - Path to file to lint
   * @param _content - File content (not used, oxlint reads from disk)
   * @param autofix - Apply automatic fixes (oxlint --fix)
   * @param dryRun - Show what would be fixed without applying changes
   */
  async lint(filePath: string, _content: string, autofix = false, dryRun = false): Promise<ValidationProblem[]> {
    try {
      const bin = await this.getBinPath();

      // Dry-run mode: create a temporary file
      if (autofix && dryRun) {
        const tempFile = join(tmpdir(), `oxlint-dryrun-${Date.now()}.tmp`);

        try {
          // Copy to temp
          await copyFile(filePath, tempFile);

          // Apply autofixes to the copy
          const command = `"${bin}" --fix --format json "${tempFile}"`;
          await exec(command, { timeout: 30000 });

          // Read changes
          const original = await readFile(filePath, "utf-8");
          const fixed = await readFile(tempFile, "utf-8");

          // Return problems + information about what would be fixed
          const problems = await this.lint(filePath, _content, false);
          if (original !== fixed) {
            problems.push({
              severity: "info",
              message: `[DRY-RUN] Would apply autofixes (${fixed.length - original.length} chars diff)`,
              line: 0,
              column: 0,
              source: "oxlint",
            });
          }

          return problems;
        } finally {
          // Delete the temporary file
          await unlink(tempFile).catch(() => {});
        }
      }

      // Normal logic
      const fixFlag = autofix ? "--fix" : "";
      const { stdout, stderr } = await exec(`"${bin}" ${fixFlag} --format json "${filePath}"`.trim(), {
        timeout: 30000,
      });

      const output = stdout || stderr;
      return this.parseOutput(output);
    } catch (error) {
      // oxlint returns non-zero on lint errors
      const err = error as { stdout?: string; stderr?: string };
      const output = err.stdout || err.stderr || "";
      if (output) {
        return this.parseOutput(output);
      }
      log.w("OXLINT", "lint_fail", { err: String(error) });
      return [];
    }
  }

  private parseOutput(output: string): ValidationProblem[] {
    try {
      const parsed = JSON.parse(output) as {
        diagnostics?: Array<{
          message: string;
          code?: string;
          severity: string;
          labels?: Array<{ span?: { line?: number; column?: number } }>;
        }>;
      };

      if (!parsed.diagnostics) return [];

      return parsed.diagnostics.map((d) => ({
        severity: d.severity === "error" ? "error" : ("warning" as const),
        message: d.message,
        line: d.labels?.[0]?.span?.line ?? 0,
        column: d.labels?.[0]?.span?.column ?? 0,
        ruleId: d.code,
        source: "oxlint",
      }));
    } catch {
      return [];
    }
  }

  private async getBinPath(): Promise<string> {
    if (this.binPath) return this.binPath;

    const { createRequire } = await import("node:module");
    const { dirname, join } = await import("node:path");
    const { access } = await import("node:fs/promises");

    try {
      const require = createRequire(import.meta.url);
      const oxlintPkg = require.resolve("oxlint/package.json");
      const oxlintDir = dirname(oxlintPkg);
      const pkg = require(oxlintPkg) as { bin?: Record<string, string> | string };

      const binPath = typeof pkg.bin === "string" ? pkg.bin : typeof pkg.bin === "object" ? pkg.bin["oxlint"] : null;

      if (binPath) {
        const fullPath = join(oxlintDir, binPath);
        await access(fullPath);
        this.binPath = fullPath;
        return fullPath;
      }
    } catch {
      // Fallback
    }

    this.binPath = "npx oxlint";
    return "npx oxlint";
  }
}
