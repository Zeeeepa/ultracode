# Test Helpers

## Overview

This module provides factory functions and assertion utilities for unit testing MCP tool handlers and related agent/orchestrator components. It creates lightweight mock implementations of core dependencies (graph storage, agents, conductors, knowledge bus) that can be injected into tests, enabling isolated testing of tool handler logic without requiring live external systems or complex state setup.

## Entity Listing

### Mock Factory Functions

| Name | Location | Description |
|------|----------|-------------|
| `createMockGraphStorage` | [_test-helpers.ts:13](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock graph storage instance for indexing and querying code graphs in tests. |
| `createMockSemanticAgent` | [_test-helpers.ts:37](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock semantic analysis agent that responds to code understanding queries. |
| `createMockBranchManager` | [_test-helpers.ts:55](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock branch manager for version control state tracking in tests. |
| `createMockSnapshotManager` | [_test-helpers.ts:69](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock snapshot manager for code state capture and restoration in tests. |
| `createMockConductor` | [_test-helpers.ts:80](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock conductor orchestrator for agent coordination and task routing. |
| `createMockKnowledgeBus` | [_test-helpers.ts:90](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a mock message bus for inter-component knowledge exchange during tests. |
| `createMockToolContext` | [_test-helpers.ts:105](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Creates a complete mock tool execution context with all dependencies pre-configured for handler testing. |

### Test Assertion & Utility Functions

| Name | Location | Description |
|------|----------|-------------|
| `parseJsonResult` | [_test-helpers.ts:134-138](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Parses a JSON-encoded tool result string into a plain JavaScript object. |
| `expectSuccess` | [_test-helpers.ts:141-152](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Asserts that a tool result represents success and extracts the returned data payload for assertions. |
| `expectError` | [_test-helpers.ts:156-160](file:///d:/github/ultracode/src/tools/__tests__/_test-helpers.ts) | Asserts that a tool result represents failure and validates error conditions match expectations. |

## Dependencies

- **Agent types & interfaces** (`src/agents/*`, `src/types/agent.js`) — defines base agent classes and task/message types that mocks must conform to
- **Core orchestration** (`src/agents/conductor-orchestrator.js`, `src/core/knowledge-bus.js`) — mocked conductor and message bus for coordinating test agent behavior
- **Storage layer** (`src/storage/`, `src/analysis/`) — mocked graph storage for code indexing and querying during handler tests
- **Tool context** (`src/tools/`) — defines ToolContext interface that createMockToolContext implements