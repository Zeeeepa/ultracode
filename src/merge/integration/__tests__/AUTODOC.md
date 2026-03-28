# src/merge/integration/__tests__

## Overview

This test module validates the `GitIntegration` class, which manages core git repository operations including branch state detection, commit hash retrieval, and file change categorization. The suite verifies constructor validation, branch operations, commit lookups, detection of staged/unstaged/untracked files, diff statistics, and branch listing with comprehensive error handling. Tests use Bun's testing framework with spied `fs.existsSync` and `childProcess.execSync` to isolate git command execution without invoking actual git operations. Mock return values simulate realistic git command outputs, enabling deterministic validation of both successful operations and error conditions.

## Flow

```
Test Suite Initialization
    ↓
beforeEach: Mock Setup
    ├─ Spy on fs.existsSync
    ├─ Spy on childProcess.execSync
    └─ Initialize test config
    ↓
Test Execution (describe blocks)
    ├─ Constructor validation
    ├─ getCurrentBranch tests
    ├─ getCurrentCommitHash tests
    ├─ getChanges tests (staged/unstaged/untracked)
    ├─ getDiffStats tests
    └─ listBranches tests
    ↓
Mock Verification → Assertions → Test Results
```

## Test Configuration and Infrastructure

- **config** `git-integration.test.ts:7-7` — Test configuration object specifying repository path (`/test/repo`), detached head allowance, and error recovery behavior.
- **mockExecSync** `git-integration.test.ts:8-8` — Spy on `childProcess.execSync` to intercept and mock git command execution.
- **mockExistsSync** `git-integration.test.ts:9-9` — Spy on `fs.existsSync` to mock file system checks for git repository validation.

## Constructor Tests

- **config (describe)** `git-integration.test.ts:6-359` — Test suite container for all GitIntegration validation tests.
- **it (valid repository)** `git-integration.test.ts:23-33` — Verifies GitIntegration initializes correctly when repository path contains valid `.git` directory.
- **git** `git-integration.test.ts:25-25` — GitIntegration instance created during valid repository initialization test.
- **mockExistsSync** `git-integration.test.ts:29-32` — Mock configuration ensuring `.git` directory check returns true during constructor validation.
- **GitIntegration** `git-integration.test.ts:31-31` — Constructor invocation creating instance for testing.
- **it (invalid repository)** `git-integration.test.ts:35-61` — Verifies constructor throws error when repository path does not contain `.git` directory.
- **mockExecSync** `git-integration.test.ts:36-45` — Mock simulating `git rev-parse --git-dir` command success during initialization.
- **mockExecSync** `git-integration.test.ts:47-60` — Secondary mock handling additional git command calls during failed initialization.
- **Error** `git-integration.test.ts:49-51` — Expected error condition when repository initialization fails.

## Branch Operations Tests

- **it (regular branch)** `git-integration.test.ts:63-83` — Verifies retrieval of current branch name returns correct branch and sets `isDetached` to false.
- **mockExecSync** `git-integration.test.ts:64-72` — Mock configuration for `git symbolic-ref --short HEAD` returning branch name.
- **mockExecSync** `git-integration.test.ts:74-82` — Secondary mock for subsequent commit hash retrieval.
- **Error** `git-integration.test.ts:75-77` — Error validation during branch name retrieval.
- **git** `git-integration.test.ts:81-81` — GitIntegration instance used in branch name test.
- **it (detached HEAD)** `git-integration.test.ts:85-105` — Tests handling of detached HEAD state and validates error when detached heads are disallowed.
- **mockExecSync** `git-integration.test.ts:86-93` — Mock configuration simulating detached HEAD detection via symbolic-ref failure.
- **mockExecSync** `git-integration.test.ts:95-104` — Fallback mock for commit hash retrieval when in detached HEAD state.
- **Error** `git-integration.test.ts:96-98` — Expected error condition when `allowDetachedHead` is false and HEAD is detached.

## Commit Hash Tests

- **it (commit hash)** `git-integration.test.ts:107-164` — Verifies retrieval of current commit hash from repository HEAD.
- **mockExecSync** `git-integration.test.ts:108-120` — Mock configuration for `git rev-parse HEAD` command returning commit hash.
- **mockExecSync** `git-integration.test.ts:122-133` — Secondary mock for branch information retrieval during hash lookup.
- **Error** `git-integration.test.ts:126-128` — Error handling validation during hash retrieval.
- **mockExecSync** `git-integration.test.ts:135-145` — Additional mock handling multiple sequential git commands in hash lookup chain.
- **mockExecSync** `git-integration.test.ts:147-163` — Final mock in command chain for complete commit hash resolution.
- **Error** `git-integration.test.ts:153-155` — Error validation for failed commit hash retrieval.
- **git** `git-integration.test.ts:158-158` — GitIntegration instance for commit hash operations.

## File Changes Detection Tests

- **it (file changes)** `git-integration.test.ts:166-242` — Tests detection and categorization of staged, unstaged, untracked, deleted, renamed, and newly added file changes.
- **mockExecSync** `git-integration.test.ts:167-178` — Mock for `git status --porcelain=v2` showing staged file modifications.
- **mockExecSync** `git-integration.test.ts:180-191` — Mock for unstaged file changes output.
- **mockExecSync** `git-integration.test.ts:193-204` — Mock for untracked files detection.
- **mockExecSync** `git-integration.test.ts:206-218` — Mock for deleted files listing.
- **mockExecSync** `git-integration.test.ts:220-230` — Mock for renamed files detection.
- **mockExecSync** `git-integration.test.ts:232-241` — Mock for newly added files output.
- **Error** `git-integration.test.ts:233-235` — Error condition validation during file changes retrieval.
- **changes** `git-integration.test.ts:171-171` — Variable storing detected file changes from initial git status call.
- **git** `git-integration.test.ts:170-170` — GitIntegration instance for file changes categorization.

## Design Patterns

The test suite employs **Mock Injection** via Bun's spy utilities to isolate `GitIntegration` from actual filesystem and child process operations. Each test configures sequential mocks to simulate realistic git command outputs, enabling deterministic assertions without external dependencies. This approach ensures tests run in milliseconds while capturing edge cases (detached HEAD, file deletions, renames) and error conditions that would be difficult to reproduce with actual repositories.