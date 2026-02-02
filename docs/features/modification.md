# Code Modification

🌐 **Language**: [EN] | [RU](./modification_ru.md)

---

Tools for safe code modification with automatic validation and graph updates.

---

## modify_code

Modify entity code by ID. Automatically creates snapshot, validates changes, and updates embeddings.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes | Entity ID to modify |
| `newCode` | string | yes | New code |
| `preview` | boolean | no | Preview mode without applying (default true) |
| `createSnapshot` | boolean | no | Create snapshot before change |
| `validate` | boolean | no | Validate code after change |
| `rollbackOnError` | boolean | no | Rollback on validation error |

### Returns

```typescript
{
  success: boolean;
  entityId: string;
  filePath: string;
  diff: {
    before: string;
    after: string;
    hunks: Array<{ oldStart: number; newStart: number; lines: string[]; }>;
  };
  validation?: {
    passed: boolean;
    issues: Array<{ severity: string; message: string; line: number; }>;
  };
  snapshotId?: string;
  appliedChanges: boolean;
}
```

### Examples

**Preview changes:**
```
modify_code({
  entityId: "src/utils/format.ts:formatDate",
  newCode: "function formatDate(date: Date): string { return date.toISOString(); }",
  preview: true
})
```

**Apply with validation:**
```
modify_code({
  entityId: "src/utils/format.ts:formatDate",
  newCode: "...",
  preview: false,
  validate: true,
  rollbackOnError: true
})
```

---

## create_file

Create new file with automatic parsing and adding to graph.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `filePath` | string | yes | Path to new file |
| `content` | string | yes | File content |
| `overwrite` | boolean | no | Overwrite if exists |

### Returns

```typescript
{
  success: boolean;
  filePath: string;
  entitiesCreated: Array<{
    entityId: string;
    name: string;
    type: string;
  }>;
  relationshipsCreated: number;
}
```

### Examples

```
create_file({
  filePath: "src/utils/validators.ts",
  content: `
export function validateEmail(email: string): boolean {
  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\\+?[0-9]{10,14}$/.test(phone);
}
`
})
```

---

## copy_file

Copy file or directory with graph updates. Supports streaming for large files.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `source` | string | yes | Source path |
| `destination` | string | yes | Destination path |
| `overwrite` | boolean | no | Overwrite if exists |

### Returns

```typescript
{
  success: boolean;
  source: string;
  destination: string;
  filesCopied: number;
  entitiesCreated: number;
}
```

### Examples

```
copy_file({
  source: "src/components/Button.tsx",
  destination: "src/components/IconButton.tsx"
})
```

---

## rename_file

Rename file with automatic import updates across project.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `oldPath` | string | yes | Current path |
| `newPath` | string | yes | New path |
| `updateImports` | boolean | no | Update imports (default true) |

### Returns

```typescript
{
  success: boolean;
  oldPath: string;
  newPath: string;
  importsUpdated: Array<{
    filePath: string;
    line: number;
    oldImport: string;
    newImport: string;
  }>;
}
```

### Examples

```
rename_file({
  oldPath: "src/utils/helpers.ts",
  newPath: "src/utils/string-helpers.ts"
})
```

---

## split_file

Split file into multiple files. Useful for refactoring large files.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `filePath` | string | yes | File path |
| `entities` | array | yes | Entities to extract |
| `updateImports` | boolean | no | Update imports |

### Entities Format

```typescript
entities: [
  { entityId: "...", targetFile: "src/utils/validators.ts" },
  { entityId: "...", targetFile: "src/utils/formatters.ts" }
]
```

### Returns

```typescript
{
  success: boolean;
  originalFile: string;
  createdFiles: Array<{
    filePath: string;
    entities: string[];
  }>;
  importsUpdated: number;
}
```

### Examples

```
split_file({
  filePath: "src/utils/index.ts",
  entities: [
    { entityId: "src/utils/index.ts:validateEmail", targetFile: "src/utils/validators.ts" },
    { entityId: "src/utils/index.ts:formatDate", targetFile: "src/utils/formatters.ts" }
  ]
})
```

---

## synthesize_files

Merge multiple files into one.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `sourceFiles` | string[] | yes | Source file paths |
| `targetFile` | string | yes | Target file path |
| `deleteOriginals` | boolean | no | Delete source files |
| `updateImports` | boolean | no | Update imports |

### Returns

```typescript
{
  success: boolean;
  targetFile: string;
  mergedEntities: number;
  deletedFiles?: string[];
  importsUpdated: number;
}
```

### Examples

```
synthesize_files({
  sourceFiles: [
    "src/utils/string-validators.ts",
    "src/utils/number-validators.ts"
  ],
  targetFile: "src/utils/validators.ts",
  deleteOriginals: true
})
```

---

## rename_symbol

Rename symbol (variable, function, class) with all references updated.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes* | Entity ID |
| `name` | string | yes* | Symbol name (if no ID) |
| `filePath` | string | no | File path (to clarify name) |
| `newName` | string | yes | New name |
| `preview` | boolean | no | Preview mode |

*Specify either `entityId` or `name`

### Returns

```typescript
{
  success: boolean;
  oldName: string;
  newName: string;
  referencesUpdated: Array<{
    filePath: string;
    line: number;
    column: number;
  }>;
  totalReferences: number;
}
```

### Examples

```
rename_symbol({
  entityId: "src/services/auth.ts:AuthService",
  newName: "AuthenticationService",
  preview: true
})
```

---

## add_member

Add new member (method, property, field) to class or interface.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `targetEntityId` | string | yes | Class/interface ID |
| `memberCode` | string | yes | New member code |
| `position` | string | no | Position: `start`, `end`, `after:memberName`, `before:memberName` |
| `memberType` | string | no | Type: `method`, `property`, `field` |

### Returns

```typescript
{
  success: boolean;
  targetEntity: string;
  newMember: {
    entityId: string;
    name: string;
    type: string;
  };
  position: number;
}
```

### Examples

**Add method:**
```
add_member({
  targetEntityId: "src/services/user.ts:UserService",
  memberCode: `
  async deleteUser(id: string): Promise<void> {
    await this.repository.delete(id);
  }
  `,
  position: "after:updateUser"
})
```

**Add property:**
```
add_member({
  targetEntityId: "src/models/user.ts:User",
  memberCode: "readonly createdAt: Date;",
  memberType: "property",
  position: "end"
})
```
