---
module_name: kotlin
description: "ANTLR-generated lexer and parser for Kotlin syntax analysis"
status: generated
language: typescript
---

# Kotlin

> ANTLR-generated lexer, parser, listener, and visitor for parsing Kotlin source code into syntax trees.

## Overview

Provides the full ANTLR toolchain output for Kotlin grammar, enabling tokenization and AST construction of Kotlin source files. Includes a Unicode character class helper required by the lexer.

## Exports



## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports parser components for internal consumption |
| `KotlinLexer.ts` | Generated lexer that tokenizes Kotlin source code |
| `KotlinParser.ts` | Generated parser that builds syntax trees from tokens |
| `KotlinParserListener.ts` | Listener interface for syntax tree traversal events |
| `KotlinParserVisitor.ts` | Visitor interface for syntax tree traversal with return values |
| `UnicodeClasses.ts` | Unicode character class definitions used by the Kotlin lexer |
