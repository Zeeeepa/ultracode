# GitIntegration Test Suite

## Overview

This test module validates the `GitIntegration` class, which manages core git repository operations including branch state detection, commit hash retrieval, and file change categorization. The suite verifies constructor validation, branch operations, commit lookups, detection of staged/unstaged/untracked files, diff statistics, and branch listing with comprehensive error handling. Tests use Bun's testing framework with spied `fs.existsSync` and `childProcess.execSync` to isolate git command execution without invoking actual git operations.

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
    ├─ Constructor validation tests
    ├─ Branch state detection tests
    ├─ Commit hash resolution tests
    ├─ File change categorization tests
    └─ Diff statistics & branch listing
    ↓
Mock Verification → Assertions → Test Results
```

## Test Infrastructure

- **config** `git-integration.test.ts:7-7` — Test configuration object specifying repository path, detached head allowance, and error recovery behavior.
- **mockExecSync** `git-integration.test.ts:8-8` — Spy on `childProcess.execSync` to intercept and mock git command execution without invoking actual processes.
- **mockExistsSync** `git-integration.test.ts:9-9` — Spy on `fs.existsSync` to mock filesystem checks for git repository validation.

## Constructor Validation Tests

- **config (describe)** `git-integration.test.ts:6-359` — Test suite container for all GitIntegration validation and operation tests.
- **it (valid repository)** `git-integration.test.ts:23-33` — Verifies GitIntegration initializes successfully when repository path contains valid `.git` directory.
- **git** `git-integration.test.ts:25-25` — GitIntegration instance created during valid repository initialization test.
- **mockExistsSync** `git-integration.test.ts:29-32` — Mock configuration ensuring `.git` directory check returns true during constructor validation.
- **it (invalid repository)** `git-integration.test.ts:35-61` — Verifies constructor throws error when repository path does not contain `.git` directory.
- **mockExecSync** `git-integration.test.ts:36-45` — Mock simulating `git rev-parse --git-dir` command success during initialization attempt.
- **mockExecSync** `git-integration.test.ts:47-60` — Secondary mock handling git command calls after failed directory validation.

## Branch State Detection Tests

- **it (regular branch)** `git-integration.test.ts:63-83` — Verifies retrieval of current branch name returns correct branch and sets `isDetached` flag to false.
- **mockExecSync** `git-integration.test.ts:64-72` — Mock configuration for `git symbolic-ref --short HEAD` returning branch name during regular branch detection.
- **mockExecSync** `git-integration.test.ts:74-82` — Secondary mock for subsequent commit hash retrieval operation.
- **it (detached HEAD)** `git-integration.test.ts:85-105` — Tests handling of detached HEAD state and validates error when detached heads are disallowed by configuration.
- **mockExecSync** `git-integration.test.ts:86-93` — Mock configuration simulating detached HEAD detection via symbolic-ref command failure.
- **mockExecSync** `git-integration.test.ts:95-104` — Fallback mock for commit hash retrieval when HEAD is in detached state.

## Commit Hash Resolution Tests

- **it (commit hash)** `git-integration.test.ts:107-164` — Verifies retrieval of current commit hash from repository HEAD and validates proper error handling.
- **mockExecSync** `git-integration.test.ts:108-120` — Mock configuration for `git rev-parse HEAD` command returning commit hash.
- **mockExecSync** `git-integration.test.ts:122-133` — Secondary mock for branch information retrieval during hash lookup operation.
- **mockExecSync** `git-integration.test.ts:135-145` — Additional mock handling multiple sequential git commands in hash lookup chain.
- **mockExecSync** `git-integration.test.ts:147-163` — Final mock in command sequence for complete commit hash resolution.

## File Change Categorization Tests

- **it (file changes)** `git-integration.test.ts:166-242` — Tests detection and categorization of staged, unstaged, untracked, deleted, renamed, and newly added file changes.
- **mockExecSync** `git-integration.test.ts:167-178` — Mock for `git status --porcelain=v2` command output showing staged file modifications.
- **mockExecSync** `git-integration.test.ts:180-191` — Mock for unstaged file changes output during file status detection.
- **mockExecSync** `git-integration.test.ts:193-204` — Mock for untracked files detection via git status porcelain format.
- **mockExecSync** `git-integration.test.ts:206-218` — Mock for deleted files listing in working directory.
- **mockExecSync** `git-integration.test.ts:220-230` — Mock for renamed files detection and tracking.
- **mockExecSync** `git-integration.test.ts:232-241` — Mock for newly added files output.
- **changes** `git-integration.test.ts:171-171` — Variable storing detected file changes from git status porcelain query.

## Testing Strategy

The suite employs **Mock Injection** via Bun's spy utilities to isolate `GitIntegration` from actual filesystem and child process operations. Sequential mocks simulate realistic git command outputs, enabling deterministic assertions without external dependencies. Each test configures return values and error conditions to validate both successful operations and error handling paths, ensuring tests execute in milliseconds while capturing complete edge case coverage.