# Kotlin

## Overview

This module provides ANTLR-generated Kotlin language tooling including lexical analysis, parsing, and abstract syntax tree (AST) traversal interfaces. It enables tokenization of Kotlin source code and construction of complete syntax trees through visitor and listener patterns, serving as the foundation for static analysis and semantic inspection of Kotlin code.

## Flow

```
Kotlin Source Code
        ↓
  [KotlinLexer]
        ↓
    Token Stream
        ↓
  [KotlinParser]
        ↓
 Syntax Tree (AST)
        ↓
  [Visitor / Listener]
        ↓
 Code Analysis & Transformation
```

## Entity Listing

### Public API

- **index.ts** — Central re-export hub that surfaces lexer, parser, listener, and visitor components for downstream consumption.

### Core Parsing Components

- **KotlinLexer.ts** — ANTLR-generated lexer that tokenizes raw Kotlin source code into a labeled token stream representing keywords, identifiers, operators, and literals.
- **KotlinParser.ts** — ANTLR-generated parser that converts token streams into a context hierarchy representing Kotlin's grammar structure and syntactic rules.

### Traversal Interfaces

- **KotlinParserListener.ts** — Event-based listener interface enabling depth-first tree traversal with hooks that fire as the parser enters and exits each syntax node.
- **KotlinParserVisitor.ts** — Visitor interface supporting depth-first AST traversal with typed return values, enabling stateful semantic analysis and transformation of parse tree nodes.

### Utilities

- **UnicodeClasses.ts** — Unicode character class definitions and helper functions required by the lexer for correct tokenization of Kotlin identifiers, string literals, and other Unicode-dependent syntax elements.

## Design Patterns

**Listener Pattern** — Automatic callback-driven traversal; effective for simple analysis without return values.

**Visitor Pattern** — Return-value-based traversal; enables staged transformation and semantic analysis with state propagation.

## Dependencies

**ANTLR 4** — Generates the lexer, parser, and traversal interfaces from formal grammar specifications.

**antlr4ts** (Runtime) — Base classes for lexer execution, token streams, and tree traversal primitives.