---
module_name: javascript-family
description: "Parser configurations for JavaScript, TypeScript, JSX, and TSX"
status: active
language: typescript
---

# JavaScript Family

> Parser configuration objects for the JavaScript language family: standard JavaScript, TypeScript with full type system support, and JSX/TSX with element syntax.

## Overview

The javascript-family module provides `LanguageConfig` objects for JavaScript, TypeScript, JSX, and TSX. The JavaScript config defines standard function/class/import/export node types. TypeScript extends this with interfaces, type aliases, enums, and access modifiers. JSX and TSX extend their respective base configs with JSX element and expression node types. These are the most feature-complete configurations in the project.

## Data Flow

- **Inputs:** Imported by `registry.ts` during initialization.
- **Processing:** Static configuration data; no runtime processing.
- **Outputs:** `LanguageConfig` objects registered in `LANGUAGE_CONFIGS`.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `JAVASCRIPT_CONFIG` | const | Standard JavaScript parser configuration | [`javascript.ts:8-53`](./javascript.ts) |
| `TYPESCRIPT_CONFIG` | const | Full TypeScript config with interfaces and types | [`typescript.ts:8-65`](./typescript.ts) |
| `JSX_CONFIG` | const | JavaScript + JSX element support | [`jsx.ts:9-18`](./jsx.ts) |
| `TSX_CONFIG` | const | TypeScript + TSX element support | [`tsx.ts:9-18`](./tsx.ts) |

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
| Extensions (JS) | `.js`, `.mjs`, `.cjs` |
| Extensions (TS) | `.ts`, `.mts`, `.cts` |
| Extensions (JSX/TSX) | `.jsx`, `.tsx` |

## Error Handling

Static configuration data with no runtime error paths. Validation performed by the registry module.

## Known Limitations

- JSX/TSX configs extend base configs but do not support all React-specific patterns.
- No distinction between CommonJS and ES module syntax at the config level.

## Exports

- `JAVASCRIPT_CONFIG`
- `JSX_CONFIG`
- `TSX_CONFIG`
- `TYPESCRIPT_CONFIG`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all JavaScript family configurations |
| `javascript.ts` | Standard JavaScript node types and extractors |
| `typescript.ts` | Full TypeScript with interfaces, types, enums, and modifiers |
| `jsx.ts` | JavaScript extended with JSX element syntax |
| `tsx.ts` | TypeScript extended with TSX element syntax |
