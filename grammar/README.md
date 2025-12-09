# ANTLR Grammar Infrastructure

This directory contains ANTLR grammars for various languages. Generated TypeScript parsers are placed in `src/generated/` for proper compilation with the project.

## Structure

```
grammar/
  kotlin/
    grammar/              # Downloaded .g4 grammar files
  <other-language>/
    grammar/
  scripts/
    download-kotlin.cmd   # Windows: download Kotlin grammar
    download-kotlin.sh    # Linux/Mac: download Kotlin grammar
    generate-kotlin.cmd   # Windows: generate TypeScript parser
    generate-kotlin.sh    # Linux/Mac: generate TypeScript parser

src/
  generated/
    kotlin/               # Generated TypeScript code (committed)
      KotlinLexer.ts
      KotlinParser.ts
      KotlinParserVisitor.ts
      KotlinParserListener.ts
      index.ts
  parsers/
    kotlin-antlr-parser.ts   # Parser using generated code
```

## Prerequisites for Generation

Generation requires Java Runtime Environment (JRE) 11+. This is needed ONLY for developers regenerating parsers, NOT for end users.

```bash
# Check Java is installed
java -version
```

## Available Languages

| Language | Parser Type | Status |
|----------|-------------|--------|
| Kotlin | ANTLR (kotlin-spec) | ✅ Complete |
| Java | ANTLR (grammars-v4/java20) | ✅ Complete |
| Rust | ANTLR (grammars-v4/rust) | ✅ Complete |
| Python | Native (ast module) | ✅ Complete |
| Go | Native (go/parser) | ✅ Complete |

## Kotlin Parser Features

The Kotlin ANTLR parser extracts:

**Entities:**
- Packages, Imports, Classes, Interfaces, Objects
- Functions (including suspend), Properties, Constants
- Enums + enum variants, Type aliases, Companion objects

**Relationships:**
- `imports` - import statements
- `inherits` - class inheritance
- `implements` - interface implementation
- `contains` - nesting (class contains method)
- `calls` - function calls
- `decorates` - annotations
- `overrides` - method overrides

## Usage

### 1. Download Grammar (one time)

```bash
# Windows
scripts\download-kotlin.cmd

# Linux/Mac
./scripts/download-kotlin.sh
```

### 2. Generate TypeScript Parser (one time)

```bash
# Windows
scripts\generate-kotlin.cmd

# Linux/Mac
./scripts/generate-kotlin.sh
```

### 3. Commit Generated Files

Generated TypeScript files in `src/generated/` should be committed to the repository.
End users will use these files directly without needing Java or ANTLR tools.

## Adding New Language

1. Create directory: `grammar/<language>/grammar/`
2. Create download script: `scripts/download-<language>.{cmd,sh}`
3. Create generate script: `scripts/generate-<language>.{cmd,sh}`
4. Add visitor implementation in `src/parsers/`

## Runtime Dependency

The generated parsers require `antlr4ng` runtime (~150KB):

```json
{
  "dependencies": {
    "antlr4ng": "^3.0.0"
  }
}
```

## Grammar Sources

- **Kotlin**: https://github.com/Kotlin/kotlin-spec/tree/master/grammar/src/main/antlr
- **Java**: https://github.com/antlr/grammars-v4/tree/master/java/java
- **Python**: https://github.com/antlr/grammars-v4/tree/master/python/python3
- **Go**: https://github.com/antlr/grammars-v4/tree/master/golang
- **Rust**: https://github.com/AmazingAng/rust-antlr4/tree/main/grammar
- **Swift**: https://github.com/AmazingAng/swift-antlr4/tree/main/grammar
- **C/C++**: https://github.com/antlr/grammars-v4/tree/master/cpp
