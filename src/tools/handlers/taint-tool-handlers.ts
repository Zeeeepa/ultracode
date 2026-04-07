import { z } from "zod";
import { log } from "../../logging/index.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { MAX_PAGE_SIZE, paginate, SAFE_LIMITS } from "../response-limits.js";

const TaintAnalysisSchema = z.object({
  projectPath: z.string().optional(),
  category: z
    .enum([
      "sql_injection",
      "xss",
      "command_injection",
      "path_traversal",
      "ssrf",
      "prototype_pollution",
      "missing_auth",
      "all",
    ])
    .optional()
    .default("all"),
  maxDepth: z.number().optional().default(15),
  includeTests: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(SAFE_LIMITS.taintVulnerabilities),
});

export class TaintAnalysisToolHandler extends BaseToolHandler<z.infer<typeof TaintAnalysisSchema>> {
  protected parseArgs(args: unknown) {
    return TaintAnalysisSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof TaintAnalysisSchema>): Promise<ToolResult> {
    log.i("TAINT", "handler_start", { category: args.category, maxDepth: args.maxDepth });

    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    const { TaintFlowAnalyzer } = await import("../../analysis/taint/index.js");
    const { TaintFormatter } = await import("../../analysis/taint/index.js");

    const analyzer = new TaintFlowAnalyzer(storage);
    const result = await analyzer.analyze({
      projectPath: this.resolveProjectPath(args),
      category: args.category,
      maxDepth: args.maxDepth,
      includeTests: args.includeTests,
    });
    log.i("TAINT", "handler_analyze_done");

    const summary = TaintFormatter.toSummary(result);
    const safeLimit = Math.min(args.limit, MAX_PAGE_SIZE);
    const paginatedVulns = paginate(result.vulnerabilities, args.offset, safeLimit);

    // Format text only for the paginated page of vulnerabilities
    const pageResult = {
      ...result,
      vulnerabilities: paginatedVulns.data,
    };
    const text = TaintFormatter.formatAsText(pageResult);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              summary,
              pagination: paginatedVulns.pagination,
              stats: {
                sources: result.sources.length,
                sinks: result.sinks.length,
                sanitizers: result.sanitizers.length,
                vulnerabilities: result.vulnerabilities.length,
                categorySummary: result.summary.byCategory,
              },
              formatted: text,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
