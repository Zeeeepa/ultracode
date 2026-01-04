/**
 * Language Keywords and File Extensions
 *
 * File extensions mapped to languages and language-specific keywords.
 */

import type { SupportedLanguage } from "../../../types/parser.js";

/**
 * File extensions mapped to languages
 */
export const FILE_EXTENSIONS: Record<string, SupportedLanguage> = {
  // JavaScript
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",

  // TypeScript
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",

  // JSX/TSX
  jsx: "jsx",
  tsx: "tsx",

  // Python
  py: "python",
  pyi: "python",
  pyw: "python",

  // C
  c: "c",
  h: "c",

  // C++
  cpp: "cpp",
  cxx: "cpp",
  cc: "cpp",
  C: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  hh: "cpp",

  // Rust
  rs: "rust",

  // Go
  go: "go",
  mod: "go",

  // Java
  java: "java",

  // Kotlin
  kt: "kotlin",
  kts: "kotlin",

  // Swift
  swift: "swift",

  // CSS/SCSS/LESS
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",

  // HTML
  html: "html",
  htm: "html",

  // XML
  xml: "xml",

  // Bash/Shell scripts
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",

  // PowerShell
  ps1: "powershell",
  psm1: "powershell",

  // JSON
  json: "json",
  psd1: "powershell",

  // Batch/CMD
  bat: "batch",
  cmd: "batch",
};

/**
 * Language-specific keywords for entity detection
 */
export const LANGUAGE_KEYWORDS: Record<
  SupportedLanguage,
  {
    functions: string[];
    classes: string[];
    imports: string[];
    exports: string[];
    types: string[];
  }
> = {
  javascript: {
    functions: ["function", "async", "generator", "=>"],
    classes: ["class", "constructor", "extends"],
    imports: ["import", "require"],
    exports: ["export", "module.exports"],
    types: [],
  },

  typescript: {
    functions: ["function", "async", "generator", "=>"],
    classes: ["class", "constructor", "extends", "implements"],
    imports: ["import", "require"],
    exports: ["export", "module.exports"],
    types: ["interface", "type", "enum", "namespace"],
  },

  jsx: {
    functions: ["function", "async", "generator", "=>"],
    classes: ["class", "constructor", "extends", "Component"],
    imports: ["import", "require"],
    exports: ["export", "module.exports"],
    types: [],
  },

  tsx: {
    functions: ["function", "async", "generator", "=>"],
    classes: ["class", "constructor", "extends", "implements", "Component"],
    imports: ["import", "require"],
    exports: ["export", "module.exports"],
    types: ["interface", "type", "enum", "namespace"],
  },

  python: {
    functions: ["def", "async", "lambda", "yield", "yield_from", "await"],
    classes: ["class", "dataclass", "NamedTuple", "Enum", "Protocol", "ABC"],
    imports: ["import", "from", "as", "__import__"],
    exports: ["__all__", "__version__", "__author__"],
    types: [
      "typing",
      "Union",
      "Optional",
      "List",
      "Dict",
      "Tuple",
      "Generic",
      "TypeVar",
      "Callable",
      "Any",
      "ClassVar",
      "Final",
    ],
  },

  c: {
    functions: ["function", "static", "inline", "extern"],
    classes: ["struct", "union", "enum"],
    imports: ["include", "import"],
    exports: ["extern", "static"],
    types: ["typedef", "const", "volatile", "register", "auto"],
  },

  cpp: {
    functions: ["function", "static", "inline", "extern", "virtual", "override", "final", "constexpr", "consteval"],
    classes: ["class", "struct", "union", "enum", "namespace", "template"],
    imports: ["include", "import", "using"],
    exports: ["extern", "static", "export"],
    types: ["typedef", "using", "const", "volatile", "mutable", "constexpr", "consteval", "auto", "decltype"],
  },

  rust: {
    functions: ["fn", "async", "const"],
    classes: ["struct", "enum", "trait", "impl", "mod"],
    imports: ["use", "extern", "crate"],
    exports: ["pub"],
    types: ["type"],
  },

  go: {
    functions: ["func"],
    classes: ["type", "struct", "interface"],
    imports: ["import"],
    exports: [], // Go uses capitalization for exports
    types: ["type", "interface", "struct"],
  },

  java: {
    functions: ["void", "public", "private", "protected", "static", "final"],
    classes: ["class", "interface", "enum", "record", "@interface"],
    imports: ["import"],
    exports: ["public", "protected"],
    types: ["int", "long", "double", "float", "char", "boolean", "String", "void"],
  },

  kotlin: {
    functions: ["fun", "suspend", "inline", "operator", "infix"],
    classes: ["class", "interface", "object", "enum", "data", "sealed", "annotation"],
    imports: ["import"],
    exports: ["public", "internal", "protected"],
    types: ["Int", "Long", "Double", "Float", "String", "Boolean", "Any", "Unit"],
  },

  swift: {
    functions: ["func", "async", "throws", "rethrows", "mutating", "nonmutating"],
    classes: ["class", "struct", "enum", "protocol", "extension", "actor"],
    imports: ["import"],
    exports: ["public", "internal", "fileprivate", "private", "open"],
    types: ["Int", "Double", "Float", "String", "Bool", "Any", "Void"],
  },

  css: {
    functions: [],
    classes: [],
    imports: ["@import"],
    exports: [],
    types: [],
  },

  html: {
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    types: [],
  },

  xml: {
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    types: [],
  },

  bash: {
    functions: ["function", "declare"],
    classes: [],
    imports: ["source", ".", "import"],
    exports: ["export", "declare"],
    types: ["local", "declare"],
  },

  powershell: {
    functions: ["function", "filter", "workflow"],
    classes: ["class", "enum"],
    imports: ["Import-Module", "using", ".", "source"],
    exports: ["Export-ModuleMember", "Export"],
    types: ["[string]", "[int]", "[array]", "[hashtable]", "[PSCustomObject]", "[bool]", "[datetime]"],
  },

  batch: {
    functions: ["call", "goto", "label"],
    classes: [],
    imports: ["call"],
    exports: ["set", "setx"],
    types: [],
  },

  json: {
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    types: ["$ref", "allOf", "anyOf", "oneOf", "definitions", "components"],
  },
};
