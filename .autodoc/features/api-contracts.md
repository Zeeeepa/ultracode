# API Contract Analysis (Protobuf, GraphQL, Swagger)

**Language**: [EN] | [RU](./api-contracts_ru.md)

---

Tools for understanding how API contract specs (Swagger/OpenAPI, Protobuf/gRPC, GraphQL) relate to code — servers, resolvers, generated clients, and type definitions. Automatically detects API contract boundaries and warns about breaking changes.

---

## How It Works

When your project contains `.proto`, `.graphql`/`.gql`, or Swagger JSON files, UltraCode automatically:

1. **Parses API specs** into graph entities with type-specific markers
2. **Links specs to code** — connects servers/resolvers (producers), clients/hooks (consumers), and generated types to their spec origins
3. **Detects active contracts** — multi-signal scoring determines which specs are actually used
4. **Annotates API boundaries** in trace results and impact analysis

### Supported Ecosystems

#### Protobuf / gRPC

| Role | Frameworks / Tools |
|------|-------------------|
| **gRPC Servers** | @grpc/grpc-js, grpc-go, grpc-java, grpc-dotnet, tonic (Rust) |
| **Code Generators** | protoc, protobuf-ts, grpc-tools, buf, ts-proto |

**Parsed entities:**
- Services and RPCs (unary, server/client/bidirectional streaming)
- Messages (nested, oneof, map fields)
- Enums with values
- Packages
- HTTP annotations (`google.api.http`)

#### GraphQL

| Role | Frameworks / Tools |
|------|-------------------|
| **Servers** | Apollo Server, type-graphql, Nexus, Pothos, graphql-yoga, Ariadne, Strawberry, gqlgen |
| **Clients** | Apollo Client, urql, graphql-request, relay |
| **Code Generators** | graphql-codegen, graphql-code-generator, genql |

**Parsed entities:**
- Types, interfaces, inputs, enums, unions, scalars
- Directives (including `@auth`, `@deprecated`, `@cacheControl`)
- Query, Mutation, Subscription root types
- Field arguments with types
- `extend type` declarations

### New Relationship Types

| Relationship | Direction | Meaning |
|-------------|-----------|---------|
| `produces_api` | Server/Resolver → Spec entity | Implementation serves this API |
| `consumes_api` | Client/Hook → Spec entity | Client calls this API |
| `generated_from` | Generated type → Spec entity | Code was generated from this spec |

---

## analyze_api_impact

Unified impact analysis across all API contract types. Auto-detects contract type or filter explicitly.

### Parameters

| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| `contractType` | enum | no | `swagger`, `protobuf`, `graphql`, or `auto` (default: `auto`) |
| `specFile` | string | no | Path to spec file (auto-detected if omitted) |
| `schemaName` | string | no | Specific schema/message/type name to analyze |
| `endpointPath` | string | no | Specific endpoint like `GET /api/users` or rpc name |
| `projectPath` | string | no | Project directory path |

### Returns

```typescript
{
  contracts: Array<{
    type: "swagger" | "protobuf" | "graphql";
    filePath: string;
    isActive: boolean;
    usageConfidence: number;
    entitiesFound: number;
  }>;
  affectedEntities: Array<{
    entityId: string;
    name: string;
    filePath: string;
    role: "producer" | "consumer" | "generated_type";
    relationship: "produces_api" | "consumes_api" | "generated_from";
    contractType: "swagger" | "protobuf" | "graphql";
  }>;
  breakingChangeRisk: "low" | "medium" | "high";
  summary: string;
}
```

### Examples

**Full API impact across all contract types:**
```
analyze_api_impact()
```

**Protobuf-only impact:**
```
analyze_api_impact({
  contractType: "protobuf",
  schemaName: "UserService"
})
```

**GraphQL type impact:**
```
analyze_api_impact({
  contractType: "graphql",
  schemaName: "User"
})
```

**Specific endpoint:**
```
analyze_api_impact({
  endpointPath: "GetUser"
})
```

---

## Enhancements to Existing Tools

### taint_analysis — missing_auth Category

The `missing_auth` taint category detects API endpoints (REST controllers, gRPC handlers, GraphQL resolvers) that reach sensitive operations (database writes, file access, external calls) without passing through authorization checks.

```ts
taint_analysis({ category: "missing_auth" })
```

See [security.md](security.md) for full details.

### trace_flow / trace_backwards — API Boundary Annotations

Trace steps that pass through any API contract entity (Swagger, Protobuf, or GraphQL) are annotated:

```typescript
{
  crossesApiContract: true,
  contractInfo: {
    type: "protobuf" | "graphql" | "swagger",
    swaggerType?: "endpoint" | "schema",
    endpoint?: string,
    schemaName?: string
  }
}
```

---

## Usage Detection

UltraCode determines which API spec files are "actively used" via multi-signal scoring:

| Signal | Weight | Method |
|--------|--------|--------|
| Code imports from generated paths | 0.4 | Analyzes `IMPORTS` relationships in graph |
| package.json/build config has codegen script | 0.3 | Checks for protoc, graphql-codegen, etc. |
| Codegen config file exists | 0.2 | Looks for `buf.yaml`, `codegen.yml`, etc. |
| Generated files with markers | 0.1 | Checks auto-generated markers |

A spec file is considered **active** when score >= 0.3.

---

## Zero Overhead for Non-API Projects

All API-related processing is lazy-loaded and gated behind checks for spec entities in the graph. Projects without API spec files have **zero performance overhead**.
