# src/merge/__tests__

## Overview

This test suite validates the semantic merge and conflict resolution system through comprehensive unit tests covering AI-powered conflict resolution, conflict detection, core resolution logic, and intent classification. Tests establish correctness for merging code units with semantic awareness, handling conflicts at multiple abstraction levels (syntactic, semantic, and intent-based), and ensuring deterministic outcomes through mock embeddings and factory helpers. The suite uses helper factories to reduce boilerplate, enables rapid iteration on merge strategies, and covers conflict patterns across parallel additions, modifications, deletions, and nested structures.

## Flow

```
Test Execution Flow
├─ Test Infrastructure Setup
│  ├─ MockEmbeddingGenerator
│  │  └─ Deterministic embeddings → Enable reproducible semantic testing
│  └─ Test Factories (createCodeUnit overrides)
│     └─ Reusable test fixtures → Reduce boilerplate
├─ Conflict Detection Tests
│  ├─ Input: Base + Modified CodeUnits
│  ├─ Process: Intent classification → Conflict detection
│  └─ Output: ConflictDetector results
├─ AI Conflict Resolver Tests
│  ├─ Input: SemanticConflict + competing units
│  ├─ Process: Semantic embedding analysis → Strategy selection
│  └─ Output: Resolution recommendations
├─ Conflict Resolver Tests
│  ├─ Input: SemanticConflict + resolution strategies
│  ├─ Process: Strategy evaluation → Merged code selection
│  └─ Output: Resolved merged output
└─ Intent Classification Tests
   ├─ Input: Base + Changed CodeUnits
   ├─ Process: Change intent analysis
   └─ Output: Classified intent type
```

## Entity Listing

### Mock Infrastructure

- **MockEmbeddingGenerator** `ai-conflict-resolver.test.ts:12-47` — Provides deterministic embeddings for semantic conflict testing without external AI dependencies, using content-based hashing for reproducible test results.
- **generateEmbedding** `ai-conflict-resolver.test.ts:13-43` — Creates Float32Array embeddings from text by computing character-based hash, populating dimensions, and normalizing vectors to unit length.
- **initialize** `ai-conflict-resolver.test.ts:45-45` — No-op initialization method for mock generator compatibility with EmbeddingGenerator interface.
- **setBatchSize** `ai-conflict-resolver.test.ts:46-46` — No-op batch size configuration method for mock generator interface compatibility.

### Test Factories & Helpers

- **createCodeUnit** `ai-conflict-resolver.test.ts:49-287` — Factory function producing CodeUnit test fixtures with configurable type, identifier, content, and nested child structures for reuse across test scenarios.
- **createCodeUnit** `intent-classifier.test.ts:9-24` — Factory for creating CodeUnit test objects with type and identifier properties for intent classification testing.
- **overrides helper** `ai-conflict-resolver.test.ts:50-65` — Applies property overrides to base CodeUnit test objects, enabling flexible test fixture construction without mutation.
- **overrides helper (SemanticConflict)** `ai-conflict-resolver.test.ts:67-78` — Applies property overrides to SemanticConflict test fixtures for resolver and AI resolver testing.
- **overrides helper** `conflict-detector.test.ts:11-27` — Applies modifications to base CodeUnit objects for detector-specific test scenarios and assertions.
- **overrides helper** `conflict-resolver.test.ts:20-35` — Applies modifications to base CodeUnit fixtures for conflict resolver test cases and validation.
- **overrides helper (SemanticConflict)** `conflict-resolver.test.ts:44-55` — Applies property overrides to SemanticConflict objects for resolution strategy testing.
- **overrides helper** `intent-classifier.test.ts:9-24` — Applies property modifications to CodeUnit test fixtures for intent classification test validation.

### AI Conflict Resolver Test Suite

