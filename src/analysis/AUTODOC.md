---
module_name: analysis
description: "Technology stack detection, state chaos analysis with race condition detection, and Swagger/OpenAPI usage detection"
status: active
language: typescript
entry_point: technology-detector.ts
exports:
  - TechnologyDetector
  - TechnologyStack
  - ChaosAnalyzer
  - StateDetector
  - RaceDetector
  - StatePatternWithRaces
  - CSharpChaosPattern
  - detectCSharpChaosPatterns
  - isStateIdentifier
  - isCSharpStateIdentifier
  - buildRelationshipLookup
  - detectSwaggerUsage
  - applySwaggerUsageMetadata
  - SwaggerUsageResult
  - SwaggerFileUsage
  - UsageSignal
dependencies:
  - node:fs
  - node:fs/promises
  - node:path
  - src/logging/index.js
  - src/types/storage.ts
  - src/types/chaos-analysis.ts
tags:
  - static-analysis
  - technology-detection
  - chaos-analysis
  - race-conditions
  - state-detection
  - swagger-usage
  - csharp
---

# Analysis Module

## Overview

The analysis module provides three major capabilities: **technology stack detection**, **state chaos analysis**, and **Swagger/OpenAPI usage detection**. `TechnologyDetector` scans the codebase graph and project manifests (package.json, pom.xml, build.gradle) to identify languages, frameworks, build tools, and dependencies with confidence scoring. The `chaos/` submodule detects scattered mutable state, race conditions (competing writers, check-then-act, async boundaries without locks), and C#-specific anti-patterns (mutable-static, async-void, god-service, missing-cancellation, singleton-mutable-state). Both subsystems operate on the `GraphStorage` entity/relationship graph and produce structured, AI-friendly output.

## Data Flow

```
GraphStorage (entities + relationships)
    |
    +--- TechnologyDetector
    |       |--- detectLanguages() -> countByLanguage() SQL aggregation
    |       |--- detectFrameworks() -> package.json + imports + build files
    |       |--- detectBuildTools() -> config file existence checks
    |       +--- detectDependencies() -> package.json + Gradle parsing
    |       => TechnologyStack { languages, frameworks, buildTools, dependencies, confidence }
    |
    +--- ChaosAnalyzer (coordinator)
            |--- getAllEntities() + getAllRelationships() [bulk load once]
            |--- buildRelationshipLookup() -> O(1) Map<entityId, Relationship[]>
            |--- StateDetector.detectPatterns() -> StatePatternWithRaces[]
            |--- detectCSharpChaosPatterns() -> CSharpChaosPattern[]
            +--- calculateChaosScore() + assessDivergenceRisk() + generateHotspots()
            => ChaosAnalysisResult[]
```

## Public API

