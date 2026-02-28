---
module_name: i18n
description: System locale detection and UI language selection for the application
status: active
language: typescript
entry_point: index.ts
exports:
  - detectSystemLocale
  - getLanguageDisplayName
  - isValidLanguage
  - LocaleConfig
  - SUPPORTED_LANGUAGES
  - UILanguage
dependencies:
  internal: []
  external: []
tags:
  - i18n
  - locale
  - language-detection
  - ui
---

# i18n

*Last updated: 2026-02-21*

## Overview

Locale detection module that determines the user's UI language through a prioritized
cascade: CLI flag, environment variables (`LC_ALL`, `LC_MESSAGES`, `LANG`), the `Intl`
API (Windows), and a hardcoded English default. Currently supports two languages:
English (`en`) and Russian (`ru`). The module is consumed by the CLI setup wizard and
re-exported through `index.ts`.

## Data Flow

```
CLI --lang flag
       |  (highest priority)
       v
Environment vars (LC_ALL > LC_MESSAGES > LANG)
       |
       v
Intl.DateTimeFormat API (Windows native locale)
       |
       v
Default fallback ("en")
       |
       v
LocaleConfig { language, source, systemLocale? }
```

## Public API

| Name | Kind | Signature | Description | Location |
|------|------|-----------|-------------|----------|
| `detectSystemLocale` | function | `(cliOverride?: string) => LocaleConfig` | Detects UI language via priority cascade | [`locale-detector.ts:97-131`](./locale-detector.ts) |
| `getLanguageDisplayName` | function | `(lang: UILanguage) => string` | Returns human-readable language name | [`locale-detector.ts:136-142`](./locale-detector.ts) |
| `isValidLanguage` | function | `(lang: string) => lang is UILanguage` | Type-guard validating a string as UILanguage | [`types.ts:30-32`](./types.ts) |
| `LocaleConfig` | interface | `{ language, source, systemLocale? }` | Locale detection result with source metadata | [`types.ts:18-25`](./types.ts) |
| `SUPPORTED_LANGUAGES` | const | `UILanguage[]` — `["en", "ru"]` | Array of all supported language codes | [`types.ts:13-13`](./types.ts) |
| `UILanguage` | type | `"en" \| "ru"` | Union type of supported language codes | [`types.ts:8-8`](./types.ts) |

## Dependencies

| Kind | Name | Purpose |
|------|------|---------|
| Node.js built-in | `process.env` | Read `LC_ALL`, `LC_MESSAGES`, `LANG` |
| Node.js built-in | `Intl.DateTimeFormat` | Windows native locale detection |

No third-party dependencies.

## Configuration

| Parameter | Source | Default | Description |
|-----------|--------|---------|-------------|
| `--lang` | CLI flag | none | Override detected language (`en` or `ru`) |
| `LC_ALL` | env var | none | Highest-priority POSIX locale variable |
| `LC_MESSAGES` | env var | none | Message-specific locale variable |
| `LANG` | env var | none | Fallback POSIX locale variable |

## Behavioral Properties

- Detection is synchronous and side-effect-free.
- The cascade short-circuits on first valid match.
- Unrecognized locale strings (e.g. `fr_FR`) fall through to the next source.
- `parseLocaleString` recognises patterns like `ru_RU.UTF-8`, `ru-RU`, `Russian_Russia`.
- The `source` field in `LocaleConfig` records which cascade level produced the result.

## Error Handling

- `Intl.DateTimeFormat` failures are caught silently; detection continues to the next level.
- Invalid `cliOverride` values are ignored (not an error), falling through to env detection.
- The function always returns a valid `LocaleConfig`; it never throws.

## Observability

No logging, metrics, or telemetry. The `source` field on `LocaleConfig` is the only
diagnostic signal indicating how the language was resolved.

## Known Limitations

- Only two languages supported (`en`, `ru`). Adding a language requires updating the
  `UILanguage` union, `SUPPORTED_LANGUAGES`, `parseLocaleString`, and `getLanguageDisplayName`.
- `parseLocaleString` uses simple prefix/substring matching; locale strings for other
  languages that contain "ru" or "en" substrings could theoretically match incorrectly.
- No persistent caching; detection runs on every call.

## TypeScript Notes

- `isValidLanguage` is a type-guard (`lang is UILanguage`) enabling safe narrowing.
- `LocaleConfig.source` is a string-literal union, not an enum.
- All exports use ES module syntax with `.js` extensions for Node.js ESM compatibility.

## Exports



## Files

| File | Lines | Description |
|------|-------|-------------|
| [`index.ts`](./index.ts) | 6 | Barrel re-export of types and detection functions |
| [`locale-detector.ts`](./locale-detector.ts) | 142 | Locale cascade detection and display-name lookup |
| [`types.ts`](./types.ts) | 32 | `UILanguage`, `LocaleConfig`, `SUPPORTED_LANGUAGES`, `isValidLanguage` |
