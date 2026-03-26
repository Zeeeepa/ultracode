# __mocks__

## Overview

Jest manual mock implementations that replace third-party modules with deterministic stubs during unit testing. These mocks eliminate runtime dependencies on external libraries (database connection pools, ID generators, async concurrency limiters) and provide predictable return values for test assertions. Loaded automatically by Jest when tests import the mocked module names.

## Entity Listing

### Mock Modules

- `connection-pool.cjs` — Replaces database connection pool implementation with a stub that returns mock database connections for controlled test scenarios.
- `nanoid.cjs` — Replaces unique ID generator with a stub producing predictable sequential or fixed IDs for test determinism.
- `p-limit.cjs` — Replaces async concurrency limiter with a stub that executes queued functions without actual concurrency constraints for faster test execution.

## Dependencies

**External dependencies mocked:**
- `node-postgres` / database driver (via `connection-pool`)
- `nanoid` (via `nanoid`)
- `p-limit` (via `p-limit`)

**Used by:**
- Test suites across the codebase that require database, ID generation, or concurrency operations

---

`★ Insight ─────────────────────────────────────`
Jest manual mocks use file naming conventions: placing files in `__mocks__` directories with the exact module name (e.g., `nanoid.cjs` mocks the `nanoid` package). Jest's module resolution automatically loads these when tests execute `jest.mock('nanoid')`, eliminating the need for explicit mock factory functions in test setup. This pattern is powerful for infrastructure modules where test speed and isolation matter more than integration testing.
`─────────────────────────────────────────────────`