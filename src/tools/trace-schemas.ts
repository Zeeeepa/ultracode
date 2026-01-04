/**
 * Trace Tool Schemas
 *
 * Tool definitions for execution flow tracing and analysis.
 */

// Tool definitions for MCP server
export const traceToolDefinitions = [
  {
    name: "trace_flow",
    description:
      "Trace execution flow from point A to point B in the codebase. Finds all possible paths and analyzes state changes, conditions, and async boundaries along each path. Returns paths with confidence scores and optional Mermaid diagrams.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Starting point (function/method name or semantic query)" },
        to: { type: "string", description: "Ending point (function/method name or semantic query)" },
        trackStates: { type: "boolean", description: "Track state changes along paths", default: true },
        trackConditions: { type: "boolean", description: "Track conditions/branches", default: true },
        maxDepth: { type: "number", description: "Maximum traversal depth", default: 15 },
        format: {
          type: "string",
          enum: ["sequence", "tree", "graph", "mermaid"],
          description: "Output format",
          default: "sequence",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "trace_backwards",
    description:
      "Trace backwards from a method to find why it might not be called. Analysis types: why_not_called (blocking conditions), what_affects (dependencies), dependencies (full graph). Returns callers, blocking conditions, state dependencies, and diagnosis.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Target method/function to analyze" },
        question: {
          type: "string",
          enum: ["why_not_called", "what_affects", "dependencies"],
          description: "Type of analysis",
        },
        depth: { type: "number", description: "Backward traversal depth", default: 15 },
        includeStates: { type: "boolean", description: "Include state dependencies", default: true },
        includeEffects: { type: "boolean", description: "Include side effects", default: true },
      },
      required: ["target", "question"],
    },
  },
  {
    name: "trace_data_flow",
    description:
      "Trace how data flows from sources to affect a target state. Identifies data sources, transformations, branching, and builds behavior matrix for different inputs.",
    inputSchema: {
      type: "object",
      properties: {
        entryPoint: { type: "string", description: "Entry point function" },
        targetState: { type: "string", description: "Target state to trace" },
        dataSources: {
          type: "array",
          items: { type: "string" },
          description: "Data sources to analyze (auto-detected if not specified)",
        },
        trackTransformations: { type: "boolean", description: "Track data transformations", default: true },
      },
      required: ["entryPoint", "targetState"],
    },
  },
  {
    name: "analyze_state_impact",
    description:
      "Analyze the impact of a state variable across different scenarios. Shows usages, reachable/blocked paths per scenario, conflicts, and ripple effects.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "State variable to analyze" },
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: { value: {}, label: { type: "string" } },
            required: ["value", "label"],
          },
          description: "Scenarios to analyze",
          minItems: 1,
        },
        scope: { type: "string", description: "Scope of analysis (semantic query)" },
      },
      required: ["state", "scenarios"],
    },
  },
  {
    name: "find_decision_points",
    description:
      "Find all decision points in a scenario's execution flow. Types: validation, api_response, state_mutation, guard, loop, error_handling, feature_flag. Returns grouped by impact with Mermaid flowchart.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { type: "string", description: "Scenario to analyze" },
        includeGuards: { type: "boolean", description: "Include guard conditions", default: true },
        includeEffects: { type: "boolean", description: "Include side effects", default: true },
        groupBy: {
          type: "string",
          enum: ["impact", "location", "type"],
          description: "How to group results",
          default: "impact",
        },
      },
      required: ["scenario"],
    },
  },
];
