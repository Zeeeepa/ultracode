/**
 * TASK-003B: Enhanced Language Configuration Module
 *
 * This file re-exports the refactored language configurations from the language-configs/ module.
 * The implementation has been split into multiple files for better maintainability:
 *
 * - language-configs/shared/types.ts - Type definitions
 * - language-configs/shared/keywords.ts - FILE_EXTENSIONS, LANGUAGE_KEYWORDS
 * - language-configs/shared/utils.ts - Utility functions
 * - language-configs/javascript-family/ - JS, TS, JSX, TSX configs
 * - language-configs/compiled-languages/ - C, C++, Rust, Go, Java, Kotlin, Swift
 * - language-configs/scripting-languages/ - Python, Bash, PowerShell, Batch
 * - language-configs/markup-languages/ - CSS, HTML, XML, JSON
 * - language-configs/registry.ts - Config registry and lookup functions
 * - language-configs/python-helpers.ts - Python-specific node detection
 *
 * @task_id TASK-003B
 */

// Re-export everything from the refactored module
export * from "./language-configs/index.js";
