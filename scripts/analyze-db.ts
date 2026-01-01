import { createClient } from "@libsql/client";

const dbPath = process.env.LOCALAPPDATA + "/UltraScriptTools/unified-storage.db";
const client = createClient({ url: `file:${dbPath}` });

// Check for --vacuum flag
const shouldVacuum = process.argv.includes("--vacuum");
const shouldDropIndex = process.argv.includes("--drop-index");
const shouldRebuildIndex = process.argv.includes("--rebuild-index");

async function analyze() {
  // List all tables with row counts
  console.log("\n=== TABLES ===");
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  for (const row of tables.rows) {
    const name = row.name as string;
    const count = await client.execute(`SELECT COUNT(*) as cnt FROM "${name}"`);
    console.log(`${name}: ${count.rows[0]?.cnt} rows`);
  }

  // Check shadow table structure
  console.log("\n=== SHADOW TABLE STRUCTURE ===");
  const shadowSchema = await client.execute("SELECT sql FROM sqlite_master WHERE name = 'idx_emb_vec_fad95849_shadow'");
  console.log(shadowSchema.rows[0]?.sql);

  // Check average row size in shadow table
  console.log("\n=== SHADOW ROW SIZE ===");
  try {
    const shadowSample = await client.execute("SELECT index_key, LENGTH(data) as data_len FROM idx_emb_vec_fad95849_shadow LIMIT 5");
    for (const row of shadowSample.rows) {
      console.log(`Row ${row.index_key}: ${row.data_len} bytes`);
    }
    const avgSize = await client.execute("SELECT AVG(LENGTH(data)) as avg_len FROM idx_emb_vec_fad95849_shadow");
    console.log(`Average data size: ${(avgSize.rows[0]?.avg_len as number).toFixed(0)} bytes`);
  } catch (e) {
    console.log("Shadow table not found");
  }

  // Check index parameters from libsql_vector_meta_shadow
  console.log("\n=== VECTOR INDEX METADATA ===");
  const meta = await client.execute("SELECT * FROM libsql_vector_meta_shadow");
  for (const row of meta.rows) {
    console.log(JSON.stringify(row, null, 2));
  }

  // Estimate table sizes using dbstat if available
  console.log("\n=== TABLE SIZES (approx) ===");
  try {
    const stats = await client.execute(`
      SELECT name, SUM(pgsize) as size_bytes
      FROM dbstat
      GROUP BY name
      ORDER BY size_bytes DESC
      LIMIT 20
    `);
    for (const row of stats.rows) {
      const sizeMB = ((row.size_bytes as number) / 1024 / 1024).toFixed(2);
      console.log(`${row.name}: ${sizeMB} MB`);
    }
  } catch {
    console.log("dbstat not available, using estimate...");
    // Fallback: estimate from page_count
  }

  // Check freelist (fragmentation)
  console.log("\n=== FRAGMENTATION ===");
  const freelist = await client.execute("PRAGMA freelist_count");
  const pageCount = await client.execute("PRAGMA page_count");
  const freePages = freelist.rows[0]?.freelist_count as number;
  const totalPages = pageCount.rows[0]?.page_count as number;
  console.log(`Free pages: ${freePages} / ${totalPages} (${((freePages / totalPages) * 100).toFixed(1)}%)`);

  // Check WAL size
  console.log("\n=== WAL MODE ===");
  const walMode = await client.execute("PRAGMA journal_mode");
  console.log(`Journal mode: ${walMode.rows[0]?.journal_mode}`);

  // Optional: Drop index
  if (shouldDropIndex) {
    console.log("\n=== DROPPING INDEX ===");
    await client.execute("DROP INDEX IF EXISTS idx_emb_vec_fad95849");
    console.log("Index dropped");

    // Also drop shadow table
    await client.execute("DROP TABLE IF EXISTS idx_emb_vec_fad95849_shadow");
    console.log("Shadow table dropped");
  }

  // Optional: VACUUM
  if (shouldVacuum) {
    console.log("\n=== RUNNING VACUUM ===");
    console.log("This may take a while...");
    await client.execute("VACUUM");
    console.log("VACUUM complete");

    // Check new size
    const newPageCount = await client.execute("PRAGMA page_count");
    const newPages = newPageCount.rows[0]?.page_count as number;
    console.log(`New size: ${((newPages * 4096) / 1024 / 1024).toFixed(2)} MB`);
  }

  // Optional: Rebuild index with correct parameters
  if (shouldRebuildIndex) {
    console.log("\n=== REBUILDING INDEX ===");
    // max_neighbors=12 for smaller index
    // For 30K vectors this is sufficient, recall ~95%
    const indexParams = [
      "'metric=cosine'",
      "'compress_neighbors=float8'",
      "'max_neighbors=12'",
      "'search_l=150'",
      "'insert_l=30'",
    ].join(", ");

    console.log("Creating index with params:", indexParams);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_emb_vec_fad95849
      ON embeddings(libsql_vector_idx(embedding, ${indexParams}))
      WHERE project_hash = 'fad95849'
    `);
    console.log("Index rebuilt");
  }

  await client.close();
}

analyze().catch(console.error);
