# Multi-Agent Worktree Support

UltraCode supports multiple AI agents working in parallel, each in its own git worktree on a separate branch. The server detects that all worktrees belong to the same repository and shares the base index.

## Core Concepts

### repoIdentity

A stable hash (`xxHash32(gitCommonDir)`) that is identical for all worktrees of the same repository. This enables:
- Shared database index (no duplication)
- Cross-worktree session discovery
- Indexing lock coordination

### Worktree Detection

UltraCode uses `git rev-parse --git-common-dir` to detect worktrees:
- Main worktree: `.git` is a directory → `gitCommonDir = .git`
- Linked worktree: `.git` is a file containing `gitdir: ...` → resolves to shared `.git`

### Init Protocol v3.0

comm.c sends a JSON init message on connection:
```
ULTRACODE_INIT:{"cwd":"/path/to/worktree","branch":"feature-x","agentId":"agent-1"}\n
```

## Tools

### spawn_agent_worktree

Create a git worktree for a new branch and prepare for agent connection.

```typescript
spawn_agent_worktree({
  branch: "feature/auth",      // Branch name
  baseBranch: "main",          // Base branch (default: HEAD)
  agentId: "auth-agent",       // Agent identifier
  directory: "../wt-auth"      // Custom path (default: ../wt-{branch})
})
```

**Returns**: worktree path, branch, agentId, repoIdentity, connection instructions.

### list_worktree_agents

List all worktrees and active agent sessions for the current repository.

```typescript
list_worktree_agents({
  includeInactive: true   // Include worktrees without active sessions
})
```

**Returns**: repoIdentity, total worktrees, active sessions, per-worktree details.

### cleanup_worktree

Remove a git worktree by branch name.

```typescript
cleanup_worktree({
  branch: "feature/auth",   // Branch to remove
  force: false              // Force removal if modified
})
```

### get_worktree_info

Get detailed information about the repository topology.

```typescript
get_worktree_info({
  directory: "/path/to/project"   // Optional, defaults to current project
})
```

**Returns**:
- Worktree info: isWorktree, mainRepo, repoIdentity, worktreeName
- Sibling worktrees with active session status
- Detected submodules (path, url, branch, commit)
- Detected subtrees (prefix, lastMergeCommit)

## Submodule Detection

Submodules are detected via `.gitmodules` and `git submodule status --recursive`. Each submodule gets its own `repoIdentity` (different from the parent).

## Subtree Detection

Subtrees are detected via `git log --grep="git-subtree-dir:"` which finds merge commits left by `git subtree`.

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/shared/git-worktree.ts` | Worktree/submodule/subtree detection |
| `src/shared/storage-paths.ts` | `hashProjectPath()` → repoIdentity |
| `src/core/client-session.ts` | Session with repoIdentity + agentId |
| `src/core/pipe-transport.ts` | JSON init protocol v3.0 |
| `src/core/git-watcher.ts` | Worktree-aware HEAD tracking |
| `src/agents/indexer-agent.ts` | Indexing lock coordination |
| `src/tools/handlers/worktree-tool-handlers.ts` | MCP tool handlers |
| `src/comm/comm.c` | CLI args: --directory, --branch, --agent-id |

### Indexing Lock Coordination

When multiple worktrees try to index the same branch simultaneously, `acquireIndexLockForProject()` prevents duplication:
- Lock key: `repoIdentity:branch`
- If lock is held: wait for completion, then skip (data is fresh)
- Different branches of the same repo: index in parallel (different locks)
