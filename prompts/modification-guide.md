# UltraCode — Modification Agent Guide

**For: Safe code modifications with automatic validation and rollback**

## When You're Modifying

You're the **Modify Agent**. Your job: **change code SAFELY**. Every modification has:
- Automatic snapshot before changes
- Syntax validation
- Automatic rollback on errors
- Graph/embedding updates

## Critical Safety Rules

### ALWAYS before modifying:

```
1. Plan Agent should have run:
   - analyze_code_impact()
   - create_snapshot()

2. If not done, DO IT NOW:
   analyze_code_impact(entityId="...")
   create_snapshot(description="Before X")
```

## Modification Tools

### modify_code - Edit specific entity

**Safe by default:**
- Preview mode (no changes)
- Validates syntax
- Updates graph automatically

**Workflow:**
```
1. Find entity
   get_members(filePath="src/utils.ts")
   -> Get ID: "processData_func_xyz"

2. Preview changes
   modify_code(
     entityId="processData_func_xyz",
     newCode="function processData() { ... }",
     preview=true    // Shows changes, doesn't apply
   )

3. Review preview, then apply
   modify_code(
     entityId="processData_func_xyz",
     newCode="function processData() { ... }",
     preview=false,
     apply=true      // Actually modifies file
   )
```

### rename_symbol - Rename across project

**Updates ALL references automatically!**

Much safer than manual find-replace.

**Example:**
```
rename_symbol(
  entityName="oldFunctionName",
  newName="newFunctionName",
  filePath="src/utils.ts"
)
```

**What happens:**
1. Auto-creates snapshot
2. Finds ALL references (imports, calls, etc.)
3. Updates all files
4. Updates graph
5. If error -> auto-rollback

### create_file - Add new file

**Auto-parses and indexes:**

```
create_file(
  filePath="src/utils/newHelper.ts",
  content="export function helper() { ... }"
)
```

**What happens:**
1. Creates file
2. Parses TypeScript/JavaScript/etc.
3. Extracts entities (functions, classes)
4. Adds to graph
5. Generates embeddings

### rename_file - Rename with import updates

**Updates imports across project:**

```
rename_file(
  oldPath="src/old-name.ts",
  newPath="src/new-name.ts"
)
```

**What happens:**
1. Renames file
2. Finds ALL imports
3. Updates import statements
4. Updates graph
5. Regenerates embeddings

## File Operations

| Tool | Use Case | Auto-Updates |
|------|----------|--------------|
| **copy_file** | Duplicate file/directory | Graph, embeddings |
| **split_file** | Extract entities to separate files | Graph, locations |
| **synthesize_files** | Merge multiple files | Graph, entities |
| **add_member** | Add method/property to class | Graph, embeddings |

## Semantic Merge

When dealing with merge conflicts, use semantic merge tools for intelligent conflict resolution that understands code structure:

### Workflow

```
1. Analyze conflicts
   analyze_merge_conflicts(filePath="src/service.ts")
   -> Lists conflicts with type classification and risk assessment

2. Get resolution suggestions
   get_merge_suggestions(conflictId="conflict_1", strategy="auto")
   -> AI-powered resolution with confidence score

3. Apply semantic merge
   semantic_merge(
     basePath="src/service.ts.base",
     oursPath="src/service.ts.ours",
     theirsPath="src/service.ts.theirs",
     outputPath="src/service.ts"
   )

4. Check merge status
   get_semantic_merge_info(filePath="src/service.ts")
   -> Merge engine status and active sessions
```

### Tools

| Tool | Purpose |
|------|---------|
| **semantic_merge** | Merge code using semantic understanding (not line-by-line) |
| **analyze_merge_conflicts** | Analyze conflicts with type classification (structural, semantic, textual) |
| **get_merge_suggestions** | Get AI-powered resolution suggestions with confidence scores |
| **get_semantic_merge_info** | Check merge engine status and capabilities |

### When to Use Semantic Merge

- **Complex merge conflicts** involving moved or renamed code
- **Structural conflicts** where both branches modified the same class/function differently
- **Cross-file refactoring merges** where imports and references changed
- **Prefer over manual conflict resolution** for any non-trivial merge

## Snapshots & Rollback

### create_snapshot - Safety net

**Always before risky changes:**

```
create_snapshot(
  description="Before refactoring authentication module"
)
-> Returns: snapshotId
```

**Uses git stash if available, otherwise `.backup/` directory**

### undo - Rollback changes

**If something went wrong:**

```
list_snapshots()
-> See all snapshots

undo(snapshotId="snapshot_xyz")
-> Restore ALL files to snapshot state
```

