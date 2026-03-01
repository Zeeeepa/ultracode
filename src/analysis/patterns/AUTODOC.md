# Patterns

Two-stage pipeline system for detecting code patterns through structural analysis and semantic validation.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CustomDetectorFn` | type | Type for custom detector function signature | [→ types.ts:174] |
| `CustomDetectorResult` | interface | Interface for custom detector function result | [→ types.ts:168-172] |
| `ExemplarStore` | class | Loads curated code examples with lazy embedding caching | [→ exemplar-store.ts:36-228] |
| `PatternCategory` | type | Union type for pattern categories and classifications | [→ types.ts:9] |
| `PatternDefinition` | interface | Interface for complete pattern rule definition | [→ types.ts:74-102] |
| `PatternEngine` | class | Orchestrates structural detection and semantic validation pipeline | [→ pattern-engine.ts:40-48] |
| `PatternExemplar` | interface | Interface for curated code example with metadata | [→ types.ts:106-112] |
| `PatternFormatter` | class | Formats scan results as summary, detailed, or JSON | [→ pattern-formatter.ts:7-154] |
| `PatternMatch` | interface | Interface for detected pattern match result | [→ types.ts:116-130] |
| `PatternRegistry` | class | Indexes pattern definitions by language for efficient lookup | [→ pattern-registry.ts:92-203] |
| `PatternScanOptions` | interface | Interface for scan configuration and filtering options | [→ types.ts:152-164] |
| `PatternScanResult` | interface | Interface for complete scan results with summary | [→ types.ts:134-148] |
| `PatternSeverity` | type | Union type for severity levels critical to info | [→ types.ts:11] |
| `registerDetector` | function | Registers single custom detector function for patterns | [→ structural-detector.ts:23-27] |
| `registerDetectors` | function | Registers multiple detectors from module exports | [→ structural-detector.ts:37-49] |
| `RelationshipCriteria` | interface | Interface for graph relationship matching requirements | [→ types.ts:9-9] |
| `SemanticValidator` | class | Validates candidates using embedding similarity comparison | [→ semantic-validator.ts:16-145] |
| `StructuralCandidate` | interface | Interface for pattern candidate before validation | [→ types.ts:168-172] |
| `StructuralCriteria` | interface | Interface for structural pattern matching requirements | [→ types.ts:24-70] |
| `StructuralDetector` | class | Detects patterns using metadata and graph criteria | [→ structural-detector.ts:43-558] |

## Files

- **exemplar-store.ts** — Loads and caches curated code example embeddings
- **index.ts** — Public API exports for pattern detection system
- **pattern-engine.ts** — Orchestrates structural detection and semantic validation
- **pattern-formatter.ts** — Formats scan results as summary, detailed, JSON
- **pattern-registry.ts** — Indexes pattern definitions by language from YAML
- **semantic-validator.ts** — Validates candidates using embedding similarity scoring
- **structural-detector.ts** — Detects patterns using metadata and graph criteria
- **types.ts** — Type definitions for pattern detection system
