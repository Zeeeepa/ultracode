# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`, organized by MCP domain: protocol adapters in `src/mcp/`, graph analytics in `src/graph/`, and shared utilities under `src/common/`. Integration and regression specs sit in `tests/` alongside fixtures. Example client workflows are in `docs/examples/`, while reusable orchestration scripts live in `scripts/`. Runtime data (SQLite vectors, generated graphs) persists in `data/` and `llm_rag_db/`; keep large artifacts out of version control. Operational logs and session traces are archived under `logs_llm/` and `logs_archive/`.

## Build, Test, and Development Commands
- `bun run tsup` — bundle the TypeScript server into `dist/` for local validation.
- `make package` — produce the NPM tarball with metadata checks.
- `npx biome check --apply .` — lint and format TypeScript/JSON using the shared ruleset.
- `npm test` — execute the Jest suite with snapshots and coverage.
- `./test-tools.sh` — sanity-check MCP tool wiring against the reference manifest.
- `./test-correct-tools.sh` — performance and correctness sweep for sqlite-vec integration.

## Coding Style & Naming Conventions
Use TypeScript with strict mode enabled (see `tsconfig.json`). Prefer 2-space indentation, single quotes, and trailing commas where Biome enforces them. Name files in kebab-case (`graph-storage.ts`), classes in PascalCase, functions and variables in camelCase, and constants in SCREAMING_SNAKE_CASE. Document non-obvious modules with top-of-file comments describing their agent interaction or graph responsibilities.

## Testing Guidelines
Write Jest tests beside the closest domain (mirroring `src/` inside `tests/`) with filenames ending in `.test.ts`. Favor deterministic fixtures checked into `tests/fixtures/` and update snapshots deliberately. Ensure new features exercise both graph generation and tool invocation paths; aim to keep coverage at or above existing thresholds shown in `coverage/`. Before opening a PR, run `npm test` and both tool scripts locally.

## Commit & Pull Request Guidelines
Follow the established convention of prefixing commits with the active task, e.g., `TASK-123: tighten vector cache`. Keep messages in imperative mood and describe the user-facing outcome. For pull requests, include a concise summary, highlight affected agents or tools, link the relevant TASK ticket, and attach CLI output for key commands (`npm test`, tool scripts). If the change impacts memory bank content or logging, note any new files or retention considerations.

## Agent & Memory Bank Notes
Complex multi-step updates should route through the Conductor agent with clear delegation to specialist agents (parser, vector, tooling). Update `.memory_bank/` entries when workflows, commands, or agent responsibilities change, and log significant orchestration runs in `logs_llm/` to preserve traceability.

## Branch-Aware Indexing Architecture (v2.8.0+)

**Key Components:**
- **BranchManager** (`src/core/branch-manager.ts`) — orchestrates per-branch database lifecycle, xxHash-based repository identification, LRU eviction, metadata persistence (last commit, entity counts).
- **GitWatcher** (`src/core/git-watcher.ts`) — monitors `.git/HEAD` for branch switches, polls for new commits, emits events (`onBranchChange`, `onCommitChange`).
- **IndexerAgent Integration** — `onInitialize()` creates BranchManager/GitWatcher when `config.indexing.branchAware` is true, subscribes to branch change events, triggers incremental/full reindex.
- **Branch Tools** (`src/tools/branch-tools.ts` + `src/tools/branch-schemas.ts`) — 5 new MCP methods: `list_branches`, `switch_branch`, `get_branch_status`, `cleanup_branches`, `get_changed_files`.

**Database Structure:**
```
data/
├── {repo-hash}/              # xxHash(git remote URL or path)
│   ├── main/vectors.db
│   ├── develop/vectors.db
│   └── feature-x/vectors.db
└── branch-registry.json      # Global metadata: {branches, activeBranches}
```

**Configuration** (`config/default.yaml`):
- `indexing.branchAware` (default: `false`) — enable per-branch databases
- `indexing.autoSwitchOnBranchChange` (default: `true`) — auto-switch DB on `git checkout`
- `indexing.maxBranchesPerRepo` (default: `10`) — LRU limit per repository
- `git.enabled` (default: `false`) — enable Git integration
- `git.watchBranchChanges` (default: `true`) — watch `.git/HEAD`
- `git.diffMode` (default: `"incremental"`) — `"incremental"` or `"full"` reindex on branch switch

**When to Use:**
- Teams with active feature branches — accurate indexing per branch, no stale data.
- Automatic mode: server detects `git checkout`, switches DB, reindexes changed files.
- Manual mode: use `switch_branch` MCP tool to explicitly switch without Git operation.

**Performance Impact:**
- Incremental sync: only reindex changed files (via `git diff`)
- Threshold: if >20 files changed (configurable `incrementalThreshold`), do full reindex
- LRU cleanup: automatic eviction of old branches to prevent disk bloat

**See also:** [docs/BRANCH_AWARE_INDEXING.md](./docs/BRANCH_AWARE_INDEXING.md) for implementation details, [ULTRA.md](./ULTRA.md) for performance optimizations.
