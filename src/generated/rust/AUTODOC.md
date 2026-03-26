# Rust

## Overview

This module exports ANTLR-generated lexer and parser components for tokenizing and parsing Rust source code into abstract syntax trees. It serves as the foundation for Rust semantic analysis within the code analysis pipeline. The components support both event-driven (listener) and value-returning (visitor) traversal patterns for AST processing.

## Flow

```
Rust Source Code
       ↓
   RustLexer
  (Tokenization)
       ↓
   RustParser
 (AST Construction)
       ↓
   Listener / Visitor
    (Tree Traversal)
       ↓
  Analysis Results
```

## Entities

### Parser Components

- **RustLexer.ts** — ANTLR-generated tokenizer that converts Rust source code into a stream of tokens with position and type information.
- **RustParser.ts** — ANTLR-generated recursive descent parser that builds a complete abstract syntax tree (AST) from token sequences.
- **RustParserListener.ts** — Listener interface providing event-driven callbacks (enter/exit) for depth-first AST traversal without return values.
- **RustParserVisitor.ts** — Visitor interface enabling return-value-based AST traversal where each node visit produces a computed result.

### Module Interface

- **index.ts** — Central re-export barrel file that exposes lexer, parser, and traversal interfaces to internal consumers.

### ANTLR Runtime Metadata

- **RustLexer.tokens** — Token vocabulary mapping terminal symbols to numeric token identifiers for lexer output.
- **RustLexer.interp** — ANTLR binary interpreter data encoding the lexer's finite state machine.
- **RustParser.tokens** — Token vocabulary definitions consumed by the parser, synchronized with lexer output.
- **RustParser.interp** — ANTLR binary interpreter data encoding the parser's LL(*) state machine.

## Design Patterns

- **Pipeline Pattern** — Data flows unidirectionally from lexing through parsing to traversal, enabling stage-based processing.
- **Visitor/Listener Pattern** — Dual traversal interfaces accommodate both stateful and functional AST processing strategies.

## Dependencies

- **ANTLR 4 Runtime** — Parser and lexer are auto-generated from the Rust grammar specification; runtime is embedded in generated code.