/**
 * JVM (Java/Kotlin) Stacktrace Parser
 *
 * Handles Java/Kotlin stacktraces:
 *   java.lang.NullPointerException: message
 *     at package.Class.method(File.java:line)
 *     at package.Class.method(Native Method)
 *   Caused by: ...
 *
 * Supports "Caused by" exception chains.
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_PATTERN = /^\s+at\s+[\w.$]+\(/m;
const ERROR_LINE_PATTERN = /^([\w.$]+(?:Exception|Error|Throwable))(?::\s*(.+))?$/m;
const FRAME_PATTERN = /^\s+at\s+([\w.$]+)\.([\w$<>]+)\((?:(\w+\.\w+):(\d+)|Native Method|Unknown Source)\)/gm;
export class JvmStacktraceParser implements LanguageStacktraceParser {
  language = "java";

  detect(text: string): number {
    if (!DETECT_PATTERN.test(text)) return 0;
    // Check for Java-specific patterns: qualified class names with ()
    const javaFrames = text.match(/at\s+[\w.$]+\.\w+\(\w+\.\w+:\d+\)/gm);
    if (javaFrames && javaFrames.length >= 2) return 0.95;
    if (DETECT_PATTERN.test(text) && ERROR_LINE_PATTERN.test(text)) return 0.8;
    return 0.3;
  }

  parse(text: string): ParsedStacktrace {
    return this.parseSection(text);
  }

  private parseSection(text: string): ParsedStacktrace {
    // Split on "Caused by:" to handle exception chains
    const causedByIdx = text.search(/\nCaused by:\s*/);
    const mainSection = causedByIdx >= 0 ? text.substring(0, causedByIdx) : text;
    const causedBySection = causedByIdx >= 0 ? text.substring(causedByIdx + 1) : null;

    const errorMatch = mainSection.match(ERROR_LINE_PATTERN);
    const errorType = errorMatch?.[1] ?? "Exception";
    const errorMessage = errorMatch?.[2] ?? "";

    // Parse thread info
    const threadMatch = mainSection.match(/^"([^"]+)"/m);
    const threadInfo = threadMatch?.[1];

    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(FRAME_PATTERN.source, "gm");

    while ((match = re.exec(mainSection)) !== null) {
      const fullClass = match[1]!;
      const methodName = match[2]!;
      const fileName = match[3];
      const lineNum = match[4];

      // Split package from class
      const lastDot = fullClass.lastIndexOf(".");
      const className = lastDot >= 0 ? fullClass.substring(lastDot + 1) : fullClass;
      const moduleName = lastDot >= 0 ? fullClass.substring(0, lastDot) : undefined;

      frames.push({
        index: frames.length,
        functionName: methodName,
        className,
        moduleName,
        filePath: fileName,
        lineNumber: lineNum ? Number(lineNum) : undefined,
        isNative: !fileName,
        raw: match[0]!.trim(),
      });
    }

    const result: ParsedStacktrace = {
      language: "java",
      errorType,
      errorMessage,
      frames,
      rawText: text,
      threadInfo,
    };

    // Recursively parse "Caused by" chain
    if (causedBySection) {
      const causedText = causedBySection.replace(/^Caused by:\s*/, "");
      result.causedBy = this.parseSection(causedText);
    }

    return result;
  }
}
