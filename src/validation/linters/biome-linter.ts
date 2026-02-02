import { copyFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../../logging/index.js";
import { exec } from "../../utils/shell.js";
import type { Linter, ValidationProblem } from "../code-validator.js";

export class BiomeLinter implements Linter {
  name = "biome";
  private binPath: string | null = null;

  /**
   * Lint file with Biome
   * @param filePath - Path to file to lint
   * @param _content - File content (not used, Biome reads from disk)
   * @param autofix - Apply automatic fixes (biome check --write)
   * @param dryRun - Show what would be fixed without applying changes
   */
  async lint(filePath: string, _content: string, autofix = false, dryRun = false): Promise<ValidationProblem[]> {
    try {
      const bin = await this.getBinPath();

      // Dry-run режим: создать временный файл
      if (autofix && dryRun) {
        const tempFile = join(tmpdir(), `biome-dryrun-${Date.now()}.tmp`);

        try {
          // Скопировать в temp
          await copyFile(filePath, tempFile);

          // Применить автофиксы к копии
          const command = `"${bin}" check --write --reporter=json "${tempFile}"`;
          await exec(command, { timeout: 30000 });

          // Прочитать изменения
          const original = await readFile(filePath, "utf-8");
          const fixed = await readFile(tempFile, "utf-8");

          // Вернуть проблемы + информацию о том, что было бы исправлено
          const problems = await this.lint(filePath, _content, false);
          if (original !== fixed) {
            problems.push({
              severity: "info",
              message: `[DRY-RUN] Would apply autofixes (${fixed.length - original.length} chars diff)`,
              line: 0,
              column: 0,
              source: "biome",
            });
          }

          return problems;
        } finally {
          // Удалить временный файл
          await unlink(tempFile).catch(() => {});
        }
      }

      // Обычная логика
      const writeFlag = autofix ? "--write" : "";
      const command = `"${bin}" check ${writeFlag} --reporter=json "${filePath}"`;

      const { stdout, stderr } = await exec(command, { timeout: 30000 });
      return this.parseOutput(stdout || stderr);
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      const output = err.stdout || err.stderr || "";
      if (output) {
        return this.parseOutput(output);
      }
      log.w("BIOME", "lint_fail", { err: String(error) });
      return [];
    }
  }

  private parseOutput(output: string): ValidationProblem[] {
    try {
      const parsed = JSON.parse(output) as {
        diagnostics?: Array<{
          message: { content: string };
          severity: string;
          location?: { span?: { start?: { line: number; column: number } } };
          category?: string;
        }>;
      };

      if (!parsed.diagnostics) return [];

      return parsed.diagnostics.map((d) => ({
        severity: d.severity === "error" ? "error" : "warning",
        message: d.message.content,
        line: d.location?.span?.start?.line ?? 0,
        column: d.location?.span?.start?.column ?? 0,
        ruleId: d.category,
        source: "biome",
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
      const biomePkg = require.resolve("@biomejs/biome/package.json");
      const biomeDir = dirname(biomePkg);

      // Biome binary обычно в bin/biome
      const binPath = join(biomeDir, "bin", "biome");
      await access(binPath);
      this.binPath = binPath;
      return binPath;
    } catch (error) {
      // Biome не найден (критическая ошибка, так как в dependencies)
      log.e("BIOME", "not_found", {
        err: String(error),
        hint: "Biome should be in dependencies",
      });
      throw new Error("Biome binary not found (check installation)");
    }
  }
}
