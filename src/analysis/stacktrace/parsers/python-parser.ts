/**
 * Python Traceback Parser
 *
 * Handles Python tracebacks:
 *   Traceback (most recent call last):
 *     File "path", line N, in func
 *       code_line
 *   ExceptionType: message
 *
 * Python frames are listed caller→callee (top→bottom), last frame = crash point.
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /Traceback \(most recent call last\)/m;
const FRAME_PATTERN = /^\s*File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(\S+))?/gm;
const ERROR_LINE_PATTERN = /^(\w+(?:\.\w+)*(?:Error|Exception|Warning|Exit))\s*:\s*(.+)$/m;
const BARE_ERROR_PATTERN = /^(\w+(?:\.\w+)*(?:Error|Exception|Warning|Exit))\s*$/m;

export class PythonStacktraceParser implements LanguageStacktraceParser {
  language = "python";

  detect(text: string): number {
    if (DETECT_PATTERN.test(text)) return 0.95;
    // Could be a short traceback without the header
    if (FRAME_PATTERN.test(text) && ERROR_LINE_PATTERN.test(text)) return 0.7;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    // Extract error type and message (last non-empty line matching pattern)
    const errorMatch = text.match(ERROR_LINE_PATTERN) ?? text.match(BARE_ERROR_PATTERN);
    const errorType = errorMatch?.[1] ?? "Exception";
    const errorMessage = errorMatch?.[2] ?? "";

    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(FRAME_PATTERN.source, "gm");

    while ((match = re.exec(text)) !== null) {
      const funcName = match[3] ?? "<module>";
      const filePath = match[1]!;

      frames.push({
        index: 0, // will be reassigned below
        functionName: funcName,
        filePath,
        lineNumber: Number(match[2]),
        isNative: filePath.includes("site-packages") || filePath.includes("/lib/python") || filePath.startsWith("<"),
        raw: match[0]!.trim(),
      });
    }

    // In Python traceback, last frame = crash point → index 0
    for (let i = 0; i < frames.length; i++) {
      frames[i]!.index = frames.length - 1 - i;
    }

    return {
      language: "python",
      errorType,
      errorMessage,
      frames,
      rawText: text,
    };
  }
}
