---
module_name: global-cache
description: "Global embedding cache with pre-built language builtins and framework patterns"
status: active
language: typescript
---

# Global Cache

> Provides a global embedding cache containing pre-built entries for language built-in functions, standard library patterns, and framework-specific patterns across multiple programming languages.

## Overview

The global-cache module defines the data model and aggregation layer for pre-computed embedding cache entries. It re-exports the GlobalEmbeddingCache class from the parent semantic module and provides typed interfaces for cache entries (text, category, language, framework) and metadata (version, model, dimensions, entry counts). The data submodule contains the actual built-in definitions for all supported languages and frameworks.

## Data Flow

- **Inputs**: None at runtime; entries are statically defined in the data submodule.
- **Processing**: getAllGlobalEntries() aggregates all language builtins and framework patterns into a single GlobalCacheEntry array.
- **Outputs**: GlobalCacheEntry arrays consumed by GlobalEmbeddingCache for pre-seeding vector indexes.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `GlobalEmbeddingCache` | class | Re-exported cache manager from parent semantic module | [`index.ts:7-7`](./index.ts) |
| `GlobalCacheEntry` | interface | Cache entry with text, category, language, and optional framework | [`types.ts:5-10`](./types.ts) |
| `GlobalCacheMetadata` | interface | Cache metadata with version, model, dimension, and entry counts | [`types.ts:12-18`](./types.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `semantic/global-embedding-cache` | GlobalEmbeddingCache class implementation |
| `global-cache/data` | Built-in and framework pattern definitions |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Entry categories | builtin, stdlib, framework, pattern |
| Supported languages | JavaScript, TypeScript, Python, Java, Kotlin, Go, Rust |
| Supported frameworks | React, Angular, Vue, Express, NestJS |

## Error Handling

No runtime errors are possible; all data is statically defined. The module exports pure type definitions and constant arrays.

## Known Limitations

- Framework patterns are manually curated and may not cover all versions or APIs.
- No automatic updates when new language versions add built-in functions.

## Exports

- `GlobalEmbeddingCache`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports GlobalEmbeddingCache, data submodule, and types |
| `types.ts` | GlobalCacheEntry and GlobalCacheMetadata interfaces |
