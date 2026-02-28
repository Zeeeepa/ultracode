---
module_name: chaos
description: "State chaos and race condition detection for scattered state, async races, and language-specific anti-patterns"
status: active
language: typescript
---

# Chaos

> Static analysis module that detects scattered state patterns, race conditions, async boundary issues, and language-specific anti-patterns (Angular, C#) across the codebase using the knowledge graph.

## Overview

The chaos module analyzes code for state management problems by examining the knowledge graph. The `ChaosAnalyzer` orchestrates the analysis pipeline: `StateDetector` identifies state patterns and their operations across files, `RaceDetector` finds potential race conditions (competing mutations, check-then-act patterns, async races, hidden async APIs), and language-specific pattern detectors (Angular, C#) flag framework-specific anti-patterns. Results include risk scores, affected entities, refactoring suggestions, and detailed explanations.

## Data Flow

- **Inputs:** `GraphStorage` containing all entities and relationships, `ChaosAnalysisOptions` with scope and depth settings.
- **Processing:** Bulk entity/relationship loading, state pattern detection via code analysis, race condition detection via mutation point cross-referencing, C#/Angular anti-pattern matching.
- **Outputs:** `ChaosAnalysisResult[]` with state patterns, race risks, mutation points, and refactoring plans.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ChaosAnalyzer` | class | Main orchestrator for chaos analysis | [`chaos-analyzer.ts:21-618`](./chaos-analyzer.ts) |
| `StateDetector` | class | Detects state patterns and operations across files | [`state-detector.ts`](./state-detector.ts) |
| `RaceDetector` | class | Detects race conditions from mutation analysis | [`race-detector.ts`](./race-detector.ts) |
| `StatePatternWithRaces` | type | State pattern enriched with race analysis | [`state-detector.ts`](./state-detector.ts) |
| `isStateIdentifier` | function | Checks if a name represents state (Angular) | [`angular-patterns.ts:5-40`](./angular-patterns.ts) |
| `CSharpChaosPattern` | interface | C# anti-pattern detection result | [`csharp-patterns.ts:19-28`](./csharp-patterns.ts) |
| `detectCSharpChaosPatterns` | function | Detects C# state and async anti-patterns | [`csharp-patterns.ts`](./csharp-patterns.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `types/chaos-analysis` | Type definitions for analysis results and options |
| `types/storage` | `GraphStorage`, `Entity`, `Relationship` types |
| `logging` | Performance and debug logging |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | Pure TypeScript analysis with no external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Relationship loading | Bulk O(1) lookup via pre-built Map index |
| Race detection patterns | Competing mutations, check-then-act, async boundaries, hidden APIs |
| C# anti-patterns | mutable-static, async-void, god-service, missing-cancellation, singleton-mutable-state |

## Error Handling

Analysis catches and logs errors at each stage, continuing with partial results. Missing code content on entities is handled gracefully by skipping code-level pattern matching. Performance timing is logged for each analysis phase.

## Known Limitations

- Static analysis only; does not execute code or trace runtime behavior.
- Race condition detection is heuristic-based and may produce false positives.
- C# and Angular pattern detection requires entities to have code content in the graph.

## Exports

- `ChaosAnalyzer`
- `RaceDetector`
- `StateDetector`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all public types, classes, and functions |
| `chaos-analyzer.ts` | Main `ChaosAnalyzer` orchestrating state and race analysis |
| `state-detector.ts` | `StateDetector` for finding state patterns and operations |
| `race-detector.ts` | `RaceDetector` for competing mutations and async race detection |
| `angular-patterns.ts` | Angular-specific state identifier detection |
| `csharp-patterns.ts` | C# anti-pattern detection (5 high-value patterns) |
