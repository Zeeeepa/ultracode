# Parsers

Parses stacktraces from multiple programming languages into structured frames.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `DotNetStacktraceParser` | class | Detects and parses .NET exception stacktraces into frames | [→ dotnet-parser.ts:12-77] |
| `GoStacktraceParser` | class | Extracts goroutine context and panic frames from Go dumps | [→ go-parser.ts:10-13] |
| `JavaScriptStacktraceParser` | class | Parses V8-style async-aware frames with positions | [→ javascript-parser.ts:12-83] |
| `JvmStacktraceParser` | class | Parses Java frames with recursive exception chain handling | [→ jvm-parser.ts:15-92] |
| `NativeStacktraceParser` | class | Detects GDB, ASAN, and macOS formats for native code | [→ native-parser.ts:13-110] |
| `PythonStacktraceParser` | class | Parses Python exception frames with inverted index ordering | [→ python-parser.ts:15-67] |
| `RustStacktraceParser` | class | Extracts backtrace frames with crate and type information | [→ rust-parser.ts:14-122] |
| `ZigStacktraceParser` | class | Parses Zig error traces with thread and function context | [→ zig-parser.ts:16-68] |

## Files

- **dotnet-parser.ts** — Parses .NET C#/F#/VB stacktraces with file locations
- **go-parser.ts** — Parses Go panic and goroutine dump stacktraces
- **javascript-parser.ts** — Parses V8/Node.js JavaScript and TypeScript stacktraces
- **jvm-parser.ts** — Parses Java/Kotlin stacktraces with exception chaining support
- **native-parser.ts** — Parses C/C++/Swift GDB, ASAN, and macOS crash stacktraces
- **python-parser.ts** — Parses Python tracebacks with exception type extraction
- **rust-parser.ts** — Parses Rust panic backtraces with crate and module context
- **zig-parser.ts** — Parses Zig error traces and panic stack frames
