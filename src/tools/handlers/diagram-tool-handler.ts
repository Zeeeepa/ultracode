/**
 * Architecture Diagram Tool Handler
 *
 * MCP tool for generating architecture diagrams from the code graph.
 * Supports Mermaid, Graphviz DOT, and D2 output formats.
 */

import type { z } from "zod";
import { createRenderer } from "../../diagrams/renderers/index.js";
import { SchemaCollector } from "../../diagrams/schema-collector.js";
import { TraceEngine } from "../../tracing/trace-engine.js";
import type { ToolResult } from "../base-tool-handler.js";
import { BaseToolHandler } from "../base-tool-handler.js";
import { GetArchitectureDiagramSchema } from "../schemas/diagram-schemas.js";

type Args = z.infer<typeof GetArchitectureDiagramSchema>;

export class GetArchitectureDiagramToolHandler extends BaseToolHandler<Args> {
  protected parseArgs(args: unknown): Args {
    return GetArchitectureDiagramSchema.parse(args);
  }

  protected async execute(args: Args): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const traceEngine = new TraceEngine(storage);
    const collector = new SchemaCollector(storage, traceEngine);

    const ir = await this.context.withTimeout(
      collector.collect(
        {
          entryPoint: args.entryPoint,
          depth: args.depth,
          dataFlowLevel: args.dataFlowLevel,
          diagramType: args.diagramType,
          direction: args.direction,
        },
        args.projectPath || "default",
      ),
      10_000,
      "get_architecture_diagram",
      this.context.requestId,
    );

    const renderer = createRenderer(args.format);
    const diagram = renderer.render(ir);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              format: args.format,
              diagramType: ir.diagramType,
              direction: ir.direction,
              diagram,
              stats: ir.stats,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
