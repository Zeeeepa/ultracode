---
module_name: analysis
description: "Conflict detection and change intent classification for semantic merge"
status: active
language: typescript
---

# Analysis

> Detects merge conflicts between code units from different branches and classifies the intent behind each change (bug fix, refactoring, feature addition, or API change).

## Overview

The analysis module provides two core capabilities for the semantic merge pipeline. ConflictDetector analyzes pairs of code units from two branches to identify overlapping changes, API-breaking modifications, and incompatible intents, assigning severity levels and auto-resolvability flags. IntentClassifier uses heuristic pattern matching to determine why code was changed, collecting evidence such as added try-catch blocks, null checks, renamed variables, or signature changes to classify each modification.

## Data Flow

- **Inputs**: Base, branchA, and branchB CodeUnit objects with optional ChangeIntent metadata.
- **Processing**: ConflictDetector compares content hashes, signatures, and FQNs across branches; IntentClassifier collects evidence from code patterns to determine change type.
- **Outputs**: SemanticConflict objects with severity and auto-resolve flags; ChangeIntent objects with type, confidence, and evidence arrays.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ConflictDetector` | class | Detects conflicts between branch code units with severity classification | [`conflict-detector.ts:19-251`](./conflict-detector.ts) |
| `IntentClassifier` | class | Classifies change intents using heuristic evidence collection | [`intent-classifier.ts:23-245`](./intent-classifier.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `merge/models` | CodeUnit, SemanticConflict, ChangeIntent, and related types |

### External Packages

| Package | Purpose |
|---------|---------|
| (none) | No external dependencies |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Intent compatibility | Uses a compatibility matrix (BugFix+Refactoring compatible, APIChange incompatible with all) |
| Severity classification | Based on normalized length difference ratio between base and branch content |
| Auto-resolve threshold | Only Low severity with compatible intents qualifies for auto-resolution |

## Error Handling

The module does not throw exceptions. If evidence is insufficient for classification, IntentClassifier returns an Unknown intent with zero confidence. ConflictDetector returns null when no conflict is detected.

## Known Limitations

- Difference computation uses simplified length-based metric rather than true Levenshtein or diff-based analysis.
- Intent classification relies on regex heuristics and may misclassify complex refactorings.
- No cross-file conflict detection (operates on individual CodeUnit pairs only).

## Exports

- `ConflictDetector`
- `IntentClassifier`

## Files

| File | Description |
|------|-------------|
| `conflict-detector.ts` | Detects overlapping, API-breaking, and intent-incompatible conflicts between branch code units |
| `index.ts` | Re-exports ConflictDetector and IntentClassifier |
| `intent-classifier.ts` | Classifies changes as BugFix, Refactoring, FeatureAddition, or APIChange using pattern evidence |
