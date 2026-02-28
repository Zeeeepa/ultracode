---
module_name: i18n
description: "Internationalization system for the setup wizard with English and Russian translations"
status: active
language: typescript
---

# I18n (Setup)

> Internationalization module providing translated strings for the interactive setup wizard, with English and Russian language support, key-path lookup, and interpolation.

## Overview

The i18n module manages all user-facing text strings for the setup command. It stores translations in a structured `SetupStrings` interface covering banners, hardware descriptions, provider/model selection prompts, installation messages, and status indicators. The module provides three lookup functions: `t()` for plain strings, `ti()` for strings with parameter interpolation, and `ta()` for string arrays. It defaults to English and falls back to English for missing keys in other languages.

## Data Flow

- **Inputs:** Language code set via `setSetupLanguage()`, key paths like `"provider.title"`, interpolation parameters.
- **Processing:** Dot-separated key path traversal through the translations object, fallback to English if key is missing.
- **Outputs:** Localized strings ready for console output.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `setSetupLanguage` | function | Sets the current UI language | [`index.ts:24-26`](./index.ts) |
| `getSetupLanguage` | function | Returns the current UI language | [`index.ts:31-33`](./index.ts) |
| `t` | function | Gets a translated string by dot-separated key path | [`index.ts:42-74`](./index.ts) |
| `ti` | function | Gets a translated string with `{param}` interpolation | [`index.ts:83-91`](./index.ts) |
| `ta` | function | Gets a translated string array by key path | [`index.ts:100-128`](./index.ts) |
| `getStrings` | function | Returns the full `SetupStrings` object for current language | [`index.ts:133-135`](./index.ts) |
| `SetupStrings` | interface | Complete type definition for all setup UI strings | [`types.ts:17-397`](./types.ts) |
| `ProviderStrings` | interface | Provider name, pros, and cons strings | [`types.ts:8-12`](./types.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `i18n/types` | `UILanguage` type definition |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | Pure TypeScript with no external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default language | English (`en`) |
| Fallback behavior | Always falls back to English for missing keys |
| Supported languages | `en`, `ru` |

## Error Handling

If a key path is not found in any language, the key path string itself is returned (e.g., `"provider.unknown_key"`), which aids debugging. Array lookups return an empty array for missing keys.

## Known Limitations

- Only English and Russian are currently supported.
- No plural form handling; pluralization must be handled by the caller.
- String interpolation only supports simple `{key}` replacement, not nested expressions.

## Exports

- `setSetupLanguage`
- `getSetupLanguage`
- `t`
- `ti`
- `ta`
- `getStrings`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Translation lookup functions (`t`, `ti`, `ta`) and language management |
| `types.ts` | `SetupStrings` and `ProviderStrings` interface definitions |
| `en.ts` | English translation strings |
| `ru.ts` | Russian translation strings |
