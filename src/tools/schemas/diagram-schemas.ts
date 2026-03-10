/**
 * Schema for get_architecture_diagram tool
 */

import { z } from "zod";

import { projectPathParam } from "../base-schemas.js";

export const GetArchitectureDiagramSchema = z.object({
  entryPoint: z
    .string()
    .optional()
    .describe("Entry point: file path, module name, class name, or entity ID. Omit for project-wide diagram."),
  depth: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .default(2)
    .describe("Traversal depth. 1=files, 2=classes/functions, 3=methods/properties, 4+=deeper nesting."),
  dataFlowLevel: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .default(1)
    .describe(
      "Data flow detail: 0=structure only, 1=basic types on edges, 2=all params+conditionals, 3=field-level mapping.",
    ),
  format: z
    .enum(["mermaid", "graphviz", "d2"])
    .optional()
    .default("mermaid")
    .describe("Output format: mermaid (default), graphviz (DOT), or d2."),
  diagramType: z
    .enum(["flowchart", "class", "component"])
    .optional()
    .describe("Diagram type. Auto-detected from code structure if omitted."),
  direction: z
    .enum(["TD", "LR"])
    .optional()
    .default("TD")
    .describe("Layout direction: TD (top-down) or LR (left-right)."),
  projectPath: projectPathParam,
});
