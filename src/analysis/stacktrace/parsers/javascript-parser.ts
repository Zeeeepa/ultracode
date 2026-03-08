/**
 * JavaScript/TypeScript (V8/Node.js) Stacktrace Parser
 *
 * Handles V8-style stacktraces:
 *   at functionName (file:line:col)
 *   at file:line:col
 *   at async functionName (file:line:col)
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /^\s+at\s+/m;
const ERROR_LINE_PATTERN =
  /^(\w+(?:\.\w+)*Error|RangeError|TypeError|ReferenceError|SyntaxError|URIError|EvalError):\s*(.+)$/m;

// Matches:  at funcName (file:line:col)  or  at file:line:col
const FRAME_PATTERN = /^\s+at\s+(?:async\s+)?(?:(?:new\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))$/gm;

export class JavaScriptStacktraceParser implements LanguageStacktraceParser {
  language = "javascript";

  detect(text: string): number {
    if (!DETECT_PATTERN.test(text)) return 0;
    // Distinguish from Java: JS uses "(file:line:col)" with TWO colons
    const jsFrames = text.match(/at\s+.*?\d+:\d+\)/gm);
    const javaFrames = text.match(/at\s+[\w.$]+\.\w+\(\w+\.\w+:\d+\)/gm);
    if (javaFrames && javaFrames.length > (jsFrames?.length ?? 0)) return 0.2;
    if (jsFrames && jsFrames.length > 0) return 0.9;
    // "at" lines without colons could be either
    return DETECT_PATTERN.test(text) ? 0.5 : 0;
  }

  parse(text: string): ParsedStacktrace {
    const errorMatch = text.match(ERROR_LINE_PATTERN);
    const errorType = errorMatch?.[1] ?? "Error";
    const errorMessage = errorMatch?.[2] ?? "";

    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(FRAME_PATTERN.source, "gm");

    while ((match = re.exec(text)) !== null) {
      const isAsync = /^\s+at\s+async\s+/.test(match[0]!);

      // Named function form: at func (file:line:col)
      if (match[1]) {
        const funcName = match[1]!.replace(/^new\s+/, "");
        const parts = funcName.split(".");
        frames.push({
          index: frames.length,
          functionName: parts.length > 1 ? parts[parts.length - 1]! : funcName,
          className: parts.length > 1 ? parts.slice(0, -1).join(".") : undefined,
          filePath: match[2],
          lineNumber: Number(match[3]),
          columnNumber: Number(match[4]),
          isNative: match[2] === "native" || match[2]?.includes("<anonymous>"),
          isAsync,
          raw: match[0]!.trim(),
        });
      } else {
        // Anonymous form: at file:line:col
        frames.push({
          index: frames.length,
          functionName: "<anonymous>",
          filePath: match[5],
          lineNumber: Number(match[6]),
          columnNumber: Number(match[7]),
          isNative: false,
          isAsync,
          raw: match[0]!.trim(),
        });
      }
    }

    return {
      language: "javascript",
      errorType,
      errorMessage,
      frames,
      rawText: text,
    };
  }
}
