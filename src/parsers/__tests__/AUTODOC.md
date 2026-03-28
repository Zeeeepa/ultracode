# src/parsers/__tests__

## Overview

This module contains the comprehensive test suite for the HelmParser, validating its ability to parse Helm chart files and extract entities, patterns, and metadata. The tests cover Chart.yaml parsing, Helm template pattern detection (nindent, indent, toYaml, include, etc.), incremental parsing behavior, and edge cases in YAML/Helm syntax. Tests use Vitest with mocked file operations and logging to ensure isolated, deterministic validation of parser functionality across realistic Helm chart scenarios.

## Flow

```
Test Input (filePath + content)
    ↓
HelmParser.parse()
    ↓
Pattern Detection (functions, variables, includes, range/with)
    ↓
Entity Extraction (files, variables, charts, functions, imports)
    ↓
Assertion Validation (entities count, properties, categorization)
    ↓
Result: Pass/Fail
```

## Test Infrastructure

- **existsSync mock** (`helm-parser.test.ts:5-12`) — Mocked file existence check that simulates Chart.yaml locations for specific paths to test Helm context detection without filesystem I/O.
- **log mock** (`helm-parser.test.ts:15-17`) — Mocked logging interface with info, debug, warning, and error methods to capture parser debug output during tests.
- **parser instance setup** (`helm-parser.test.ts:22-24`) — beforeEach hook that instantiates a fresh HelmParser for each test, ensuring test isolation and preventing state leakage.

## Core Parsing Tests

- **Chart.yaml parsing** (`helm-parser.test.ts:29-101`) — Validates extraction of module entity with name, version, appVersion, and description from Chart.yaml files; tests both standard and edge case YAML formats.
- **Chart.yaml parsing variations** (`helm-parser.test.ts:106-170`) — Tests multi-chart scenarios, invalid YAML, and misaligned indentation in Chart.yaml; validates error handling and fallback behavior.

## Pattern Detection Tests

- **Helm function patterns** (`helm-parser.test.ts:175-256`) — Tests detection and extraction of Helm built-in functions (nindent, indent, quote, lower) and their arguments; validates regex-based pattern matching.
- **Advanced function patterns** (`helm-parser.test.ts:261-327`) — Tests complex nested function calls, toYaml patterns, and whitespace handling in template expressions; validates proper tokenization.
- **Include and define directives** (`helm-parser.test.ts:332-391`) — Tests recognition of Helm include, define, and template directives; validates template name extraction and scope detection.
- **Control flow directives** (`helm-parser.test.ts:396-477`) — Tests range and with directives for variable bindings; validates context and iterator extraction.
- **Variable references** (`helm-parser.test.ts:482-523`) — Tests variable references with dot notation, map access, and function calls; validates symbol binding resolution.
- **String interpolation patterns** (`helm-parser.test.ts:528-616`) — Tests Helm string interpolation with nindent, indent, toYaml, and include patterns; validates quoted and raw string handling.

## Integration and Behavior Tests

- **Batch parsing scenario** (`helm-parser.test.ts:621-658`) — Validates sequential parsing and entity aggregation; tests Prime dependency detection and multiple chart references in batch mode.
- **Incremental parsing** (`helm-parser.test.ts:663-671`) — Tests incremental parser state management and result merging across multiple file parses; validates cache efficiency.
- **Entity categorization** (`helm-parser.test.ts:676-706`) — Validates file entity, variable, chart, function, and import categorization; tests proper entity type assignment and filtering.
- **Large file handling** (`helm-parser.test.ts:711-729`) — Tests parser performance and stability with multi-hundred-line Helm templates; validates incremental parsing on large documents.
- **Performance regression** (`helm-parser.test.ts:734-738`) — Tests parser speed on repeated parses; validates no unexpected slowdowns.
- **File system integration** (`helm-parser.test.ts:740-753`) — Tests isHelmContext detection and Chart.yaml discovery; validates mock file operations and path resolution.
- **Statistics tracking** (`helm-parser.test.ts:755-777`) — Validates entity count, line count, and parse statistics collection; tests incremental stats updates.
- **Incremental updates** (`helm-parser.test.ts:782-807`) — Tests adding, modifying, and removing entities in incremental parse cycles; validates before/after state correctness.
- **Complex template structures** (`helm-parser.test.ts:812-860`) — Tests nested conditionals, loops, and variable scoping; validates location tracking and entity nesting.
- **Comprehensive integration** (`helm-parser.test.ts:865-941`) — End-to-end validation of all parser features: Chart.yaml extraction, pattern detection, variable binding, and entity relationships in a realistic chart.

## Test Fixtures

Test fixtures provide repeatable input scenarios for HelmParser validation:

- **Chart.yaml file paths** (`helm-parser.test.ts:30`, `helm-parser.test.ts:106`, `helm-parser.test.ts:742`, `helm-parser.test.ts:813`, `helm-parser.test.ts:867`) — File path inputs for Chart.yaml and Helm template file processing.
- **YAML content fixtures** — Helm template and Chart.yaml content spanning multiple scenarios:
  - Basic structures (`helm-parser.test.ts:33-39`, `helm-parser.test.ts:54`, `helm-parser.test.ts:63-74`)
  - Multi-chart variations (`helm-parser.test.ts:109-131`, `helm-parser.test.ts:133-141`, `helm-parser.test.ts:143-149`, `helm-parser.test.ts:151-159`, `helm-parser.test.ts:161-169`)
  - Function patterns (`helm-parser.test.ts:178-195`, `helm-parser.test.ts:197-206`, `helm-parser.test.ts:208-225`, `helm-parser.test.ts:227-243`, `helm-parser.test.ts:245-255`)
  - Advanced functions (`helm-parser.test.ts:264-281`, `helm-parser.test.ts:283-291`, `helm-parser.test.ts:293-310`, `helm-parser.test.ts:312-318`, `helm-parser.test.ts:320-326`)
  - Directives and references (`helm-parser.test.ts:335-348`, `helm-parser.test.ts:350-358`, `helm-parser.test.ts:360-368`, `helm-parser.test.ts:370-382`, `helm-parser.test.ts:384-390`)
  - Control flow (`helm-parser.test.ts:399-410`, `helm-parser.test.ts:412-425`, `helm-parser.test.ts:427-443`, `helm-parser.test.ts:445-452`, `helm-parser.test.ts:454-468`, `helm-parser.test.ts:470-476`)
  - Variable bindings (`helm-parser.test.ts:485-496`, `helm-parser.test.ts:498-513`, `helm-parser.test.ts:515-522`)
  - String interpolation (`helm-parser.test.ts:531-545`, `helm-parser.test.ts:547-561`, `helm-parser.test.ts:563-575`, `helm-parser.test.ts:577-589`, `helm-parser.test.ts:594`, `helm-parser.test.ts:609-615`)

## Test Design Patterns

The test suite uses **assertion-based validation** to verify parser behavior: each test parses input content and asserts on entity counts, properties (name, version, description), and type categorization. Tests combine **mock-based isolation** (mocked filesystem and logger) with **fixture-driven scenarios** to validate the parser across standard usage patterns, edge cases, and integration points without requiring external resources.