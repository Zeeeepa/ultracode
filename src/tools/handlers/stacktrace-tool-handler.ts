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
import {
  buildRecentChangeSummary,
  type EntityInfoInput,
  formatRecentChangesSection,
  getAdapterFromStorage,
  type RecentChangeSummary,
} from "../utils/recent-changes-enrichment.js";

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

    // Enrich with recently-changed status if requested
    let recentChangeSummary: RecentChangeSummary | null = null;
    let crashPointHistory: unknown[] | null = null;
    if (args.highlightRecentChanges) {
      const entityInfos: EntityInfoInput[] = [];

      // Crash location — critical significance
      if (diagnosis.crashLocation.frame.entityId) {
        entityInfos.push({
          entityId: diagnosis.crashLocation.frame.entityId,
          significance: "critical",
          entityName: diagnosis.crashLocation.frame.functionName,
          filePath: diagnosis.crashLocation.frame.filePath,
        });

        // Get entity history for crash point
        try {
          const adapter = getAdapterFromStorage(storage);
          if (adapter) {
            const commitManager = adapter.getCommitManager?.();
            const nodeStore = adapter.getProllyNodeStore?.();
            if (commitManager && nodeStore) {
              const { TimeTravelManager } = await import("../../storage/prolly/time-travel.js");
              const timeTravel = new TimeTravelManager(nodeStore, commitManager);
              const history = await timeTravel.getEntityHistory(diagnosis.crashLocation.frame.entityId, 3);
              if (history.length > 0) {
                crashPointHistory = history.map((h) => ({
                  commitHash: h.commitHash,
                  changeType: h.changeType,
                  timestamp: h.timestamp,
                }));
              }
            }
          }
        } catch {
          // Entity history unavailable — non-critical
        }
      }

      // Call chain entities — high significance
      for (const frame of diagnosis.callChain) {
        if (frame.resolved && frame.entityId) {
          entityInfos.push({
            entityId: frame.entityId,
            significance: "high",
            entityName: frame.functionName,
            filePath: frame.filePath,
          });
        }
      }

      if (entityInfos.length > 0) {
        recentChangeSummary = await buildRecentChangeSummary(storage, entityInfos, args.recentCommitsCount);
      }
    }

    // Format output based on requested format
    const output = formatOutput(diagnosis, args.format, recentChangeSummary, crashPointHistory);

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

function formatOutput(
  diagnosis: StacktraceDiagnosis,
  format: string,
  recentChangeSummary: RecentChangeSummary | null,
  crashPointHistory: unknown[] | null,
): string {
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
          ...(recentChangeSummary ? { recentChangeSummary } : {}),
          ...(crashPointHistory ? { crashPointHistory } : {}),
        },
        null,
        2,
      );

    case "text":
    default: {
      let text = diagnosis.formatted;
      if (recentChangeSummary) {
        text += formatRecentChangesSection(recentChangeSummary);
      }
      if (crashPointHistory) {
        text += `\n\nCrash Point History (last ${(crashPointHistory as Array<{ commitHash: string; changeType: string }>).length} commits):\n`;
        for (const h of crashPointHistory as Array<{ commitHash: string; changeType: string }>) {
          text += `  ${h.commitHash.substring(0, 8)} — ${h.changeType}\n`;
        }
      }
      return text;
    }
  }
}
