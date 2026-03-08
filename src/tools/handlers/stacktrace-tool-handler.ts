/**
 * MCP Handler for analyze_stacktrace tool
 *
 * Parses stacktraces, resolves frames to graph entities,
 * classifies errors, and orchestrates diagnosis.
 */

import type { z } from "zod";
import { type DiagnosisTraceEngine, diagnose } from "../../analysis/stacktrace/diagnosis-engine.js";
import { parseStacktrace } from "../../analysis/stacktrace/stacktrace-parser.js";
import type { StacktraceDiagnosis } from "../../analysis/stacktrace/types.js";
import { TraceEngine } from "../../tracing/trace-engine.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { AnalyzeStacktraceSchema } from "../schemas/stacktrace-schemas.js";

type Args = z.infer<typeof AnalyzeStacktraceSchema>;

export class AnalyzeStacktraceToolHandler extends BaseToolHandler<Args> {
  protected parseArgs(args: unknown): Args {
    return AnalyzeStacktraceSchema.parse(args);
  }

  protected async execute(args: Args): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    // Parse the stacktrace
    const parsed = parseStacktrace(args.stacktrace, args.language);

    if (parsed.frames.length === 0 && parsed.language === "unknown") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Could not parse stacktrace. No recognizable frame patterns found.",
              hint: "Try providing a language hint via the 'language' parameter.",
              rawInput: args.stacktrace.substring(0, 200),
            }),
          },
        ],
      };
    }

    // Create TraceEngine for backwards analysis (optional)
    let traceEngine: DiagnosisTraceEngine | undefined;
    if (args.includeBackwardsTrace) {
      try {
        traceEngine = new TraceEngine(storage) as unknown as DiagnosisTraceEngine;
      } catch {
        // TraceEngine may not be available
      }
    }

    // Run diagnosis
    const diagnosis = await diagnose(parsed, storage, traceEngine, {
      includeBackwardsTrace: args.includeBackwardsTrace,
      includeImpactAnalysis: args.includeImpactAnalysis,
      depth: args.depth,
      projectPath: args.projectPath,
    });

    // Format output based on requested format
    const output = formatOutput(diagnosis, args.format);

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
}

function formatOutput(diagnosis: StacktraceDiagnosis, format: string): string {
  switch (format) {
    case "mermaid":
      return diagnosis.mermaidDiagram || "No diagram available (no frames parsed)";

    case "json":
      return JSON.stringify(
        {
          language: diagnosis.language,
          errorCategory: diagnosis.errorCategory,
          errorType: diagnosis.errorType,
          errorMessage: diagnosis.errorMessage,
          severity: diagnosis.severity,
          crashLocation: {
            function: diagnosis.crashLocation.frame.functionName,
            class: diagnosis.crashLocation.frame.className,
            file: diagnosis.crashLocation.frame.filePath,
            line: diagnosis.crashLocation.frame.lineNumber,
            resolved: diagnosis.crashLocation.frame.resolved,
            entityId: diagnosis.crashLocation.frame.entityId,
          },
          resolvedFrameCount: diagnosis.resolvedFrameCount,
          totalFrameCount: diagnosis.totalFrameCount,
          callChain: diagnosis.callChain.map((f) => ({
            index: f.index,
            function: f.functionName,
            class: f.className,
            file: f.filePath,
            line: f.lineNumber,
            resolved: f.resolved,
            entityId: f.entityId,
          })),
          backwardsTrace: diagnosis.backwardsTrace,
          impactAnalysis: diagnosis.impactAnalysis,
          relatedPatterns: diagnosis.relatedPatterns,
          suggestedFixes: diagnosis.suggestedFixes,
        },
        null,
        2,
      );

    case "text":
    default:
      return diagnosis.formatted;
  }
}
