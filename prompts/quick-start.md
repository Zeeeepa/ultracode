# UltraScript Tools MCP — Quick Start

## When to Use UltraScript Tools

**USE instead of Grep/Glob** — 5-10x faster, understands meaning.

| Task | Tool | Why |
|------|------|-----|
| Search code by meaning | `semantic_search` | Understands natural language |
| Find similar code | `find_similar_code` | Semantic similarity |
| Impact analysis | `analyze_code_impact` | Shows what breaks |
| Find duplicates | `detect_code_clones` | Semantic detection |
| List entities in file | `list_file_entities` | AST parsing |
| Show dependencies | `list_entity_relationships` | Dependency graph |
| Modify code safely | `modify_code` | With preview & rollback |
| Rename across project | `rename_symbol` | Updates all references |

## Supported Languages

| Language | Support | Features |
|----------|---------|----------|
| TypeScript | ⭐⭐⭐ | Full type analysis, JSX/TSX |
| JavaScript | ⭐⭐⭐ | ES6+, JSX, CommonJS/ESM |
| Python | ⭐⭐⭐ | Type hints, async, decorators |
| Go | ⭐⭐⭐ | Goroutines, interfaces |
| Rust | ⭐⭐⭐ | Traits, lifetimes, macros |
| Java | ⭐⭐ | Generics, annotations |
| C++ | ⭐⭐ | Templates, namespaces |
| Swift | ⭐⭐ | Protocols, extensions |
| Kotlin | ⭐⭐ | Coroutines, data classes |
| Bash | ⭐ | Functions, variables |

> **For C# projects** use UltrasharpTools MCP — uses Roslyn for deep analysis.

## Typical Workflow

```
1. index — index project (once)
2. semantic_search / query — find code
3. list_entity_relationships — understand dependencies
4. analyze_code_impact — assess change risks
5. modify_code — make changes
```

## Advantages Over Built-in Tools

| Operation | Built-in (Grep/Glob) | UltraScript |
|-----------|----------------------|-------------|
| Search "auth functions" | ❌ Text only | ✅ Understands meaning |
| Find duplicates | ❌ Impossible | ✅ Semantic |
| Change impact analysis | ❌ Impossible | ✅ Dependency graph |
| Type navigation | ❌ Regex only | ✅ AST parsing |
| Speed on large projects | 🐌 Slow | 🚀 SIMD/GPU acceleration |
