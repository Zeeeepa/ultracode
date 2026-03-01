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
  ".hxx", // C/C++
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
  ".graphql",
  ".gql", // GraphQL schemas
  ".proto", // Protocol Buffers
  ".sql", // SQL scripts
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

/** Checks if extension is a code file (requires AST parsing) */
export function isCodeExtension(ext: string): boolean {
  return SUPPORTED_CODE_EXTENSIONS.includes(ext as (typeof SUPPORTED_CODE_EXTENSIONS)[number]);
}

/** Checks if extension is a data file (no AST parsing) */
export function isDataExtension(ext: string): boolean {
  return SUPPORTED_DATA_EXTENSIONS.includes(ext as (typeof SUPPORTED_DATA_EXTENSIONS)[number]);
}
