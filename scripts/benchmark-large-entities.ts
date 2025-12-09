/**
 * Benchmark: Embedding Providers on Large Entities (>512 tokens)
 *
 * Tests real code entities from the database that exceed 512 token limit
 * Uses Smart Chunker to split large entities before embedding
 * Compares: OpenVINO (CPU), Ollama (GPU), TEI (GPU)
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { chunkCode, estimateTokens as chunkEstimateTokens } from "../src/semantic/smart-chunker.js";

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const TEI_ENDPOINT = "http://127.0.0.1:8081";

interface LargeEntity {
  id: string;
  name: string;
  type: string;
  filePath: string;
  content: string;
  lines: number;
  estimatedTokens: number;
}

interface BenchmarkResult {
  provider: string;
  model: string;
  maxTokens: number;
  dimensions: number;
  entityCount: number;
  chunkCount: number;
  totalTimeMs: number;
  perEntityMs: number;
  perChunkMs: number;
  avgTokensPerChunk: number;
  totalTokensProcessed: number;
  effectiveTokensPerSec: number;
}

// Estimate tokens (~10 per line of code)
function estimateTokens(content: string): number {
  const lines = content.split("\n").length;
  return lines * 10;
}

// Get storage paths
function getDataDir(): string {
  let baseDir: string;
  switch (process.platform) {
    case "win32":
      baseDir = process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local");
      break;
    case "darwin":
      baseDir = path.join(require("os").homedir(), "Library", "Application Support");
      break;
    default:
      baseDir = process.env.XDG_DATA_HOME || path.join(require("os").homedir(), ".local", "share");
  }
  return path.join(baseDir, "UltraScriptTools");
}

// Load large entities from database
async function loadLargeEntities(minTokens: number = 512): Promise<LargeEntity[]> {
  // Find database - check multiple locations
  const dataDir = getDataDir();
  const projectsDir = path.join(dataDir, "projects");

  // List all project directories and find graph.db
  let dbPath: string | null = null;

  // First check local .ultrascript
  const localDb = path.join(process.cwd(), ".ultrascript", "graph.db");
  if (fs.existsSync(localDb)) {
    dbPath = localDb;
  }

  // Then check central storage - find database with most entities
  if (!dbPath && fs.existsSync(projectsDir)) {
    const projects = fs.readdirSync(projectsDir);
    let maxEntities = 0;

    for (const proj of projects) {
      const graphDb = path.join(projectsDir, proj, "graph.db");
      if (fs.existsSync(graphDb)) {
        try {
          const testDb = new Database(graphDb, { readonly: true });
          const count = testDb.prepare("SELECT COUNT(*) as c FROM entities").get() as any;
          testDb.close();
          if (count.c > maxEntities) {
            maxEntities = count.c;
            dbPath = graphDb;
          }
        } catch {}
      }
    }
  }

  if (!dbPath) {
    console.error(`Database not found. Checked:\n  - ${localDb}\n  - ${projectsDir}/**/graph.db`);
    console.error("\nPlease run 'index' first to create the database.");
    process.exit(1);
  }

  console.log(`Loading entities from: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });

  // Query entities with location info
  const rows = db.prepare(`
    SELECT id, name, type, file_path, location, size_bytes
    FROM entities
    WHERE location IS NOT NULL
    ORDER BY size_bytes DESC
    LIMIT 500
  `).all() as any[];

  const entities: LargeEntity[] = [];

  for (const row of rows) {
    // Parse location JSON
    let startLine = 1, endLine = 1;
    try {
      const loc = JSON.parse(row.location || "{}");
      startLine = loc.start?.line || 1;
      endLine = loc.end?.line || startLine;
    } catch {}

    const lines = Math.max(1, endLine - startLine + 1);
    const estimatedTokens = lines * 10;

    if (estimatedTokens > minTokens) {
      // Read actual content
      let content = "";
      try {
        if (fs.existsSync(row.file_path)) {
          const fileContent = fs.readFileSync(row.file_path, "utf-8");
          const fileLines = fileContent.split("\n");
          content = fileLines.slice(Math.max(0, startLine - 1), endLine).join("\n");
        }
      } catch {
        content = `// ${row.name}\n// ${lines} lines of code`;
      }

      entities.push({
        id: row.id,
        name: row.name,
        type: row.type,
        filePath: row.file_path,
        content,
        lines,
        estimatedTokens,
      });
    }
  }

  db.close();
  return entities;
}