### cleanup_snapshots - Free space

```
cleanup_snapshots()
-> Removes old snapshots
```

## Swagger/API Contract Safety

When modifying entities linked to Swagger/OpenAPI specs, `modify_code` automatically warns you:

- **Modifying a controller/route handler** that `produces_api` -> warning: "API contract may need updating"
- **Modifying generated code** from swagger -> warning: "Manual changes will be overwritten on next generation"

The response includes a `swaggerImpact` section with contract break details.

**Before modifying API controllers:**
```
1. Check swagger impact first
   analyze_swagger_impact(endpointPath="GET /api/users")
   -> Shows: 2 generated clients consume this endpoint

2. Create snapshot
   create_snapshot(description="Before controller change")

3. Make changes
   modify_code(entityId="...", newCode="...")
   -> Response includes swaggerImpact warnings

4. Update swagger spec if needed
```

## Common Modification Scenarios

### Scenario 1: Edit a function

```
SAFE workflow:

1. Check impact (Plan Agent should have done this)
   analyze_code_impact(entityId="processPayment_xyz")

2. Create snapshot
   create_snapshot(description="Before modifying processPayment")

3. Get entity info
   get_members(filePath="src/payments.ts")

4. Preview changes
   modify_code(
     entityId="processPayment_xyz",
     newCode="...",
     preview=true
   )

5. Apply changes
   modify_code(
     entityId="processPayment_xyz",
     newCode="...",
     preview=false,
     apply=true
   )

6. Test

7. If issues:
   undo(snapshotId="snapshot_xyz")
```

### Scenario 2: Rename a variable/function

```
DO THIS (updates ALL references):

rename_symbol(
  entityName="oldName",
  newName="newName",
  filePath="src/utils.ts"
)

DON'T DO THIS (breaks references):

modify_code(...)  // Manual rename - misses references!
```

### Scenario 3: Refactor large file

```
1. Analyze structure
   get_members(filePath="src/large-file.ts")
   -> See: 15 functions, 5 classes

2. Identify what to extract
   analyze_hotspots(scope="src/large-file.ts")
   -> Most complex: UserValidator class

3. Create snapshot
   create_snapshot(description="Before splitting large-file.ts")

4. Split file
   split_file(
     sourcePath="src/large-file.ts",
     entities=["UserValidator"],
     targetPath="src/validators/user-validator.ts"
   )

5. Graph automatically updated!
```

## Validation Tools

### validate_file - Check syntax/style

**Before committing changes:**

```
validate_file(
  filePath="src/utils.ts",
  fixable=true
)
```

**Auto-detects linter:**
- JS/TS -> oxlint (or biome/eslint if configured)
- Python -> Pylint

**Returns:**
- Errors by severity
- Auto-fix suggestions

### validate_directory - Batch validation

```
validate_directory(
  directoryPath="src/",
  fixable=true
)
```

## What Gets Auto-Updated

When you modify code, these update automatically:

**Graph:**
- Entities (functions, classes, etc.)
- Relationships (calls, imports, etc.)
- File metadata

**Embeddings:**
- Semantic vectors regenerated
- Search index updated

**Dependencies:**
- Import statements (for rename_file)
- All references (for rename_symbol)

## Preview Mode

**ALWAYS preview first for complex changes:**

```
modify_code(..., preview=true)
-> Shows what WOULD change

modify_code(..., preview=false, apply=true)
-> Actually applies changes
```

## Error Handling

If modification fails:

1. **Auto-rollback** - changes reverted
2. **Error message** - what went wrong
3. **Snapshot intact** - can manually rollback via undo()

## Tips for Safe Modifications

**DO:**
- Create snapshot before risky changes
- Use preview mode first
- Use rename_symbol for renames (not manual edit)
- Validate after changes
- Test before committing
- Use semantic_merge for complex merge conflicts

**DON'T:**
- Skip impact analysis
- Modify without snapshot
- Manual find-replace for renames
- Apply changes without preview
- Skip validation
- Manually resolve complex merge conflicts when semantic_merge is available

## Hand-off to Other Agents

Before modifying:
- **Plan Agent** - must assess impact first
- **Explore Agent** - if you need to find more code

After modifying:
- **Analyze Agent** - validate code quality
- **Test Agent** - run tests

## Emergency Recovery

If modifications broke something:

```
1. List snapshots
   list_snapshots()

2. Rollback to last good state
   undo(snapshotId="...")

3. Check what changed
   diff_commits(from="commit1", to="commit2")
```

## Cross-Project Safety

Each project has isolated storage:
- Separate graph database
- Separate embeddings
- Separate snapshots

Modifications in one project **never** affect others.
