# Stacktrace Parsers

Language-specific stacktrace parsers that extract and structure error information from runtime exceptions across multiple programming languages.

## Overview

This module provides language-agnostic stacktrace parsing for 8+ programming languages including Java, .NET, Python, JavaScript, Go, Rust, Zig, and native C/C++/Swift. Each parser detects its format using pattern matching with confidence scoring, extracts exception metadata and stack frames, and normalizes them into a unified `StackFrame` structure. The Strategy pattern enables dynamic parser selection based on format detection, supporting polymorphic parsing across polyglot systems.

## Flow

```
Raw Stacktrace Text
  │
  ↓
Detection Engine (pattern confidence scores)
  │
  ↓
Language-Specific Parser Selected
  │
  ├─ Extract exception type/message
  ├─ Parse frames (file, function, line)
  └─ Normalize output format
  │
  ↓
ParsedStacktrace (frames array + metadata)
```

## Language-Specific Parsers

- **`DotNetStacktraceParser`** (dotnet-parser.ts:12-77): Detects and parses .NET exception stacktraces into frames with file location metadata for C#, F#, and VB.NET.

- **`JvmStacktraceParser`** (jvm-parser.ts:15-92): Parses Java and Kotlin exception frames with recursive exception chain handling for multi-cause exceptions.

- **`JavaScriptStacktraceParser`** (javascript-parser.ts:12-83): Parses V8-style async-aware frames with source positions and async context information for JavaScript and TypeScript.

- **`PythonStacktraceParser`** (python-parser.ts:15-67): Parses Python exception frames with inverted index ordering from traceback format.

- **`GoStacktraceParser`** (go-parser.ts:10-13): Extracts goroutine context and panic frames from Go runtime dump format.

- **`RustStacktraceParser`** (rust-parser.ts:14-122): Extracts backtrace frames with crate, module, and type information from panic output.

- **`NativeStacktraceParser`** (native-parser.ts:13-110): Detects GDB, ASAN, and macOS formats for native C/C++/Swift code with address and symbol resolution.

- **`ZigStacktraceParser`** (zig-parser.ts:16-68): Parses Zig error traces with thread and function context information.

## Core Types and Interfaces

- **`LanguageStacktraceParser`** (types.js): Interface that all parsers implement, defining `detect(text): number` for format confidence scoring and `parse(text): ParsedStacktrace` for frame extraction.

- **`StackFrame`** (types.js): Normalized representation of a single stack frame containing file path, function name, line number, and optional column information.

- **`ParsedStacktrace`** (types.js): Container for parsed stacktrace output including exception type, message, and array of normalized `StackFrame` objects.

## Dependencies

### Internal

- `types.js` — Core interfaces (`LanguageStacktraceParser`) and types (`StackFrame`, `ParsedStacktrace`) for parser contracts and normalized output representation.

### External

- Standard TypeScript RegExp for pattern matching and text extraction.
- No third-party npm dependencies.

## Design Patterns

**Strategy Pattern**: Each parser implements `LanguageStacktraceParser` with `detect(text): number` and `parse(text): ParsedStacktrace` methods, enabling polymorphic selection based on detected format and graceful fallback handling.

**Confidence Scoring**: Detection methods return scores (0.0–1.0) from multiple pattern matches, allowing a dispatcher to select the highest-confidence parser when formats are ambiguous or overlapping.