# Stacktrace Analyzer

Analyzes stacktraces by parsing frames, classifying errors, resolving entities, and generating root cause diagnosis with fixes.

## Overview

The Stacktrace Analyzer module parses and diagnoses runtime errors by extracting stack frames, classifying error types and severity, and resolving frames to corresponding code entities via a code graph. It supports multiple programming languages with auto-detection and can optionally integrate with trace-backwards analysis and impact assessment to generate actionable fix suggestions. The module is designed as a pipeline with clear separation: parsing → classification → resolution → optional enrichment → diagnosis output.

## Flow

```
Raw Stacktrace
      ↓
   [Parse] ← Language auto-detection
      ↓
   Stack Frames
      ↓
   [Classify Error] ← Error type + severity
      ↓
   Error Classification
      ↓
   [Resolve Frames] ← Match to code graph
      ↓
   Resolved Frames (with bindings)
      ↓
   [Enrich] ← Optional: trace-backwards, impact analysis
      ↓
   [Generate Fixes] ← Search for missing checks
      ↓
   StacktraceDiagnosis (fixes + diagram)
```

## Core API

**Primary orchestration:**
- `diagnose()` (diagnosis-engine.ts:48-56) — Orchestrates complete stacktrace analysis: parses raw input, classifies error type and severity, resolves frames to code entities, optionally runs backwards trace and impact analysis, then generates suggested fixes and diagnostic diagram.

**Foundation operations:**
- `parseStacktrace()` (stacktrace-parser.ts:65-99) — Auto-detects source programming language and parses raw stacktrace text into structured stack frame objects with function name, file path, and line number.
- `classifyError()` (error-classifier.ts:252-288) — Analyzes error message and surrounding context to assign error category (reference, type, runtime, etc.), severity level, and debugging hints.
- `resolveFrames()` (frame-resolver.ts:65-155) — Maps parsed stacktrace frames to code graph entities (functions, classes, modules) using symbol matching and location-based lookup.
- `getSupportedLanguages()` (stacktrace-parser.ts:104-106) — Returns list of programming languages with available stacktrace parser implementations.

## Configuration Interfaces

- `DiagnosisOptions` (diagnosis-engine.ts:39-43) — Configures diagnosis behavior: `includeBackwardsTrace` enables call-chain analysis from crash point, `includeImpactAnalysis` runs code impact assessment, `depth` controls analysis scope, `projectPath` contextualizes file resolution.
- `DiagnosisTraceEngine` (diagnosis-engine.ts:20-26) — Minimal dependency interface for optional backwards trace engine; exposes `traceBackwards()` method to analyze call chains leading to error origin.
- `FrameResolverStorage` (frame-resolver.ts:17-37) — Abstraction for code graph backend: defines operations for symbol lookup, entity retrieval, and location-based matching needed by frame resolution.
- `LanguageStacktraceParser` (types.ts:142-146) — Interface for language-specific parser implementations: declares `language` identifier and `parse()` method for parsing stacktraces in that language's format.

## Data Types

- `StackFrame` (types.ts:16-27) — Represents single stacktrace entry with `function` name, source `file` path, `line` number, optional `column` offset, and `sourceContext` code snippet.
- `ParsedStacktrace` (types.ts:33-41) — Result of parsing: `message` (error message), `frames` (StackFrame array), `language` (detected language), `metadata` (parser-specific data).
- `ErrorCategory` (types.ts:47-61) — Union of classifiable error types including `ReferenceError`, `TypeError`, `RuntimeException`, `DomainSpecificError`, and others based on error context.
- `Severity` (types.ts:63) — Priority level union: `"critical" | "high" | "medium" | "low"` assigned based on error impact.
- `ErrorClassification` (types.ts:65-73) — Classification result containing `category` (ErrorCategory), `severity` (Severity), and `hints` (array of debugging suggestions).
- `ResolvedFrame` (types.ts:79-85) — StackFrame enriched with code graph bindings: original `frame`, matched code `entity`, `scopeDepth` (nesting level), and `codeLocation` metadata.
- `SuggestedFix` (types.ts:91-95) — Recommended correction with `description` (fix explanation), `location` (file/line), `priority` (implementation order), and `confidence` (likelihood of resolution).
- `StacktraceDiagnosis` (types.ts:97-132) — Complete diagnosis output aggregating `stacktrace` (parsed), `resolvedFrames` (with graph bindings), `errorClassification`, `suggestedFixes`, and `diagram` (Mermaid visualization).

## Design Patterns

The module implements a **diagnostic pipeline pattern** where each stage (parse, classify, resolve, enrich) is independently testable and composable. Error classification and frame resolution are decoupled operations that can run in sequence, with optional enrichment stages (backwards trace, impact analysis) injected via dependency interfaces. This allows the core diagnosis to function standalone without trace capabilities while supporting deep analysis when the trace engine is available. The module uses **dependency injection** through abstract interfaces (`DiagnosisTraceEngine`, `FrameResolverStorage`) to keep core logic independent of external analysis tools.

## Dependencies

**Internal:**
- Code graph storage backend (via `FrameResolverStorage` interface) for symbol resolution and entity matching
- Language parser implementations (via `LanguageStacktraceParser` interface) for syntax variations across supported languages
- Error classification engine for categorizing faults and assigning severity
- Optional trace-backwards engine (via `DiagnosisTraceEngine` interface) for backward call-chain analysis from crash point

**External:**
- File I/O for retrieving source code context around stack frames
- Symbol resolution service (injected via storage interface)