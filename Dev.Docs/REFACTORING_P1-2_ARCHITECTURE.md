# P1-2: SQLiteManager Modular Architecture

## Current State
- **File:** src/storage/sqlite-manager.ts
- **Lines:** 450+
- **Issues:** Mixed concerns (connection, optimization, queries)

## Proposed Architecture

```
src/storage/sqlite-manager/
├── connection-manager.ts       # Connection pool, transactions
├── optimization-manager.ts     # WAL, pragmas, ANALYZE
├── query-executor.ts          # Prepared statements, execution
├── types.ts                   # Shared types
└── index.ts                   # Facade pattern
```

## Module Responsibilities

### connection-manager.ts
```typescript
export class ConnectionManager {
  private db: SQLiteDatabase;
  private pool: ConnectionPool;

  constructor(config: SQLiteConfig) {}

  getConnection(): SQLiteDatabase {}
  transaction<T>(fn: () => T): T {}
  close(): void {}
}
```

### optimization-manager.ts
```typescript
export class OptimizationManager {
  constructor(private conn: ConnectionManager) {}

  applyWALMode(): void {}
  applyPragmas(): void {}
  runAnalyze(): void {}
  optimize(): void {}
}
```

### query-executor.ts
```typescript
export class QueryExecutor {
  constructor(private conn: ConnectionManager) {}

  prepare(sql: string): SQLiteStatement {}
  execute(stmt: SQLiteStatement, params: any[]): any {}
  recordMetrics(duration: number): void {}
}
```

### index.ts (Facade)
```typescript
export class SQLiteManager {
  private connectionManager: ConnectionManager;
  private optimizationManager: OptimizationManager;
  private queryExecutor: QueryExecutor;

  constructor(config: SQLiteConfig) {
    this.connectionManager = new ConnectionManager(config);
    this.optimizationManager = new OptimizationManager(this.connectionManager);
    this.queryExecutor = new QueryExecutor(this.connectionManager);

    // Apply optimizations on init
    this.optimizationManager.applyWALMode();
    this.optimizationManager.applyPragmas();
  }

  // Delegate methods
  transaction<T>(fn: () => T): T {
    return this.connectionManager.transaction(fn);
  }

  prepare(sql: string) {
    return this.queryExecutor.prepare(sql);
  }

  close(): void {
    this.connectionManager.close();
  }
}
```

## Migration Path

1. Create new directory structure
2. Extract ConnectionManager (no breaking changes)
3. Extract OptimizationManager (internal only)
4. Extract QueryExecutor (internal only)
5. Update SQLiteManager to use modules
6. Run tests
7. Deprecate old implementation

## Benefits
- ✅ Single Responsibility Principle
- ✅ Easier to test (mock individual components)
- ✅ Better separation of concerns
- ✅ No breaking changes (facade maintains API)

## Effort Estimate
2-3 days for full implementation + testing
