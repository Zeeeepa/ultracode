/**
 * Condition Trace — Variable dependency analysis
 *
 * Analyzes whether a variable's existence or value depends on
 * conditional branches. Uses CFG + reaching definitions (already
 * ported) with text-based fallback for non-tree-sitter languages.
 *
 * Ported from ultracode.zig/src/tracing/condition_trace.zig
 */

// =============================================================================
// TYPES
// =============================================================================

export enum ConditionDependency {
  /** Variable may not exist without this condition (declaration in branch) */
  Existence = "existence",
  /** Variable's value depends on this condition (assignment in branch) */
  Value = "value",
  /** Variable is always assigned (not in any branch) */
  Unconditional = "unconditional",
}

export interface VariableDep {
  kind: ConditionDependency;
  conditions: string[]; // innermost→outermost
  sourceLine: number;
  sourceFile: string;
  assignmentText: string;
}

export interface VariableTraceResult {
  success: boolean;
  existenceDeps: VariableDep[];
  valueDeps: VariableDep[];
  unconditionalDefs: VariableDep[];
  totalDefs: number;
}

// =============================================================================
// TEXT-BASED ANALYSIS (fallback for non-tree-sitter languages)
// =============================================================================

const COND_KEYWORDS = new Set(["if", "while", "for", "switch", "case", "match", "when", "elif", "elsif", "else if"]);
const MAX_BACKWARD_LINES = 50;
const MAX_CONDITIONS = 6;

/**
 * Analyze variable dependencies using text-based indentation analysis.
 * Fallback for languages without tree-sitter CFG support.
 */
export function analyzeVariableDepsTextBased(
  source: string,
  startLine: number,
  endLine: number,
  variableName: string,
  filePath: string,
): VariableTraceResult {
  const lines = source.split("\n");
  const result: VariableTraceResult = {
    success: true,
    existenceDeps: [],
    valueDeps: [],
    unconditionalDefs: [],
    totalDefs: 0,
  };

  // Scan for variable definitions in range
  for (let i = startLine; i < Math.min(endLine, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;

    const trimmed = line.trim();
    const defKind = classifyLine(trimmed, variableName);
    if (!defKind) continue;

    result.totalDefs++;
    const indent = measureIndent(line);

    // Extract conditions by walking backward
    const conditions = extractConditionsBackward(lines, i, indent);

    const dep: VariableDep = {
      kind:
        conditions.length > 0
          ? defKind === "declaration"
            ? ConditionDependency.Existence
            : ConditionDependency.Value
          : ConditionDependency.Unconditional,
      conditions,
      sourceLine: i + 1,
      sourceFile: filePath,
      assignmentText: trimmed.slice(0, 80),
    };

    if (dep.kind === ConditionDependency.Existence) result.existenceDeps.push(dep);
    else if (dep.kind === ConditionDependency.Value) result.valueDeps.push(dep);
    else result.unconditionalDefs.push(dep);
  }

  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

type DefKind = "declaration" | "assignment" | "parameter";

function classifyLine(trimmed: string, variableName: string): DefKind | null {
  // const x = / let x = / var x =
  if (trimmed.match(new RegExp(`(?:const|let|var|val|auto)\\s+${escapeRegex(variableName)}\\s*[=:]`))) {
    return "declaration";
  }
  // x = (assignment)
  if (trimmed.match(new RegExp(`^${escapeRegex(variableName)}\\s*[=](?!=)`))) {
    return "assignment";
  }
  // for (x of/in ...)
  if (trimmed.match(new RegExp(`for\\s*\\(.*${escapeRegex(variableName)}.*(?:of|in)`))) {
    return "declaration";
  }
  return null;
}

function measureIndent(line: string): number {
  let indent = 0;
  for (const ch of line) {
    if (ch === " ") indent++;
    else if (ch === "\t") indent += 4;
    else break;
  }
  return indent;
}

function extractConditionsBackward(lines: string[], targetLine: number, targetIndent: number): string[] {
  const conditions: string[] = [];
  let scannedLines = 0;

  for (let i = targetLine - 1; i >= 0 && scannedLines < MAX_BACKWARD_LINES && conditions.length < MAX_CONDITIONS; i--) {
    const line = lines[i];
    if (!line) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;
    scannedLines++;

    const lineIndent = measureIndent(line);
    if (lineIndent >= targetIndent) continue; // Skip same or deeper indentation

    // Check if this is a condition keyword line
    const firstWord = trimmed.split(/[\s(]/)[0]?.toLowerCase() ?? "";
    if (COND_KEYWORDS.has(firstWord)) {
      conditions.push(trimmed.slice(0, 120));
      targetIndent = lineIndent; // Next condition must be at even less indentation
    }
  }

  return conditions;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
