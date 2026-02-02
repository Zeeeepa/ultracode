# Code Graph and Entities

🌐 **Language**: [EN] | [RU](./graph_ru.md)

---

Tools for working with the entity graph and their relationships.

---

## get_members

List of entities in a file — imports, functions, classes, variables, etc. Entry point for obtaining entity IDs before other operations.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `filePath` | string | yes | Path to file |
| `types` | string[] | no | Entity types to filter |
| `includePrivate` | boolean | no | Include private members |

### Entity Types

`function`, `class`, `interface`, `type`, `enum`, `variable`, `import`, `export`, `method`, `property`

### Returns

```typescript
{
  filePath: string;
  entities: Array<{
    entityId: string;
    name: string;
    type: string;
    line: number;
    endLine: number;
    exported: boolean;
    modifiers: string[];        // async, static, private, etc.
    signature?: string;         // For functions/methods
  }>;
  totalCount: number;
}
```

### Examples

**All file entities:**
```
get_members({ filePath: "src/services/auth.ts" })
```

**Only functions and classes:**
```
get_members({
  filePath: "src/services/auth.ts",
  types: ["function", "class"]
})
```

---

## list_entity_relationships

List of entity relationships — imports, calls, inheritance, implementations.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes* | Entity ID |
| `entityName` | string | yes* | Entity name (if no ID) |
| `filePath` | string | no | File path (to clarify name) |
| `direction` | string | no | Direction: `outgoing`, `incoming`, `both` |
| `relationshipTypes` | string[] | no | Relationship types to filter |

*Specify either `entityId` or `entityName`

### Relationship Types

`imports`, `calls`, `extends`, `implements`, `references`, `contains`, `uses`

### Returns

```typescript
{
  entity: { id: string; name: string; type: string; };
  relationships: Array<{
    type: string;
    direction: "outgoing" | "incoming";
    target: {
      entityId: string;
      name: string;
      filePath: string;
    };
    metadata?: object;
  }>;
  totalCount: number;
}
```

### Examples

**All outgoing relationships:**
```
list_entity_relationships({
  entityId: "src/services/auth.ts:AuthService"
})
```

**Who calls this function:**
```
list_entity_relationships({
  entityName: "validateEmail",
  filePath: "src/utils/validators.ts",
  direction: "incoming",
  relationshipTypes: ["calls"]
})
```

---

## get_graph

Get complete code graph or part of it.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `scope` | string | no | Scope: `file`, `module`, `project` |
| `filePath` | string | no | Path for scope=file/module |
| `depth` | number | no | Relationship depth |
| `format` | string | no | Format: `json`, `graphml`, `mermaid` |

### Returns

```typescript
{
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    filePath: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
  }>;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    scope: string;
  };
  mermaid?: string;
}
```

### Examples

**Module graph:**
```
get_graph({
  scope: "module",
  filePath: "src/services/",
  format: "mermaid"
})
```

---

## get_graph_stats

Graph statistics — entity count, relationships, coverage by types.

### Parameters

No parameters.

### Returns

```typescript
{
  entities: {
    total: number;
    byType: Record<string, number>;
    byLanguage: Record<string, number>;
  };
  relationships: {
    total: number;
    byType: Record<string, number>;
  };
  files: {
    total: number;
    indexed: number;
    byExtension: Record<string, number>;
  };
  lastUpdated: string;
}
```

### Examples

```
get_graph_stats()
```

---

## reset_graph

Complete graph cleanup — remove all entities, relationships and files. Use before full reindexing.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `confirm` | boolean | no | Confirm operation |

### Returns

```typescript
{
  success: boolean;
  deletedEntities: number;
  deletedRelationships: number;
  deletedFiles: number;
}
```

### Examples

```
reset_graph({ confirm: true })
```

---

## get_graph_health

Graph health diagnostics — integrity check, statistics, data samples.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `detailed` | boolean | no | Detailed diagnostics |
| `sampleSize` | number | no | Number of samples |

### Returns

```typescript
{
  healthy: boolean;
  issues: Array<{
    type: "orphan_entity" | "missing_file" | "broken_relationship";
    description: string;
    count: number;
  }>;
  statistics: {
    entities: number;
    relationships: number;
    files: number;
    vectors: number;
  };
  samples?: {
    entities: Array<{...}>;
    relationships: Array<{...}>;
  };
  databaseInfo: {
    path: string;
    size: number;
    lastModified: string;
  };
}
```

### Examples

```
get_graph_health({ detailed: true, sampleSize: 5 })
```
