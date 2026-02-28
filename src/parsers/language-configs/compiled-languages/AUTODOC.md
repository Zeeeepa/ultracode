---
module_name: compiled-languages
description: "Parser configurations for compiled languages: C, C++, C#, Go, Java, Kotlin, Rust, Swift, Zig"
status: active
language: typescript
---

# Compiled Languages

> Parser configuration objects defining AST node types, file extensions, keywords, and extraction rules for nine compiled programming languages.

## Overview

The compiled-languages module provides `LanguageConfig` objects for C, C++, C#, Go, Java, Kotlin, Rust, Swift, and Zig. Each config defines the file extensions, language-specific keywords, Tree-sitter node types for functions/classes/methods/imports/exports/variables/types/interfaces, and extraction rules for name resolution, modifier detection, and parameter/return type handling. These configs are consumed by the central language registry.

## Data Flow

- **Inputs:** Imported by `registry.ts` during initialization.
- **Processing:** Static configuration data; no runtime processing.
- **Outputs:** `LanguageConfig` objects registered in `LANGUAGE_CONFIGS`.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `C_CONFIG` | const | C language parser configuration | [`c.ts:8-67`](./c.ts) |
| `CPP_CONFIG` | const | C++ configuration with templates and methods | [`cpp.ts:8-82`](./cpp.ts) |
| `CSHARP_CONFIG` | const | C# configuration with access modifiers | [`csharp.ts:8-85`](./csharp.ts) |
| `GO_CONFIG` | const | Go configuration with interfaces and types | [`go.ts:8-60`](./go.ts) |
| `JAVA_CONFIG` | const | Java configuration with access modifiers | [`java.ts:8-79`](./java.ts) |
| `KOTLIN_CONFIG` | const | Kotlin configuration with core elements | [`kotlin.ts:8-29`](./kotlin.ts) |
| `RUST_CONFIG` | const | Rust configuration with traits and visibility | [`rust.ts:8-105`](./rust.ts) |
| `SWIFT_CONFIG` | const | Swift configuration with protocols | [`swift.ts:8-29`](./swift.ts) |
| `ZIG_CONFIG` | const | Zig language parser configuration | [`zig.ts:8-29`](./zig.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `shared/types` | `LanguageConfig`, `NodeTypeConfig`, `ExtractorConfig` interfaces |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | Pure configuration data |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Languages covered | C, C++, C#, Go, Java, Kotlin, Rust, Swift, Zig |
| Config completeness | Full node type mappings and extractor rules per language |

## Error Handling

Configs are static data and do not produce runtime errors. Validation is performed by `validateConfigurations()` in the registry.

## Known Limitations

- Zig support is minimal compared to more established languages.
- Kotlin config uses simplified extraction logic.

## Exports

- `C_CONFIG`
- `CPP_CONFIG`
- `CSHARP_CONFIG`
- `GO_CONFIG`
- `JAVA_CONFIG`
- `KOTLIN_CONFIG`
- `RUST_CONFIG`
- `SWIFT_CONFIG`
- `ZIG_CONFIG`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all compiled language configurations |
| `c.ts` | C language parser configuration |
| `cpp.ts` | C++ with template and class support |
| `csharp.ts` | C# with access modifiers and properties |
| `go.ts` | Go with interfaces and goroutine types |
| `java.ts` | Java with annotations and access modifiers |
| `kotlin.ts` | Kotlin with simplified extraction |
| `rust.ts` | Rust with traits, visibility, and lifetimes |
| `swift.ts` | Swift with protocols and modifiers |
| `zig.ts` | Zig language configuration |