// Prepare chunks for all entities
function prepareChunks(entities: LargeEntity[], maxTokens: number): { chunks: string[]; entityCount: number; totalTokens: number } {
  const allChunks: string[] = [];
  let totalTokens = 0;

  for (const entity of entities) {
    // chunkCode(entityId, code, header, options)
    const header = `// ${entity.type}: ${entity.name}`;
    const chunks = chunkCode(entity.id, entity.content, header, { maxTokens });

    for (const chunk of chunks) {
      allChunks.push(chunk.content);
      totalTokens += chunk.tokenCount;
    }
  }

  return { chunks: allChunks, entityCount: entities.length, totalTokens };
}

async function benchmarkOllama(
  model: string,
  entities: LargeEntity[],
  maxTokens: number
): Promise<BenchmarkResult | null> {
  try {
    // Check if model exists
    const modelsRes = await fetch(`${OLLAMA_ENDPOINT}/api/tags`);
    const models = await modelsRes.json();
    const hasModel = models.models?.some((m: any) => m.name.includes(model.split(":")[0]));

    if (!hasModel) {
      console.log(`  [SKIP] Ollama model ${model} not installed`);
      return null;
    }

    // Prepare chunks using Smart Chunker
    const { chunks, totalTokens } = prepareChunks(entities, maxTokens);
    console.log(`    Chunked ${entities.length} entities → ${chunks.length} chunks`);

    const t0 = Date.now();
    const embeddings: number[][] = [];

    // Process chunks with concurrency
    const CONCURRENCY = 4;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (text) => {
          const res = await fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, input: text }),
          });
          const data = await res.json();
          return data.embeddings?.[0] || [];
        })
      );
      embeddings.push(...results);
    }

    const totalTimeMs = Date.now() - t0;

    return {
      provider: "Ollama (GPU)",
      model,
      maxTokens,
      dimensions: embeddings[0]?.length || 0,
      entityCount: entities.length,
      chunkCount: chunks.length,
      totalTimeMs,
      perEntityMs: Math.round((totalTimeMs / entities.length) * 10) / 10,
      perChunkMs: Math.round((totalTimeMs / chunks.length) * 10) / 10,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      totalTokensProcessed: totalTokens,
      effectiveTokensPerSec: Math.round(totalTokens / (totalTimeMs / 1000)),
    };
  } catch (e: any) {
    console.log(`  [ERROR] Ollama: ${e.message}`);
    return null;
  }
}

