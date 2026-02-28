---
module_name: i18n
description: "Language detection and localized section names for multi-language documentation"
status: active
language: typescript
---

# I18n

> Provides language detection from text, code comments, and file content, plus localized section names and placeholders for English, Russian, and Chinese documentation output.

## Overview

The i18n module enables AutoDoc to produce documentation in multiple languages. The language detector uses fast `charCodeAt`-based Unicode range classification (Cyrillic, CJK, Latin) to determine dominant language from text or code comments, with aggregation across multiple files. The section-names component provides a comprehensive translation table for all documentation section titles, document type names, and template placeholders in three languages (en, ru, zh).

## Data Flow

- **Inputs**: Raw text strings, code file content with extension, or arrays of detection results for aggregation.
- **Processing**: Character-by-character classification counts script types (Russian/Chinese/Latin), computes ratios against total, and applies thresholds (>30% for single text, >10% for AUTODOC.md analysis) to determine language.
- **Outputs**: `LanguageDetectionResult` with language code, confidence score, and character counts; localized strings from lookup tables.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `detectLanguageFromText` | function | Detects language from a text string using charCodeAt classification | [`language-detector.ts:88-145`](./language-detector.ts) |
| `detectLanguageFromComments` | function | Detects language from an array of code comments | [`language-detector.ts:150-154`](./language-detector.ts) |
| `detectLanguageFromCode` | function | Extracts comments from code and detects their language | [`language-detector.ts:160-194`](./language-detector.ts) |
| `aggregateLanguageDetection` | function | Aggregates detection results from multiple files | [`language-detector.ts:199-244`](./language-detector.ts) |
| `LanguageDetectionResult` | interface | Result with language, confidence, and charCounts | [`language-detector.ts:70-82`](./language-detector.ts) |
| `SECTION_NAMES` | const | Record of section name translations (en/ru/zh) | [`section-names.ts:17-144`](./section-names.ts) |
| `DOC_TYPE_NAMES` | const | Record of document type name translations (en/ru/zh) | [`section-names.ts:149-183`](./section-names.ts) |
| `TEMPLATE_PLACEHOLDERS` | const | Record of template placeholder translations (en/ru/zh) | [`section-names.ts:226-226`](./section-names.ts) |
| `getSectionName` | function | Gets localized section name by key and language | [`section-names.ts:188-190`](./section-names.ts) |
| `getDocTypeName` | function | Gets localized document type name | [`section-names.ts:195-197`](./section-names.ts) |
| `getAllSectionNames` | function | Gets all section names for a language (merged with en fallback) | [`section-names.ts:202-204`](./section-names.ts) |
| `findSectionKey` | function | Reverse lookup: finds section key from localized name | [`section-names.ts:209-221`](./section-names.ts) |
| `getPlaceholder` | function | Gets localized template placeholder text | [`section-names.ts:256-258`](./section-names.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `autodoc/types` | `DocLanguage` and `DocEntityType` type definitions |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | Pure TypeScript with no external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Supported languages | English (en), Russian (ru), Chinese (zh) |
| Detection threshold (single text) | >30% non-Latin character ratio |
| Detection method | charCodeAt Unicode range classification (~3x faster than regex) |

## Error Handling

Language detection returns `"en"` with zero confidence when input has no classifiable characters. Code comment extraction silently returns empty results for unrecognized file extensions. Section name lookups fall back to English when a key is missing in the requested language.

## Known Limitations

- Only three languages are supported; adding new languages requires extending both the detector Unicode ranges and all translation tables.
- Language detection is script-based, not NLP-based, so it cannot distinguish between languages sharing the same script (e.g., Ukrainian vs Russian Cyrillic).
- Python docstrings and comments are handled, but other language-specific comment syntaxes (e.g., Ruby `#`, Lua `--`) are not extracted.

## Exports



## Files

| File | Description |
|------|-------------|
| [`language-detector.ts`](./language-detector.ts) | Fast Unicode-based language detection from text, comments, and code files |
| [`section-names.ts`](./section-names.ts) | Localized section titles, document type names, and template placeholders for en/ru/zh |
| [`index.ts`](./index.ts) | Module barrel file re-exporting language-detector and section-names |
