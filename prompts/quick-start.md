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
| Find complex code | `semantic_search minCyclomatic=10` | Complexity filter |
| Find undocumented code | `semantic_search hasDocumentation=false` | Docs filter |
| Find async without error handling | `semantic_search hasAwaits=true hasExceptions=false` | Control flow filters |

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

## Tracing Tools (NEW)

| Question | Tool |
|----------|------|
| "How does code get from A to B?" | `trace_flow` |
| "Why isn't this method called?" | `trace_backwards` |
| "How does data affect state?" | `trace_data_flow` |
| "What changes with different values?" | `analyze_state_impact` |
| "What are all decision points?" | `find_decision_points` |

## Cross-Project Support (NEW)

Work with multiple projects, each with isolated databases:

```
# Switch context via index
index directory="D:\\other\\project"

# Or search in another project directly
semantic_search query="auth" projectPath="D:\\other\\project"
```

Storage: `%LOCALAPPDATA%\UltraScriptTools\projects\{hash}/`

## Advantages Over Built-in Tools

| Operation | Built-in (Grep/Glob) | UltraScript |
|-----------|----------------------|-------------|
| Search "auth functions" | ❌ Text only | ✅ Understands meaning |
| Find duplicates | ❌ Impossible | ✅ Semantic |
| Change impact analysis | ❌ Impossible | ✅ Dependency graph |
| Type navigation | ❌ Regex only | ✅ AST parsing |
| Speed on large projects | 🐌 Slow | 🚀 SIMD/GPU acceleration |
| Find complex code | ❌ Impossible | ✅ Cyclomatic/cognitive metrics |
| Find undocumented APIs | ❌ Impossible | ✅ Documentation detection |
| Find async code patterns | ❌ Impossible | ✅ Control flow analysis |

## Enhanced Search Filters (NEW)

`semantic_search` now supports rich filtering:

- **Complexity**: `minCyclomatic`, `maxCyclomatic`
- **Control Flow**: `hasExceptions`, `hasLoops`, `hasAwaits`
- **Documentation**: `hasDocumentation`, `isDeprecated`
- **Call Analysis**: `minCallCount`
- **History (Prolly Tree)**: `changedInLastCommits`, `changedSinceMs` — **dramatically faster responses**: narrows 500+ results to 10-20 recently changed entities, reducing response size and agent processing time

**Examples:**
```
semantic_search query="data processing" minCyclomatic=10  # Complex code
semantic_search query="API" hasAwaits=true hasExceptions=false  # Async without error handling
semantic_search query="export" hasDocumentation=false  # Undocumented exports
semantic_search query="auth" changedInLastCommits=5  # ⚡ Only recently changed — much faster response
pattern_search pattern="handle.*" mode="entity" changedInLastCommits=3  # ⚡ 10x fewer results = 10x faster
```

**Returns enhanced data:**
- `complexity`: cyclomatic, cognitive, linesOfCode, nestingDepth
- `controlFlow`: branches, loops, exceptions, awaits (counts and flags)
- `calls`: function call count, async call detection
- `documentation`: docs presence, params, examples, deprecated status
