# Stacktrace

Analyzes stacktraces to identify and diagnose runtime errors

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `classifyError` | function | Classifies error by type and severity | [→ error-classifier.ts:252-288] |
| `diagnose` | function | Analyzes stacktrace and generates diagnosis with fixes | [→ diagnosis-engine.ts:55-59] |
| `DiagnosisOptions` | interface | Configuration options for diagnosis function | [→ diagnosis-engine.ts:44-49] |
| `DiagnosisTraceEngine` | interface | Interface for optional backwards tracing dependency | [→ diagnosis-engine.ts:29-42] |
| `ErrorCategory` | type | Type for classifiable error categories | [→ types.ts:47-61] |
| `ErrorClassification` | interface | Error category with severity and hints | [→ types.ts:65-70] |
| `FrameResolverStorage` | interface | Interface for code graph storage operations | [→ frame-resolver.ts:18-41] |
| `getSupportedLanguages` | function | Returns list of supported stacktrace languages | [→ stacktrace-parser.ts:104-106] |
| `LanguageStacktraceParser` | interface | Interface for language-specific parser implementations | [→ types.ts:138-142] |
| `ParsedStacktrace` | interface | Complete parsed stacktrace with error metadata | [→ types.ts:33-41] |
| `parseStacktrace` | function | Parses raw stacktrace with auto-detected language | [→ stacktrace-parser.ts:65-99] |
| `ResolvedFrame` | interface | StackFrame enriched with code graph bindings | [→ types.ts:79-85] |
| `resolveFrames` | function | Resolves stacktrace frames to code entities | [→ frame-resolver.ts:69-159] |
| `Severity` | type | Type for error severity levels | [→ types.ts:63] |
| `StackFrame` | interface | Single stacktrace frame with location information | [→ types.ts:16-27] |
| `StacktraceDiagnosis` | interface | Complete diagnosis output with analysis | [→ types.ts:97-128] |
| `SuggestedFix` | interface | Suggested fix with location and priority | [→ types.ts:91-95] |

## Files

- **diagnosis-engine.ts** — Orchestrates stacktrace analysis with error classification and fixes
- **error-classifier.ts** — Classifies errors by type and severity with hints
- **frame-resolver.ts** — Resolves stacktrace frames to code graph entities
- **index.ts** — Barrel export for stacktrace analyzer module
- **stacktrace-parser.ts** — Auto-detects language and parses stacktraces
- **types.ts** — Core type definitions for stacktrace analysis
