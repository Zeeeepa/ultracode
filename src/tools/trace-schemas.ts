/**
 * Trace Tool Schemas
 *
 * Tool definitions for execution flow tracing and analysis.
 */

// Tool definitions for MCP server
export const traceToolDefinitions = [
  {
    name: "trace_flow",
    description: "Trace execution path A to B via BFS. format=mermaid adds ~500tok. ~300-2000tok",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source entity" },
        to: { type: "string", description: "Target entity" },
        trackStates: { type: "boolean", description: "Track state changes", default: true },
        trackConditions: { type: "boolean", description: "Track conditions", default: true },
        maxDepth: { type: "number", description: "Max depth (default 15)", default: 15 },
        format: {
          type: "string",
          enum: ["sequence", "tree", "graph", "mermaid"],
          description: "sequence | tree | graph | mermaid (adds ~500tok)",
          default: "sequence",
        },
        highlightRecentChanges: {
          type: "boolean",
          description: "Annotate recently changed",
          default: false,
        },
        recentCommitsCount: {
          type: "number",
          description: "Recent commits count",
          default: 10,
        },
        projectPath: {
          type: "string",
          description: "Project dir",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "trace_backwards",
    description: "Find all callers of target entity. ~200-1500tok",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Target entity name" },
        question: {
          type: "string",
          enum: ["why_not_called", "what_affects", "dependencies"],
          description: "dependencies (callers) | why_not_called (dead code) | what_affects (upstream files)",
        },
        depth: { type: "number", description: "Max depth (default 15)", default: 15 },
        includeStates: { type: "boolean", description: "Include state deps", default: true },
        includeEffects: { type: "boolean", description: "Include side effects", default: true },
        highlightRecentChanges: {
          type: "boolean",
          description: "Annotate recently changed",
          default: false,
        },
        recentCommitsCount: {
          type: "number",
          description: "Recent commits count",
          default: 10,
        },
        projectPath: {
          type: "string",
          description: "Project dir",
        },
      },
      required: ["target", "question"],
    },
  },
  {
    name: "trace_data_flow",
    description: "Trace data flow from entity through call chains. ~200-1500tok",
    inputSchema: {
      type: "object",
      properties: {
        entryPoint: { type: "string", description: "Entry point function" },
        targetState: { type: "string", description: "Target state to trace" },
        dataSources: {
          type: "array",
          items: { type: "string" },
          description: "Data sources (auto-detected if omitted)",
        },
        trackTransformations: { type: "boolean", description: "Classify source/transform/sink", default: true },
        projectPath: {
          type: "string",
          description: "Project dir",
        },
      },
      required: ["entryPoint", "targetState"],
    },
  },
  {
    name: "analyze_state_impact",
    description: "What entities/files break when entity changes. ~200-1500tok",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "State variable" },
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: { value: {}, label: { type: "string" } },
            required: ["value", "label"],
          },
          description: "What-If scenarios",
          minItems: 1,
        },
        scope: { type: "string", description: "Scope (semantic query)" },
        projectPath: {
          type: "string",
          description: "Project dir",
        },
      },
      required: ["state", "scenarios"],
    },
  },
  {
    name: "find_decision_points",
    description: "Find branching points in code flow. ~200-1000tok",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { type: "string", description: "Scenario to analyze" },
        includeGuards: { type: "boolean", description: "Include guards", default: true },
        includeEffects: { type: "boolean", description: "Include side effects", default: true },
        groupBy: {
          type: "string",
          enum: ["impact", "location", "type"],
          description: "impact | location | type",
          default: "impact",
        },
        projectPath: {
          type: "string",
          description: "Project dir",
        },
      },
      required: ["scenario"],
    },
  },
];
