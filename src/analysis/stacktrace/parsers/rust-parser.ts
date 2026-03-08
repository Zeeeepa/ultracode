/**
 * Rust Panic / RUST_BACKTRACE Parser
 *
 * Handles Rust panics with backtrace:
 *   thread 'main' panicked at 'message', src/main.rs:42:5
 *   stack backtrace:
 *     0: std::panicking::begin_panic
 *     1: myapp::module::function
 *              at ./src/module.rs:10:5
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /thread\s+'[^']+'\s+panicked/m;
const DETECT_BACKTRACE = /stack backtrace:/m;
const PANIC_PATTERN = /thread\s+'([^']+)'\s+panicked\s+at\s+'?(.+?)'?,\s*(.+\.rs:\d+(?::\d+)?)/m;
const PANIC_V2_PATTERN = /thread\s+'([^']+)'\s+panicked\s+at\s+(.+\.rs:\d+(?::\d+)?):\s*\n(.+)/m;

// Backtrace frame:  N: symbol_name
const FRAME_NUM_PATTERN = /^\s*(\d+):\s+(.+)$/;
// Followed by:       at ./path.rs:line:col
const FRAME_AT_PATTERN = /^\s+at\s+(.+\.rs):(\d+)(?::(\d+))?$/;

export class RustStacktraceParser implements LanguageStacktraceParser {
  language = "rust";

  detect(text: string): number {
    if (DETECT_PATTERN.test(text) && DETECT_BACKTRACE.test(text)) return 0.95;
    if (DETECT_PATTERN.test(text)) return 0.85;
    if (DETECT_BACKTRACE.test(text) && /\.rs:\d+/m.test(text)) return 0.7;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    // Extract panic message
    const panicMatch = text.match(PANIC_PATTERN) ?? text.match(PANIC_V2_PATTERN);
    const threadName = panicMatch?.[1] ?? "main";
    const errorMessage = panicMatch?.[2] ?? "";
    const errorType = "panic";

    const frames: StackFrame[] = [];
    const lines = text.split("\n");

    let currentFunc: string | null = null;
    let currentFrameIdx = 0;

    for (const line of lines) {
      const frameMatch = line.match(FRAME_NUM_PATTERN);
      if (frameMatch) {
        // If we had a previous function without location, push it
        if (currentFunc) {
          frames.push(this.buildFrame(currentFunc, currentFrameIdx));
          currentFrameIdx++;
        }
        currentFunc = frameMatch[2]!;
        continue;
      }

      const atMatch = line.match(FRAME_AT_PATTERN);
      if (atMatch && currentFunc) {
        frames.push(
          this.buildFrame(
            currentFunc,
            currentFrameIdx,
            atMatch[1],
            Number(atMatch[2]),
            atMatch[3] ? Number(atMatch[3]) : undefined,
          ),
        );
        currentFrameIdx++;
        currentFunc = null;
      }
    }

    // Push last function if not followed by location
    if (currentFunc) {
      frames.push(this.buildFrame(currentFunc, currentFrameIdx));
    }

    return {
      language: "rust",
      errorType,
      errorMessage,
      frames,
      rawText: text,
      threadInfo: `thread '${threadName}'`,
    };
  }

  private buildFrame(
    funcStr: string,
    index: number,
    filePath?: string,
    lineNumber?: number,
    columnNumber?: number,
  ): StackFrame {
    // Parse "crate::module::Type::method" or "crate::module::function"
    const parts = funcStr.split("::");
    const functionName = parts[parts.length - 1] ?? funcStr;
    const moduleName = parts.length > 2 ? parts.slice(0, -1).join("::") : parts[0];

    // Heuristic: if second-to-last part starts with uppercase, it's a type
    const className =
      parts.length > 2 && /^[A-Z]/.test(parts[parts.length - 2] ?? "") ? parts[parts.length - 2] : undefined;

    return {
      index,
      functionName,
      className,
      moduleName,
      filePath,
      lineNumber,
      columnNumber,
      isNative:
        funcStr.startsWith("std::") ||
        funcStr.startsWith("core::") ||
        funcStr.startsWith("alloc::") ||
        funcStr.includes("__rust_"),
      raw: funcStr,
    };
  }
}
