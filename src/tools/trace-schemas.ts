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
      "[PLAN] Static analysis: trace execution from A→B. Use when: 'How does code get from login() to saveUser()?', 'What paths lead to handleError()?'. Finds ALL possible paths with state changes, conditions, async boundaries. Returns confidence-scored paths + optional Mermaid diagrams. Supports highlightRecentChanges to annotate recently modified nodes. Example: trace_flow(from='handleRequest', to='sendEmail', highlightRecentChanges=true). 📖 get_help(topic='tracing') for guide.",
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
        highlightRecentChanges: {
          type: "boolean",
          description: "Annotate trace nodes with recently-changed status (Prolly Tree)",
          default: false,
        },
        recentCommitsCount: {
          type: "number",
          description: "Number of recent commits to consider for highlighting",
          default: 10,
        },
        projectPath: {
          type: "string",
          description:
            "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "trace_backwards",
    description:
      "[PLAN] Static analysis: why isn't method called? Use when: 'Why doesn't processPayment() run?', 'What blocks saveUser()?'. Questions: 'why_not_called' (find blockers), 'what_affects' (dependencies), 'dependencies' (full graph). Returns callers, blocking conditions, state deps, diagnosis. Supports highlightRecentChanges to annotate recently modified callers. Example: trace_backwards(target='sendNotification', question='why_not_called', highlightRecentChanges=true). 📖 get_help(topic='tracing').",
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
        highlightRecentChanges: {
          type: "boolean",
          description: "Annotate trace nodes with recently-changed status (Prolly Tree)",
          default: false,
        },
        recentCommitsCount: {
          type: "number",
          description: "Number of recent commits to consider for highlighting",
          default: 10,
        },
        projectPath: {
          type: "string",
          description:
            "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
        },
      },
      required: ["target", "question"],
    },
  },
  {
    name: "trace_data_flow",
    description:
      "[PLAN] Static analysis: trace data flow from sources→target state. Use when: 'How does user input affect isValid?', 'What data feeds into price calculation?'. Identifies sources, transformations, branching, builds behavior matrix. Example: trace_data_flow(entryPoint='handleSubmit', targetState='form.errors'). 📖 get_help(topic='tracing').",
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
        projectPath: {
          type: "string",
          description:
            "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
        },
      },
      required: ["entryPoint", "targetState"],
    },
  },
  {
    name: "analyze_state_impact",
    description:
      "[PLAN] Analyze the impact of a state variable across different scenarios. Shows usages, reachable/blocked paths per scenario, conflicts, and ripple effects.",
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
        projectPath: {
          type: "string",
          description:
            "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
        },
      },
      required: ["state", "scenarios"],
    },
  },
  {
    name: "find_decision_points",
    description:
      "[PLAN] Find all decision points in a scenario's execution flow. Types: validation, api_response, state_mutation, guard, loop, error_handling, feature_flag. Returns grouped by impact with Mermaid flowchart.",
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
        projectPath: {
          type: "string",
          description:
            "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
        },
      },
      required: ["scenario"],
    },
  },
];
