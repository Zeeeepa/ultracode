# Protobuf

Analyzes .proto files and links protobuf services to source code implementations.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `analyzeProtobufCodeLinks` | function | Analyzes links between protobuf and source code | [→ protobuf-code-linker.ts:96-137] |
| `buildProtobufRelationships` | function | Constructs graph relationships from protobuf analysis | [→ protobuf-code-linker.ts:142-194] |
| `getProtobufCodegenConfigFiles` | function | Identifies protobuf code generation configuration files | [→ protobuf-code-linker.ts:413-415] |
| `getProtobufGeneratedCodeMarkers` | function | Detects markers in generated protobuf code files | [→ protobuf-code-linker.ts:413-415] |
| `ProtobufAnalysis` | interface | Result containing producers, consumers, and generated types | [→ types.ts:33-44] |
| `ProtobufCodeLink` | interface | Links protobuf entity to corresponding code implementation | [→ types.ts:13-28] |
| `ProtobufParser` | class | Text-based parser extracting entities from .proto files | [→ protobuf-parser.ts:37-37] |
| `ProtobufRelationship` | interface | Graph storage relationship for protobuf definitions | [→ types.ts:49-63] |
| `ProtoEnumValue` | interface | Value definition within protobuf enum type | [→ types.ts:80-85] |
| `ProtoField` | interface | Field definition within protobuf message type | [→ types.ts:68-77] |

## Files

- **index.ts** — Main module file with exports
- **protobuf-code-linker.ts** — Links protobuf definitions to source code implementations
- **protobuf-parser.ts** — Parses .proto files for services and messages
- **types.ts** — Type definitions for protobuf code linking
