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
// TYPE DEFINITIONS
// =============================================================================

/**
 * Single validation issue from linter/validator
 */
interface ValidationIssue {
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  severity: "error" | "warning";
}

/**
 * Result from a single validator run
 */
interface ValidationResult {
  validator: string;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

/**
 * Complete file validation result
 */
interface FileValidationResult {
  file: string;
  validators: string[];
  totalErrors: number;
  totalWarnings: number;
  isValid: boolean;
  results: ValidationResult[];
}

/**
 * Parsed file from eslint/pylint JSON output
 */
interface ParsedValidatorFile {
  messages?: Array<{
    line?: number;
    column?: number;
    message?: string;
    ruleId?: string;
    symbol?: string;
    severity?: number;
  }>;
}

/**
 * Error with stdout/stderr from exec
 */
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

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

    const results: ValidationResult[] = [];

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
      ".ts": ["oxlint", "tsc"],
      ".tsx": ["oxlint", "tsc"],
      ".js": ["oxlint"],
      ".jsx": ["oxlint"],
      ".py": ["pylint", "mypy"],
      ".rs": ["cargo-check"],
      ".go": ["go-vet"],
      ".java": ["javac"],
    };
    return map[ext] || [];
  }

  private async runValidator(validator: string, filePath: string, fixable: boolean): Promise<ValidationResult> {
    const { exec } = await import("../../utils/shell.js");
    const { dirname } = await import("node:path");

    const cwd = dirname(filePath);

    try {
      let command: string;
      switch (validator) {
        case "oxlint": {
          // Find oxlint binary from package
          const oxlintBin = await this.findOxlintBin();
          command = fixable
            ? `"${oxlintBin}" --fix --format json "${filePath}"`
            : `"${oxlintBin}" --format json "${filePath}"`;
          break;
        }
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
          return { validator, errors: 0, warnings: 0, issues: [{ message: "Unknown validator", severity: "error" }] };
      }

      const result = await exec(command, { cwd, timeout: 60000 });
      const issues = this.parseValidatorOutput(validator, result.stdout + result.stderr);

      return {
        validator,
        errors: issues.filter((i: ValidationIssue) => i.severity === "error").length,
        warnings: issues.filter((i: ValidationIssue) => i.severity === "warning").length,
        issues,
      };
    } catch (error: unknown) {
      // Many validators exit with non-zero on issues
      const execError = error as ExecError;
      const output = execError.stdout || execError.stderr || execError.message;
      const issues = this.parseValidatorOutput(validator, output);

      return {
        validator,
        errors: issues.filter((i: ValidationIssue) => i.severity === "error").length || 1,
        warnings: issues.filter((i: ValidationIssue) => i.severity === "warning").length,
        issues: issues.length > 0 ? issues : [{ message: output, severity: "error" }],
      };
    }
  }

  private oxlintBinPath: string | null = null;

  /**
   * Find oxlint binary path from installed package
   */
  private async findOxlintBin(): Promise<string> {
    if (this.oxlintBinPath) return this.oxlintBinPath;

    const { createRequire } = await import("node:module");
    const { dirname, join } = await import("node:path");
    const { access } = await import("node:fs/promises");

    try {
      // Find oxlint package location
      const require = createRequire(import.meta.url);
      const oxlintPkg = require.resolve("oxlint/package.json");
      const oxlintDir = dirname(oxlintPkg);

      // Get binary name from package.json
      const pkg = require(oxlintPkg) as { bin?: Record<string, string> | string };
      const binPath = typeof pkg.bin === "string" ? pkg.bin : typeof pkg.bin === "object" ? pkg.bin["oxlint"] : null;

      if (binPath) {
        const fullPath = join(oxlintDir, binPath);
        await access(fullPath);
        this.oxlintBinPath = fullPath;
        return fullPath;
      }
    } catch {
      // Fallback to npx
    }

    this.oxlintBinPath = "npx oxlint";
    return "npx oxlint";
  }

  private parseValidatorOutput(validator: string, output: string): ValidationIssue[] {
    try {
      if (validator === "oxlint") {
        // oxlint JSON format: { diagnostics: [...] }
        const parsed = JSON.parse(output) as {
          diagnostics?: Array<{
            message: string;
            code?: string;
            severity: string;
            labels?: Array<{ span?: { line?: number; column?: number } }>;
          }>;
        };
        if (parsed.diagnostics) {
          return parsed.diagnostics.map((d) => ({
            line: d.labels?.[0]?.span?.line,
            column: d.labels?.[0]?.span?.column,
            message: d.message,
            rule: d.code,
            severity: d.severity === "error" ? "error" : "warning",
          }));
        }
      } else if (validator === "pylint") {
        // pylint JSON format: array of files with messages
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed)) {
          return parsed.flatMap((file: ParsedValidatorFile) =>
            (file.messages || []).map(
              (m): ValidationIssue => ({
                line: m.line,
                column: m.column,
                message: m.message || "Unknown error",
                rule: m.ruleId || m.symbol,
                severity: m.severity === 2 ? "error" : "warning",
              }),
            ),
          );
        }
      }
    } catch {
      // Not JSON, parse as text
    }

    // Simple line-based parsing
    const issues: ValidationIssue[] = [];
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

    const config = this.context.config as { directory?: string };
    const directory = args.directory || config.directory;
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
      const results: FileValidationResult[] = [];

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
                invalidFiles: invalidFiles.slice(0, 20).map((f: FileValidationResult) => ({
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
