/**
 * Validation Tool Handlers
 *
 * Handlers for code validation operations:
 * - validate_file
 * - validate_directory
 */

import { z } from "zod";
import { toError } from "../../utils/error-handling.js";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// VALIDATE FILE
// =============================================================================

const ValidateFileSchema = z.object({
  filePath: z.string(),
  projectPath: projectPathParam,
  validators: z.array(z.string()).optional(),
  fixable: z.boolean().optional().default(false),
});

export class ValidateFileToolHandler extends BaseToolHandler<z.infer<typeof ValidateFileSchema>> {
  protected parseArgs(args: unknown) {
    return ValidateFileSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ValidateFileSchema>): Promise<ToolResult> {
    const { extname } = await import("node:path");

    const filePath = this.context.normalizeInputPath(args.filePath) || args.filePath;
    const ext = extname(filePath).toLowerCase();

    const results: any[] = [];

    try {
      // Determine validators based on file extension
      const validators = args.validators || this.getDefaultValidators(ext);

      for (const validator of validators) {
        const result = await this.runValidator(validator, filePath, args.fixable);
        results.push(result);
      }

      const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);
      const totalWarnings = results.reduce((sum, r) => sum + (r.warnings || 0), 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file: filePath,
                validators: validators,
                totalErrors,
                totalWarnings,
                isValid: totalErrors === 0,
                results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }

  private getDefaultValidators(ext: string): string[] {
    const map: Record<string, string[]> = {
      ".ts": ["eslint", "tsc"],
      ".tsx": ["eslint", "tsc"],
      ".js": ["eslint"],
      ".jsx": ["eslint"],
      ".py": ["pylint", "mypy"],
      ".rs": ["cargo-check"],
      ".go": ["go-vet"],
      ".java": ["javac"],
    };
    return map[ext] || [];
  }

  private async runValidator(
    validator: string,
    filePath: string,
    fixable: boolean,
  ): Promise<{ validator: string; errors: number; warnings: number; issues: any[] }> {
    const { exec } = await import("../../utils/shell.js");
    const { dirname } = await import("node:path");

    const cwd = dirname(filePath);

    try {
      let command: string;
      switch (validator) {
        case "eslint":
          command = fixable ? `npx eslint --fix --format json "${filePath}"` : `npx eslint --format json "${filePath}"`;
          break;
        case "tsc":
          command = `npx tsc --noEmit "${filePath}" 2>&1`;
          break;
        case "pylint":
          command = `pylint --output-format=json "${filePath}"`;
          break;
        case "mypy":
          command = `mypy --no-error-summary "${filePath}"`;
          break;
        case "cargo-check":
          command = `cargo check --message-format=json 2>&1`;
          break;
        case "go-vet":
          command = `go vet "${filePath}" 2>&1`;
          break;
        default:
          return { validator, errors: 0, warnings: 0, issues: [{ message: "Unknown validator" }] };
      }

      const result = await exec(command, { cwd, timeout: 60000 });
      const issues = this.parseValidatorOutput(validator, result.stdout + result.stderr);

      return {
        validator,
        errors: issues.filter((i: any) => i.severity === "error").length,
        warnings: issues.filter((i: any) => i.severity === "warning").length,
        issues,
      };
    } catch (error: any) {
      // Many validators exit with non-zero on issues
      const output = error.stdout || error.stderr || error.message;
      const issues = this.parseValidatorOutput(validator, output);

      return {
        validator,
        errors: issues.filter((i: any) => i.severity === "error").length || 1,
        warnings: issues.filter((i: any) => i.severity === "warning").length,
        issues: issues.length > 0 ? issues : [{ message: output, severity: "error" }],
      };
    }
  }

  private parseValidatorOutput(validator: string, output: string): any[] {
    try {
      if (validator === "eslint" || validator === "pylint") {
        // Try JSON parse
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed)) {
          return parsed.flatMap((file: any) =>
            (file.messages || []).map((m: any) => ({
              line: m.line,
              column: m.column,
              message: m.message,
              rule: m.ruleId || m.symbol,
              severity: m.severity === 2 ? "error" : "warning",
            })),
          );
        }
      }
    } catch {
      // Not JSON, parse as text
    }

    // Simple line-based parsing
    const issues: any[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (line.includes("error") || line.includes("Error")) {
        issues.push({ message: line.trim(), severity: "error" });
      } else if (line.includes("warning") || line.includes("Warning")) {
        issues.push({ message: line.trim(), severity: "warning" });
      }
    }

    return issues;
  }
}

// =============================================================================
// VALIDATE DIRECTORY
// =============================================================================

const ValidateDirectorySchema = z.object({
  directory: z.string().optional(),
  projectPath: projectPathParam,
  validators: z.array(z.string()).optional(),
  extensions: z.array(z.string()).optional(),
  maxFiles: z.number().optional().default(100),
  parallel: z.boolean().optional().default(true),
});

export class ValidateDirectoryToolHandler extends BaseToolHandler<z.infer<typeof ValidateDirectorySchema>> {
  protected parseArgs(args: unknown) {
    return ValidateDirectorySchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ValidateDirectorySchema>): Promise<ToolResult> {
    const { glob } = await import("../../utils/glob.js");

    const directory = args.directory || this.context.config.directory;
    const extensions = args.extensions || [".ts", ".tsx", ".js", ".jsx", ".py"];

    try {
      // Find files
      const patterns = extensions.map((ext) => `**/*${ext}`);
      let files: string[] = [];

      for (const pattern of patterns) {
        const found = await glob(pattern, { cwd: directory, absolute: true });
        files.push(...found);
      }

      // Limit files
      files = files.slice(0, args.maxFiles);

      // Validate files
      const validateHandler = new ValidateFileToolHandler(this.context);
      const results: any[] = [];

      if (args.parallel) {
        const promises = files.map(async (file) => {
          const result = await validateHandler.handle({
            filePath: file,
            validators: args.validators,
          });
          const text = result.content[0]?.text || "{}";
          const parsed = JSON.parse(text as string);
          return { file, ...parsed };
        });
        results.push(...(await Promise.all(promises)));
      } else {
        for (const file of files) {
          const result = await validateHandler.handle({
            filePath: file,
            validators: args.validators,
          });
          const text = result.content[0]?.text || "{}";
          const parsed = JSON.parse(text as string);
          results.push({ file, ...parsed });
        }
      }

      // Aggregate results
      const totalErrors = results.reduce((sum, r) => sum + (r.totalErrors || 0), 0);
      const totalWarnings = results.reduce((sum, r) => sum + (r.totalWarnings || 0), 0);
      const invalidFiles = results.filter((r) => !r.isValid);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                directory,
                filesValidated: files.length,
                totalErrors,
                totalWarnings,
                invalidFilesCount: invalidFiles.length,
                summary: {
                  passed: files.length - invalidFiles.length,
                  failed: invalidFiles.length,
                },
                invalidFiles: invalidFiles.slice(0, 20).map((f: any) => ({
                  file: f.file,
                  errors: f.totalErrors,
                  warnings: f.totalWarnings,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}
