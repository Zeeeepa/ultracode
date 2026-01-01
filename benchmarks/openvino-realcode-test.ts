/**
 * OpenVINO Real Code Test
 *
 * Tests embedding generation on actual source code files
 * to reproduce the crash that happens with diverse text input.
 *
 * Usage:
 *   bun run benchmarks/openvino-realcode-test.ts
 *   node --experimental-strip-types benchmarks/openvino-realcode-test.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Collect all source files
function collectSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip node_modules, dist, .git
    if (entry === "node_modules" || entry === "dist" || entry === ".git" || entry === ".ultrasharp") {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if ([".ts", ".js", ".json", ".md"].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Extract code chunks from files
function extractCodeChunks(files: string[], maxChunks: number): string[] {
  const chunks: string[] = [];

  for (const file of files) {
    if (chunks.length >= maxChunks) break;

    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // Extract chunks of ~20 lines
      for (let i = 0; i < lines.length && chunks.length < maxChunks; i += 20) {
        const chunk = lines.slice(i, i + 20).join("\n").trim();
        if (chunk.length > 50 && chunk.length < 2000) {
          chunks.push(chunk);
        }
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  return chunks;
}

async function main() {
  console.log("OpenVINO Real Code Test");
  console.log("========================\n");

  // Import OpenVINO provider directly (works with both bun and tsx)
  const { OpenVINOProvider } = await import("../src/semantic/providers/openvino-provider.js");

  // Collect source files
  const srcDir = join(process.cwd(), "src");
  console.log(`Collecting source files from: ${srcDir}`);

  const files = collectSourceFiles(srcDir);
  console.log(`Found ${files.length} source files\n`);

  // Extract code chunks
  const maxChunks = 2000;
  const chunks = extractCodeChunks(files, maxChunks);
  console.log(`Extracted ${chunks.length} code chunks\n`);

  // Initialize provider
  console.log("Initializing OpenVINO provider...");
  const provider = new OpenVINOProvider({
    model: "all-MiniLM-L6-v2",
    device: "CPU",
    logger: {
      debug: () => {},
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ""),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      error: (msg: string, data?: any, _?: any, e?: Error) => console.error(`[ERROR] ${msg}`, data, e),
    },
  });

  await provider.initialize();
  console.log(`Provider initialized. Dimension: ${provider.getDimension()}\n`);

  // Process embeddings
  console.log("Starting embedding generation...");
  console.log("Will log progress every 25 embeddings.\n");

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await provider.embed(chunks[i]!);

      if (embedding && embedding.length > 0) {
        successCount++;
      }

      // Log progress
      if ((i + 1) % 25 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const perSec = (successCount / parseFloat(elapsed)).toFixed(1);
        const mem = process.memoryUsage();
        const rssMB = Math.round(mem.rss / 1024 / 1024);
        const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

        console.log(
          `[${i + 1}/${chunks.length}] ` +
          `success=${successCount} errors=${errorCount} ` +
          `elapsed=${elapsed}s rate=${perSec}/s ` +
          `rss=${rssMB}MB heap=${heapMB}MB`
        );
      }

      // Small delay to allow GC
      if ((i + 1) % 100 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    } catch (e: any) {
      errorCount++;
      console.error(`[ERROR at ${i}] ${e.message}`);

      // Stop on too many errors
      if (errorCount > 10) {
        console.error("\nToo many errors, stopping.");
        break;
      }
    }
  }

  // Final stats
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n========================");
  console.log("Test Complete!");
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total time: ${totalTime}s`);
  console.log(`Average rate: ${(successCount / parseFloat(totalTime)).toFixed(1)} embeddings/sec`);

  await provider.close();
  console.log("\nProvider closed.");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
