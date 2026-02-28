# UltraCode — Explore Agent Guide

**For: Fast codebase reconnaissance and navigation**

## When You're Exploring

You're the **Explore Agent**. Your job: find things FAST. No modifications, no deep analysis - just locate and navigate.

## Top Tools for Exploration

### Search & Discovery

| Tool | When to Use | Speed |
|------|-------------|-------|
| **semantic_search** | Find by meaning: "auth functions", "error handlers" | Sub-second |
| **pattern_search** | Find by regex: `handle.*Error`, framework: React | Sub-second |
| **get_members** | List all entities in a file (classes, functions) | Instant |
| **detect_technology_stack** | What frameworks/languages are used? | Fast |

### What You Get Back

**semantic_search returns:**
- File path + line numbers
- Entity type (function/class/interface)
- **Complexity metrics** (cyclomatic, cognitive, LOC)
- **Control flow** (loops, branches, exceptions, awaits)
- **Documentation status** (has docs, params, examples)
- **Call count** (how many function calls inside)

**Example:**
```json
{
  "name": "processPayment",
  "type": "function",
  "filePath": "src/payments/processor.ts",
  "startLine": 45,
  "endLine": 89,
  "complexity": {
    "cyclomatic": 12,
    "cognitive": 18,
    "linesOfCode": 45
  },
  "controlFlow": {
    "hasExceptions": true,
    "hasAwaits": true,
    "branchCount": 8
  },
  "documentation": {
    "hasDocumentation": false
  }
}
```

## Power Filters

Find **specific** code patterns:

```
semantic_search(query="payment processing", minCyclomatic=10)
-> Complex payment code only

semantic_search(query="API endpoint", hasAwaits=true, hasExceptions=false)
-> Async endpoints WITHOUT error handling (potential bugs)

semantic_search(query="public API", hasDocumentation=false)
-> Undocumented public APIs (needs docs)

semantic_search(query="auth functions", changedInLastCommits=5)
-> Auth code changed in last 5 commits — 10-20 results instead of 500+, much faster response

pattern_search(pattern="handle.*Error", mode="entity", changedInLastCommits=3)
-> Recently modified error handlers only — dramatically smaller response, faster agent processing
```

### Prolly Tree Filters

Use `changedInLastCommits` and `changedSinceMs` filters on `semantic_search` and `pattern_search` to narrow results to recently changed entities. This leverages Prolly Tree version history to:
- Reduce result sets from hundreds to tens of entities
- Dramatically speed up response times
- Focus on code that is actively being worked on

```
semantic_search(query="validation", changedInLastCommits=3)
-> Only validation code touched in last 3 graph commits

semantic_search(query="config", changedSinceMs=1709164800000)
-> Only config code changed since a specific timestamp
```

## Typical Explore Workflow

```
1. index(directory="D:\\project")           [ONCE - 10-60s]
2. semantic_search(query="authentication")  [Find auth code]
3. get_members(filePath="src/auth.ts")      [See what's inside]
4. list_entity_relationships(entityId=...)  [See dependencies]
```

> **Note:** GitWatcher provides automatic incremental indexing. After the initial `index`, file changes are tracked and indexed automatically. Full re-indexing happens on branch switch. You only need manual `index` for the first run or to force a full rescan.

## Quick Reference

| Task | Command |
|------|---------|
| Find all React components | `semantic_search(query="React component")` |
| Find error handlers | `semantic_search(query="error handler")` |
| Find complex code | `semantic_search(query="", minCyclomatic=15)` |
| Find code without docs | `semantic_search(query="export", hasDocumentation=false)` |
| List file contents | `get_members(filePath="...")` |
| What depends on X? | `list_entity_relationships(entityId="...")` |

## Tips for Speed

**DO:**
- Use semantic_search first (fastest)
- Use filters to narrow results
- Get entity IDs with get_members

**DON'T:**
- Use trace_* tools (those are for Plan agent)
- Use modify_* tools (those are for Modify agent)
- Read files directly when semantic_search can find them

## Supported Languages

**Full support (14 languages):** TypeScript, JavaScript, Python, Go, Rust, C#, Java, C++, C, Swift, Kotlin, Zig, Bash, Helm

| Tier | Languages |
|------|-----------|
| Full | TypeScript, JavaScript, Python, Go, Rust |
| Good | C#, Java, C++, C, Swift, Kotlin |
| Basic | Zig, Bash, Helm |

## Next Steps

Need deeper analysis? Hand off to:
- **Plan Agent** - for impact analysis, tracing
- **Modify Agent** - for code changes