- **AIConflictResolver tests** `ai-conflict-resolver.test.ts:80-202` — Main test group covering semantic conflict resolution with AI embedding analysis across six distinct conflict patterns and resolution scenarios.
- **Addition vs. Addition conflict** `ai-conflict-resolver.test.ts:81-102` — Test case validating AI resolution of parallel code unit additions using semantic embeddings to evaluate similarity and choose best variant.
- **Modification vs. Modification conflict** `ai-conflict-resolver.test.ts:104-128` — Test case validating AI resolution of competing modifications through embedding similarity analysis and contextual evaluation.
- **Deletion vs. Modification conflict** `ai-conflict-resolver.test.ts:130-151` — Test case validating AI resolution when one branch deletes a unit while another modifies it, choosing appropriate strategy.
- **Nested conflict resolution** `ai-conflict-resolver.test.ts:153-177` — Test case validating AI resolution of conflicts within nested code unit hierarchies and child element changes.
- **Cross-unit semantic conflicts** `ai-conflict-resolver.test.ts:179-201` — Test case validating AI resolution of conflicts spanning multiple related code units with semantic interdependencies.
- **Batch resolution** `ai-conflict-resolver.test.ts:204-233` — Test group for AIConflictResolver batch processing functionality covering multiple conflicts in single operation.
- **Multiple conflict batch** `ai-conflict-resolver.test.ts:205-232` — Test case validating resolution of multiple distinct conflicts simultaneously using batch resolution API.
- **Fallback resolution strategies** `ai-conflict-resolver.test.ts:235-286` — Test group for heuristic-based resolution when semantic embedding analysis is inconclusive or produces tied evaluations.
- **High similarity tie-breaking** `ai-conflict-resolver.test.ts:236-261` — Test case validating heuristic resolution strategy when embeddings indicate high similarity between competing options.
- **Contextual metadata fallback** `ai-conflict-resolver.test.ts:263-285` — Test case validating fallback tie-breaking resolution using contextual metadata and change intent information when semantic signals are ambiguous.

### Conflict Detector Test Suite

- **ConflictDetector tests** `conflict-detector.test.ts:8-152` — Main test group validating detection and classification of various conflict types and change intents across different modification patterns.
- **ChangeIntentType helper** `conflict-detector.test.ts:29-34` — Helper definition enumerating supported change intent types (addition, modification, deletion, replacement) for detector test scenarios.
- **Addition conflict detection** `conflict-detector.test.ts:36-45` — Test case validating conflict detection when new code units are added to branches with modifications to base structure.
- **Modification conflict detection** `conflict-detector.test.ts:47-69` — Test case validating detection when the same code units are modified independently in different branches from identical base state.
- **Deletion conflict detection** `conflict-detector.test.ts:71-83` — Test case validating detection when code units are deleted from one branch after being modified in the base or another branch.
- **Replacement conflict detection** `conflict-detector.test.ts:85-97` — Test case validating detection when code units are completely replaced with different content or structure.
- **Nested modification conflict** `conflict-detector.test.ts:99-115` — Test case validating conflict detection within hierarchical code unit structures where nested children are independently modified.

### Conflict Resolver Test Suite

- **ConflictResolver tests** `conflict-resolver.test.ts:12-156` — Main test group validating conflict resolution through strategy selection and application to produce merged output.
- **Resolution strategy selection** `conflict-resolver.test.ts:13-45` — Test case validating that ConflictResolver correctly selects appropriate strategy based on conflict type and severity.
- **Merged output generation** `conflict-resolver.test.ts:47-78` — Test case validating that resolver produces correct merged CodeUnit output after applying selected resolution strategy.
- **Multiple strategy fallback** `conflict-resolver.test.ts:80-110` — Test case validating fallback behavior when primary strategy fails or is incompatible with conflict characteristics.
- **Preservation of metadata** `conflict-resolver.test.ts:112-140` — Test case validating that resolved output preserves important metadata, identifiers, and non-conflicting properties.

### Intent Classifier Test Suite

- **IntentClassifier tests** `intent-classifier.test.ts:1-89` — Main test group validating classification of change intents (addition, modification, deletion, replacement) from base and changed code unit pairs.
- **Addition intent classification** `intent-classifier.test.ts:26-39` — Test case validating correct identification of new code unit additions by presence in changed units absent from base.
- **Modification intent classification** `intent-classifier.test.ts:41-54` — Test case validating correct identification of code unit modifications by detecting structural or content changes from base to changed versions.
- **Deletion intent classification** `intent-classifier.test.ts:56-69` — Test case validating correct identification of code unit deletions by presence in base absent from changed version.
- **Replacement intent classification** `intent-classifier.test.ts:71-84` — Test case validating correct identification of complete code unit replacement through structural transformation detection.


### Added Entities

