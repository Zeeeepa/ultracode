/**
 * Zig Error Trace Parser
 *
 * Handles Zig error return traces:
 *   error: message
 *   /path/to/file.zig:42:5: 0x12345 in functionName (binary)
 *   /path/to/file.zig:50:1: 0x12346 in anotherFunc (binary)
 *
 * Also handles panic format:
 *   thread N panic: message
 *   /path/to/file.zig:line:col: ...
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /\.zig:\d+:\d+:/m;
const DETECT_PANIC = /thread\s+\d+\s+panic:/m;

// file.zig:line:col: 0xaddr in funcName (binary)
const FRAME_PATTERN = /^(.+\.zig):(\d+):(\d+):\s*(?:0x[\da-f]+\s+in\s+)?(\S+)?/gm;
const ERROR_PATTERN = /^(?:error|thread\s+\d+\s+panic):\s*(.+)$/m;

export class ZigStacktraceParser implements LanguageStacktraceParser {
  language = "zig";

  detect(text: string): number {
    if (DETECT_PANIC.test(text) && DETECT_PATTERN.test(text)) return 0.95;
    if (DETECT_PATTERN.test(text)) return 0.8;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    const errorMatch = text.match(ERROR_PATTERN);
    const errorType = DETECT_PANIC.test(text) ? "panic" : "error";
    const errorMessage = errorMatch?.[1] ?? "";

    const threadMatch = text.match(/thread\s+(\d+)\s+panic/);
    const threadInfo = threadMatch ? `thread ${threadMatch[1]}` : undefined;

    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(FRAME_PATTERN.source, "gm");

    while ((match = re.exec(text)) !== null) {
      const filePath = match[1]!;
      const funcName = match[4] ?? "<unknown>";

      frames.push({
        index: frames.length,
        functionName: funcName,
        filePath,
        lineNumber: Number(match[2]),
        columnNumber: Number(match[3]),
        isNative: filePath.includes("/lib/std/") || filePath.includes("\\lib\\std\\"),
        raw: match[0]!.trim(),
      });
    }

    return {
      language: "zig",
      errorType,
      errorMessage,
      frames,
      rawText: text,
      threadInfo,
    };
  }
}