| Export | Kind | Description | Location |
|--------|------|-------------|----------|
| `TechnologyDetector` | class | Full stack detection: `detectStack()`, `generateTechContext()` | [`technology-detector.ts:67-67`](./technology-detector.ts) |
| `TechnologyStack` | interface | Result: languages, frameworks, buildTools, dependencies, confidence | [`technology-detector.ts:29-35`](./technology-detector.ts) |
| `LanguageInfo` | interface | Language name, version, percentage, fileCount | [`technology-detector.ts:37-42`](./technology-detector.ts) |
| `FrameworkInfo` | interface | Framework name, version, category, confidence, evidence | [`technology-detector.ts:44-50`](./technology-detector.ts) |
| `BuildToolInfo` | interface | Build tool name and config file paths | [`technology-detector.ts:52-55`](./technology-detector.ts) |
| `DependencyInfo` | interface | Dependency name, version, type (prod/dev) | [`technology-detector.ts:57-61`](./technology-detector.ts) |
| `ChaosAnalyzer` | class | Coordinator: `analyze(options)` returns `ChaosAnalysisResult[]` | [`chaos/chaos-analyzer.ts:21-618`](./chaos/chaos-analyzer.ts) |
| `StateDetector` | class | State pattern detection: `detectPatterns(options, entities?, relLookup?)` | [`chaos/state-detector.ts:64-64`](./chaos/state-detector.ts) |
| `RaceDetector` | class | Race condition analysis on state operations | [`chaos/race-detector.ts:128-651`](./chaos/race-detector.ts) |
| `StatePatternWithRaces` | interface | Extends `StatePattern` with `raceAnalysis: RaceAnalysis` | [`chaos/state-detector.ts:60-62`](./chaos/state-detector.ts) |
| `CSharpChaosPattern` | interface | C# anti-pattern: pattern, severity, entityId, suggestion | [`chaos/csharp-patterns.ts:19-28`](./chaos/csharp-patterns.ts) |
| `detectCSharpChaosPatterns` | function | Detect C# anti-patterns from entity array | [`chaos/csharp-patterns.ts:144-274`](./chaos/csharp-patterns.ts) |
| `buildRelationshipLookup` | function | Build O(1) entity-to-relationship map from flat array | [`chaos/state-detector.ts:26-46`](./chaos/state-detector.ts) |
| `isStateIdentifier` | function | Angular/general state name heuristic (keywords + regex) | [`chaos/angular-patterns.ts:5-40`](./chaos/angular-patterns.ts) |
| `isCSharpStateIdentifier` | function | C# state identifier detection via entity metadata | [`chaos/csharp-patterns.ts:84-135`](./chaos/csharp-patterns.ts) |
| `detectSwaggerUsage` | function | Multi-signal detection of which swagger files are actively used | [`swagger-usage-detector.ts:74-134`](./swagger-usage-detector.ts) |
| `applySwaggerUsageMetadata` | function | Apply usage detection results to swagger entities in graph | [`swagger-usage-detector.ts:140-167`](./swagger-usage-detector.ts) |
| `SwaggerUsageResult` | interface | Result: files map, total count, active count | [`swagger-usage-detector.ts:24-31`](./swagger-usage-detector.ts) |
| `SwaggerFileUsage` | interface | Per-file usage data: confidence, isActive, signals | [`swagger-usage-detector.ts:33-41`](./swagger-usage-detector.ts) |
| `UsageSignal` | interface | Individual signal: type, weight, score, details | [`swagger-usage-detector.ts:43-48`](./swagger-usage-detector.ts) |

## Dependencies

| Dependency | Kind | Purpose |
|------------|------|---------|
| `node:fs` | node | `existsSync` for config file detection |
| `node:fs/promises` | node | `readFile` for package.json, pom.xml, build.gradle |
| `node:path` | node | `join` for working directory path construction |
| `src/logging/index.js` | internal | Structured logging (`log.i`, `log.w`, `log.d`) |
| `src/types/storage.ts` | internal | `Entity`, `GraphStorage`, `Relationship`, `EntityType`, `RelationType` |
| `src/types/chaos-analysis.ts` | internal | All chaos/race result types and options interfaces |

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `ChaosAnalysisOptions.identifiers` | auto-detect | State identifiers to analyze; auto-detected if omitted |
| `ChaosAnalysisOptions.maxDepth` | varies | Maximum traversal depth for state operations |
| `TechnologyDetector.workingDirectory` | constructor arg | Root path for manifest file lookups |
| Confidence formula | weighted | Languages 0.3 max + Frameworks 0.5 max + BuildTools 0.2 max |

## Behavioral Properties

`TechnologyDetector` is fully async and reads the filesystem for manifest files (package.json, pom.xml, build.gradle). Framework detection combines three strategies: manifest parsing, import entity analysis from the graph, and build file scanning. Results are deduplicated by name keeping the highest-confidence entry. `ChaosAnalyzer` bulk-loads all entities and relationships in two queries, then builds an O(1) relationship lookup map to avoid N+1 queries. `StateDetector` pre-loads all function/method entities once and caches them for body scanning across all identifiers. `RaceDetector` classifies race patterns into competing-mutations, check-then-act, competing-resets, and async-boundary-without-lock. All chaos detection is stateful within a single `analyze()` call but does not persist state between calls.

## Error Handling