async function benchmarkTEI(
  endpoint: string,
  entities: LargeEntity[],
  maxTokens: number
): Promise<BenchmarkResult | null> {
  try {
    // Check health
    const healthRes = await fetch(`${endpoint}/health`);
    if (!healthRes.ok) {
      console.log(`  [SKIP] TEI not healthy`);
      return null;
    }

    const infoRes = await fetch(`${endpoint}/info`);
    const info = await infoRes.json();
    const modelMaxTokens = info.max_input_length || maxTokens;

    // Prepare chunks using Smart Chunker
    const { chunks, totalTokens } = prepareChunks(entities, modelMaxTokens);
    console.log(`    Chunked ${entities.length} entities → ${chunks.length} chunks`);

    const t0 = Date.now();
    const embeddings: number[][] = [];

    // TEI supports batch - process in batches
    const BATCH_SIZE = 16;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const res = await fetch(`${endpoint}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: batch, truncate: true }),
      });

      if (!res.ok) {
        console.log(`  [ERROR] TEI: ${res.status}`);
        return null;
      }

      const result = await res.json();
      embeddings.push(...result);
    }

    const totalTimeMs = Date.now() - t0;

    return {
      provider: "TEI (GPU)",
      model: info.model_id || "multilingual-e5-large",
      maxTokens: modelMaxTokens,
      dimensions: embeddings[0]?.length || 0,
      entityCount: entities.length,
      chunkCount: chunks.length,
      totalTimeMs,
      perEntityMs: Math.round((totalTimeMs / entities.length) * 10) / 10,
      perChunkMs: Math.round((totalTimeMs / chunks.length) * 10) / 10,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      totalTokensProcessed: totalTokens,
      effectiveTokensPerSec: Math.round(totalTokens / (totalTimeMs / 1000)),
    };
  } catch (e: any) {
    console.log(`  [ERROR] TEI: ${e.message}`);
    return null;
  }
}

async function benchmarkOpenVINO(
  model: string,
  entities: LargeEntity[],
  maxTokens: number
): Promise<BenchmarkResult | null> {
  try {
    const { OpenVINOProvider } = await import("../src/semantic/providers/openvino-provider.js");

    const provider = new OpenVINOProvider({
      model,
      device: "CPU",
      logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
    });

    await provider.initialize();

    // Prepare chunks using Smart Chunker
    const { chunks, totalTokens } = prepareChunks(entities, maxTokens);
    console.log(`    Chunked ${entities.length} entities → ${chunks.length} chunks`);

    const t0 = Date.now();
    const embeddings = await provider.embedBatch(chunks);
    const totalTimeMs = Date.now() - t0;

    await provider.close();

    return {
      provider: "OpenVINO (CPU)",
      model,
      maxTokens,
      dimensions: embeddings[0]?.length || 384,
      entityCount: entities.length,
      chunkCount: chunks.length,
      totalTimeMs,
      perEntityMs: Math.round((totalTimeMs / entities.length) * 10) / 10,
      perChunkMs: Math.round((totalTimeMs / chunks.length) * 10) / 10,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      totalTokensProcessed: totalTokens,
      effectiveTokensPerSec: Math.round(totalTokens / (totalTimeMs / 1000)),
    };
  } catch (e: any) {
    console.log(`  [ERROR] OpenVINO: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Large Entity Benchmark (>512 tokens)                          ║");
  console.log("║  Comparing 512 vs 8K context models                            ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Load large entities
  console.log("Loading entities from database...\n");
  const entities = await loadLargeEntities(512);

  if (entities.length === 0) {
    console.log("No entities >512 tokens found. Run 'index' first.");
    return;
  }

  // Stats
  const totalTokens = entities.reduce((s, e) => s + e.estimatedTokens, 0);
  const avgTokens = Math.round(totalTokens / entities.length);
  const maxTokensEntity = entities.reduce((a, b) => a.estimatedTokens > b.estimatedTokens ? a : b);

  console.log(`Found ${entities.length} entities exceeding 512 tokens:\n`);
  console.log(`  Average tokens: ${avgTokens}`);
  console.log(`  Max tokens:     ${maxTokensEntity.estimatedTokens} (${maxTokensEntity.name})`);
  console.log(`  Total tokens:   ${totalTokens}\n`);

  // Show top 5 largest
  console.log("Top 5 largest entities:");
  for (const e of entities.slice(0, 5)) {
    console.log(`  - ${e.type.padEnd(12)} ${e.name.slice(0, 40).padEnd(42)} ${e.lines} lines (~${e.estimatedTokens} tok)`);
  }
  console.log("");

  // Limit to first 50 for benchmark (speed)
  const testEntities = entities.slice(0, 50);
  console.log(`\nBenchmarking with ${testEntities.length} entities...\n`);

  const results512: BenchmarkResult[] = [];
  const results8K: BenchmarkResult[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 512 TOKEN MODELS (English)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("                  512 TOKEN MODELS (English)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // OpenVINO BGE Small EN
  console.log("Testing OpenVINO (bge-small-en-v1.5, 512 tokens)...");
  const ovBgeResult = await benchmarkOpenVINO("bge-small-en-v1.5", testEntities, 512);
  if (ovBgeResult) results512.push(ovBgeResult);

  // OpenVINO All-MiniLM (256 tokens)
  console.log("Testing OpenVINO (all-MiniLM-L6-v2, 256 tokens)...");
  const ovMiniResult = await benchmarkOpenVINO("all-MiniLM-L6-v2", testEntities, 256);
  if (ovMiniResult) results512.push(ovMiniResult);

  // Ollama all-minilm
  console.log("Testing Ollama (all-minilm, 512 tokens)...");
  const ollamaMiniResult = await benchmarkOllama("all-minilm", testEntities, 512);
  if (ollamaMiniResult) results512.push(ollamaMiniResult);

  // Ollama mxbai-embed-large
  console.log("Testing Ollama (mxbai-embed-large, 512 tokens)...");
  const ollamaMxbaiResult = await benchmarkOllama("mxbai-embed-large", testEntities, 512);
  if (ollamaMxbaiResult) results512.push(ollamaMxbaiResult);

  // Ollama granite-embedding:30m
  console.log("Testing Ollama (granite-embedding:30m, 512 tokens)...");
  const ollamaGraniteResult = await benchmarkOllama("granite-embedding:30m", testEntities, 512);
  if (ollamaGraniteResult) results512.push(ollamaGraniteResult);

  // ═══════════════════════════════════════════════════════════════════════════
  // 8K TOKEN MODELS (English)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("                   8K TOKEN MODELS (English)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Ollama nomic-embed-text
  console.log("Testing Ollama (nomic-embed-text, 8192 tokens)...");
  const ollamaNomicResult = await benchmarkOllama("nomic-embed-text", testEntities, 8192);
  if (ollamaNomicResult) results8K.push(ollamaNomicResult);

  // Ollama snowflake-arctic-embed2
  console.log("Testing Ollama (snowflake-arctic-embed2, 8192 tokens)...");
  const ollamaArcticResult = await benchmarkOllama("snowflake-arctic-embed2", testEntities, 8192);
  if (ollamaArcticResult) results8K.push(ollamaArcticResult);

  // TEI 8K - check if 8K model is running
  const teiInfo = await fetch(`${TEI_ENDPOINT}/info`).then(r => r.json()).catch(() => null);
  if (teiInfo && teiInfo.max_input_length >= 8000) {
    console.log(`Testing TEI (${teiInfo.model_id}, ${teiInfo.max_input_length} tokens)...`);
    const tei8KResult = await benchmarkTEI(TEI_ENDPOINT, testEntities, 8192);
    if (tei8KResult) results8K.push(tei8KResult);
  } else {
    console.log(`  [SKIP] TEI is running ${teiInfo?.model_id || 'unknown'} with ${teiInfo?.max_input_length || '?'} tokens (not 8K)`);
  }

  const results = [...results512, ...results8K];

  // Print results
  console.log("\n\n╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                      BENCHMARK RESULTS (Large Entities + Smart Chunker)                                 ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝\n");

  const printTable = (title: string, data: BenchmarkResult[]) => {
    if (data.length === 0) {
      console.log(`\n${title}: No results\n`);
      return;
    }
    console.log(`\n┌─── ${title} ${"─".repeat(80 - title.length)}┐`);
    console.log("│ Provider         Model                       Entities  Chunks   Total     Per-ent   Tokens/sec  │");
    console.log("├───────────────────────────────────────────────────────────────────────────────────────────────────┤");

    for (const r of data.sort((a, b) => a.perEntityMs - b.perEntityMs)) {
      const provider = r.provider.padEnd(16);
      const model = r.model.slice(0, 25).padEnd(25);
      const entities = String(r.entityCount).padStart(8);
      const chunks = String(r.chunkCount).padStart(7);
      const total = `${r.totalTimeMs}ms`.padStart(9);
      const perEnt = `${r.perEntityMs}ms`.padStart(9);
      const tokSec = String(r.effectiveTokensPerSec).padStart(11);
      console.log(`│ ${provider} ${model} ${entities}  ${chunks}  ${total}  ${perEnt}  ${tokSec}  │`);
    }
    console.log("└───────────────────────────────────────────────────────────────────────────────────────────────────┘");
  };

  printTable("512 TOKEN MODELS (with Smart Chunker)", results512);
  printTable("8K TOKEN MODELS (no chunking needed)", results8K);

  // Analysis
  console.log("\n═══════════════════════════════════════════════════════════════════════════════════════════════════════════");
  console.log("                                            ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════════════════════\n");

  // 512 analysis
  if (results512.length > 0) {
    const fastest512 = results512.reduce((a, b) => a.perEntityMs < b.perEntityMs ? a : b);
    console.log(`🏆 Fastest 512-token:       ${fastest512.provider} (${fastest512.model.slice(0, 25)})`);
    console.log(`   ${fastest512.perEntityMs}ms per entity, ${fastest512.chunkCount} chunks, ${fastest512.effectiveTokensPerSec} tok/s\n`);
  }

  // 8K analysis
  if (results8K.length > 0) {
    const fastest8K = results8K.reduce((a, b) => a.perEntityMs < b.perEntityMs ? a : b);
    console.log(`🏆 Fastest 8K-token:        ${fastest8K.provider} (${fastest8K.model.slice(0, 25)})`);
    console.log(`   ${fastest8K.perEntityMs}ms per entity, ${fastest8K.chunkCount} chunks, ${fastest8K.effectiveTokensPerSec} tok/s\n`);
  }

  // Head-to-head comparison
  if (results512.length > 0 && results8K.length > 0) {
    const best512 = results512.reduce((a, b) => a.totalTimeMs < b.totalTimeMs ? a : b);
    const best8K = results8K.reduce((a, b) => a.totalTimeMs < b.totalTimeMs ? a : b);

    console.log("📊 HEAD-TO-HEAD: 512 vs 8K");
    console.log(`   512 winner: ${best512.provider} - ${best512.totalTimeMs}ms total (${best512.chunkCount} chunks)`);
    console.log(`   8K winner:  ${best8K.provider} - ${best8K.totalTimeMs}ms total (${best8K.chunkCount} chunks)`);

    const speedup = (best8K.totalTimeMs / best512.totalTimeMs).toFixed(1);
    const chunkRatio = (best512.chunkCount / best8K.chunkCount).toFixed(1);

    if (best512.totalTimeMs < best8K.totalTimeMs) {
      console.log(`\n   ✅ 512 + Smart Chunker is ${speedup}x FASTER than 8K!`);
      console.log(`   📦 But requires ${chunkRatio}x more chunks (${best512.chunkCount} vs ${best8K.chunkCount})`);
    } else {
      console.log(`\n   ✅ 8K is ${(best512.totalTimeMs / best8K.totalTimeMs).toFixed(1)}x FASTER`);
      console.log(`   📦 And uses ${chunkRatio}x fewer chunks`);
    }
  }

  // Chunk analysis
  console.log("\n📊 Chunking Summary:");
  for (const r of [...results512, ...results8K]) {
    const ratio = (r.chunkCount / r.entityCount).toFixed(1);
    const ctx = r.maxTokens >= 8000 ? "8K" : "512";
    console.log(`   [${ctx}] ${r.provider.padEnd(16)} ${r.entityCount} ent → ${String(r.chunkCount).padStart(3)} chunks (${ratio}x) | ${r.totalTimeMs}ms | ${r.effectiveTokensPerSec} tok/s`);
  }

  console.log("\n💡 Key Insights:");
  console.log("   ✅ Smart Chunker preserves ALL content - no truncation!");
  console.log("   ✅ 512-token + chunking: more API calls, but faster per call");
  console.log("   ✅ 8K-token: fewer calls, but slower per call");
  console.log("   → Winner depends on: provider speed vs chunk overhead");
}

main().catch(console.error);
