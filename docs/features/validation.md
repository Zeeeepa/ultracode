# Code Validation

🌐 **Language**: [EN] | [RU](./validation_ru.md)

---

Tools for code quality checking using linters.

---

## validate_file

Validate a single file using the appropriate linter (oxlint for JS/TS, Pylint for Python).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | yes | File path |
| `fix` | boolean | no | Automatically fix issues |
| `rules` | string[] | no | Specific rules to check |

### Returns

```typescript
{
  filePath: string;
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    line: number;
    column: number;
    rule: string;
    fixable: boolean;
  }>;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    fixableCount: number;
  };
  fixed?: boolean;
}
```

### Supported Languages

| Extension | Linter |
|-----------|--------|
| `.ts`, `.tsx`, `.js`, `.jsx` | oxlint |
| `.py` | Pylint |
| `.go` | golint |
| `.rs` | clippy |

### Examples

**Check:**
```
validate_file({
  filePath: "src/utils/validators.ts"
})
```

**Check with fix:**
```
validate_file({
  filePath: "src/utils/validators.ts",
  fix: true
})
```

---

## validate_directory

Batch validation of all files in directory with parallel processing.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `directory` | string | yes | Directory path |
| `recursive` | boolean | no | Recursively traverse subdirectories (default true) |
| `filePattern` | string | no | Glob pattern for files |
| `excludePatterns` | string[] | no | Exclusion patterns |
| `fix` | boolean | no | Automatically fix issues |
| `concurrency` | number | no | Processing parallelism |

### Returns

```typescript
{
  directory: string;
  filesChecked: number;
  filesWithIssues: number;
  results: Array<{
    filePath: string;
    valid: boolean;
    errors: number;
    warnings: number;
  }>;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfos: number;
    passRate: number;           // Percentage of files without errors
  };
  fixed?: number;
}
```

### Examples

**Check directory:**
```
validate_directory({
  directory: "src/",
  excludePatterns: ["**/*.test.ts", "**/*.spec.ts"]
})
```

**Check with fix:**
```
validate_directory({
  directory: "src/components/",
  fix: true,
  concurrency: 4
})
```
