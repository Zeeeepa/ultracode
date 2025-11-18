/**
 * Pylint Linter Integration
 *
 * Provides Pylint linting for Python files via subprocess.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
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
        console.warn("[PylintLinter] Pylint not available");
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
      if (error instanceof Error && "stdout" in error) {
        try {
          const stdout = (error as any).stdout;
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

      console.warn("[PylintLinter] Linting failed:", error);
      return [];
    }
  }

  /**
   * Check if pylint is installed
   */
  private async checkPylintAvailable(): Promise<boolean> {
    try {
      await execAsync("pylint --version");
      console.log("[PylintLinter] Pylint detected");
      return true;
    } catch {
      console.warn("[PylintLinter] Pylint not found in PATH");
      return false;
    }
  }
}
