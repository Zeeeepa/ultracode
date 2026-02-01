/**
 * Oxlint Linter Integration
 *
 * Fast linter for TypeScript/JavaScript files using oxlint binary.
 * ~100x faster than ESLint.
 */

import { log } from "../../logging/index.js";
import { exec } from "../../utils/shell.js";
import type { Linter, ValidationProblem } from "../code-validator.js";

export class OxlintLinter implements Linter {
  name = "oxlint";
  private binPath: string | null = null;

  /**
   * Lint file with oxlint
   */
  async lint(filePath: string, _content: string): Promise<ValidationProblem[]> {
    try {
      const bin = await this.getBinPath();
      const { stdout, stderr } = await exec(`"${bin}" --format json "${filePath}"`, {
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