`TechnologyDetector` wraps all file reads in try/catch and logs warnings (`deps_parse_fail`, `packagejson_parse_fail`, `gradle_deps_parse_fail`, `pom_parse_fail`, `gradle_parse_fail`) without throwing, returning empty arrays on failure. `ChaosAnalyzer` wraps C# pattern detection in try/catch, defaulting to an empty array on failure. `StateDetector` logs warnings for slow identifiers exceeding time thresholds. No exceptions propagate to callers from manifest parsing; all degradation is graceful.

## Observability

| Tag | Level | Event | Payload |
|-----|-------|-------|---------|
| `TECHDETECT` | info | `language_counts` | `{ languages: [{lang, count, files}] }` |
| `TECHDETECT` | warn | `deps_parse_fail` / `packagejson_parse_fail` | `{ err }` |
| `CHAOS` | info | `1_getAllEntities` | `{ count, ms }` |
| `CHAOS` | info | `1b_getAllRelationships` | `{ count, indexKeys, ms }` |
| `CHAOS` | info | `2_detectPatterns` | `{ patterns, ms }` |
| `CHAOS` | info | `3_csharpPatterns` | `{ count, ms }` |
| `CHAOS` | info | `4_total` | `{ results, ms }` |
| `CHAOS_DET` | info | `preload_functions` / `autoDetect` / `all_identifiers` | counts and timing |
| `CHAOS_DET` | warn | `slow_identifier` / `slow_findOps` | `{ identifier, ms }` |
| `CHAOS_RACE` | warn | `slow_mutations` | timing data |

## Known Limitations

1. Technology detection relies on static manifest files; monorepos with nested package.json files are not recursively scanned.
2. Framework detection from imports requires entities to be indexed in GraphStorage first.
3. Gradle dependency parsing handles Kotlin DSL and Groovy DSL but may miss version catalog references.
4. Chaos analysis loads all entities and relationships into memory; large codebases (50k+ entities) may consume significant RAM.
5. Race detection is static and cannot verify runtime synchronization guarantees.
6. C# anti-pattern detection depends on entity metadata quality from the parser.
7. Angular/general state identifier heuristic may produce false positives on common variable names.

## TypeScript Notes

All public types use explicit interfaces (`TechnologyStack`, `ChaosAnalysisResult`, `StatePatternWithRaces`). The `chaos/index.ts` re-exports types with `export type` for type-only imports. `RelationshipLookup` is a type alias for `Map<string, Relationship[]>`. `DetectionPattern` is a private interface internal to `TechnologyDetector`. C# pattern severity uses a union type `"critical" | "high" | "medium"`. Framework category uses `"frontend" | "backend" | "testing" | "build" | "other"`. All detection methods are `async` returning `Promise<T>`.

## Files

| File | Lines | Purpose |
|------|-------|---------|
| [`technology-detector.ts`](./technology-detector.ts) | 832 | Full technology stack detection: languages, frameworks, build tools, dependencies |
| [`chaos/index.ts`](./chaos/index.ts) | 30 | Re-exports for chaos submodule types and classes |
| [`chaos/chaos-analyzer.ts`](./chaos/chaos-analyzer.ts) | 618 | Main chaos coordinator: scoring, divergence risk, hotspots, refactoring strategies |
| [`chaos/state-detector.ts`](./chaos/state-detector.ts) | 490 | State pattern detection with cached entity loading and relationship lookup |
| [`chaos/race-detector.ts`](./chaos/race-detector.ts) | 651 | Race condition detection: competing mutations, check-then-act, async boundaries |
| [`chaos/csharp-patterns.ts`](./chaos/csharp-patterns.ts) | 274 | C# anti-patterns: mutable-static, async-void, god-service, missing-cancellation |
| [`chaos/angular-patterns.ts`](./chaos/angular-patterns.ts) | 40 | Angular/general state identifier keyword and regex heuristic |
| [`swagger-usage-detector.ts`](./swagger-usage-detector.ts) | 309 | Multi-signal swagger usage detection (imports 0.4, codegen scripts 0.3, config files 0.2, generated markers 0.1) |
