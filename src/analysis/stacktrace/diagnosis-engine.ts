/**
 * Diagnosis Engine
 *
 * Orchestrates stacktrace analysis:
 * 1. Parse stacktrace → frames
 * 2. Classify error → category + severity
 * 3. Resolve frames → graph entities
 * 4. Optionally run trace_backwards on crash point
 * 5. Optionally run impact analysis on crash entity
 * 6. Search for missing checks and error handlers
 * 7. Generate suggested fixes and Mermaid diagram
 */

import { classifyError } from "./error-classifier.js";
import type { FrameResolverStorage } from "./frame-resolver.js";
import { resolveFrames } from "./frame-resolver.js";
import type { ParsedStacktrace, ResolvedFrame, StacktraceDiagnosis, SuggestedFix } from "./types.js";

// =============================================================================
// Minimal interface for optional TraceEngine dependency
// =============================================================================

/** Subset of TraceEngine used by diagnosis — accepts any object with traceBackwards */
export interface DiagnosisTraceEngine {
  traceBackwards(opts: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface DiagnosisOptions {
  includeBackwardsTrace?: boolean | undefined;
  includeImpactAnalysis?: boolean | undefined;
  depth?: number | undefined;
  projectPath?: string | undefined;
}

// =============================================================================
// Main Diagnosis Engine
// =============================================================================

export async function diagnose(
  parsed: ParsedStacktrace,
  storage: FrameResolverStorage,
  traceEngine?: DiagnosisTraceEngine,
  options: DiagnosisOptions = {},
): Promise<StacktraceDiagnosis> {
  const { includeBackwardsTrace = true, includeImpactAnalysis = true, depth = 10 } = options;

  // 1. Classify error
  const classification = classifyError(parsed);

  // 2. Resolve frames
  const resolvedFrames = await resolveFrames(parsed.frames, storage);

  // 3. Find crash point (first resolved frame, or first frame)
  const crashFrame = resolvedFrames.find((f) => f.resolved) ?? resolvedFrames[0];
  const crashLocation = crashFrame
    ? { frame: crashFrame, codeContext: undefined as string | undefined }
    : { frame: resolvedFrames[0] ?? createEmptyFrame(parsed), codeContext: undefined };

  // Try to get code context for crash point
  if (crashFrame?.entityId) {
    try {
      const entities = await storage.findEntities({ filters: {}, limit: 1 });
      // Code context would come from the entity's code field
      // We don't have direct getEntity here, so skip for now
      void entities;
    } catch {
      // ignore
    }
  }

  // 4. Backwards trace (optional)
  let backwardsTrace: StacktraceDiagnosis["backwardsTrace"];
  if (includeBackwardsTrace && traceEngine && crashFrame?.resolved && crashFrame.entityName) {
    try {
      const targetName = crashFrame.className
        ? `${crashFrame.filePath ?? ""}:${crashFrame.className}.${crashFrame.functionName}`
        : `${crashFrame.filePath ?? ""}:${crashFrame.functionName}`;

      const btResult = await traceEngine.traceBackwards({
        target: targetName,
        question: "what_affects",
        depth,
      });

      // Extract fields safely from the untyped result
      const callers = Array.isArray(btResult["callers"]) ? (btResult["callers"] as Array<Record<string, unknown>>) : [];
      const blockConds = Array.isArray(btResult["blockingConditions"])
        ? (btResult["blockingConditions"] as Array<Record<string, unknown>>)
        : [];
      const diag = (btResult["diagnosis"] ?? {}) as Record<string, unknown>;

      backwardsTrace = {
        callers: callers.map((c) => ({
          name: String(c["name"] ?? ""),
          file: String(c["file"] ?? ""),
          line: Number(c["line"] ?? 0),
        })),
        blockingConditions: blockConds.map((b) => ({
          condition: String(b["condition"] ?? ""),
          location: String(b["location"] ?? ""),
        })),
        diagnosis: String(diag["mostLikely"] ?? ""),
      };
    } catch {
      // traceBackwards not available or failed
    }
  }

  // 5. Impact analysis (optional) — uses graph relationships
  let impactAnalysis: StacktraceDiagnosis["impactAnalysis"];
  if (includeImpactAnalysis && crashFrame?.resolved && crashFrame.entityId) {
    try {
      // Collect dependent entities by searching for references
      const searchName = crashFrame.entityName ?? crashFrame.functionName;
      const dependents = await storage.searchEntities({ namePattern: searchName });
      const dependentFiles = [...new Set(dependents.filter((e) => e.filePath).map((e) => e.filePath!))];

      impactAnalysis = {
        affectedEntities: dependents.length,
        riskScore: Math.min(dependents.length / 10, 1),
        dependentFiles: dependentFiles.slice(0, 20),
      };
    } catch {
      // ignore
    }
  }

  // 6. Search for related patterns (error handlers, guards, missing checks)
  const relatedPatterns = {
    errorHandlers: [] as string[],
    guards: [] as string[],
    missingChecks: classification.missingCheckHints,
  };

  // Search for error handlers near crash point
  if (crashFrame?.filePath) {
    try {
      const fileEntities = await storage.findEntities({
        filePath: crashFrame.filePath,
        limit: 200,
      });
      for (const entity of fileEntities) {
        const name = entity.name.toLowerCase();
        if (name.includes("catch") || name.includes("error") || name.includes("handler") || name.includes("fallback")) {
          relatedPatterns.errorHandlers.push(`${entity.name} (${entity.type})`);
        }
        if (name.includes("guard") || name.includes("check") || name.includes("validate") || name.includes("assert")) {
          relatedPatterns.guards.push(`${entity.name} (${entity.type})`);
        }
      }
    } catch {
      // ignore
    }
  }

  // 7. Generate suggested fixes
  const suggestedFixes = generateFixes(parsed, classification, crashFrame, resolvedFrames);

  // 8. Generate Mermaid diagram
  const mermaidDiagram = generateMermaidDiagram(resolvedFrames, crashFrame);

  // 9. Generate text summary
  const formatted = formatDiagnosis(
    parsed,
    classification,
    resolvedFrames,
    crashFrame,
    backwardsTrace,
    impactAnalysis,
    suggestedFixes,
  );

  const resolvedCount = resolvedFrames.filter((f) => f.resolved).length;

  return {
    language: parsed.language,
    errorCategory: classification.category,
    errorType: parsed.errorType,
    errorMessage: parsed.errorMessage,
    severity: classification.severity,
    crashLocation,
    callChain: resolvedFrames,
    resolvedFrameCount: resolvedCount,
    totalFrameCount: parsed.frames.length,
    backwardsTrace,
    impactAnalysis,
    relatedPatterns,
    suggestedFixes,
    mermaidDiagram,
    formatted,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function createEmptyFrame(parsed: ParsedStacktrace): ResolvedFrame {
  return {
    index: 0,
    functionName: "<unknown>",
    raw: parsed.rawText.split("\n")[0] ?? "",
    resolved: false,
    confidence: 0,
  };
}

function generateFixes(
  parsed: ParsedStacktrace,
  classification: ReturnType<typeof classifyError>,
  crashFrame: ResolvedFrame | undefined,
  resolvedFrames: ResolvedFrame[],
): SuggestedFix[] {
  const fixes: SuggestedFix[] = [];
  const location = crashFrame ? `${crashFrame.filePath ?? "unknown"}:${crashFrame.lineNumber ?? "?"}` : "unknown";

  // Category-specific fixes
  for (const hint of classification.missingCheckHints) {
    fixes.push({
      location,
      description: hint,
      priority: "high",
    });
  }

  // If crash is deep in call chain, suggest adding error handling higher up
  const firstUserFrame = resolvedFrames.find((f) => f.resolved && f.index > 0);
  if (firstUserFrame && firstUserFrame.index > 2) {
    fixes.push({
      location: `${firstUserFrame.filePath ?? "unknown"}:${firstUserFrame.lineNumber ?? "?"}`,
      description: `Add try-catch in ${firstUserFrame.functionName}() to handle ${parsed.errorType} from deeper call`,
      priority: "medium",
    });
  }

  // For causedBy chains, suggest wrapping the inner exception
  if (parsed.causedBy) {
    fixes.push({
      location,
      description: `Handle inner ${parsed.causedBy.errorType} before it propagates as ${parsed.errorType}`,
      priority: "high",
    });
  }

  return fixes;
}

function generateMermaidDiagram(frames: ResolvedFrame[], crashFrame: ResolvedFrame | undefined): string {
  if (frames.length === 0) return "";

  const lines: string[] = ["flowchart TD"];
  const displayFrames = frames.slice(0, 15); // limit for readability

  for (let i = 0; i < displayFrames.length; i++) {
    const frame = displayFrames[i]!;
    const label = frame.className ? `${frame.className}.${frame.functionName}` : frame.functionName;
    const loc = frame.lineNumber ? `:${frame.lineNumber}` : "";
    const nodeId = `F${i}`;

    // Crash point gets special styling
    if (frame === crashFrame) {
      lines.push(`  ${nodeId}["${sanitize(label)}${loc}"]:::crash`);
    } else if (frame.resolved) {
      lines.push(`  ${nodeId}["${sanitize(label)}${loc}"]:::resolved`);
    } else {
      lines.push(`  ${nodeId}["${sanitize(label)}${loc}"]:::external`);
    }

    // Connect to next frame
    if (i < displayFrames.length - 1) {
      lines.push(`  F${i + 1} --> ${nodeId}`);
    }
  }

  // Styles
  lines.push("  classDef crash fill:#ff4444,stroke:#cc0000,color:#fff");
  lines.push("  classDef resolved fill:#4488ff,stroke:#2266cc,color:#fff");
  lines.push("  classDef external fill:#888,stroke:#666,color:#fff");

  return lines.join("\n");
}

function formatDiagnosis(
  parsed: ParsedStacktrace,
  classification: ReturnType<typeof classifyError>,
  frames: ResolvedFrame[],
  crashFrame: ResolvedFrame | undefined,
  backwardsTrace: StacktraceDiagnosis["backwardsTrace"],
  impactAnalysis: StacktraceDiagnosis["impactAnalysis"],
  fixes: SuggestedFix[],
): string {
  const lines: string[] = [];
  const resolvedCount = frames.filter((f) => f.resolved).length;

  const severityIcon: Record<string, string> = {
    critical: "\uD83D\uDD34",
    high: "\uD83D\uDFE0",
    medium: "\uD83D\uDFE1",
    low: "\uD83D\uDFE2",
  };

  lines.push(`\u2550\u2550\u2550 Stacktrace Diagnosis \u2550\u2550\u2550`);
  lines.push(
    `${severityIcon[classification.severity] ?? ""} ${classification.severity.toUpperCase()}: ${parsed.errorType}: ${parsed.errorMessage}`,
  );
  lines.push(`Category: ${classification.category} \u2014 ${classification.description}`);
  lines.push(`Language: ${parsed.language}`);
  lines.push(`Frames: ${frames.length} total, ${resolvedCount} resolved`);
  lines.push("");

  // Crash point
  if (crashFrame) {
    const name = crashFrame.className ? `${crashFrame.className}.${crashFrame.functionName}` : crashFrame.functionName;
    lines.push(`\u2500\u2500\u2500 Crash Point \u2500\u2500\u2500`);
    lines.push(`  \u26A1 ${name}`);
    if (crashFrame.filePath) {
      lines.push(`     ${crashFrame.filePath}:${crashFrame.lineNumber ?? "?"}`);
    }
    if (crashFrame.resolved) {
      lines.push(`     Entity: ${crashFrame.entityName} (${crashFrame.entityType})`);
    }
    lines.push("");
  }

  // Call chain (top 10)
  lines.push(`\u2500\u2500\u2500 Call Chain \u2500\u2500\u2500`);
  const displayFrames = frames.slice(0, 10);
  for (const frame of displayFrames) {
    const icon = frame === crashFrame ? "\u26A1" : frame.resolved ? "\u2192" : "\u00B7";
    const name = frame.className ? `${frame.className}.${frame.functionName}` : frame.functionName;
    const loc = frame.filePath ? ` (${frame.filePath}:${frame.lineNumber ?? "?"})` : "";
    lines.push(`  ${frame.index}. ${icon} ${name}${loc}`);
  }
  if (frames.length > 10) {
    lines.push(`  ... and ${frames.length - 10} more frames`);
  }
  lines.push("");

  // Backwards trace
  if (backwardsTrace) {
    lines.push(`\u2500\u2500\u2500 Backwards Trace \u2500\u2500\u2500`);
    if (backwardsTrace.callers.length > 0) {
      lines.push(`  Callers:`);
      for (const c of backwardsTrace.callers.slice(0, 5)) {
        lines.push(`    \u2190 ${c.name} (${c.file}:${c.line})`);
      }
    }
    if (backwardsTrace.blockingConditions.length > 0) {
      lines.push(`  Blocking conditions:`);
      for (const b of backwardsTrace.blockingConditions.slice(0, 3)) {
        lines.push(`    \u26D4 ${b.condition} @ ${b.location}`);
      }
    }
    if (backwardsTrace.diagnosis) {
      lines.push(`  Diagnosis: ${backwardsTrace.diagnosis}`);
    }
    lines.push("");
  }

  // Impact analysis
  if (impactAnalysis) {
    lines.push(`\u2500\u2500\u2500 Impact Analysis \u2500\u2500\u2500`);
    lines.push(`  Affected entities: ${impactAnalysis.affectedEntities}`);
    lines.push(`  Risk score: ${Math.round(impactAnalysis.riskScore * 100)}%`);
    if (impactAnalysis.dependentFiles.length > 0) {
      lines.push(`  Dependent files:`);
      for (const f of impactAnalysis.dependentFiles.slice(0, 5)) {
        lines.push(`    \u2022 ${f}`);
      }
    }
    lines.push("");
  }

  // Suggested fixes
  if (fixes.length > 0) {
    lines.push(`\u2500\u2500\u2500 Suggested Fixes \u2500\u2500\u2500`);
    for (const fix of fixes) {
      const pri =
        fix.priority === "high" ? "\uD83D\uDD34" : fix.priority === "medium" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
      lines.push(`  ${pri} [${fix.priority}] ${fix.description}`);
      lines.push(`     @ ${fix.location}`);
    }
  }

  return lines.join("\n");
}

function sanitize(text: string): string {
  return text
    .replace(/["\n\r]/g, " ")
    .replace(/[{}[\]<>|]/g, "")
    .trim()
    .substring(0, 50);
}
