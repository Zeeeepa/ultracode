# SQLite Vector Search Alternatives for TypeScript MCP Tooling

**The landscape has evolved significantly in 2024-2025, with several solutions now addressing the persistence-performance trade-off.** Most notably, vectorlite's HNSW index persistence issue has a solution (the `index_file_path` parameter), libSQL has added native vector support with DiskANN, and LanceDB has emerged as the leading embedded vector database for TypeScript. For MCP-specific use cases, a purpose-built solution called `mcp-memory-libsql` now exists.

## The current sqlite-vec vs vectorlite trade-off is solvable

Your characterization of the persistence problem needs updating. **Vectorlite does support HNSW index persistence**—the index can be serialized to disk by specifying an `index_file_path` parameter when creating the virtual table:

```sql
CREATE VIRTUAL TABLE vectors USING vectorlite(
  embedding float32[1536], 
  hnsw(max_elements=100000), 
  '/data/my_index.bin'  -- HNSW index persists here
);
```

The index saves on connection close and reloads on the next connection. This means you can have both **HNSW performance** (3-100x faster than brute-force on large datasets) and **persistence**. The caveat: HNSW parameters (except `max_elements`) cannot be changed when reloading an existing index.

**sqlite-vec** (v0.1.6, November 2024) remains brute-force only but added significant features: metadata columns, partition keys, auxiliary columns, and WHERE clause filtering in KNN queries. It performs well up to ~100k vectors with <100ms query times for typical embedding dimensions. ANN indexes (IVF + HNSW) are planned but not yet available.

## libSQL brings native vector support to SQLite

The most significant 2024 development is **libSQL** (the Turso-backed SQLite fork) adding native vector support without requiring any extension. Vectors become a first-class column type using a **DiskANN** algorithm optimized for disk-based storage with low memory usage.

```typescript
import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:local.db' });
await db.execute(`CREATE TABLE docs (id INTEGER PRIMARY KEY, embedding F32_BLOB(1536))`);
await db.execute(`CREATE INDEX docs_idx ON docs(libsql_vector_idx(embedding))`);

// Query
const results = await db.execute(
  "SELECT id FROM vector_top_k('docs_idx', vector('[0.1, 0.2, ...]'), 10)"
);
```

Key advantages include **full persistence by design** (DiskANN is optimized for disk), configurable compression (float8, 1-bit for 8x size reduction), and excellent TypeScript support via `@libsql/client`. It works both locally and with Turso's cloud offering, making it ideal for MCP tools that might need to scale later.

## LanceDB leads the embedded TypeScript ecosystem

For projects willing to move beyond SQLite, **LanceDB** is the production-ready choice. It's the only embedded vector database with native TypeScript support, disk persistence by default, and proven at scale—Continue.dev uses it in production for IDE codebase search.

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("data/vectors");
const table = await db.createTable("docs", [
  { id: 1, vector: [0.1, 0.2, ...], text: "document content" }
]);

const results = await table.vectorSearch([0.1, 0.3, ...])
  .where("category = 'technical'")
  .limit(10)
  .toArray();
```

LanceDB stores data in a **columnar Lance format** with automatic versioning and zero-copy memory-mapped access. It supports SQL-like filtering, hybrid full-text + vector search, and scales to billions of vectors. The `@lancedb/lancedb` npm package (note: the older `vectordb` package is deprecated) provides full TypeScript support. The main limitation is being at version 0.x with occasional API changes and some Arrow schema quirks.

## MCP-specific solutions now exist

A TypeScript solution purpose-built for MCP tooling has emerged: **mcp-memory-libsql**. It combines vector search with knowledge graph capabilities, using libSQL as the backend.

```json
{
  "mcpServers": {
    "mcp-memory-libsql": {
      "command": "npx",
      "args": ["-y", "mcp-memory-libsql"],
      "env": { "LIBSQL_URL": "file:/path/to/memory.db" }
    }
  }
}
```

This provides high-performance vector search, persistent entity/relation storage, semantic search, and works with both local SQLite files and remote Turso databases. Other official MCP servers exist for Qdrant and Chroma, but these require external server processes.

For the sqlite-vec + better-sqlite3 combination, integration is seamless:

```typescript
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";

const db = new Database("vectors.db");
sqliteVec.load(db);

const embedding = new Float32Array([0.1, 0.2, 0.3]);
const results = db.prepare(`
  SELECT rowid, distance FROM vectors 
  WHERE embedding MATCH ? 
  ORDER BY distance LIMIT 10
`).all(embedding.buffer);
```

The key detail is using `Float32Array.buffer` for bindings. This combination works well for datasets up to ~100k vectors with query times under 100ms.

## Performance comparison across solutions

| Solution | Index Type | 100k Vector Query | Persistence | Best Scale |
|----------|-----------|-------------------|-------------|------------|
| **sqlite-vec** | Brute-force | ~75-214ms | Full (SQLite) | <100k vectors |
| **vectorlite** | HNSW | ~3-10ms | File-based | 100k-1M vectors |
| **libSQL** | DiskANN | ~10-50ms | Full (SQLite) | Multi-million |
| **LanceDB** | HNSW/IVF | <10ms | Disk (Lance) | Billions |
| **hnswlib-node** | HNSW | ~1-5ms | Binary file | Any (index only) |

**Insert speed** varies significantly: sqlite-vec is fastest (pure storage), while HNSW-based solutions take 6-16x longer due to index maintenance. For batch loading, LanceDB and sqlite-vec excel; for incremental updates with fast queries, vectorlite or libSQL are better choices.

## Other notable alternatives

**DuckDB VSS** adds HNSW indexing to DuckDB but with a critical limitation: persistence is experimental and requires a flag (`SET hnsw_enable_experimental_persistence = true`). Not recommended for production MCP tools yet, but worth watching if you need combined analytics and vector search.

**hnswlib-node** provides raw HNSW performance with full binary persistence, but it's index-only with no metadata storage. Useful if you're willing to manage metadata separately in SQLite and combine the two.

**usearch** offers the fastest distance computations (AVX-512, ARM SVE optimized) and cross-language index compatibility, but like hnswlib-node, it requires wrapping for a complete solution.

**Vectra** is a pure TypeScript option using JSON file storage—no native dependencies, simple API, but limited to small-medium datasets where all vectors fit in memory during queries.

## Recommended approach for your MCP tooling

For a TypeScript MCP project needing vector search with good persistence and performance characteristics:

1. **Under 100k vectors, simple use case**: sqlite-vec + better-sqlite3. Zero external dependencies, full SQLite persistence, excellent TypeScript support. Accept brute-force performance.

2. **100k+ vectors, need speed**: vectorlite with `index_file_path` for HNSW persistence, or migrate to LanceDB for native TypeScript and better scalability.

3. **MCP-native approach**: mcp-memory-libsql if you want a batteries-included memory tool, or use libSQL directly with its native vector support via `@libsql/client`.

4. **Production scale**: LanceDB. It's the only embedded solution with native TypeScript, disk persistence, and proven at scale. The Continue.dev deployment demonstrates real-world viability.

The 2024-2025 developments have largely solved the persistence-performance trade-off. vectorlite's index persistence, libSQL's native DiskANN, and LanceDB's columnar storage all offer paths to fast vector search without losing data on restart. The choice depends primarily on your scale requirements and whether you need to stay within SQLite's ecosystem.