---
module_name: integration
description: "Git integration utilities for semantic merge operations"
status: active
language: typescript
---

# Integration

> Provides safe git operations for the semantic merge pipeline, including branch checkout, changed file detection, merge-base discovery, and branch restoration.

## Overview

The integration module wraps git CLI commands into a safe, typed API used by the multi-version indexer and three-way merger. GitIntegration validates repository state, saves the original branch before operations, detects uncommitted changes, and automatically restores the working branch on error. It supports detecting renamed, added, modified, and deleted files between branches using triple-dot diff.

## Data Flow

- **Inputs**: Repository path, branch names, and git references (commits, tags).
- **Processing**: Executes git CLI commands (checkout, diff, merge-base, rev-parse) via child_process.execSync.
- **Outputs**: GitFileChange arrays, GitDiffResult statistics, commit hashes, branch info, and file content at specific revisions.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `GitIntegration` | class | Safe git operations for merge with automatic branch restoration | [`git-integration.ts:51-431`](./git-integration.ts) |
| `GitIntegrationConfig` | interface | Configuration with repoPath and safety flags | [`git-integration.ts:41-45`](./git-integration.ts) |
| `GitBranchInfo` | interface | Branch name, commit hash, and detached state info | [`git-integration.ts:21-26`](./git-integration.ts) |
| `GitFileChange` | interface | File change with path, status, and optional oldPath for renames | [`git-integration.ts:28-32`](./git-integration.ts) |
| `GitDiffResult` | interface | Diff statistics with file changes, insertions, and deletions | [`git-integration.ts:34-39`](./git-integration.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging` | Structured logging |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:child_process` | Git CLI execution via execSync |
| `node:fs` | Repository .git directory validation |
| `node:path` | Path joining for git directory check |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Branch restoration | Automatic on error when restoreOnError is true (default) |
| Uncommitted changes | Checkout is blocked if working directory has uncommitted changes |
| Detached HEAD | Supported via allowDetachedHead config option (default: false) |

## Error Handling

Throws descriptive errors when branches do not exist, commit hashes cannot be resolved, or checkout fails with uncommitted changes. On checkout failure with restoreOnError enabled, automatically restores the original branch before re-throwing. Diff and merge-base operations return empty results on failure rather than throwing.

## Known Limitations

- Uses synchronous execSync for git commands, which blocks the event loop during execution.
- No support for worktree-based parallel checkout (would eliminate sequential branch switching).
- Rename detection relies on git's built-in rename scoring rather than semantic analysis.

## Exports



## Files

| File | Description |
|------|-------------|
| `git-integration.ts` | Git CLI wrapper with safe checkout, diff, merge-base, and branch restoration |
| `index.ts` | Re-exports all git integration types and classes |
