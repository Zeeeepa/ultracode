# i18n

## Overview

The i18n module provides system locale detection and UI language selection for the application through a prioritized cascade mechanism. It detects the user's preferred language by checking, in order: CLI flags, environment variables (`LC_ALL`, `LC_MESSAGES`, `LANG`), the system's native locale via the `Intl` API, and finally defaults to English. The module currently supports English and Russian, exposing a clean detection function and type-safe language validation utilities consumed by the CLI setup wizard.

## Flow

```
Application startup
       │
       ├─→ CLI --lang argument? ──→ Validate → Found ──┐
       │                             │                   │
       │                             No                  │
       │                             │                   │
       ├─→ Environment: LC_ALL? ────→ Parse → Found ───┐│
       │                             │                 ││
       │                             No                ││
       │                             │                 ││
       ├─→ Environment: LC_MESSAGES? ──→ Parse → Found ┤│
       │                             │                 ││
       │                             No                ││
       │                             │                 ││
       ├─→ Environment: LANG? ──────→ Parse → Found ───┤│
       │                             │                 ││
       │                             No                ││
       │                             │                 ││
       ├─→ Intl.DateTimeFormat (Windows) ──→ Extract ──┤│
       │                             │                 ││
       │                             No/Error          ││
       │                             │                 ││
       ├─→ Default fallback: "en" ──────────────────┐  ││
       │                                            │  ││
       └────────────────────────────────────────────┴──┘│
                                                        │
                                                        v
                                              LocaleConfig
                                         { language, source }
```

## Entity Listing

### Public API

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `detectSystemLocale` | function | Detects the UI language through a priority cascade of CLI flag, environment variables, system locale, and English fallback. | `locale-detector.ts:97-131` |
| `getLanguageDisplayName` | function | Returns the human-readable display name for a supported language code. | `locale-detector.ts:136-142` |
| `isValidLanguage` | function | Type-guard function that validates whether a string is a supported `UILanguage` code. | `types.ts:30-32` |

### Types & Constants

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `UILanguage` | type | Union type representing all supported language codes: English or Russian. | `types.ts:8-8` |
| `LocaleConfig` | interface | Result object containing the detected language, the detection source (which cascade level matched), and optionally the raw system locale string. | `types.ts:18-25` |
| `SUPPORTED_LANGUAGES` | const | Array containing all valid `UILanguage` values for runtime validation and enumeration. | `types.ts:13-13` |

## Dependencies

### External

| Dependency | Type | Purpose |
|------------|------|---------|
| `process.env` | Node.js built-in | Reads POSIX locale environment variables (`LC_ALL`, `LC_MESSAGES`, `LANG`). |
| `Intl.DateTimeFormat` | Web API (Node.js 18+) | Queries the system's native locale on Windows and other platforms. |

## Module Structure

| File | Purpose |
|------|---------|
| `index.ts` | Barrel re-export of public API functions and types. |
| `locale-detector.ts` | Core detection logic implementing the locale cascade, locale string parsing, and language display name lookup. |
| `types.ts` | Type definitions for `UILanguage`, `LocaleConfig`, and the `SUPPORTED_LANGUAGES` constant. |