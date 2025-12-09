/**
 * Kotlin Compiler Integration
 *
 * Provides Kotlin syntax validation using kotlinc compiler.
 * Uses the Kotlin compiler if available for syntax checking.
 *
 * Philosophy: Kotlin developers have kotlinc installed.
 */

import { spawnSync } from "node:child_process";
import type { ParsedEntity } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

export interface KotlinDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  column?: number;
  file?: string;
}

export interface KotlinCompileResult {
  success: boolean;
  diagnostics: KotlinDiagnostic[];
}

// =============================================================================
// KOTLINC INTEGRATION
// =============================================================================

let kotlincPath: string | null = null;
let kotlincChecked = false;

/**
 * Find kotlinc executable
 */
export async function findKotlinc(): Promise<string | null> {
  if (kotlincChecked) {
    return kotlincPath;
  }

  kotlincChecked = true;

  const commands = ["kotlinc", "kotlin-compiler", "kotlinc.bat"];

  for (const cmd of commands) {
    try {
      const result = spawnSync(cmd, ["-version"], {
        timeout: 10000,
        encoding: "utf-8",
        windowsHide: true,
      });
      if (result.status === 0 || result.stdout?.includes("Kotlin")) {
        kotlincPath = cmd;
        console.error(`[KotlinCompilerIntegration] Found kotlinc: ${cmd}`);
        return kotlincPath;
      }
    } catch {
      // Try next
    }
  }

  console.error("[KotlinCompilerIntegration] kotlinc not found");
  return null;
}

/**
 * Check if kotlinc is available
 */
export function isKotlincAvailable(): boolean {
  return kotlincPath !== null;
}

/**
 * Validate Kotlin source using kotlinc
 * Returns diagnostics without actually compiling
 */
export function validateKotlinSyntax(_filePath: string, content: string): KotlinCompileResult {
  if (!kotlincPath) {
    return { success: true, diagnostics: [] };
  }

  try {
    // Use kotlinc -script to check syntax without full compilation
    // This is faster than full compilation
    const result = spawnSync(
      kotlincPath,
      [
        "-nowarn",
        "-Werror",
        "-d",
        "/dev/null", // Don't output class files
        "-language-version",
        "1.9",
        "-script",
        "-",
      ],
      {
        input: content,
        timeout: 30000,
        encoding: "utf-8",
        windowsHide: true,
      },
    );

    const diagnostics: KotlinDiagnostic[] = [];

    // Parse compiler output for errors
    const errorLines = (result.stderr || "").split("\n");
    for (const line of errorLines) {
      // Format: file.kt:line:column: error: message
      const errorMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/);
      if (errorMatch) {
        diagnostics.push({
          severity: errorMatch[4] === "error" ? "error" : "warning",
          message: errorMatch[5] ?? "",
          line: Number.parseInt(errorMatch[2] ?? "0", 10),
          column: Number.parseInt(errorMatch[3] ?? "0", 10),
          file: errorMatch[1],
        });
      } else if (line.includes("error:")) {
        diagnostics.push({
          severity: "error",
          message: line.replace(/^.*error:\s*/, ""),
        });
      }
    }

    return {
      success: result.status === 0 && diagnostics.filter((d) => d.severity === "error").length === 0,
      diagnostics,
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          severity: "error",
          message: `Kotlin compiler error: ${error}`,
        },
      ],
    };
  }
}

/**
 * Enhance parsed entities with Kotlin compiler diagnostics
 */
export function enhanceWithKotlinDiagnostics(entities: ParsedEntity[], filePath: string, content: string): void {
  if (!kotlincPath) return;

  const result = validateKotlinSyntax(filePath, content);

  if (result.diagnostics.length === 0) return;

  // Create a map of diagnostics by line
  const diagnosticsByLine = new Map<number, KotlinDiagnostic[]>();
  for (const diag of result.diagnostics) {
    if (diag.line) {
      const existing = diagnosticsByLine.get(diag.line) || [];
      existing.push(diag);
      diagnosticsByLine.set(diag.line, existing);
    }
  }

  // Add diagnostics to entities based on their location
  for (const entity of entities) {
    if (!entity.location) continue;

    const startLine = entity.location.start.line;
    const endLine = entity.location.end?.line || startLine;

    const entityDiagnostics: Array<{
      severity: string;
      message: string;
    }> = [];

    for (let line = startLine; line <= endLine; line++) {
      const lineDiags = diagnosticsByLine.get(line);
      if (lineDiags) {
        for (const diag of lineDiags) {
          entityDiagnostics.push({
            severity: diag.severity,
            message: diag.message,
          });
        }
      }
    }

    if (entityDiagnostics.length > 0) {
      (entity as any).diagnostics = entityDiagnostics;
    }
  }
}

// =============================================================================
// KOTLIN SCRIPT SUPPORT
// =============================================================================

/**
 * Check if file is a Kotlin script (.kts)
 */
export function isKotlinScript(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".kts");
}

/**
 * Get Kotlin version from kotlinc
 */
export function getKotlinVersion(): string | null {
  if (!kotlincPath) return null;

  try {
    const result = spawnSync(kotlincPath, ["-version"], {
      timeout: 5000,
      encoding: "utf-8",
      windowsHide: true,
    });

    const versionMatch = (result.stdout || result.stderr || "").match(/(\d+\.\d+\.\d+)/);
    return versionMatch?.[1] ?? null;
  } catch {
    return null;
  }
}
