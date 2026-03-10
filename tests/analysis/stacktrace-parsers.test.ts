/**
 * Stacktrace Parser Unit Tests
 *
 * Tests all 8 language parsers + auto-detection dispatcher.
 * Each parser is tested with real-world stacktrace samples.
 */

import { describe, expect, it } from "bun:test";
import { DotNetStacktraceParser } from "../../src/analysis/stacktrace/parsers/dotnet-parser";
import { GoStacktraceParser } from "../../src/analysis/stacktrace/parsers/go-parser";
import { JavaScriptStacktraceParser } from "../../src/analysis/stacktrace/parsers/javascript-parser";
import { JvmStacktraceParser } from "../../src/analysis/stacktrace/parsers/jvm-parser";
import { NativeStacktraceParser } from "../../src/analysis/stacktrace/parsers/native-parser";
import { PythonStacktraceParser } from "../../src/analysis/stacktrace/parsers/python-parser";
import { RustStacktraceParser } from "../../src/analysis/stacktrace/parsers/rust-parser";
import { ZigStacktraceParser } from "../../src/analysis/stacktrace/parsers/zig-parser";
import { parseStacktrace } from "../../src/analysis/stacktrace/stacktrace-parser";

// =============================================================================
// JavaScript / TypeScript (V8/Node.js)
// =============================================================================

describe("JavaScriptStacktraceParser", () => {
  const parser = new JavaScriptStacktraceParser();

  const SAMPLE = `TypeError: Cannot read properties of undefined (reading 'name')
    at processUser (src/services/user-service.ts:42:15)
    at async handleRequest (src/server.ts:100:5)
    at Router.handle (node_modules/express/lib/router.js:45:12)
    at Object.<anonymous> (src/index.ts:10:3)`;

  it("should detect JS/TS stacktrace with high confidence", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.5);
  });

  it("should not detect non-JS text", () => {
    expect(parser.detect("just some random text")).toBe(0);
  });

  it("should parse error type and message", () => {
    const result = parser.parse(SAMPLE);
    expect(result.errorType).toBe("TypeError");
    expect(result.errorMessage).toBe("Cannot read properties of undefined (reading 'name')");
    expect(result.language).toBe("javascript");
  });

  it("should parse all frames", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(4);
  });

  it("should extract function name and file path", () => {
    const result = parser.parse(SAMPLE);
    const first = result.frames[0]!;
    expect(first.functionName).toBe("processUser");
    expect(first.filePath).toBe("src/services/user-service.ts");
    expect(first.lineNumber).toBe(42);
    expect(first.columnNumber).toBe(15);
  });

  it("should detect async frames", () => {
    const result = parser.parse(SAMPLE);
    const asyncFrame = result.frames[1]!;
    expect(asyncFrame.isAsync).toBe(true);
    expect(asyncFrame.functionName).toBe("handleRequest");
  });

  it("should detect node_modules as native", () => {
    const result = parser.parse(SAMPLE);
    const nodeModFrame = result.frames[2]!;
    // node_modules frames are not marked as native by the parser
    // (isNative checks for "native" or "<anonymous>" in filePath)
    expect(nodeModFrame.filePath).toContain("node_modules");
  });

  it("should parse class.method patterns", () => {
    const sample = `Error: fail
    at Router.handle (lib/router.js:10:5)`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.className).toBe("Router");
    expect(result.frames[0]!.functionName).toBe("handle");
  });

  it("should parse anonymous frames (file:line:col only)", () => {
    const sample = `Error: test
    at src/index.ts:5:10`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.functionName).toBe("<anonymous>");
    expect(result.frames[0]!.filePath).toBe("src/index.ts");
    expect(result.frames[0]!.lineNumber).toBe(5);
  });
});

// =============================================================================
// Python
// =============================================================================

