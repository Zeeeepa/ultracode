/**
 * Pylint Linter Integration
 *
 * Provides Pylint linting for Python files via subprocess.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { log } from "../../logging/index.js";
import type { Linter, ValidationProblem } from "../code-validator.js";

const execAsync = promisify(exec);

export class PylintLinter implements Linter {
  name = "Pylint";
  private pylintAvailable: boolean | null = null;

  /**
   * Lint file with Pylint
   */
  async lint(filePath: string, _content: string): Promise<ValidationProblem[]> {
    try {
      // Check if pylint is available
      if (this.pylintAvailable === null) {
        this.pylintAvailable = await this.checkPylintAvailable();
      }

      if (!this.pylintAvailable) {
        log.w("PYLINT", "unavailable");
        return [];
      }

      // Run pylint
      const { stdout } = await execAsync(`pylint --output-format=json "${filePath}"`, {
        encoding: "utf-8",
      });

      const results = JSON.parse(stdout);
      const problems: ValidationProblem[] = [];

      for (const result of results) {
        problems.push({
          severity: result.type === "error" ? "error" : result.type === "warning" ? "warning" : "info",
          message: result.message,
          line: result.line,
          column: result.column,
          ruleId: result["message-id"],
          source: "Pylint",
        });
      }

      return problems;
    } catch (error) {
      // Pylint may exit with non-zero status if there are errors
      // Try to parse output anyway
      if (error instanceof Error && "stdout" in error && typeof (error as { stdout?: unknown }).stdout === "string") {
        try {
          const stdout = (error as { stdout: string }).stdout;
          const results = JSON.parse(stdout);
          const problems: ValidationProblem[] = [];

          for (const result of results) {
            problems.push({
              severity: result.type === "error" ? "error" : result.type === "warning" ? "warning" : "info",
              message: result.message,
              line: result.line,
              column: result.column,
              ruleId: result["message-id"],
              source: "Pylint",
            });
          }

          return problems;
        } catch {
          // Failed to parse, return empty
        }
      }

      log.w("PYLINT", "lint_fail", { err: String(error) });
      return [];
    }
  }

  /**
   * Check if pylint is installed
   */
  private async checkPylintAvailable(): Promise<boolean> {
    try {
      await execAsync("pylint --version");
      log.i("PYLINT", "detected");
      return true;
    } catch {
      log.w("PYLINT", "not_in_path");
      return false;
    }
  }
}
