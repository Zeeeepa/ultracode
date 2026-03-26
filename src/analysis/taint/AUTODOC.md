# Taint

## Overview

Taint is a data flow analysis system that detects security vulnerabilities by tracking how untrusted data (sources) flows through the codebase to dangerous operations (sinks) without sufficient sanitization. The module identifies SQL injection, XSS, command injection, and prototype pollution vulnerabilities by analyzing source code patterns and constructing complete vulnerability flows. It uses regex-based pattern catalogs to classify sources, sinks, and sanitizers, then formats results with pagination and severity classification for developer consumption.

## Flow

```
Source Code
    ↓
TaintFlowAnalyzer (core engine)
    ├─ Extract sources (HTTP inputs, database reads, user-controlled data)
    ├─ Extract sinks (SQL queries, eval, DOM writes, command execution)
    ├─ Extract sanitizers (validation, escaping, parameterization)
    └─ Trace data flows from sources → sinks, classify vulnerabilities
    ↓
TaintVulnerability[] (flows with severity, categories, steps)
    ↓
TaintFormatter
    ├─ Format as text report (statistics, vulnerability list)
    └─ Paginate results (default 20/page, max 200)
    ↓
Handler Response (JSON + pagination metadata + 50KB transport limit)
```

## Entity Listing

### Type Definitions

| Name | Description | Location |
|------|-------------|----------|
| `TaintCategory` | Vulnerability category enumeration supporting `"sql_injection"`, `"xss"`, `"command_injection"`, and `"prototype_pollution"`. | [types.ts:1-8](types.ts:1-8) |
| `TaintSeverity` | Vulnerability severity level enumeration with values `"critical"`, `"high"`, `"medium"`, and `"low"`. | [types.ts:10](types.ts:10) |
| `TaintFlowRole` | Entity role in taint flow analysis: `"source"` for data entry points, `"sink"` for dangerous operations, or `"sanitizer"` for protective functions. | [types.ts:41](types.ts:41) |

### Pattern Interfaces

| Name | Description | Location |
|------|-------------|----------|
| `SourcePattern` | Configuration for detecting untrusted data entry points with regex pattern, classification type, description, and priority ranking for source prioritization. | [catalogs.ts:3-8](catalogs.ts:3-8) |
| `SinkPattern` | Configuration for detecting dangerous operations with regex pattern, classification type, list of affected vulnerability categories, and priority ranking. | [catalogs.ts:10-16](catalogs.ts:10-16) |
| `SanitizerPattern` | Configuration for detecting protective functions with regex pattern, classification type, set of vulnerability categories the sanitizer defends against, and optional location metadata. | [catalogs.ts:18-23](catalogs.ts:18-23) |

### Pattern Catalogs

| Name | Description | Location |
|------|-------------|----------|
| `SOURCE_PATTERNS` | Pre-defined array of regex patterns identifying untrusted data sources including HTTP body/parameters/query/headers/cookies, DOM input elements, database output, and websocket messages. | [catalogs.ts:28-30](catalogs.ts:28-30) |
| `SINK_PATTERNS` | Pre-defined array of regex patterns identifying dangerous operations including SQL query execution, command execution, JavaScript eval, DOM manipulation, and prototype pollution attacks. | [catalogs.ts:64-66](catalogs.ts:64-66) |
| `SANITIZER_PATTERNS` | Pre-defined array of regex patterns identifying protective functions including SQL parameterization, HTML escaping, command escaping, input validation, and JSON schema validation. | [catalogs.ts:105-107](catalogs.ts:105-107) |

### Flow Entity Types

| Name | Description | Location |
|------|-------------|----------|
| `TaintSource` | Discovered taint source with entity name, source type classification (e.g., `"http_body"`), file location, line and column numbers, and detection priority. | [types.ts:10](types.ts:10) |
| `TaintSink` | Dangerous operation with entity name, sink type classification (e.g., `"sql_execute"`), list of affected vulnerability categories, file location coordinates, and priority ranking. | [types.ts:22-30](types.ts:22-30) |
| `TaintSanitizer` | Protective function with name, sanitizer type classification (e.g., `"sql_parameterize"`), set of vulnerability categories defended, and file location. | [types.ts:32-39](types.ts:32-39) |
| `TaintFlowStep` | Single step in a vulnerability propagation path showing the role (source/sink/sanitizer), entity name, file location, and description of data transformation at this step. | [types.ts:41](types.ts:41) |
| `TaintVulnerability` | Detected security vulnerability with source and sink references, assigned severity level, vulnerability category, complete flow path as sequence of steps, and unsanitized flag. | [types.ts:52-61](types.ts:52-61) |

### Analysis Interfaces

| Name | Description | Location |
|------|-------------|----------|
| `TaintAnalysisParams` | Parameters for initiating taint analysis including target entity identifier, code cache reference, optional severity filter, optional category filter, and pagination configuration. | [types.ts:63-68](types.ts:63-68) |
| `TaintAnalysisResult` | Complete taint analysis report containing summary statistics (source count, sink count, sanitizer count, vulnerability count) and list of detected vulnerabilities. | [types.ts:63-68](types.ts:63-68) |

### Core Engine Classes

| Name | Description | Location |
|------|-------------|----------|
| `TaintFlowAnalyzer` | Main analysis engine responsible for discovering taint sources and sinks in code, tracing data flow paths between them, evaluating sanitization effectiveness, detecting vulnerabilities, and building complete vulnerability paths with step-by-step tracking for developer review. | [taint-flow-analyzer.ts:19-642](taint-flow-analyzer.ts:19-642) |
| `TaintFormatter` | Transformer that converts `TaintAnalysisResult` into human-readable text reports with vulnerability statistics, summary section, and detailed vulnerability descriptions for presentation in analysis interfaces. | [taint-formatter.ts:3-90](taint-formatter.ts:3-90) |

### Classification Utilities

| Name | Description | Location |
|------|-------------|----------|
| `classifyAsSource` | Classifies an entity as a taint source by matching against `SOURCE_PATTERNS` and assigns priority ranking based on pattern specificity and risk level. | [catalogs.ts:135-137](catalogs.ts:135-137) |
| `classifyAsSink` | Classifies an entity as a dangerous operation by matching against `SINK_PATTERNS` and determines which vulnerability categories are affected by the sink. | [catalogs.ts:149-151](catalogs.ts:149-151) |
| `classifyAsSanitizer` | Classifies an entity as a protective sanitizer by matching against `SANITIZER_PATTERNS` and identifies which vulnerability categories are defended by the sanitizer. | [catalogs.ts:163-165](catalogs.ts:163-165) |

## Dependencies

**Internal:**
- `response-limits.ts` — Provides `paginate()` utility function and `SAFE_LIMITS.taintVulnerabilities` configuration for result pagination and controlling maximum page size.
- `index.ts` (handler layer) — Enforces `MAX_RESPONSE_SIZE_BYTES` (50KB) transport safety limit on serialized responses and injects `_responseMeta` metadata for truncated result indication.

**Pattern catalog architecture:**
- Regex-based pattern matching using pre-compiled patterns for efficient source, sink, and sanitizer detection.
- Analysis routing through `pLimit(1)` queue ensuring serialized analysis execution to prevent concurrent memory spikes on heavyweight analysis operations.