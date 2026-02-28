---
module_name: java
description: "Java ANTLR parser for extracting metadata from Java AST"
status: active
language: typescript
---

# Java

> Extracts metadata from Java source code using the ANTLR parser, including modifiers, annotations, inheritance, parameters, and method calls.

## Overview

This module provides helper functions for parsing Java source code via ANTLR-generated AST nodes. It extracts structural information such as class/interface modifiers, annotations, inheritance hierarchies, method parameters, and method calls. The module serves as the root coordinator, re-exporting types and extraction helpers consumed by the Java parser pipeline.

## Data Flow

- **Inputs**: ANTLR-generated Java AST context nodes from the Java20 grammar
- **Processing**: Traverses AST nodes to extract modifiers, annotations, inheritance info, parameters, and calls using type-safe wrappers around ANTLR contexts
- **Outputs**: Typed extraction results (`AnnotationInfo`, `InheritanceInfo`, `ParameterInfo`, `LocationInfo`, call lists)

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `getLocation` | function | Extracts position information from an AST node | [`extraction-helpers.ts:114-132`](./extraction-helpers.ts) |
| `extractClassModifiers` | function | Gets modifiers from a class declaration | [`extraction-helpers.ts:159-161`](./extraction-helpers.ts) |
| `extractInterfaceModifiers` | function | Gets modifiers from an interface declaration | [`extraction-helpers.ts:167-169`](./extraction-helpers.ts) |
| `extractMethodModifiers` | function | Gets modifiers from a method declaration | [`extraction-helpers.ts:175-177`](./extraction-helpers.ts) |
| `extractInterfaceMethodModifiers` | function | Gets modifiers from an interface method | [`extraction-helpers.ts:183-185`](./extraction-helpers.ts) |
| `extractFieldModifiers` | function | Gets modifiers from a field declaration | [`extraction-helpers.ts:190-192`](./extraction-helpers.ts) |
| `extractConstructorModifiers` | function | Gets modifiers from a constructor | [`extraction-helpers.ts:197-199`](./extraction-helpers.ts) |
| `extractConstantModifiers` | function | Gets modifiers from a constant field | [`extraction-helpers.ts:204-206`](./extraction-helpers.ts) |
| `extractAnnotations` | function | Extracts annotations from class/enum modifiers | [`extraction-helpers.ts:216-273`](./extraction-helpers.ts) |
| `extractAnnotationsFromInterfaceModifiers` | function | Extracts annotations from interface modifiers | [`extraction-helpers.ts:278-282`](./extraction-helpers.ts) |
| `extractAnnotationsFromMethodModifiers` | function | Extracts annotations from method modifiers | [`extraction-helpers.ts:287-291`](./extraction-helpers.ts) |
| `extractAnnotationsFromFieldModifiers` | function | Extracts annotations from field modifiers | [`extraction-helpers.ts:296-300`](./extraction-helpers.ts) |
| `extractClassInheritance` | function | Gets class extends/implements information | [`extraction-helpers.ts:309-333`](./extraction-helpers.ts) |
| `extractInterfaceInheritance` | function | Gets interface extends information | [`extraction-helpers.ts:338-340`](./extraction-helpers.ts) |
| `extractMethodParameters` | function | Extracts parameters from a method | [`extraction-helpers.ts:363-404`](./extraction-helpers.ts) |
| `extractConstructorParameters` | function | Extracts parameters from a constructor | [`extraction-helpers.ts:409-434`](./extraction-helpers.ts) |
| `extractCalls` | function | Gets method calls via regex from body text | [`extraction-helpers.ts:465-484`](./extraction-helpers.ts) |
| `ParserContext` | interface | Context passed through Java parsing functions | [`types.ts:17-24`](./types.ts) |
| `LocationInfo` | type | Position information for AST nodes | [`types.ts:33-36`](./types.ts) |
| `CallInfo` | interface | Method/function call information | [`types.ts:45-62`](./types.ts) |
| `AnnotationInfo` | interface | Annotation extracted from modifiers | [`types.ts:71-74`](./types.ts) |
| `InheritanceInfo` | interface | Base classes and interfaces | [`types.ts:83-86`](./types.ts) |
| `ParameterInfo` | interface | Method/constructor parameter | [`types.ts:95-101`](./types.ts) |
| `ControlFlowInfo` | interface | Complete control flow structure | [`types.ts:144-149`](./types.ts) |
| `ComplexityMetrics` | interface | Code complexity metrics | [`types.ts:192-200`](./types.ts) |
| `SpringAnnotationInfo` | interface | Spring framework annotation info | [`types.ts:209-214`](./types.ts) |
| `JpaEntityInfo` | interface | JPA entity information | [`types.ts:219-227`](./types.ts) |
| `LombokInfo` | interface | Lombok annotation information | [`types.ts:232-240`](./types.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../generated/java/Java20Parser` | ANTLR-generated Java 20 parser context types |
| `../../types/parser` | Shared `ParsedEntity` and `EntityRelationship` types |

### External Packages
| Package | Purpose |
|---------|---------|
| `antlr4ng` | ANTLR4 runtime for TypeScript (parser contexts) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Thread Safety | Stateless functions, safe for concurrent use |
| Parser Grammar | Java SE 20 (ANTLR4 grammar) |
| Annotation handling | Supports marker, single-element, and normal annotations |

## Error Handling

Functions return empty arrays or default values when AST nodes are missing or null. No exceptions are thrown; all extraction is defensive with optional chaining.

## Known Limitations

- `extractCalls` in `extraction-helpers.ts` uses regex-based extraction (simple heuristic); the AST-based call extractor in `extractors/` is more accurate
- Generic type arguments in annotations are not deeply parsed
- Does not handle annotation processors or compile-time code generation

## Exports



## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all Java parser modules |
| `types.ts` | Type definitions for parser context, calls, annotations, control flow, complexity, and framework patterns |
| `extraction-helpers.ts` | Helper functions for extracting modifiers, annotations, inheritance, parameters, and calls from ANTLR AST nodes |
