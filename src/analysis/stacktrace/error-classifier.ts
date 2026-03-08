/**
 * Error Classifier
 *
 * Classifies stack trace errors into categories based on error type
 * and message patterns. Each category has associated severity and
 * hints about missing checks that could have prevented the error.
 */

import type { ErrorCategory, ErrorClassification, ParsedStacktrace, Severity } from "./types.js";

interface ClassificationRule {
  category: ErrorCategory;
  severity: Severity;
  description: string;
  /** Patterns matched against errorType */
  typePatterns: RegExp[];
  /** Patterns matched against errorMessage (any match = hit) */
  messagePatterns: RegExp[];
  missingCheckHints: string[];
}

const RULES: ClassificationRule[] = [
  {
    category: "null_reference",
    severity: "high",
    description: "Null/undefined reference access",
    typePatterns: [/NullPointerException/i, /NilError/i, /NullReferenceException/i],
    messagePatterns: [
      /Cannot read propert/i,
      /undefined is not/i,
      /null is not/i,
      /is not a function/i,
      /unwrap\(\) on None/i,
      /called.*on a null/i,
      /invalid memory address or nil pointer dereference/i,
    ],
    missingCheckHints: [
      "Add null/undefined check before accessing property",
      "Use optional chaining (?.) or nullish coalescing (??)",
      "Validate function arguments at entry point",
    ],
  },
  {
    category: "type_error",
    severity: "medium",
    description: "Type mismatch or invalid cast",
    typePatterns: [/TypeError/i, /ClassCastException/i, /InvalidCastException/i],
    messagePatterns: [
      /is not a function/i,
      /cannot be cast to/i,
      /expected.*got/i,
      /type assertion failed/i,
      /interface conversion/i,
    ],
    missingCheckHints: [
      "Add type guard or instanceof check",
      "Validate input types at function boundary",
      "Use type assertions with proper error handling",
    ],
  },
  {
    category: "index_out_of_bounds",
    severity: "high",
    description: "Array/collection index out of range",
    typePatterns: [/IndexError/i, /ArrayIndexOutOfBoundsException/i, /IndexOutOfRangeException/i, /RangeError/i],
    messagePatterns: [
      /index out of (?:range|bounds)/i,
      /slice bounds out of range/i,
      /list index out of range/i,
      /Maximum call stack/i,
      /invalid array length/i,
    ],
    missingCheckHints: [
      "Add bounds check before array access",
      "Validate collection size before indexing",
      "Use safe access methods (e.g., .at(), .get())",
    ],
  },
  {
    category: "io_error",
    severity: "medium",
    description: "File system or I/O error",
    typePatterns: [/IOException/i, /FileNotFoundError/i, /OSError/i],
    messagePatterns: [
      /ENOENT/i,
      /no such file/i,
      /permission denied/i,
      /EACCES/i,
      /file.*not found/i,
      /cannot open/i,
      /EISDIR/i,
      /ENOTDIR/i,
    ],
    missingCheckHints: [
      "Check file existence before access (fs.existsSync, os.path.exists)",
      "Handle FileNotFoundError/ENOENT gracefully",
      "Validate file paths and permissions",
    ],
  },
  {
    category: "network_error",
    severity: "medium",
    description: "Network connectivity or protocol error",
    typePatterns: [/ConnectionError/i, /SocketException/i, /HttpException/i],
    messagePatterns: [
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /fetch failed/i,
      /network.*error/i,
      /connection refused/i,
      /DNS.*fail/i,
      /EHOSTUNREACH/i,
    ],
    missingCheckHints: [
      "Add retry logic with exponential backoff",
      "Handle connection errors with proper fallback",
      "Set appropriate timeouts for network requests",
    ],
  },
  {
    category: "permission_error",
    severity: "high",
    description: "Access denied or authorization failure",
    typePatterns: [/PermissionError/i, /UnauthorizedAccessException/i, /SecurityException/i],
    messagePatterns: [/permission denied/i, /access denied/i, /not authorized/i, /forbidden/i, /EPERM/i],
    missingCheckHints: [
      "Check permissions before operation",
      "Add proper authorization guards",
      "Handle access denied with user-friendly error",
    ],
  },
  {
    category: "assertion_error",
    severity: "medium",
    description: "Failed assertion or invariant violation",
    typePatterns: [/AssertionError/i, /AssertError/i],
    messagePatterns: [/assertion failed/i, /assert\(/i, /expected.*to (?:be|equal|match)/i, /invariant/i],
    missingCheckHints: ["Fix the invariant violation in the calling code", "Add defensive checks before the assertion"],
  },
  {
    category: "memory_error",
    severity: "critical",
    description: "Out of memory, stack overflow, or segfault",
    typePatterns: [/OutOfMemoryError/i, /StackOverflowError/i],
    messagePatterns: [
      /out of memory/i,
      /heap.*exceeded/i,
      /SIGSEGV/i,
      /SIGBUS/i,
      /stack overflow/i,
      /allocation failed/i,
      /buffer overflow/i,
    ],
    missingCheckHints: [
      "Check for infinite recursion",
      "Add memory limits and streaming for large data",
      "Validate buffer sizes before allocation",
    ],
  },
  {
    category: "concurrency_error",
    severity: "critical",
    description: "Deadlock, race condition, or concurrent modification",
    typePatterns: [/ConcurrentModificationException/i, /DeadlockException/i],
    messagePatterns: [/deadlock/i, /data race/i, /concurrent modification/i, /mutex/i, /lock/i, /thread.*safe/i],
    missingCheckHints: [
      "Add proper synchronization (mutex, lock, synchronized)",
      "Use concurrent-safe data structures",
      "Avoid modifying shared state without locks",
    ],
  },
  {
    category: "import_error",
    severity: "medium",
    description: "Module or dependency not found",
    typePatterns: [/ImportError/i, /ModuleNotFoundError/i],
    messagePatterns: [
      /cannot find module/i,
      /no module named/i,
      /could not resolve/i,
      /ClassNotFoundException/i,
      /module not found/i,
    ],
    missingCheckHints: [
      "Check that the dependency is installed",
      "Verify import path is correct",
      "Add the missing package to dependencies",
    ],
  },
  {
    category: "syntax_error",
    severity: "low",
    description: "Syntax or parsing error",
    typePatterns: [/SyntaxError/i, /ParseError/i, /JsonSyntaxException/i],
    messagePatterns: [/unexpected token/i, /unexpected end/i, /invalid syntax/i, /unterminated/i, /malformed/i],
    missingCheckHints: [
      "Validate input before parsing",
      "Add try-catch around JSON.parse / eval",
      "Use a schema validator for structured input",
    ],
  },
  {
    category: "timeout_error",
    severity: "medium",
    description: "Operation timeout",
    typePatterns: [/TimeoutError/i, /TimeoutException/i],
    messagePatterns: [/timed?\s*out/i, /deadline exceeded/i, /ETIMEDOUT/i, /operation.*timeout/i],
    missingCheckHints: [
      "Set appropriate timeout values",
      "Add cancellation support",
      "Implement circuit breaker pattern for external calls",
    ],
  },
];

/**
 * Classify an error from a parsed stacktrace into a category with severity.
 */
export function classifyError(parsed: ParsedStacktrace): ErrorClassification {
  const { errorType, errorMessage } = parsed;
  const combined = `${errorType} ${errorMessage}`;

  for (const rule of RULES) {
    // Check type patterns
    const typeMatch = rule.typePatterns.some((p) => p.test(errorType));
    // Check message patterns
    const msgMatch = rule.messagePatterns.some((p) => p.test(combined));

    if (typeMatch || msgMatch) {
      return {
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        missingCheckHints: rule.missingCheckHints,
      };
    }
  }

  // Fallback: check for generic "Error" suffix → custom_error
  if (/Error|Exception/i.test(errorType)) {
    return {
      category: "custom_error",
      severity: "medium",
      description: `Custom error: ${errorType}`,
      missingCheckHints: ["Add specific error handling for this error type"],
    };
  }

  return {
    category: "unknown",
    severity: "medium",
    description: "Unrecognized error type",
    missingCheckHints: [],
  };
}
