# TODO: Bun native streaming iterate() with parameters

## Status: Waiting for Bun

## Problem
Bun's `bun:sqlite` Statement does not support true streaming `iterate()` with bound parameters.
`stmt.values()` returns positional arrays (not named objects), and `stmt.all()` creates full array in memory.

## Current workaround
`sqlite-adapter.ts` Bun wrapper: `iterate()` falls back to `stmt.all()` + yield.
This works correctly (returns named objects) but doesn't provide true streaming benefits.
With LIMIT/OFFSET chunking (5000 rows per page), memory impact is acceptable.

## When Bun adds this
Replace the workaround in `src/storage/sqlite-adapter.ts` with:
```ts
iterate: function* <R = T>(...params: unknown[]): IterableIterator<R> {
  for (const row of stmt.iterate(...params)) { yield row as R; }
},
```

## Related
- better-sqlite3 (Node.js) already has native `stmt.iterate()` — works correctly
- Native iterate would eliminate the intermediate array allocation entirely
