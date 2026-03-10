# Patterns

Pattern Detection System for analyzing code across multiple programming languages using structural metadata and semantic embeddings to identify anti-patterns, code smells, optimizations, and best practices.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CustomDetectorFn` | type | Type for custom detector function signature | [→ types.ts:169] |
| `CustomDetectorResult` | interface | Interface for custom detector function result | [→ types.ts:159-165] |
| `ExemplarStore` | class | Loads curated code examples with lazy embedding caching | [→ exemplar-store.ts:36-231] |
| `PatternCategory` | type | Union type for pattern categories and classifications | [→ types.ts:9] |
| `PatternDefinition` | interface | Interface for complete pattern rule definition | [→ types.ts:74-102] |
| `PatternEngine` | class | Orchestrates structural detection and semantic validation pipeline | [→ pattern-engine.ts:38-44] |
| `PatternExemplar` | interface | Interface for curated code example with metadata | [→ types.ts:102-132] |
| `PatternFormatter` | class | Formats scan results as summary, detailed, or JSON | [→ pattern-formatter.ts:7-166] |
| `PatternMatch` | interface | Interface for detected pattern match result | [→ types.ts:125-155] |
| `PatternRegistry` | class | Indexes pattern definitions by language for efficient lookup | [→ pattern-registry.ts:90-112] |
| `PatternScanOptions` | interface | Interface for scan configuration and filtering options | [→ types.ts:146-181] |
| `PatternScanResult` | interface | Interface for complete scan results with summary | [→ types.ts:134-169] |
| `PatternSeverity` | type | Union type for severity levels critical to info | [→ types.ts:11] |
| `registerDetector` | function | Registers single custom detector function for patterns | [→ structural-detector.ts:23-27] |
| `registerDetectors` | function | Registers multiple detectors from module exports | [→ structural-detector.ts:37-51] |
| `RelationshipCriteria` | interface | Interface for graph relationship matching requirements | [→ types.ts:9-9] |
| `SemanticValidator` | class | Validates candidates using embedding similarity comparison | [→ semantic-validator.ts:16-161] |
| `StructuralCandidate` | interface | Interface for pattern candidate before validation | [→ types.ts:159-165] |
| `StructuralCriteria` | interface | Interface for structural pattern matching requirements | [→ types.ts:24-121] |
| `StructuralDetector` | class | Detects patterns using metadata and graph criteria | [→ structural-detector.ts:37-51] |

## Files

- **exemplar-store.ts** — Loads and caches curated code example embeddings
- **index.ts** — Public API exports for pattern detection system
- **pattern-engine.ts** — Orchestrates structural detection and semantic validation
- **pattern-formatter.ts** — Formats scan results as summary, detailed, JSON
- **pattern-registry.ts** — Indexes pattern definitions by language from YAML
- **semantic-validator.ts** — Validates candidates using embedding similarity scoring
- **structural-detector.ts** — Detects patterns using metadata and graph criteria
- **types.ts** — Type definitions for pattern detection system
