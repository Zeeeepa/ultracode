/**
 * .NET (C#/F#/VB) Stacktrace Parser
 *
 * Handles .NET stacktraces:
 *   System.NullReferenceException: Object reference not set...
 *     at Namespace.Class.Method(params) in file:line N
 *     at Namespace.Class.Method(params)
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /^\s+at\s+[\w.]+\(.*\)\s+in\s+/m;
const DETECT_PATTERN_ALT = /^\s+at\s+[\w.<>]+\([\w\s,.<>[\]]*\)$/m;
const ERROR_LINE_PATTERN = /^([\w.]+(?:Exception|Error)):\s*(.+)$/m;
const FRAME_PATTERN = /^\s+at\s+([\w.<>+`[\],]+)\(([^)]*)\)(?:\s+in\s+(.+):line\s+(\d+))?/gm;

export class DotNetStacktraceParser implements LanguageStacktraceParser {
  language = "csharp";

  detect(text: string): number {
    if (DETECT_PATTERN.test(text)) return 0.95;
    // .NET without file paths
    if (DETECT_PATTERN_ALT.test(text) && ERROR_LINE_PATTERN.test(text)) return 0.7;
    // Check for .NET-specific exception types
    if (/System\.\w+Exception/m.test(text)) return 0.6;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    const errorMatch = text.match(ERROR_LINE_PATTERN);
    const errorType = errorMatch?.[1] ?? "Exception";
    const errorMessage = errorMatch?.[2] ?? "";

    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(FRAME_PATTERN.source, "gm");

    while ((match = re.exec(text)) !== null) {
      const fullName = match[1]!;
      const filePath = match[3];
      const lineNum = match[4];

      // Split "Namespace.Class.Method" → className + functionName
      const lastDot = fullName.lastIndexOf(".");
      const functionName = lastDot >= 0 ? fullName.substring(lastDot + 1) : fullName;
      const qualifiedClass = lastDot >= 0 ? fullName.substring(0, lastDot) : undefined;

      // Further split class from namespace
      let className: string | undefined;
      let moduleName: string | undefined;
      if (qualifiedClass) {
        const classDot = qualifiedClass.lastIndexOf(".");
        className = classDot >= 0 ? qualifiedClass.substring(classDot + 1) : qualifiedClass;
        moduleName = classDot >= 0 ? qualifiedClass.substring(0, classDot) : undefined;
      }

      frames.push({
        index: frames.length,
        functionName,
        className,
        moduleName,
        filePath,
        lineNumber: lineNum ? Number(lineNum) : undefined,
        isNative: !filePath,
        raw: match[0]!.trim(),
      });
    }

    return {
      language: "csharp",
      errorType,
      errorMessage,
      frames,
      rawText: text,
    };
  }
}
