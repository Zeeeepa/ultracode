---
module_name: java
description: "ANTLR-generated lexer and parser for Java 20 syntax analysis"
status: generated
language: typescript
---

# Java

> ANTLR-generated lexer, parser, listener, and visitor for parsing Java 20 source code into syntax trees.

## Overview

Provides the full ANTLR toolchain output for Java 20 grammar, enabling tokenization and AST construction of Java source files. Used internally by the code analysis pipeline.

## Exports



## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports parser components for internal consumption |
| `Java20Lexer.ts` | Generated lexer that tokenizes Java 20 source code |
| `Java20Lexer.interp` | ANTLR interpreter data for the Java 20 lexer |
| `Java20Lexer.tokens` | Token vocabulary definitions for the lexer |
| `Java20Parser.ts` | Generated parser that builds syntax trees from tokens |
| `Java20Parser.interp` | ANTLR interpreter data for the Java 20 parser |
| `Java20Parser.tokens` | Token vocabulary definitions for the parser |
| `Java20ParserListener.ts` | Listener interface for syntax tree traversal events |
| `Java20ParserVisitor.ts` | Visitor interface for syntax tree traversal with return values |
