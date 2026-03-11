/**
 * File Extensions Configuration
 *
 * Constants and utilities for determining supported file types
 * for code indexing and semantic merge.
 */

/**
 * Code files that support AST parsing.
 * These files are processed by ParserAgent for full entity extraction.
 */
export const SUPPORTED_CODE_EXTENSIONS = [
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs", // JavaScript/TypeScript
  ".py",
  ".pyi",
  ".pyw", // Python
  ".java", // Java
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".cc",
  ".hh",
  ".cxx",
  ".hxx",
  ".c++",
  ".h++", // C/C++
  ".go", // Go
  ".rs", // Rust
  ".swift", // Swift
  ".kt",
  ".kts", // Kotlin
  ".cs",
  ".csx", // C#
  ".sh",
  ".bash",
  ".zsh", // Bash/Shell
  ".ps1",
  ".psm1",
  ".psd1", // PowerShell
  ".css",
  ".scss",
  ".sass",
  ".less", // CSS
  ".html",
  ".htm", // HTML
  ".json", // JSON with AST parsing (swagger, package.json, tsconfig.json)
  ".proto", // Protocol Buffers with AST parsing
  ".graphql",
  ".gql", // GraphQL schemas with AST parsing
  ".sql", // SQL schema parsing (tables, views, procedures)
  ".linq", // LINQPad queries
  ".prisma", // Prisma schema
  ".zig",
  ".zon", // Zig
  ".tpl", // Helm templates
] as const;

/**
 * Non-AST files for semantic merge.
 * These files are indexed as File units with contentHash,
 * without AST parsing, for merge support of configs, docs and resources.
 */
export const SUPPORTED_DATA_EXTENSIONS = [
  ".yaml",
  ".yml", // Config files
  ".toml", // Cargo.toml, pyproject.toml
  ".xml", // Maven pom.xml, Android layouts
  ".csproj",
  ".sln",
  ".slnx",
  ".targets",
  ".props", // C#/.NET project files
  ".md",
  ".mdx", // Documentation
  ".txt", // Plain text
  ".svg", // Vector graphics (often in code)
  // ".sql" moved to SUPPORTED_CODE_EXTENSIONS for DB schema parsing
  ".env",
  ".env.example", // Environment configs
  ".gitignore",
  ".dockerignore", // Ignore files
  ".editorconfig", // Editor config
  ".prettierrc",
  ".eslintrc", // Linter configs (without .json)
] as const;

/** All supported extensions for indexing */
export const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_CODE_EXTENSIONS, ...SUPPORTED_DATA_EXTENSIONS] as const;

// =============================================================================
// LANGUAGE-GROUP SUBSETS (derived from SUPPORTED_CODE_EXTENSIONS)
// =============================================================================

/** TypeScript and JavaScript extensions */
export const TS_JS_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx", ".mts", ".cts", ".mjs", ".cjs"]);

/** Python extensions */
export const PYTHON_EXTENSIONS = new Set([".py", ".pyi", ".pyw"]);

/** C/C++ extensions */
export const CPP_EXTENSIONS = new Set([".cpp", ".c", ".h", ".hpp", ".cc", ".hh", ".cxx", ".hxx", ".c++", ".h++"]);

/** Java extensions */
export const JAVA_EXTENSIONS = new Set([".java"]);

/** Kotlin extensions */
export const KOTLIN_EXTENSIONS = new Set([".kt", ".kts"]);

/** C# extensions */
export const CSHARP_EXTENSIONS = new Set([".cs", ".csx"]);

/** Go extensions */
export const GO_EXTENSIONS = new Set([".go"]);

/** Rust extensions */
export const RUST_EXTENSIONS = new Set([".rs"]);

/** Swift extensions */
export const SWIFT_EXTENSIONS = new Set([".swift"]);

/** Zig extensions */
export const ZIG_EXTENSIONS = new Set([".zig", ".zon"]);

/** Bash/Shell extensions */
export const BASH_EXTENSIONS = new Set([".sh", ".bash", ".zsh"]);

/** PowerShell extensions */
export const POWERSHELL_EXTENSIONS = new Set([".ps1", ".psm1", ".psd1"]);

/** Set version of SUPPORTED_CODE_EXTENSIONS for O(1) lookup */
export const SUPPORTED_CODE_EXTENSIONS_SET = new Set<string>(SUPPORTED_CODE_EXTENSIONS);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Checks if extension is a code file (requires AST parsing) */
export function isCodeExtension(ext: string): boolean {
  return SUPPORTED_CODE_EXTENSIONS_SET.has(ext);
}

/** Checks if extension is a data file (no AST parsing) */
export function isDataExtension(ext: string): boolean {
  return SUPPORTED_DATA_EXTENSIONS.includes(ext as (typeof SUPPORTED_DATA_EXTENSIONS)[number]);
}