- **content** — `diff3.test.ts:6-6`
- **result** — `diff3.test.ts:7-7`
- **base** — `diff3.test.ts:15-15`
- **branchA** — `diff3.test.ts:16-16`
- **branchB** — `diff3.test.ts:17-17`
- **result** — `diff3.test.ts:19-19`
- **base** — `diff3.test.ts:26-26`
- **branchA** — `diff3.test.ts:27-27`
- **branchB** — `diff3.test.ts:28-28`
- **result** — `diff3.test.ts:30-30`
- **base** — `diff3.test.ts:37-37`
- **branchA** — `diff3.test.ts:38-38`
- **branchB** — `diff3.test.ts:39-39`
- **result** — `diff3.test.ts:41-41`
- **base** — `diff3.test.ts:48-48`
- **branchA** — `diff3.test.ts:49-49`
- **branchB** — `diff3.test.ts:50-50`
- **result** — `diff3.test.ts:52-52`
- **base** — `diff3.test.ts:59-59`
- **branchA** — `diff3.test.ts:60-60`
- **branchB** — `diff3.test.ts:61-61`
- **result** — `diff3.test.ts:63-63`
- **base** — `diff3.test.ts:75-75`
- **branchA** — `diff3.test.ts:76-76`
- **branchB** — `diff3.test.ts:77-77`
- **result** — `diff3.test.ts:79-79`
- **base** — `diff3.test.ts:86-86`
- **branchA** — `diff3.test.ts:87-87`
- **branchB** — `diff3.test.ts:88-88`
- **result** — `diff3.test.ts:90-90`
- **base** — `diff3.test.ts:96-96`
- **branchA** — `diff3.test.ts:97-97`
- **branchB** — `diff3.test.ts:98-98`
- **result** — `diff3.test.ts:100-104`
- **result** — `diff3.test.ts:112-112`
- **result** — `diff3.test.ts:119-119`
- **result** — `diff3.test.ts:126-126`
- **prefix** — `diff3.test.ts:134-134`
- **suffix** — `diff3.test.ts:135-135`
- **base** — `diff3.test.ts:136-136`
- **branchA** — `diff3.test.ts:137-137`
- **branchB** — `diff3.test.ts:138-138`
- **result** — `diff3.test.ts:140-140`
- **base** — `diff3.test.ts:150-150`
- **branchA** — `diff3.test.ts:151-151`
- **branchB** — `diff3.test.ts:152-152`
- **result** — `diff3.test.ts:154-154`
- **base** — `diff3.test.ts:162-162`
- **branchA** — `diff3.test.ts:163-163`
- **branchB** — `diff3.test.ts:164-164`
- **result** — `diff3.test.ts:166-166`
- **base** — `diff3.test.ts:173-173`
- **branchA** — `diff3.test.ts:174-174`
- **branchB** — `diff3.test.ts:175-175`
- **result** — `diff3.test.ts:177-177`
- **types** — `diff3.test.ts:179-179`
- **base** — `diff3.test.ts:186-186`
- **branchA** — `diff3.test.ts:187-187`
- **branchB** — `diff3.test.ts:188-188`
- **result** — `diff3.test.ts:190-190`
- **base** — `diff3.test.ts:203-211`
- **branchA** — `diff3.test.ts:213-222`
- **branchB** — `diff3.test.ts:224-236`
- **result** — `diff3.test.ts:238-238`
- **base** — `diff3.test.ts:246-258`
- **branchA** — `diff3.test.ts:261-277`
- **branchB** — `diff3.test.ts:280-296`
- **result** — `diff3.test.ts:298-298`
- **base** — `diff3.test.ts:306-311`
- **branchA** — `diff3.test.ts:314-321`
- **branchB** — `diff3.test.ts:324-331`
- **result** — `diff3.test.ts:333-336`
- **base** — `diff3.test.ts:348-359`
- **branchA** — `diff3.test.ts:362-374`
- **branchB** — `diff3.test.ts:377-389`
- **result** — `diff3.test.ts:391-391`
- **base** — `diff3.test.ts:399-410`
- **branchA** — `diff3.test.ts:413-419`
- **branchB** — `diff3.test.ts:422-437`
- **result** — `diff3.test.ts:439-439`
- **base** — `diff3.test.ts:449-456`
- **branchA** — `diff3.test.ts:459-468`
- **branchB** — `diff3.test.ts:471-478`
- **result** — `diff3.test.ts:480-480`
- **base** — `diff3.test.ts:487-487`
- **formatted** — `diff3.test.ts:489-489`
- **result** — `diff3.test.ts:492-492`

## Dependencies

**Internal Dependencies:**
- `AIConflictResolver` — Semantic conflict resolution engine being tested
- `ConflictDetector` — Conflict detection and intent classification logic
- `ConflictResolver` — Core resolution strategy application
- `IntentClassifier` — Change intent analysis from code unit pairs
- `CodeUnit`, `SemanticConflict` — Domain models for test fixtures

**Test Framework:**
- `bun:test` — Test runner providing `describe`, `it`, `expect`, `spyOn` utilities