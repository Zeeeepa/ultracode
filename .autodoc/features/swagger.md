# Swagger/OpenAPI Integration

**Language**: [EN] | [RU](./swagger_ru.md)

---

Tools for understanding how Swagger/OpenAPI specs relate to code — controllers, generated clients, and type definitions. Automatically detects API contract boundaries and warns about breaking changes.

---

## How It Works

When your project contains Swagger/OpenAPI JSON files, UltraCode automatically:

1. **Parses swagger specs** into graph entities with `metadata.swaggerType` markers (`api_spec`, `endpoint`, `schema`, `tag`)
2. **Links swagger to code** — connects controllers (producers), generated clients (consumers), and generated types to their swagger origins
3. **Detects active contracts** — multi-signal scoring determines which swagger files are actually used
4. **Annotates API boundaries** in trace results and impact analysis

### Supported Ecosystems

| Role | Frameworks / Tools |
|------|-------------------|
| **API Producers** | NestJS, Express/Fastify, Spring Boot, .NET (Swashbuckle, Microsoft.OpenApi) |
| **Code Generators** | openapi-generator-cli, NSwag, swagger-codegen, Autorest, Refitter, ng-openapi-gen |

### New Relationship Types

| Relationship | Direction | Meaning |
|-------------|-----------|---------|
| `produces_api` | Controller → Swagger endpoint | Controller method implements this API endpoint |
| `consumes_api` | Generated client → Swagger endpoint | Generated client calls this API endpoint |
| `generated_from` | Generated type → Swagger schema | TypeScript/C# type was generated from this schema |

---

## analyze_swagger_impact

Analyze the impact of Swagger/OpenAPI spec changes. Shows affected producers (controllers), consumers (generated clients), and generated types.

### Parameters

| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| `swaggerFile` | string | no | Path to swagger file (auto-detected if omitted) |
| `schemaName` | string | no | Specific schema name to analyze (e.g. `User`) |
| `endpointPath` | string | no | Specific endpoint (e.g. `GET /api/users`) |
| `projectPath` | string | no | Project directory path |

### Returns

```typescript
{
  swaggerFiles: Array<{
    filePath: string;
    isActive: boolean;
    usageConfidence: number;
  }>;
  affectedEntities: Array<{
    entityId: string;
    name: string;
    filePath: string;
    role: "producer" | "consumer" | "generated_type";
    relationship: "produces_api" | "consumes_api" | "generated_from";
  }>;
  breakingChangeRisk: "low" | "medium" | "high";
  summary: string;
}
```

### Examples

**Full swagger impact:**
```
analyze_swagger_impact()
```

**Impact of specific schema change:**
```
analyze_swagger_impact({
  schemaName: "User"
})
```

**Impact of endpoint change:**
```
analyze_swagger_impact({
  endpointPath: "GET /api/users"
})
```

---

## Enhancements to Existing Tools

### analyze_code_impact — Contract Impact

When an impacted entity has `produces_api`, `consumes_api`, or `generated_from` relationships, `analyze_code_impact` now includes a `contractImpact` section:

```typescript
{
  // ...existing fields...
  contractImpact: {
    affectsApiContract: true,
    affectedEndpoints: ["GET /api/users", "POST /api/users"],
    affectedSchemas: ["User", "CreateUserRequest"],
    breakingChangeRisk: "high",
    consumers: ["frontend-client"],
    warning: "Changes affect external API contract — consumers may break"
  }
}
```

### modify_code — Swagger Warnings

When modifying an entity linked to swagger, the response includes a `swaggerImpact` section:

```typescript
{
  // ...existing fields...
  swaggerImpact: {
    affectsContract: true,
    contractBreaks: [{
      rule: "controller-modified",
      change: "unknown",
      endpoint: "GET /api/users/{id}",
      message: "API contract may be affected"
    }],
    isGeneratedCode: false
  }
}
```

If modifying generated code, you'll see:
> "This file is generated from swagger — manual changes will be overwritten on next generation"

### trace_flow / trace_backwards — API Boundary Annotations

Trace steps that pass through swagger entities are annotated:

```typescript
{
  // ...existing step fields...
  crossesApiContract: true,
  contractInfo: {
    type: "swagger",
    swaggerType: "endpoint",
    endpoint: "GET /api/users",
    schemaName: undefined
  }
}
```

Path-level warning: `"Path crosses API contract boundary — changes may affect external consumers"`

### get_graph_health — Swagger Stale Detection

Health check now reports when generated code may be out of sync with swagger:

```typescript
{
  // ...existing fields...
  swaggerHealth: {
    swaggerFilesFound: 2,
    activeContracts: 1,
    staleWarnings: [
      "Generated code may be out of sync: swagger.json updated after src/generated/api-client.ts"
    ]
  }
}
```

---

## Usage Detection

UltraCode determines which swagger files are "actively used" via multi-signal scoring:

| Signal | Weight | Method |
|--------|--------|--------|
| Code imports from generated paths | 0.4 | Analyzes `IMPORTS` relationships in graph |
| package.json has codegen script | 0.3 | Checks for openapi-generator, nswag, etc. |
| Codegen config file exists | 0.2 | Looks for `nswag.json`, `openapitools.json`, etc. |
| Generated files with markers | 0.1 | Checks `/* auto-generated */` markers |

A swagger file is considered **active** when score >= 0.3.

Results are stored as `metadata.usageConfidence` and `metadata.isActiveContract` on swagger entities.

---

## Zero Overhead for Non-Swagger Projects

All swagger-related processing is lazy-loaded and gated behind checks for swagger entities in the graph. Projects without swagger files have **zero performance overhead**.
