# Analysis Module

## Overview

The analysis module provides three core capabilities for understanding codebases: **technology stack detection** via `TechnologyDetector`, which scans entities, relationships, and project manifests to identify languages, frameworks, build tools, and dependencies with confidence scores; **state chaos analysis** via `ChaosAnalyzer`, which detects scattered mutable state, race conditions, and C#-specific anti-patterns by analyzing entity graphs and their relationships; and **API contract usage detection** via swagger/GraphQL detectors, which identify which specification files are actively used via multi-signal analysis (imports, codegen scripts, config files). The module is designed as a read-only analysis layer operating on `GraphStorage` entity and relationship graphs, producing structured metadata suitable for AI-driven refactoring recommendations.

## Flow

```
┌─────────────────────────────────────────────────────────────┐
│            GraphStorage (entities + relationships)           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │TechStack │ │  Chaos   │ │  Swagger/    │
   │Detector  │ │ Analyzer │ │  GraphQL     │
   └────┬─────┘ └────┬─────┘ │  Detector    │
        │            │       └──────┬───────┘
        │      ┌─────┴────────┐     │
        │      ▼              ▼     │
        │  StateDetector + RaceDetector
        │  + C# Patterns
        │      │
        ▼      ▼              ▼
   ┌─────────────────────────────────────┐
   │ Structured Analysis Results:        │
   │ - TechnologyStack                   │
   │ - ChaosAnalysisResult[]             │
   │ - SwaggerUsageResult                │
   └─────────────────────────────────────┘
```

## Public API

### Core Classes

| Export | File:Lines | Description |
|--------|-----------|-------------|
| `TechnologyDetector` | `technology-detector.ts:67-67` | Detects programming languages, frameworks, build tools, and dependencies by scanning entities, relationships, and project manifests (package.json, pom.xml, build.gradle). |
| `ChaosAnalyzer` | `chaos/chaos-analyzer.ts:21-618` | Coordinator for state chaos analysis: detects mutable state patterns, race conditions, C# anti-patterns, and produces chaos scoring, divergence risk assessment, and refactoring hotspots. |
| `StateDetector` | `chaos/state-detector.ts:64-64` | Identifies mutable state patterns in codebases via heuristic scanning of entity names and relationship mutations; integrates race condition detection on results. |
| `RaceDetector` | `chaos/race-detector.ts:128-651` | Analyzes state operations for race conditions: competing writes, check-then-act patterns, async boundary violations, and lock inadequacy. |

### Result Types

| Export | File:Lines | Description |
|--------|-----------|-------------|
| `TechnologyStack` | `technology-detector.ts:29-35` | Result interface containing detected languages, frameworks, build tools, dependencies, and overall confidence score. |
| `LanguageInfo` | `technology-detector.ts:37-42` | Language detection result with name, detected version, percentage of codebase, and file count. |
| `FrameworkInfo` | `technology-detector.ts:44-50` | Framework detection result with name, version, category (web/mobile/etc), confidence level, and evidence sources. |
| `BuildToolInfo` | `technology-detector.ts:52-55` | Build tool metadata: tool name and paths to configuration files found. |
| `DependencyInfo` | `technology-detector.ts:57-61` | Dependency metadata: name, detected version, and classification (production or development). |
| `StatePatternWithRaces` | `chaos/state-detector.ts:60-62` | State pattern extended with embedded race condition analysis and severity assessment. |
| `CSharpChaosPattern` | `chaos/csharp-patterns.ts:19-28` | C# anti-pattern detection result: pattern type, severity, affected entity ID, and refactoring suggestion. |
| `SwaggerUsageResult` | `swagger-usage-detector.ts:24-31` | Swagger/OpenAPI usage detection summary: files map, total count, and active file count. |
| `SwaggerFileUsage` | `swagger-usage-detector.ts:33-41` | Per-file usage data: confidence score, active status, and array of detection signals with weights. |
| `UsageSignal` | `swagger-usage-detector.ts:43-48` | Individual usage signal: signal type, weight, calculated score, and descriptive details. |

### Utility Functions

| Export | File:Lines | Description |
|--------|-----------|-------------|
| `detectCSharpChaosPatterns` | `chaos/csharp-patterns.ts:144-274` | Scans entity array for C# anti-patterns: mutable statics, async-void methods, god-service classes, missing CancellationToken, and singleton mutable state. |
| `buildRelationshipLookup` | `chaos/state-detector.ts:26-46` | Creates O(1) lookup map from entity ID to their relationships, enabling efficient mutation analysis without repeated linear scans. |
| `isStateIdentifier` | `chaos/angular-patterns.ts:5-40` | Determines if a name is likely a state variable using keyword matching and regex heuristics (detects Angular, Redux, and general state patterns). |
| `isCSharpStateIdentifier` | `chaos/csharp-patterns.ts:84-135` | C# state variable detection using entity metadata inspection (field keywords, property patterns, naming conventions). |
| `detectSwaggerUsage` | `swagger-usage-detector.ts:74-134` | Multi-signal detection of swagger file usage: analyzes imports (weight 0.4), codegen scripts (0.3), config files (0.2), and generated markers (0.1); returns results with confidence >= 0.3. |
| `applySwaggerUsageMetadata` | `swagger-usage-detector.ts:140-167` | Applies swagger usage detection results to entities in graph storage, enriching them with usage metadata and 1-sentence descriptions. |

