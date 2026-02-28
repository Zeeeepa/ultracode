---
module_name: conductor
description: "Task orchestration helpers for complexity analysis and method proposal generation"
status: active
language: typescript
---

# Conductor

> Provides task complexity analysis, delegation strategy selection, and method proposal generation for the Conductor orchestrator agent.

## Overview

The conductor module contains helper functions and types used by the ConductorOrchestrator agent. It analyzes incoming tasks to determine their complexity score (1-10), selects an appropriate delegation strategy (dev-agent, dora, or multi-agent), and generates method proposals with different risk/timeline tradeoffs. Configuration is resolved from YAML config with sensible defaults.

## Data Flow

- **Inputs**: `AgentTask` objects with type, payload, and priority metadata.
- **Processing**: Scores task complexity based on type, scope, and payload; generates 5 method proposals with pros/cons/risk assessment; resolves configuration from YAML with fallback defaults.
- **Outputs**: `TaskComplexityAnalysis` with score, factors, and delegation strategy; `MethodProposal[]` arrays; resolved `ConductorConfig`.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `analyzeTaskComplexity` | function | Scores task complexity and determines delegation strategy | [`task-analysis.ts:25-75`](./task-analysis.ts) |
| `isIndexingTask` | function | Checks whether a task is an automated indexing operation | [`task-analysis.ts:80-86`](./task-analysis.ts) |
| `isDirectImplementation` | function | Checks if a task attempts to bypass delegation | [`task-analysis.ts:91-97`](./task-analysis.ts) |
| `generateMethodProposals` | function | Generates 5 method execution proposals for a task | [`method-proposals.ts:14-73`](./method-proposals.ts) |
| `createMethodProposalTemplate` | function | Creates proposal templates for a given task type | [`method-proposals.ts:78-101`](./method-proposals.ts) |
| `getTaskTypeKey` | function | Determines the task type key for template lookup | [`method-proposals.ts:106-120`](./method-proposals.ts) |
| `initializeMethodProposalTemplates` | function | Initializes proposal templates for common task types | [`method-proposals.ts:125-134`](./method-proposals.ts) |
| `DEFAULT_CONDUCTOR_CONFIG` | const | Full default conductor configuration | [`config.ts:18-27`](./config.ts) |
| `DEFAULT_RESOURCE_CONSTRAINTS` | const | Default resource constraint values | [`config.ts:11-16`](./config.ts) |
| `getConductorAgentDefaults` | function | Resolves conductor config from YAML with defaults | [`config.ts:29-32`](./config.ts) |
| `ConductorConfig` | interface | Conductor orchestrator configuration | [`types.ts:9-18`](./types.ts) |
| `TaskComplexityAnalysis` | interface | Complexity analysis result with score and strategy | [`types.ts:20-26`](./types.ts) |
| `SubTask` | interface | Subtask definition with target agent | [`types.ts:28-35`](./types.ts) |
| `MethodProposal` | interface | Method execution proposal with risk/timeline | [`types.ts:37-46`](./types.ts) |
| `ConductorConfigOverrides` | type | Partial overrides for conductor configuration | [`types.ts:48-50`](./types.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `config/yaml-config` | Read application configuration |
| `types/agent` | `AgentTask` and `ResourceConstraints` types |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Complexity scale | 1-10, capped at 10 |
| Proposals per task | Always exactly 5 |
| Delegation strategies | `dev-agent`, `dora`, `multi-agent` |

## Error Handling

Functions are pure and do not throw exceptions. Invalid or missing payload fields are handled gracefully with default scores.

## Known Limitations

- Complexity scoring uses fixed heuristics rather than ML-based analysis.
- Method proposals are static templates, not dynamically adapted to project context.

## Exports



## Files

| File | Description |
|------|-------------|
| `config.ts` | Default configuration and YAML-based config resolution |
| `index.ts` | Re-exports all conductor module members |
| `method-proposals.ts` | Method proposal generation and template management |
| `task-analysis.ts` | Task complexity scoring and delegation determination |
| `types.ts` | TypeScript interfaces for conductor types |
