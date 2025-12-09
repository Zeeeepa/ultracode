/**
 * Pyright Integration for Python Parser
 *
 * Provides optional type checking and type inference using Microsoft Pyright.
 * Pyright can be installed via npm (pyright) or pip (pyright).
 *
 * Features:
 * - Type diagnostics (errors, warnings)
 * - Inferred types for variables and functions
 * - Symbol information with resolved types
 *
 * Philosophy: Optional enhancement - works without Pyright installed.
 */

import { spawn } from "node:child_process";
import type { ParsedEntity } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Pyright diagnostic from JSON output
 */
export interface PyrightDiagnostic {
  file: string;
  severity: "error" | "warning" | "information";
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  rule?: string;
}

/**
 * Pyright JSON output format
 */
export interface PyrightOutput {
  version: string;
  time: string;
  generalDiagnostics: PyrightDiagnostic[];
  summary: {
    filesAnalyzed: number;
    errorCount: number;
    warningCount: number;
    informationCount: number;
    timeInSec: number;
  };
}

/**
 * Type information for a Python entity
 */
export interface PythonTypeInfo {
  /** Inferred or declared type */
  inferredType?: string;

  /** Is type fully resolved */
  isResolved?: boolean;

  /** Is type from stub file */
  isFromStub?: boolean;

  /** Related diagnostics */
  diagnostics?: Array<{
    severity: "error" | "warning" | "information";
    message: string;
    rule?: string;
  }>;
}

// =============================================================================
// PYRIGHT INTEGRATION CLASS
// =============================================================================

let pyrightPath: string | null = null;
let pyrightChecked = false;

/**
 * Check if Pyright is available
 */
async function findPyright(): Promise<string | null> {
  if (pyrightChecked) {
    return pyrightPath;
  }

  pyrightChecked = true;

  // Try different Pyright commands
  const commands = ["pyright", "npx pyright"];

  for (const cmd of commands) {
    try {
      const available = await checkCommand(cmd);
      if (available) {
        pyrightPath = cmd;
        console.error(`[PyrightIntegration] Found Pyright: ${cmd}`);
        return pyrightPath;
      }
    } catch {
      // Try next
    }
  }

  console.error("[PyrightIntegration] Pyright not found");
  return null;
}

/**
 * Check if a command is available
 */
function checkCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = cmd.split(" ");
    const command = parts[0];
    if (!command) {
      resolve(false);
      return;
    }

    const proc = spawn(command, [...parts.slice(1), "--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let timeoutHandle: NodeJS.Timeout | undefined;
    timeoutHandle = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);

    proc.on("error", () => {
      clearTimeout(timeoutHandle);
      resolve(false);
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timeoutHandle);
      resolve(code === 0);
    });
  });
}

/**
 * Run Pyright analysis on a file or directory
 */
export async function runPyrightAnalysis(
  target: string,
  options: {
    /** Use basic mode (faster) */
    basic?: boolean;
    /** Timeout in milliseconds */
    timeout?: number;
  } = {},
): Promise<PyrightOutput | null> {
  const pyright = await findPyright();
  if (!pyright) {
    return null;
  }

  const { basic = true, timeout = 30000 } = options;

  return new Promise((resolve) => {
    const args: string[] = ["--outputjson"];

    if (basic) {
      args.push("--level", "basic");
    }

    args.push(target);

    const parts = pyright.split(" ");
    const command = parts[0];
    if (!command) {
      resolve(null);
      return;
    }

    const proc = spawn(command, [...parts.slice(1), ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
      console.error("[PyrightIntegration] Analysis timed out");
      resolve(null);
    }, timeout);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (_data: Buffer) => {
      // Ignore stderr
    });

    proc.on("close", (_code: number | null) => {
      clearTimeout(timeoutId);

      if (timedOut) return;

      try {
        // Pyright outputs JSON even on errors
        const output = JSON.parse(stdout);
        resolve(output as PyrightOutput);
      } catch (e) {
        console.error("[PyrightIntegration] Failed to parse output:", e);
        resolve(null);
      }
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timeoutId);
      console.error("[PyrightIntegration] Spawn error:", err);
      resolve(null);
    });
  });
}

/**
 * Get diagnostics for a specific file
 */
export async function getFileDiagnostics(filePath: string): Promise<PyrightDiagnostic[]> {
  const result = await runPyrightAnalysis(filePath);

  if (!result) {
    return [];
  }

  return result.generalDiagnostics.filter((d) => d.file === filePath || d.file.endsWith(filePath.replace(/\\/g, "/")));
}

/**
 * Enhance parsed entities with Pyright type information
 */
export async function enhanceWithPyrightTypes(entities: ParsedEntity[], filePath: string): Promise<void> {
  const diagnostics = await getFileDiagnostics(filePath);

  if (diagnostics.length === 0) {
    return;
  }

  // Create a map of diagnostics by line
  const diagnosticsByLine = new Map<number, PyrightDiagnostic[]>();
  for (const diag of diagnostics) {
    const line = diag.range.start.line + 1; // Convert to 1-indexed
    const existing = diagnosticsByLine.get(line) || [];
    existing.push(diag);
    diagnosticsByLine.set(line, existing);
  }

  // Add diagnostics to entities based on their location
  for (const entity of entities) {
    if (!entity.location) continue;

    const startLine = entity.location.start.line;
    const endLine = entity.location.end?.line || startLine;

    const entityDiagnostics: PythonTypeInfo["diagnostics"] = [];

    for (let line = startLine; line <= endLine; line++) {
      const lineDiags = diagnosticsByLine.get(line);
      if (lineDiags) {
        for (const diag of lineDiags) {
          entityDiagnostics.push({
            severity: diag.severity,
            message: diag.message,
            rule: diag.rule,
          });
        }
      }
    }

    if (entityDiagnostics.length > 0) {
      (entity as any).typeInfo = {
        diagnostics: entityDiagnostics,
      } as PythonTypeInfo;
    }
  }
}

// =============================================================================
// PYRIGHT TYPE STUB SCRIPT
// =============================================================================

/**
 * Python script to extract type information using Pyright programmatically
 * This script runs inside Python and uses pyright's API
 */
export const PYRIGHT_TYPE_SCRIPT = `
import sys
import json

try:
    from pyright import api as pyright_api
    HAS_PYRIGHT = True
except ImportError:
    HAS_PYRIGHT = False

def get_type_info(file_path):
    """Get type information for a file using Pyright API."""
    if not HAS_PYRIGHT:
        return {"error": "pyright not installed"}

    try:
        # Run Pyright analysis
        results = pyright_api.run(["--outputjson", file_path])
        return json.loads(results.stdout)
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        result = get_type_info(sys.argv[1])
        print(json.dumps(result))
    else:
        print(json.dumps({"error": "No file specified"}))
`;

// =============================================================================
// EXPORTS
// =============================================================================

export { findPyright };
