---
module_name: markup-languages
description: "Parser configurations for markup and data languages: CSS, HTML, JSON, XML"
status: active
language: typescript
---

# Markup Languages

> Parser configuration objects for markup and structured data languages: CSS (with preprocessor support), HTML, JSON (with OpenAPI/npm), and XML.

## Overview

The markup-languages module provides `LanguageConfig` objects for CSS, HTML, JSON, and XML. The CSS config covers SCSS, Sass, and Less preprocessors in addition to standard CSS. The JSON config handles package.json, OpenAPI schemas, and general JSON files. HTML and XML configs define element and attribute node types for structural analysis. These configs enable the parser to index non-code files that are important for project understanding.

## Data Flow

- **Inputs:** Imported by `registry.ts` during initialization.
- **Processing:** Static configuration data; no runtime processing.
- **Outputs:** `LanguageConfig` objects registered in `LANGUAGE_CONFIGS`.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CSS_CONFIG` | const | CSS config with SCSS/Sass/Less support | [`css.ts:8-29`](./css.ts) |
| `HTML_CONFIG` | const | HTML markup configuration | [`html.ts:8-29`](./html.ts) |
| `JSON_CONFIG` | const | JSON config for dependencies and schemas | [`json.ts:8-29`](./json.ts) |
| `XML_CONFIG` | const | XML document configuration | [`xml.ts:8-29`](./xml.ts) |

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
| CSS extensions | `.css`, `.scss`, `.sass`, `.less` |
| JSON scope | `.json` including package.json, tsconfig.json, OpenAPI specs |
| HTML/XML parsing | Element and attribute node type extraction |

## Error Handling

Static configuration data with no runtime error paths. Validation performed by the registry module.

## Known Limitations

- Markup language parsing extracts structure but not semantic meaning.
- JSON config does not validate JSON Schema compliance.

## Exports

- `CSS_CONFIG`
- `HTML_CONFIG`
- `JSON_CONFIG`
- `XML_CONFIG`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all markup language configurations |
| `css.ts` | CSS with preprocessor (SCSS, Sass, Less) support |
| `html.ts` | HTML element and attribute configuration |
| `json.ts` | JSON with OpenAPI and npm package support |
| `xml.ts` | XML element and processing instruction configuration |
