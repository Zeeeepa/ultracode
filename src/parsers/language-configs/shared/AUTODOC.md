---
module_name: shared
description: "Shared types, keywords, file extension mappings, and utilities for language configuration"
status: active
language: typescript
---

# Shared

> Shared foundations for all language configurations: type interfaces (`LanguageConfig`, `NodeTypeConfig`, `ExtractorConfig`), file extension-to-language mappings, language keyword dictionaries, and utility functions for language detection.

## Overview

The shared module provides the core type definitions and utilities used by all language configuration sub-modules. `LanguageConfig` defines the shape of every language config (extensions, keywords, node types, extractors). `FILE_EXTENSIONS` maps file extensions to `SupportedLanguage` values. `LANGUAGE_KEYWORDS` provides keyword dictionaries per language. Utility functions handle language detection from file paths, supported file checks, and listing all supported extensions.

## Data Flow

- **Inputs:** File paths for language detection, language names for keyword lookup.
- **Processing:** Extension extraction and mapping, keyword dictionary lookup.
- **Outputs:** `SupportedLanguage` values, boolean support checks, extension lists.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `LanguageConfig` | interface | Language configuration with extensions, keywords, nodeTypes, extractors | [`types.ts:13-19`](./types.ts) |
| `NodeTypeConfig` | interface | Tree-sitter node types for code constructs | [`types.ts:24-33`](./types.ts) |
| `ExtractorConfig` | interface | Name, modifier, and parameter extraction rules | [`types.ts:38-44`](./types.ts) |
| `FILE_EXTENSIONS` | const | Mapping of file extensions to supported languages | [`keywords.ts:12-100`](./keywords.ts) |
| `LANGUAGE_KEYWORDS` | const | Keyword dictionaries for each language | [`keywords.ts:105-113`](./keywords.ts) |
| `detectLanguageFromPath` | function | Detects language from a file path's extension | [`utils.ts:13-30`](./utils.ts) |
| `isFileSupported` | function | Checks if a file extension is supported | [`utils.ts:35-38`](./utils.ts) |
| `getSupportedExtensions` | function | Returns all supported file extensions | [`utils.ts:43-45`](./utils.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `types/parser` | `SupportedLanguage` union type |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | Pure TypeScript types and data |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Total mapped extensions | 40+ file extensions across all languages |
| Default language fallback | `javascript` for unrecognized extensions |
| Special cases | `.h` defaults to C; capital `.C` maps to C++ |

## Error Handling

`detectLanguageFromPath` falls back to `javascript` for unknown extensions rather than throwing. `isFileSupported` returns `false` for unsupported files.

## Known Limitations

- Extension-only detection cannot distinguish ambiguous files (e.g., `.h` could be C or C++).
- Keyword dictionaries are used for pattern matching, not for full lexical analysis.

## Exports

- `FILE_EXTENSIONS`
- `LANGUAGE_KEYWORDS`
- `detectLanguageFromPath`
- `getSupportedExtensions`
- `isFileSupported`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all public types, constants, and utilities |
| `types.ts` | `LanguageConfig`, `NodeTypeConfig`, `ExtractorConfig` interfaces |
| `keywords.ts` | File extension mappings and language keyword dictionaries |
| `utils.ts` | Language detection from path, support checking, extension listing |