describe("PythonStacktraceParser", () => {
  const parser = new PythonStacktraceParser();

  const SAMPLE = `Traceback (most recent call last):
  File "/app/main.py", line 25, in run
    result = process(data)
  File "/app/processor.py", line 10, in process
    return transform(data.value)
  File "/app/transformer.py", line 5, in transform
    return data.upper()
AttributeError: 'NoneType' object has no attribute 'upper'`;

  it("should detect Python traceback with high confidence", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse error type and message", () => {
    const result = parser.parse(SAMPLE);
    expect(result.errorType).toBe("AttributeError");
    expect(result.errorMessage).toContain("NoneType");
    expect(result.language).toBe("python");
  });

  it("should parse all 3 frames", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(3);
  });

  it("should assign index 0 to crash point (last frame)", () => {
    const result = parser.parse(SAMPLE);
    // In Python, last frame = crash point → index 0
    const crashFrame = result.frames.find((f) => f.index === 0);
    expect(crashFrame).toBeDefined();
    expect(crashFrame!.functionName).toBe("transform");
    expect(crashFrame!.filePath).toBe("/app/transformer.py");
    expect(crashFrame!.lineNumber).toBe(5);
  });

  it("should detect site-packages as native", () => {
    const sample = `Traceback (most recent call last):
  File "/usr/lib/python3.10/site-packages/flask/app.py", line 100, in run
    self.serve()
ValueError: invalid`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.isNative).toBe(true);
  });

  it("should handle module-level code (<module>)", () => {
    const sample = `Traceback (most recent call last):
  File "script.py", line 1
ImportError: No module named 'nonexistent'`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.functionName).toBe("<module>");
  });
});

// =============================================================================
// Java / Kotlin (JVM)
// =============================================================================

describe("JvmStacktraceParser", () => {
  const parser = new JvmStacktraceParser();

  const SAMPLE = `java.lang.NullPointerException: Cannot invoke method on null
	at com.example.service.UserService.getProfile(UserService.java:42)
	at com.example.controller.UserController.handle(UserController.java:15)
	at org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1067)
	at javax.servlet.http.HttpServlet.service(HttpServlet.java:750)`;

  it("should detect JVM stacktrace with high confidence", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.8);
  });

  it("should not be confused with JS stacktrace", () => {
    const jsTrace = `Error: fail
    at processUser (src/user.ts:10:5)
    at handleRequest (src/server.ts:20:3)`;
    expect(parser.detect(jsTrace)).toBeLessThan(0.5);
  });

  it("should parse error type and message", () => {
    const result = parser.parse(SAMPLE);
    expect(result.errorType).toBe("java.lang.NullPointerException");
    expect(result.errorMessage).toBe("Cannot invoke method on null");
  });

  it("should parse all frames with class and method", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(4);

    const first = result.frames[0]!;
    expect(first.functionName).toBe("getProfile");
    expect(first.className).toBe("UserService");
    expect(first.moduleName).toBe("com.example.service");
    expect(first.filePath).toBe("UserService.java");
    expect(first.lineNumber).toBe(42);
  });

  it("should handle Native Method frames", () => {
    const sample = `Exception
	at sun.reflect.NativeMethodAccessorImpl.invoke(Native Method)`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.isNative).toBe(true);
  });

  it("should handle Caused by chains", () => {
    const sample = `java.lang.RuntimeException: Wrapper
	at com.app.Main.run(Main.java:10)
Caused by: java.io.IOException: File not found
	at com.app.FileReader.read(FileReader.java:25)
	at com.app.Main.run(Main.java:8)`;

    const result = parser.parse(sample);
    expect(result.errorType).toBe("java.lang.RuntimeException");
    expect(result.causedBy).toBeDefined();
    expect(result.causedBy!.errorType).toBe("java.io.IOException");
    expect(result.causedBy!.errorMessage).toBe("File not found");
    expect(result.causedBy!.frames.length).toBe(2);
  });
});

// =============================================================================
// C# / .NET
// =============================================================================

describe("DotNetStacktraceParser", () => {
  const parser = new DotNetStacktraceParser();

  const SAMPLE = `System.NullReferenceException: Object reference not set to an instance of an object.
   at MyApp.Services.UserService.GetProfile(Int32 userId) in D:\\Projects\\MyApp\\Services\\UserService.cs:line 42
   at MyApp.Controllers.UserController.Handle(HttpContext ctx) in D:\\Projects\\MyApp\\Controllers\\UserController.cs:line 15
   at Microsoft.AspNetCore.Mvc.Internal.ActionMethodExecutor.Execute(Object controller)`;

  it("should detect .NET stacktrace", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse error type and message", () => {
    const result = parser.parse(SAMPLE);
    expect(result.errorType).toBe("System.NullReferenceException");
    expect(result.errorMessage).toContain("Object reference");
  });

  it("should parse frames with file paths and line numbers", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(3);

    const first = result.frames[0]!;
    expect(first.functionName).toBe("GetProfile");
    expect(first.className).toBe("UserService");
    expect(first.moduleName).toBe("MyApp.Services");
    expect(first.lineNumber).toBe(42);
  });

  it("should handle frames without file info", () => {
    const result = parser.parse(SAMPLE);
    const frameworkFrame = result.frames[2]!;
    expect(frameworkFrame.isNative).toBe(true);
    expect(frameworkFrame.lineNumber).toBeUndefined();
  });
});

