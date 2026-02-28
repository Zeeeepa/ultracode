---
module_name: rust
description: "ANTLR-generated lexer and parser for Rust syntax analysis"
status: generated
language: typescript
---

# Rust

> ANTLR-generated lexer, parser, listener, and visitor for parsing Rust source code into syntax trees.

## Overview

Provides the full ANTLR toolchain output for Rust grammar, enabling tokenization and AST construction of Rust source files. Used internally by the code analysis pipeline.

## Exports



## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports parser components for internal consumption |
| `RustLexer.ts` | Generated lexer that tokenizes Rust source code |
| `RustLexer.interp` | ANTLR interpreter data for the Rust lexer |
| `RustLexer.tokens` | Token vocabulary definitions for the lexer |
| `RustParser.ts` | Generated parser that builds syntax trees from tokens |
| `RustParser.interp` | ANTLR interpreter data for the Rust parser |
| `RustParser.tokens` | Token vocabulary definitions for the parser |
| `RustParserListener.ts` | Listener interface for syntax tree traversal events |
| `RustParserVisitor.ts` | Visitor interface for syntax tree traversal with return values |
