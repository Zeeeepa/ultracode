/**
 * ESLint Linter Integration
 *
 * Provides ESLint linting for TypeScript/JavaScript files.
 */

import { log } from "../../logging/index.js";
import type { Linter, ValidationProblem } from "../code-validator.js";

export class ESLintLinter implements Linter {
  name = "ESLint";
  private eslintLoaded = false;
  private eslintInstance: any = null;

  /**
   * Lint file with ESLint
   */
  async lint(filePath: string, content: string): Promise<ValidationProblem[]> {
    try {
      // Lazy load ESLint
      if (!this.eslintLoaded) {
        await this.loadESLint();
      }

      if (!this.eslintInstance) {
        log.w("ESLINT", "unavailable");
        return [];
      }

      // Lint text
      const results = await this.eslintInstance.lintText(content, {
        filePath,
      });

      const problems: ValidationProblem[] = [];

      for (const result of results) {
        for (const message of result.messages) {
          problems.push({
            severity: message.severity === 2 ? "error" : message.severity === 1 ? "warning" : "info",
            message: message.message,
            line: message.line,
            column: message.column,
            ruleId: message.ruleId || undefined,
            source: "ESLint",
          });
        }
      }

      return problems;
    } catch (error) {
      log.w("ESLINT", "lint_fail", { err: String(error) });
      return [];
    }
  }

  /**
   * Load ESLint library
   */
  private async loadESLint(): Promise<void> {
    try {
      // Try to import ESLint
      const eslintModule = await import("eslint");
      const { ESLint } = eslintModule;

      this.eslintInstance = new ESLint({
        // Try to use project's ESLint config
        cwd: process.cwd(),
      });

      this.eslintLoaded = true;
      log.i("ESLINT", "loaded");
    } catch (error) {
      log.w("ESLINT", "load_fail", { err: String(error) });
      this.eslintLoaded = true; // Don't try again
      this.eslintInstance = null;
    }
  }
}
