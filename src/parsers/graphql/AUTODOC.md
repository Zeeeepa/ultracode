# Graphql

Parses GraphQL schemas and links to resolver implementations and generated code

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `analyzeGraphQLCodeLinks` | function | Analyzes links between GraphQL schemas and implementation code | [→ graphql-code-linker.ts:113-168] |
| `buildGraphQLRelationships` | function | Constructs relationship graphs from GraphQL schema definitions | [→ graphql-code-linker.ts:173-225] |
| `getGraphQLCodegenConfigFiles` | function | Returns detected GraphQL code generation configuration files | [→ graphql-code-linker.ts:452-454] |
| `getGraphQLGeneratedCodeMarkers` | function | Returns markers found in generated GraphQL output files | [→ graphql-code-linker.ts:452-454] |
| `GraphQLAnalysis` | interface | Interface containing complete GraphQL analysis results for project | [→ types.ts:33-44] |
| `GraphQLArg` | interface | Interface defining GraphQL field argument with type information | [→ types.ts:67-71] |
| `GraphQLCodeLink` | interface | Interface representing link between GraphQL entity and code entity | [→ types.ts:13-28] |
| `GraphQLFieldDef` | interface | Interface defining GraphQL field including type arguments description | [→ types.ts:76-83] |
| `GraphQLRelationship` | interface | Interface for GraphQL relationship in graph storage system | [→ types.ts:49-62] |
| `GraphQLSchemaParser` | class | Parser class for .graphql/.gql schema files extracting entities | [→ graphql-parser.ts:49] |

## Files

- **graphql-code-linker.ts** — Analyzes relationships between GraphQL schemas and source code
- **graphql-parser.ts** — Text-based parser extracting GraphQL schema entities and definitions
- **index.ts** — Re-exports GraphQL parsing and linking module functionality
- **types.ts** — Type definitions for GraphQL code linking and analysis
