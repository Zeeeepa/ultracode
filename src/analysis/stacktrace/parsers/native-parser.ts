/**
 * C/C++/Swift Native Stacktrace Parser
 *
 * Handles:
 * - GDB backtrace: #0 0xaddr in func (args) at file:line
 * - ASAN: #0 0xaddr in func file:line
 * - macOS/LLDB: 0 libname 0xaddr func + offset
 * - Signal info: SIGSEGV, SIGABRT etc.
 */

import type { LanguageStacktraceParser, ParsedStacktrace, StackFrame } from "../types.js";

const DETECT_GDB = /^#\d+\s+0x/m;
const DETECT_SIGNAL = /\b(SIGSEGV|SIGABRT|SIGBUS|SIGFPE|SIGILL)\b/;
const DETECT_ASAN = /AddressSanitizer/m;

// GDB: #0  0xaddr in funcName (args) at file:line
const GDB_FRAME = /^#(\d+)\s+(?:0x[\da-f]+\s+in\s+)?(\S+)\s*(?:\([^)]*\))?\s*(?:at\s+(.+):(\d+))?/gm;

// ASAN: #0 0xaddr in funcName file:line:col
const ASAN_FRAME = /^\s*#(\d+)\s+0x[\da-f]+\s+in\s+(\S+)\s+(.+?):(\d+)(?::(\d+))?/gm;

// macOS crash: 0   libname  0xaddr  funcName + offset
const MACOS_FRAME = /^\s*(\d+)\s+(\S+)\s+0x[\da-f]+\s+(.+?)\s*\+\s*\d+/gm;

export class NativeStacktraceParser implements LanguageStacktraceParser {
  language = "c/c++";

  detect(text: string): number {
    if (DETECT_ASAN.test(text)) return 0.95;
    if (DETECT_GDB.test(text)) return 0.9;
    if (DETECT_SIGNAL.test(text) && /:\d+/.test(text)) return 0.8;
    if (MACOS_FRAME.test(text)) return 0.7;
    return 0;
  }

  parse(text: string): ParsedStacktrace {
    // Detect signal
    const signalMatch = text.match(DETECT_SIGNAL);
    const asanMatch = text.match(/ERROR:\s*AddressSanitizer:\s*(\S+)/);
    const errorType = asanMatch ? "AddressSanitizer" : (signalMatch?.[1] ?? "crash");
    const errorMessage = asanMatch?.[1] ?? signalMatch?.[1] ?? "";

    let frames = this.parseGDB(text);
    if (frames.length === 0) frames = this.parseASAN(text);
    if (frames.length === 0) frames = this.parseMacOS(text);

    return {
      language: "c/c++",
      errorType,
      errorMessage,
      frames,
      rawText: text,
    };
  }

  private parseGDB(text: string): StackFrame[] {
    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(GDB_FRAME.source, "gm");

    while ((match = re.exec(text)) !== null) {
      frames.push({
        index: Number(match[1]),
        functionName: match[2]!,
        filePath: match[3],
        lineNumber: match[4] ? Number(match[4]) : undefined,
        isNative: !match[3],
        raw: match[0]!.trim(),
      });
    }
    return frames;
  }

  private parseASAN(text: string): StackFrame[] {
    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(ASAN_FRAME.source, "gm");

    while ((match = re.exec(text)) !== null) {
      frames.push({
        index: Number(match[1]),
        functionName: match[2]!,
        filePath: match[3],
        lineNumber: Number(match[4]),
        columnNumber: match[5] ? Number(match[5]) : undefined,
        isNative: false,
        raw: match[0]!.trim(),
      });
    }
    return frames;
  }

  private parseMacOS(text: string): StackFrame[] {
    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(MACOS_FRAME.source, "gm");

    while ((match = re.exec(text)) !== null) {
      frames.push({
        index: Number(match[1]),
        functionName: match[3]!,
        moduleName: match[2],
        isNative: true,
        raw: match[0]!.trim(),
      });
    }
    return frames;
  }
}
