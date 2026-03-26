# external-tools/wasm/diff-simd/src

## Overview

This WASM module provides high-performance diff computation for comparing code strings using the Myers algorithm with SIMD optimization potential. It exposes a single public function `compute_diff_simd` that takes two code strings and returns their differences in unified diff format. The module is designed to run in WebAssembly environments where performance and efficiency are critical, splitting the diffing pipeline into specialized stages: line extraction, LCS computation via Myers algorithm, operation reconstruction via backtracking, and finally formatting into a standard unified diff output.

## Flow

```
Input: old_code, new_code (strings)
        ↓
    [Split into lines]
        ↓
    [Myers Diff Algorithm] → compute LCS & trace
        ↓
    [Backtrack] → reconstruct diff operations
        ↓
    [Generate Unified Diff] → format as unified diff
        ↓
Output: unified diff string
```

## Entity Listing

### Public API

- **compute_diff_simd** (`lib.rs:10-19`) — WASM-exported function that computes the difference between two code strings using the Myers algorithm and returns a unified diff format string.

### Core Algorithm

- **myers_diff** (`lib.rs:25-70`) — Implements the Myers least-edit-distance algorithm to compute the longest common subsequence (LCS) between two line sequences, returning a vector of diff operations.
- **backtrack** (`lib.rs:73-112`) — Reconstructs the actual diff operations from the Myers algorithm trace by walking backward through the computed edit trace.
- **generate_unified_diff** (`lib.rs:143-187`) — Formats a sequence of diff operations into standard unified diff format with context lines and operation markers.

### Fallback / Alternative Diff

- **simple_diff** (`lib.rs:115-140`) — A simpler, less-optimized diff algorithm available as a fallback alternative to the Myers implementation.

### Types

- **DiffOp** (`lib.rs:191-195`) — Enumeration representing diff operations (likely including Context, Addition, Deletion, and similar diff line types).

### Tests

- **tests** (`lib.rs:198-231`) — Test module containing unit tests for diff functionality.
  - **test_simple_diff** (`lib.rs:202-210`) — Tests the basic diff computation between two code strings.
  - **test_insertion** (`lib.rs:213-220`) — Tests correct handling of line insertion scenarios.
  - **test_deletion** (`lib.rs:223-230`) — Tests correct handling of line deletion scenarios.

## Dependencies

- **wasm_bindgen** — Used to expose `compute_diff_simd` as a callable WASM function for JavaScript/WebAssembly interop.
- Internal algorithm dependencies: Myers algorithm uses iterative forward-pass trace collection and backtracking for operation reconstruction.