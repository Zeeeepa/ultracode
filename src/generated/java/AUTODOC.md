# Java

## Overview

Provides ANTLR-generated lexical analysis and parsing infrastructure for Java 20 source code. Includes a tokenizer, recursive-descent parser, and tree traversal interfaces (listener and visitor patterns). Used internally by the code analysis pipeline to convert Java source text into Abstract Syntax Trees for semantic analysis and transformation.

## Flow

```
Java Source Code
       ↓
   Java20Lexer (Tokenization)
       ↓
    Token Stream
       ↓
   Java20Parser (Parsing)
       ↓
   Syntax Tree (AST)
       ↓
  [Listener/Visitor Interfaces]
       ↓
   Semantic Analysis
```

## Entity Listing

### Public API

- **index.ts** — Re-exports all parser components (Lexer, Parser, Listener, Visitor) for use by consuming analysis modules.

### Core Parser Components

- **Java20Lexer.ts** — ANTLR-generated lexer that tokenizes Java 20 source text into a stream of tokens for parsing.
- **Java20Parser.ts** — ANTLR-generated recursive-descent parser that constructs an Abstract Syntax Tree from token streams.

### Tree Traversal Interfaces

- **Java20ParserListener.ts** — Listener interface implementing the Listener pattern for depth-first AST traversal with event callbacks on node entry/exit.
- **Java20ParserVisitor.ts** — Visitor interface implementing the Visitor pattern for recursive AST traversal with return-value semantics per node type.

### Lexer Artifacts

- **Java20Lexer.tokens** — Token vocabulary definitions mapping symbolic token names to numeric token type IDs for the lexer.
- **Java20Lexer.interp** — ANTLR serialized interpreter data containing lexer runtime state machine tables and mode information.

### Parser Artifacts

- **Java20Parser.tokens** — Token vocabulary definitions for parser rule recognition.
- **Java20Parser.interp** — ANTLR serialized interpreter data containing parser runtime ATN tables and decision information.

## Dependencies

### External

- **ANTLR Runtime (antlr4-typescript)** — Provides base lexer, parser, and tree traversal classes required by generated code.

### Internal

- **Analysis pipeline modules** — Consume parsed Java ASTs for pattern detection, dependency analysis, and code transformation.

## Design Patterns

- **Visitor Pattern** — Java20ParserVisitor enables flexible tree traversal with return values, suitable for code analysis transformations.
- **Listener Pattern** — Java20ParserListener provides event-based traversal callbacks, useful for collecting metrics or generating side effects during AST walks.