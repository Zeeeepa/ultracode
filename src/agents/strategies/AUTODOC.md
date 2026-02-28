---
module_name: strategies
description: "Strategy pattern implementations for task delegation in the conductor orchestrator"
status: active
language: typescript
---

# Strategies

> Provides pluggable delegation strategies (complexity-based, round-robin, least-loaded) that replace large if-else chains in the conductor orchestrator.

## Overview

The strategies module implements the Strategy pattern for task delegation decisions. It defines a `DelegationStrategy` interface with three methods (shouldDelegate, selectAgent, calculateComplexity) and provides three concrete implementations: `ComplexityBasedStrategy` (delegates above a threshold), `RoundRobinStrategy` (always delegates, rotating agents), and `LeastLoadedStrategy` (delegates above threshold, picks agent with lowest current load). This eliminates complex conditional logic in the conductor orchestrator.

## Data Flow

- **Inputs**: `AgentTask` with type, priority, and payload; list of available `Agent` objects with capabilities.
- **Processing**: Calculates complexity score from task metadata, filters agents by supported task types, selects best agent based on strategy-specific criteria.
- **Outputs**: Boolean delegation decision, selected `Agent` or null, numeric complexity score (1-10).

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `DelegationStrategy` | interface | Strategy interface for delegation decisions | [`delegation-strategy.ts:22-37`](./delegation-strategy.ts) |
| `Agent` | interface | Agent descriptor with id, type, and capabilities | [`delegation-strategy.ts:10-17`](./delegation-strategy.ts) |
| `ComplexityBasedStrategy` | class | Delegates tasks above a configurable complexity threshold | [`delegation-strategy.ts:42-84`](./delegation-strategy.ts) |
| `RoundRobinStrategy` | class | Always delegates, rotating across capable agents | [`delegation-strategy.ts:89-112`](./delegation-strategy.ts) |
| `LeastLoadedStrategy` | class | Delegates above threshold, selects least-loaded agent | [`delegation-strategy.ts:117-151`](./delegation-strategy.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `types/agent` | `AgentTask` type definition |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Complexity score range | 1-10, capped at 10 |
| Default complexity threshold | 8 |
| Agent selection | Highest concurrency (complexity), round-robin (RR), lowest load (least-loaded) |

## Error Handling

All methods return safe defaults (null for agent selection, 5 for round-robin complexity). No exceptions are thrown for empty agent lists or missing task metadata.

## Known Limitations

- `LeastLoadedStrategy` requires an external `getAgentLoad` callback function to be provided at construction.
- Complexity scoring is based on payload size heuristics rather than actual resource requirements.
- No strategy supports weighted multi-criteria agent selection.

## Files

| File | Description |
|------|-------------|
| `delegation-strategy.ts` | DelegationStrategy interface and three concrete implementations |
