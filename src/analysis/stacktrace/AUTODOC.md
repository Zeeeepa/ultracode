# Stacktrace Analyzer

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

| Function | Purpose | Location |
|----------|---------|----------|
| `diagnose` | Orchestrates complete stacktrace analysis: parses raw stacktrace, classifies error, resolves frames to code entities, optionally runs trace-backwards and impact analysis, then generates suggested fixes and diagnostic diagram. | diagnosis-engine.ts:48-56 |
| `parseStacktrace` | Auto-detects source programming language and parses raw stacktrace text into structured stack frame objects with function name, file path, and line number. | stacktrace-parser.ts:65-99 |
| `classifyError` | Analyzes error message and surrounding context to assign error category (reference, type, runtime, etc.), severity level (critical/high/medium/low), and debugging hints. | error-classifier.ts:252-288 |
| `resolveFrames` | Maps parsed stacktrace frames to code graph entities (functions, classes, modules) using symbol matching and location-based lookup against the code graph. | frame-resolver.ts:65-155 |
| `getSupportedLanguages` | Returns list of programming languages with available stacktrace parser implementations. | stacktrace-parser.ts:104-106 |

## Configuration Interfaces

| Name | Purpose | Location |
|------|---------|----------|
| `DiagnosisOptions` | Configures diagnosis behavior: `includeBackwardsTrace` enables call-chain analysis from crash point, `includeImpactAnalysis` runs code impact assessment, `depth` controls analysis scope, `projectPath` contextualizes file resolution. | diagnosis-engine.ts:39-43 |
| `DiagnosisTraceEngine` | Minimal dependency interface for optional backwards trace engine; exposes `traceBackwards()` method to analyze call chains leading to error origin. | diagnosis-engine.ts:20-26 |
| `FrameResolverStorage` | Abstraction for code graph backend: defines operations for symbol lookup, entity retrieval, and location-based matching needed by frame resolution. | frame-resolver.ts:17-37 |
| `LanguageStacktraceParser` | Interface for language-specific parser implementations: declares `language` identifier and `parse()` method for parsing stacktraces in that language's format. | types.ts:142-146 |

## Data Types

| Type | Structure | Location |
|------|-----------|----------|
| `StackFrame` | Represents single stacktrace entry: `function` (function/method name), `file` (source file path), `line` (line number), `column` (optional column offset), `sourceContext` (code snippet around frame). | types.ts:16-27 |
| `ParsedStacktrace` | Result of parsing: `message` (error message), `frames` (array of StackFrames), `language` (detected language), `metadata` (parser-specific data). | types.ts:33-41 |
| `ErrorCategory` | Union of classifiable error types: `"ReferenceError" | "TypeError" | "RuntimeException" | "DomainSpecificError"` and others based on error context. | types.ts:47-61 |
| `Severity` | Union of priority levels: `"critical" | "high" | "medium" | "low"` assigned based on error impact and context. | types.ts:63 |
| `ErrorClassification` | Classification result: `category` (ErrorCategory), `severity` (Severity), `hints` (array of debugging suggestions). | types.ts:63 |
| `ResolvedFrame` | StackFrame enriched with code graph bindings: original `frame`, `entity` (matched code entity), `scopeDepth` (nesting level), `codeLocation` (metadata about resolved position). | types.ts:79-85 |
| `SuggestedFix` | Recommended correction: `description` (fix explanation), `location` (file/line where fix applies), `priority` (implementation order), `confidence` (likelihood fix resolves error). | types.ts:91-95 |
| `StacktraceDiagnosis` | Complete diagnosis output: `stacktrace` (parsed), `resolvedFrames` (with graph bindings), `errorClassification` (category/severity), `suggestedFixes` (array of fixes), `diagram` (Mermaid graph visualization). | types.ts:97-132 |

## Dependencies

**Internal:**
- Code graph storage backend (via `FrameResolverStorage` interface) — provides symbol resolution and entity matching capabilities
- Language parsers (implementations of `LanguageStacktraceParser`) — handle syntax variations across supported languages
- Optional trace-backwards engine (implements `DiagnosisTraceEngine`) — enriches diagnosis with backward call-chain analysis from crash point

**External:**
- File I/O for retrieving source code context around stack frames
- Symbol resolution service (injected via storage interface)