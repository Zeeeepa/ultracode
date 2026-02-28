---
module_name: __mocks__
description: "Jest manual mocks for third-party dependencies used in unit tests"
status: test-infrastructure
language: typescript
---

# __mocks__

> Jest manual mocks that replace third-party modules with predictable stubs during testing.

## Overview

Contains mock implementations automatically loaded by Jest when tests call `jest.mock()` for the corresponding module names. These stubs eliminate external dependencies and return deterministic values.

## Files

| File | Description |
|------|-------------|
| `connection-pool.cjs` | Mock for database connection pool management |
| `nanoid.cjs` | Mock for unique ID generator returning predictable values |
| `p-limit.cjs` | Mock for async concurrency limiter |
