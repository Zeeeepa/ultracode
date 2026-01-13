/**
 * Analyze which files are indexed in the unified database
 * Shows distribution by directory and highlights large files outside /src/
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@libsql/client";

// Get data directory
function getDataDir(): string {
  let baseDir: string;
  switch (process.platform) {
    case "win32":
      baseDir = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
      break;
    case "darwin":
      baseDir = join(homedir(), "Library", "Application Support");
      break;
    default:
      baseDir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  }
  return join(baseDir, "UltraScriptTools");
}

async function analyzeIndexedFiles() {
  const originalDbPath = join(getDataDir(), "unified-storage.db");

  if (!existsSync(originalDbPath)) {
    console.error(`❌ Database not found: ${originalDbPath}`);
    return;
  }

  // Copy database to temp location to avoid locking issues
  const tempDbPath = join(tmpdir(), "unified-storage-copy.db");
  console.log(`📊 Copying database to: ${tempDbPath}`);

  try {
    if (existsSync(tempDbPath)) {
      unlinkSync(tempDbPath);
    }
    copyFileSync(originalDbPath, tempDbPath);
  } catch (error: any) {
    console.error(`❌ Failed to copy database: ${error.message}`);
    return;
  }

  console.log(`📊 Analyzing database...\n`);

  // Open the copy (no locking issues)
  const db = createClient({
    url: `file:${tempDbPath}`,
  });

  try {
    // 1. Total files count
    const totalResult = await db.execute("SELECT COUNT(DISTINCT file_path) as total FROM entities");
    const totalFiles = totalResult.rows[0]?.total || 0;
    console.log(`📁 Total indexed files: ${totalFiles}\n`);

    // 2. Distribution by top-level directory
    console.log("📂 Distribution by directory:");
    const dirResult = await db.execute(`
      SELECT
        CASE
          WHEN file_path LIKE 'src/%' THEN 'src/'
          WHEN file_path LIKE 'scripts/%' THEN 'scripts/'
          WHEN file_path LIKE 'benchmarks/%' THEN 'benchmarks/'
          WHEN file_path LIKE 'tests/%' THEN 'tests/'
          WHEN file_path LIKE 'external-%' THEN 'external-*/'
          WHEN file_path LIKE 'dist/%' THEN 'dist/'
          WHEN file_path LIKE 'generated/%' THEN 'generated/'
          WHEN file_path LIKE 'node_modules/%' THEN 'node_modules/'
          ELSE 'other'
        END as dir,
        COUNT(DISTINCT file_path) as count
      FROM entities
      GROUP BY dir
      ORDER BY count DESC
    `);

    for (const row of dirResult.rows) {
      console.log(`  ${String(row.dir).padEnd(20)} ${row.count} files`);
    }

    // 3. Files outside /src/ with entity count
    console.log("\n📄 Files outside /src/ (with 10+ entities):");
    const outsideSrcResult = await db.execute(`
      SELECT
        file_path,
        COUNT(*) as entity_count
      FROM entities
      WHERE file_path NOT LIKE 'src/%'
      GROUP BY file_path
      HAVING entity_count >= 10
      ORDER BY entity_count DESC
      LIMIT 20
    `);

    if (outsideSrcResult.rows.length === 0) {
      console.log("  ✅ None (all large files are in /src/)");
    } else {
      for (const row of outsideSrcResult.rows) {
        console.log(`  ${String(row.file_path).padEnd(50)} ${row.entity_count} entities`);
      }
    }

    // 4. Suspicious patterns (dist/generated)
    console.log("\n⚠️  Checking for dist/generated files:");
    const suspiciousResult = await db.execute(`
      SELECT
        file_path,
        COUNT(*) as entity_count
      FROM entities
      WHERE
        file_path LIKE '%/dist/%' OR
        file_path LIKE 'dist/%' OR
        file_path LIKE '%/generated/%' OR
        file_path LIKE 'generated/%'
      GROUP BY file_path
      ORDER BY entity_count DESC
      LIMIT 10
    `);

    if (suspiciousResult.rows.length === 0) {
      console.log("  ✅ None found (good!)");
    } else {
      console.log("  ❌ Found indexed files in excluded directories:");
      for (const row of suspiciousResult.rows) {
        console.log(`     ${String(row.file_path).padEnd(50)} ${row.entity_count} entities`);
      }
    }

    // 5. Top files by entity count
    console.log("\n📊 Top 10 files by entity count:");
    const topFilesResult = await db.execute(`
      SELECT
        file_path,
        COUNT(*) as entity_count
      FROM entities
      GROUP BY file_path
      ORDER BY entity_count DESC
      LIMIT 10
    `);

    for (const row of topFilesResult.rows) {
      const isInSrc = String(row.file_path).startsWith("src/") ? "✅" : "⚠️ ";
      console.log(`  ${isInSrc} ${String(row.file_path).padEnd(50)} ${row.entity_count} entities`);
    }
  } catch (error: any) {
    console.error("❌ Error analyzing database:", error.message);
  } finally {
    db.close();

    // Clean up temp file
    try {
      if (existsSync(tempDbPath)) {
        unlinkSync(tempDbPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

analyzeIndexedFiles().catch(console.error);
