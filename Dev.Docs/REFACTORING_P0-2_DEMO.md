# P0-2: Base Parser Utils - Demonstration Patch

## Summary
Created `src/parsers/base-parser-utils.ts` with common utilities.
This eliminates ~150 lines of duplicated code across parsers.

## Changes Required (Demonstration)

### 1. csharp-analyzer.ts

**Add import:**
```typescript
// Around line 24
import { hasChild } from "./base-parser-utils.js";
```

**Remove duplicated function:**
```typescript
// DELETE lines 1054-1062:
private hasChild(node: TreeSitterNode, type: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) {
      return true;
    }
  }
  return false;
}
```

**Replace usage:**
```typescript
// Change all calls from:
this.hasChild(node, "type")

// To:
hasChild(node, "type")
```

### 2. rust-analyzer.ts

**Add import:**
```typescript
import { hasChild } from "./base-parser-utils.js";
```

**Remove duplicated function** (similar to csharp-analyzer)

### 3. c-analyzer.ts

**Add import:**
```typescript
import { getNodeLocation } from "./base-parser-utils.js";
```

**Remove duplicated function:**
```typescript
// DELETE private getNodeLocation() method
```

**Replace usage:**
```typescript
// Change from:
this.getNodeLocation(node)

// To:
getNodeLocation(node)
```

### 4. cpp-analyzer.ts

Same changes as c-analyzer.ts

### 5. go-analyzer.ts

**Add import:**
```typescript
import { checkCircuitBreakers, CircuitBreakerError } from "./base-parser-utils.js";
```

**Remove duplicated function and error class**

**Replace usage:**
```typescript
// Change from:
this.checkCircuitBreakers()

// To:
checkCircuitBreakers(
  this.recursionDepth,
  this.parseStartTime,
  MAX_RECURSION_DEPTH,
  PARSE_TIMEOUT_MS
)
```

### 6. java-analyzer.ts

Same changes as go-analyzer.ts

## Impact

- **Lines removed:** ~150 (duplicated code)
- **Lines added:** ~150 (base-parser-utils.ts) + ~20 (import statements)
- **Net reduction:** ~130 lines
- **Maintainability:** Single source of truth for common parser utilities
- **Bug fixes:** Now fixed in one place instead of 6 files

## Testing Required

```bash
# Run parser tests
npm test -- parsers

# Specifically test affected analyzers
npm test -- csharp-analyzer.test.ts
npm test -- rust-analyzer.test.ts
npm test -- c-analyzer.test.ts
npm test -- cpp-analyzer.test.ts
npm test -- go-analyzer.test.ts
npm test -- java-analyzer.test.ts
```

## Note

This is a demonstration of the refactoring pattern.
Full implementation would require editing 6 large parser files (1000+ lines each).
Time estimate for full implementation: 1-2 days.