## Design Patterns & Dependencies

### Detector Pattern

Each analysis capability follows a detector pattern: `TechnologyDetector`, `StateDetector`, and `RaceDetector` are specialized analyzers that operate independently on the shared `GraphStorage` graph, each producing typed result objects suitable for downstream AI analysis or UI presentation.

### Composition in ChaosAnalyzer

The `ChaosAnalyzer` coordinates multiple sub-detectors (`StateDetector`, `RaceDetector`, `detectCSharpChaosPatterns`) to produce a unified chaos assessment, demonstrating how multiple concerns (state scattering, concurrency hazards, language-specific anti-patterns) are composed into a single analysis result.

### Multi-Signal Analysis

`detectSwaggerUsage` demonstrates weighted multi-signal analysis: each detection signal (import statements, codegen scripts, config references, codegen markers) contributes independently with a configurable weight (0.4, 0.3, 0.2, 0.1), and results are filtered by a confidence threshold (>= 0.3) to eliminate false positives.

### Heuristic-Based Identification

State pattern detection (`isStateIdentifier`, `isCSharpStateIdentifier`) uses language-specific naming and structural heuristics rather than type analysis, enabling lightweight scanning across polyglot codebases without requiring full semantic parsing.

## New (pending description)

- **GraphQLUsageResult** — `graphql-usage-detector.ts:24-28`
- **GraphQLFileUsage** — `graphql-usage-detector.ts:30-35`
- **GraphQLUsageSignal** — `graphql-usage-detector.ts:37-42`
- **ProtobufUsageResult** — `protobuf-usage-detector.ts:24-28`
- **ProtobufFileUsage** — `protobuf-usage-detector.ts:30-35`
- **ProtobufUsageSignal** — `protobuf-usage-detector.ts:37-42`
- **detectGraphQLUsage** — `graphql-usage-detector.ts:61-120`
- **<anonymous>** — `graphql-usage-detector.ts:61-61`
- **e** — `graphql-usage-detector.ts:67-70`
- **sum** — `graphql-usage-detector.ts:97-97`
- **f** — `graphql-usage-detector.ts:108-108`
- **applyGraphQLUsageMetadata** — `graphql-usage-detector.ts:122-143`
- **<anonymous>** — `graphql-usage-detector.ts:122-122`
- **analyzeImportsSignal** — `graphql-usage-detector.ts:149-172`
- **<anonymous>** — `graphql-usage-detector.ts:149-149`
- **r** — `graphql-usage-detector.ts:151-156`
- **r** — `graphql-usage-detector.ts:160-160`
- **analyzeCodegenScriptSignal** — `graphql-usage-detector.ts:174-192`
- **<anonymous>** — `graphql-usage-detector.ts:174-174`
- **e** — `graphql-usage-detector.ts:177-177`
- **e** — `graphql-usage-detector.ts:178-181`
- **kw** — `graphql-usage-detector.ts:180-180`
- **s** — `graphql-usage-detector.ts:189-189`
- **analyzeCodegenConfigSignal** — `graphql-usage-detector.ts:194-228`
- **<anonymous>** — `graphql-usage-detector.ts:194-194`
- **e** — `graphql-usage-detector.ts:213-217`
- **cfg** — `graphql-usage-detector.ts:216-216`
- **c** — `graphql-usage-detector.ts:225-225`
- **analyzeGeneratedMarkersSignal** — `graphql-usage-detector.ts:230-248`
- **<anonymous>** — `graphql-usage-detector.ts:230-230`
- **e** — `graphql-usage-detector.ts:232-236`
- **detectProtobufUsage** — `protobuf-usage-detector.ts:61-117`
- **<anonymous>** — `protobuf-usage-detector.ts:61-61`
- **e** — `protobuf-usage-detector.ts:65-65`
- **e** — `protobuf-usage-detector.ts:67-67`
- **sum** — `protobuf-usage-detector.ts:94-94`
- **f** — `protobuf-usage-detector.ts:105-105`
- **applyProtobufUsageMetadata** — `protobuf-usage-detector.ts:119-140`
- **<anonymous>** — `protobuf-usage-detector.ts:119-119`
- **analyzeImportsSignal** — `protobuf-usage-detector.ts:146-170`
- **<anonymous>** — `protobuf-usage-detector.ts:146-146`
- **r** — `protobuf-usage-detector.ts:148-154`
- **r** — `protobuf-usage-detector.ts:158-158`
- **analyzeCodegenScriptSignal** — `protobuf-usage-detector.ts:172-190`
- **<anonymous>** — `protobuf-usage-detector.ts:172-172`
- **e** — `protobuf-usage-detector.ts:175-175`
- **e** — `protobuf-usage-detector.ts:176-179`
- **kw** — `protobuf-usage-detector.ts:178-178`
- **s** — `protobuf-usage-detector.ts:187-187`
- **analyzeCodegenConfigSignal** — `protobuf-usage-detector.ts:192-210`
- **<anonymous>** — `protobuf-usage-detector.ts:192-192`
- **e** — `protobuf-usage-detector.ts:195-199`
- **cfg** — `protobuf-usage-detector.ts:198-198`
- **c** — `protobuf-usage-detector.ts:207-207`
- **analyzeGeneratedMarkersSignal** — `protobuf-usage-detector.ts:212-226`
- **<anonymous>** — `protobuf-usage-detector.ts:212-212`
- **e** — `protobuf-usage-detector.ts:215-215`
- **pat** — `protobuf-usage-detector.ts:215-215`
- **SIGNAL_WEIGHTS** — `graphql-usage-detector.ts:48-53`
- **ACTIVE_THRESHOLD** — `graphql-usage-detector.ts:55-55`
- **allEntities** — `graphql-usage-detector.ts:62-62`
- **allRelationships** — `graphql-usage-detector.ts:63-63`
- **graphqlSchemas** — `graphql-usage-detector.ts:66-71`
- **graphqlFiles** — `graphql-usage-detector.ts:74-74`
- **files** — `graphql-usage-detector.ts:85-85`
- **signals** — `graphql-usage-detector.ts:88-88`
- **usageConfidence** — `graphql-usage-detector.ts:95-98`
- **activeCount** — `graphql-usage-detector.ts:108-108`
- **updated** — `graphql-usage-detector.ts:123-123`
- **entities** — `graphql-usage-detector.ts:126-126`
- **gqlImports** — `graphql-usage-detector.ts:150-157`
- **apiRelationships** — `graphql-usage-detector.ts:159-161`
- **hasImports** — `graphql-usage-detector.ts:163-163`
- **keywords** — `graphql-usage-detector.ts:175-175`
- **scriptEntities** — `graphql-usage-detector.ts:177-177`
- **matching** — `graphql-usage-detector.ts:178-181`
- **cmd** — `graphql-usage-detector.ts:179-179`
- **configFileNames** — `graphql-usage-detector.ts:195-211`
- **found** — `graphql-usage-detector.ts:213-217`
- **name** — `graphql-usage-detector.ts:214-214`
- **filePath** — `graphql-usage-detector.ts:215-215`
- **generated** — `graphql-usage-detector.ts:231-237`
- **SIGNAL_WEIGHTS** — `protobuf-usage-detector.ts:48-53`
- **ACTIVE_THRESHOLD** — `protobuf-usage-detector.ts:55-55`
- **allEntities** — `protobuf-usage-detector.ts:62-62`
- **allRelationships** — `protobuf-usage-detector.ts:63-63`
- **protoPackages** — `protobuf-usage-detector.ts:65-65`
- **protoServices** — `protobuf-usage-detector.ts:67-67`
- **protoSpecs** — `protobuf-usage-detector.ts:68-68`
- **protoFiles** — `protobuf-usage-detector.ts:71-71`
- **files** — `protobuf-usage-detector.ts:82-82`
- **signals** — `protobuf-usage-detector.ts:85-85`
- **usageConfidence** — `protobuf-usage-detector.ts:92-95`
- **activeCount** — `protobuf-usage-detector.ts:105-105`
- **updated** — `protobuf-usage-detector.ts:120-120`
- **entities** — `protobuf-usage-detector.ts:123-123`
- **pbImports** — `protobuf-usage-detector.ts:147-155`
- **apiRelationships** — `protobuf-usage-detector.ts:157-159`
- **hasImports** — `protobuf-usage-detector.ts:161-161`
- **keywords** — `protobuf-usage-detector.ts:173-173`
- **scriptEntities** — `protobuf-usage-detector.ts:175-175`
- **matching** — `protobuf-usage-detector.ts:176-179`
- **cmd** — `protobuf-usage-detector.ts:177-177`
- **configFileNames** — `protobuf-usage-detector.ts:193-193`
- **found** — `protobuf-usage-detector.ts:195-199`
- **name** — `protobuf-usage-detector.ts:196-196`
- **filePath** — `protobuf-usage-detector.ts:197-197`
- **generatedPatterns** — `protobuf-usage-detector.ts:213-213`
- **generated** — `protobuf-usage-detector.ts:215-215`