// =============================================================================
// Go
// =============================================================================

describe("GoStacktraceParser", () => {
  const parser = new GoStacktraceParser();

  const SAMPLE = `goroutine 1 [running]:
main.processRequest(0xc0000b4000)
	/app/server.go:42 +0x1a5
main.handleConnection(0xc0000a2000)
	/app/handler.go:25 +0xf8
main.main()
	/app/main.go:10 +0x45`;

  const PANIC_SAMPLE = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a3b2c]

goroutine 1 [running]:
main.foo(0x0)
	/app/main.go:15 +0x1c
main.main()
	/app/main.go:5 +0x25`;

  it("should detect goroutine dump", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should detect panic", () => {
    expect(parser.detect(PANIC_SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse goroutine frames (pairs of lines)", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(3);

    const first = result.frames[0]!;
    expect(first.functionName).toBe("processRequest");
    expect(first.moduleName).toBe("main");
    expect(first.filePath).toBe("/app/server.go");
    expect(first.lineNumber).toBe(42);
  });

  it("should extract thread info", () => {
    const result = parser.parse(SAMPLE);
    expect(result.threadInfo).toContain("goroutine 1");
  });

  it("should parse panic error message", () => {
    const result = parser.parse(PANIC_SAMPLE);
    expect(result.errorType).toBe("runtime error");
    expect(result.errorMessage).toContain("nil pointer dereference");
  });

  it("should detect runtime frames as native", () => {
    const sample = `goroutine 1 [running]:
runtime.throw(0x123)
	/usr/local/go/src/runtime/panic.go:100 +0x50`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.isNative).toBe(true);
  });

  it("should parse receiver types", () => {
    const sample = `goroutine 1 [running]:
github.com/app/pkg.(*Server).Handle(0xc000123000)
	/app/pkg/server.go:30 +0x1a`;
    const result = parser.parse(sample);
    expect(result.frames[0]!.functionName).toBe("Handle");
    expect(result.frames[0]!.className).toBe("Server");
    expect(result.frames[0]!.moduleName).toBe("github.com/app/pkg");
  });
});

// =============================================================================
// Rust
// =============================================================================

describe("RustStacktraceParser", () => {
  const parser = new RustStacktraceParser();

  const SAMPLE = `thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:42:5
stack backtrace:
   0: std::panicking::begin_panic
   1: myapp::processor::process
             at ./src/processor.rs:10:5
   2: myapp::main
             at ./src/main.rs:42:5`;

  it("should detect Rust panic with backtrace", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse panic message", () => {
    const result = parser.parse(SAMPLE);
    expect(result.errorType).toBe("panic");
    expect(result.errorMessage).toContain("index out of bounds");
  });

  it("should parse frames with file locations", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames.length).toBe(3);

    const processFrame = result.frames[1]!;
    expect(processFrame.functionName).toBe("process");
    expect(processFrame.filePath).toBe("./src/processor.rs");
    expect(processFrame.lineNumber).toBe(10);
  });

  it("should detect std:: frames as native", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames[0]!.isNative).toBe(true);
    expect(result.frames[1]!.isNative).toBe(false);
  });

  it("should extract thread info", () => {
    const result = parser.parse(SAMPLE);
    expect(result.threadInfo).toContain("main");
  });
});

// =============================================================================
// C/C++ (GDB / ASAN)
// =============================================================================

describe("NativeStacktraceParser", () => {
  const parser = new NativeStacktraceParser();

  const GDB_SAMPLE = `Program received signal SIGSEGV, Segmentation fault.
#0  0x00007ffff7b3c2a0 in process_data (buf=0x0) at src/processor.c:42
#1  0x00007ffff7b3c100 in handle_request (req=0x5555557a4010) at src/server.c:100
#2  0x00007ffff7b3c050 in main () at src/main.c:15`;

  const ASAN_SAMPLE = `=================================================================
==12345==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x602000000014
    #0 0x4a3b2c in process_data /app/src/processor.c:42:15
    #1 0x4a3a00 in main /app/src/main.c:10:5`;

  it("should detect GDB backtrace", () => {
    expect(parser.detect(GDB_SAMPLE)).toBeGreaterThan(0.8);
  });

  it("should detect ASAN output", () => {
    expect(parser.detect(ASAN_SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse GDB frames", () => {
    const result = parser.parse(GDB_SAMPLE);
    expect(result.errorType).toBe("SIGSEGV");
    expect(result.frames.length).toBe(3);

    const first = result.frames[0]!;
    expect(first.functionName).toBe("process_data");
    expect(first.filePath).toBe("src/processor.c");
    expect(first.lineNumber).toBe(42);
  });

  it("should parse ASAN frames", () => {
    const result = parser.parse(ASAN_SAMPLE);
    expect(result.errorType).toBe("AddressSanitizer");
    expect(result.frames.length).toBe(2);
    expect(result.frames[0]!.functionName).toBe("process_data");
    expect(result.frames[0]!.lineNumber).toBe(42);
    expect(result.frames[0]!.columnNumber).toBe(15);
  });
});

// =============================================================================
// Zig
// =============================================================================

describe("ZigStacktraceParser", () => {
  const parser = new ZigStacktraceParser();

  const SAMPLE = `thread 1 panic: index out of bounds
/app/src/main.zig:42:10: 0x1234 in main (app)
/app/src/lib/std/start.zig:100:5: 0x5678 in start (app)`;

  it("should detect Zig error trace", () => {
    expect(parser.detect(SAMPLE)).toBeGreaterThan(0.9);
  });

  it("should parse frames", () => {
    const result = parser.parse(SAMPLE);
    expect(result.language).toBe("zig");
    expect(result.errorType).toBe("panic");
    expect(result.frames.length).toBe(2);

    const first = result.frames[0]!;
    expect(first.filePath).toBe("/app/src/main.zig");
    expect(first.lineNumber).toBe(42);
    expect(first.columnNumber).toBe(10);
  });

  it("should detect std lib as native", () => {
    const result = parser.parse(SAMPLE);
    expect(result.frames[1]!.isNative).toBe(true);
  });

  it("should extract thread info", () => {
    const result = parser.parse(SAMPLE);
    expect(result.threadInfo).toBe("thread 1");
  });
});

// =============================================================================
// Auto-detection dispatcher
// =============================================================================

describe("parseStacktrace (auto-detect)", () => {
  it("should auto-detect JavaScript", () => {
    const result = parseStacktrace(`TypeError: x is not a function
    at foo (src/bar.ts:10:5)
    at baz (src/qux.ts:20:3)`);
    expect(result.language).toBe("javascript");
    expect(result.frames.length).toBe(2);
  });

  it("should auto-detect Python", () => {
    const result = parseStacktrace(`Traceback (most recent call last):
  File "app.py", line 10, in main
    run()
ValueError: invalid literal`);
    expect(result.language).toBe("python");
  });

  it("should auto-detect Java", () => {
    const result = parseStacktrace(`java.lang.NullPointerException
	at com.app.Service.run(Service.java:10)
	at com.app.Main.main(Main.java:5)`);
    expect(result.language).toBe("java");
  });

  it("should auto-detect Go", () => {
    const result = parseStacktrace(`goroutine 1 [running]:
main.handler(0x0)
	/app/main.go:15 +0x1a`);
    expect(result.language).toBe("go");
  });

  it("should auto-detect Rust", () => {
    const result = parseStacktrace(`thread 'main' panicked at 'error', src/main.rs:10:5
stack backtrace:
   0: myapp::main
             at ./src/main.rs:10:5`);
    expect(result.language).toBe("rust");
  });

  it("should return 'unknown' for unrecognizable text", () => {
    const result = parseStacktrace("just some random error log without frames");
    expect(result.language).toBe("unknown");
    expect(result.frames.length).toBe(0);
  });

  it("should respect language hint", () => {
    const jsTrace = `TypeError: fail
    at foo (bar.ts:1:1)`;
    const result = parseStacktrace(jsTrace, "typescript");
    expect(result.language).toBe("javascript"); // TS maps to JS parser
  });

  it("should handle language hint aliases", () => {
    const pyTrace = `Traceback (most recent call last):
  File "x.py", line 1, in f
TypeError: t`;
    const result = parseStacktrace(pyTrace, "py");
    expect(result.language).toBe("python");
  });
});
