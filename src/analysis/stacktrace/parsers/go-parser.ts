/**
 * Go Panic/Goroutine Stacktrace Parser
 *
 * Handles Go panics and goroutine dumps:
 *   goroutine 1 [running]:
 *   main.foo(0x1234)
 *       /path/to/file.go:42 +0x1a
 *   panic: runtime error: ...
 *
 * Go frames come in pairs: function line + file:line line.
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_GOROUTINE = /^goroutine\s+\d+/m;
const DETECT_PANIC = /^panic:\s+/m;
const ERROR_PATTERN = /^panic:\s+(.+)$/m;
const RUNTIME_ERROR_PATTERN = /^panic:\s+runtime error:\s+(.+)$/m;

// Go frames: pairs of lines
// Line 1: package.func(args)    or    package.(*Type).Method(args)
// Line 2: \tfile.go:line +offset
const FUNC_LINE = /^([\w./]+(?:\.\([\w*]+\))?\.[\w.]+)\(([^)]*)\)$/;
const FILE_LINE = /^\t(.+\.go):(\d+)\s/;

export class GoStacktraceParser implements LanguageStacktraceParser {
  language = "go";

  detect(text: string): number {
    if (DETECT_GOROUTINE.test(text)) return 0.95;
    if (DETECT_PANIC.test(text) && /\.go:\d+/m.test(text)) return 0.9;
    if (/\.go:\d+/m.test(text) && FUNC_LINE.test(text)) return 0.6;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    // Extract error message
    const runtimeMatch = text.match(RUNTIME_ERROR_PATTERN);
    const panicMatch = text.match(ERROR_PATTERN);
    const errorMessage = runtimeMatch?.[1] ?? panicMatch?.[1] ?? "";
    const errorType = runtimeMatch ? "runtime error" : "panic";

    // Extract goroutine info
    const goroutineMatch = text.match(/^goroutine\s+(\d+)\s+\[(\w+)]/m);
    const threadInfo = goroutineMatch ? `goroutine ${goroutineMatch[1]} [${goroutineMatch[2]}]` : undefined;

    const frames: StackFrame[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length - 1; i++) {
      const funcMatch = lines[i]!.match(FUNC_LINE);
      const fileMatch = lines[i + 1]?.match(FILE_LINE);

      if (funcMatch && fileMatch) {
        const fullFunc = funcMatch[1]!;
        const filePath = fileMatch[1]!;
        const lineNum = Number(fileMatch[2]);

        // Split "package/path.(*Type).Method" into parts
        const lastDot = fullFunc.lastIndexOf(".");
        const functionName = lastDot >= 0 ? fullFunc.substring(lastDot + 1) : fullFunc;
        const qualifier = lastDot >= 0 ? fullFunc.substring(0, lastDot) : undefined;

        // Check for receiver type: "package.(*Type)"
        let className: string | undefined;
        let moduleName: string | undefined;
        if (qualifier) {
          const receiverMatch = qualifier.match(/^(.+)\.\(([*]?\w+)\)$/);
          if (receiverMatch) {
            moduleName = receiverMatch[1];
            className = receiverMatch[2]!.replace("*", "");
          } else {
            moduleName = qualifier;
          }
        }

        frames.push({
          index: frames.length,
          functionName,
          className,
          moduleName,
          filePath,
          lineNumber: lineNum,
          isNative: filePath.includes("/runtime/") || filePath.includes("/src/runtime/"),
          raw: `${lines[i]!.trim()}\n${lines[i + 1]!.trim()}`,
        });

        i++; // skip the file line
      }
    }

    return {
      language: "go",
      errorType,
      errorMessage,
      frames,
      rawText: text,
      threadInfo,
    };
  }
}
