#!/usr/bin/env bun
/**
 * Comprehensive Embedding Models Benchmark
 *
 * Tests all embedding providers with realistic code chunks using SmartChunker.
 * Simulates actual indexing workload on this project's codebase.
 *
 * Usage:
 *   bun benchmarks/embedding-benchmark.ts
 *   bun benchmarks/embedding-benchmark.ts --provider=openvino
 *   bun benchmarks/embedding-benchmark.ts --provider=ollama --model=all-minilm
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkCode, getChunkSettings, estimateTokens, needsChunking } from "../src/semantic/smart-chunker.js";

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const TEI_ENDPOINT = "http://127.0.0.1:8080";
const PROJECT_ROOT = join(import.meta.dir, "..");

interface BenchmarkResult {
  id: string;
  provider: string;
  model: string;
  device: string;
  contextTokens: number;
  dimensions: number;
  // Metrics
  totalChunks: number;
  totalTimeMs: number;
  initTimeMs: number;
  perChunkMs: number;
  tokensPerSec: number;
  throughputChunksPerSec: number;
  // Memory
  peakMemoryMB?: number;
  // Status
  status: "success" | "skip" | "error";
  error?: string;
}

interface CodeEntity {
  id: string;
  name: string;
  type: string;
  filePath: string;
  code: string;
  lineCount: number;
  tokenEstimate: number;
}

// ============================================================================
// Code Loading with Entity Extraction
// ============================================================================

function extractEntitiesFromFile(filePath: string, code: string): CodeEntity[] {
  const entities: CodeEntity[] = [];
  const lines = code.split("\n");
  const relPath = relative(PROJECT_ROOT, filePath);

  // Simple regex-based entity extraction for TypeScript
  const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
  const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
  const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/gm;
  const typeRegex = /^(?:export\s+)?type\s+(\w+)/gm;

  // Find all entities with their positions
  let match;

  while ((match = classRegex.exec(code)) !== null) {
    const name = match[1];
    const startLine = code.substring(0, match.index).split("\n").length - 1;
    const endLine = findBlockEnd(lines, startLine);
    const entityCode = lines.slice(startLine, endLine + 1).join("\n");

    entities.push({
      id: `${relPath}:class:${name}`,
      name: name!,
      type: "class",
      filePath: relPath,
      code: entityCode,
      lineCount: endLine - startLine + 1,
      tokenEstimate: estimateTokens(entityCode),
    });
  }

  while ((match = functionRegex.exec(code)) !== null) {
    const name = match[1];
    const startLine = code.substring(0, match.index).split("\n").length - 1;
    const endLine = findBlockEnd(lines, startLine);
    const entityCode = lines.slice(startLine, endLine + 1).join("\n");

    entities.push({
      id: `${relPath}:function:${name}`,
      name: name!,
      type: "function",
      filePath: relPath,
      code: entityCode,
      lineCount: endLine - startLine + 1,
      tokenEstimate: estimateTokens(entityCode),
    });
  }

  while ((match = interfaceRegex.exec(code)) !== null) {
    const name = match[1];
    const startLine = code.substring(0, match.index).split("\n").length - 1;
    const endLine = findBlockEnd(lines, startLine);
    const entityCode = lines.slice(startLine, endLine + 1).join("\n");

    entities.push({
      id: `${relPath}:interface:${name}`,
      name: name!,
      type: "interface",
      filePath: relPath,
      code: entityCode,
      lineCount: endLine - startLine + 1,
      tokenEstimate: estimateTokens(entityCode),
    });
  }

  return entities;
}

function findBlockEnd(lines: string[], startLine: number): number {
  let braceCount = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const char of line) {
      if (char === "{") {
        braceCount++;
        started = true;
      } else if (char === "}") {
        braceCount--;
        if (started && braceCount === 0) {
          return i;
        }
      }
    }
  }

  return Math.min(startLine + 50, lines.length - 1);
}

function loadProjectEntities(maxEntities = 100): CodeEntity[] {
  const entities: CodeEntity[] = [];
  const srcDir = join(PROJECT_ROOT, "src");

  function walk(dir: string) {
    if (entities.length >= maxEntities) return;

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entities.length >= maxEntities) return;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          if (!["node_modules", "dist", ".git", "coverage", "__tests__"].includes(entry)) {
            walk(fullPath);
          }
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            const fileEntities = extractEntitiesFromFile(fullPath, content);
            entities.push(...fileEntities);
          } catch { }
        }
      }
    } catch { }
  }

  walk(srcDir);
  return entities.slice(0, maxEntities);
}

// ============================================================================
// Prepare chunks using SmartChunker
// ============================================================================

interface PreparedChunk {
  id: string;
  content: string;
  entityId: string;
  tokenCount: number;
}

function prepareChunksForProvider(entities: CodeEntity[], maxTokens: number): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  const settings = getChunkSettings(maxTokens);

  for (const entity of entities) {
    if (needsChunking(entity.code, maxTokens)) {
      // Split large entity
      const entityChunks = chunkCode(
        entity.id,
        entity.code,
        `// ${entity.type} ${entity.name} from ${entity.filePath}`,
        settings
      );
      for (const chunk of entityChunks) {
        chunks.push({
          id: chunk.id,
          content: chunk.content,
          entityId: entity.id,
          tokenCount: chunk.tokenCount,
        });
      }
    } else {
      // Use as-is
      chunks.push({
        id: entity.id,
        content: entity.code,
        entityId: entity.id,
        tokenCount: entity.tokenEstimate,
      });
    }
  }

  return chunks;
}

// ============================================================================
// Provider Benchmarks
// ============================================================================

async function benchmarkOpenVINO(
  modelId: string,
  modelName: string,
  chunks: PreparedChunk[],
  maxTokens: number
): Promise<BenchmarkResult> {
  const result: BenchmarkResult = {
    id: modelId,
    provider: "openvino",
    model: modelName,
    device: "CPU",
    contextTokens: maxTokens,
    dimensions: 0,
    totalChunks: chunks.length,
    totalTimeMs: 0,
    initTimeMs: 0,
    perChunkMs: 0,
    tokensPerSec: 0,
    throughputChunksPerSec: 0,
    status: "success",
  };

  try {
    const { OpenVINOProvider } = await import("../src/semantic/providers/openvino-provider.js");

    const initStart = Date.now();
    const provider = new OpenVINOProvider({
      model: modelName,
      device: "CPU",
      autoDownload: true,
      logger: { info: () => { }, debug: () => { }, warn: () => { }, error: () => { } },
    });

    await provider.initialize();
    result.initTimeMs = Date.now() - initStart;
    result.dimensions = provider.getDimension() || 384;

    // Warmup
    await provider.embed("warmup text");

    // Benchmark
    const texts = chunks.map(c => c.content);
    const batchStart = Date.now();
    const embeddings = await provider.embedBatch(texts);
    result.totalTimeMs = Date.now() - batchStart;

    await provider.close();

    // Calculate metrics
    const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    result.perChunkMs = result.totalTimeMs / chunks.length;
    result.tokensPerSec = Math.round(totalTokens / (result.totalTimeMs / 1000));
    result.throughputChunksPerSec = Math.round(chunks.length / (result.totalTimeMs / 1000));

    return result;
  } catch (e: any) {
    result.status = "error";
    result.error = e.message;
    return result;
  }
}

async function benchmarkOllama(
  modelId: string,
  modelName: string,
  chunks: PreparedChunk[],
  maxTokens: number,
  installedModels: Set<string>
): Promise<BenchmarkResult> {
  const result: BenchmarkResult = {
    id: modelId,
    provider: "ollama",
    model: modelName,
    device: "GPU",
    contextTokens: maxTokens,
    dimensions: 0,
    totalChunks: chunks.length,
    totalTimeMs: 0,
    initTimeMs: 0,
    perChunkMs: 0,
    tokensPerSec: 0,
    throughputChunksPerSec: 0,
    status: "success",
  };

  const baseModel = modelName.split(":")[0];
  if (!installedModels.has(baseModel)) {
    result.status = "skip";
    result.error = `Not installed. Run: ollama pull ${modelName}`;
    return result;
  }

  try {
    // Warmup
    const warmupRes = await fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, input: "warmup" }),
    });
    const warmupData = await warmupRes.json();
    result.dimensions = warmupData.embeddings?.[0]?.length || 0;

    // Benchmark with concurrency
    const CONCURRENCY = 8;
    const texts = chunks.map(c => c.content);

    const batchStart = Date.now();

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(text =>
          fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelName, input: text }),
          })
        )
      );
    }

    result.totalTimeMs = Date.now() - batchStart;

    // Calculate metrics
    const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    result.perChunkMs = result.totalTimeMs / chunks.length;
    result.tokensPerSec = Math.round(totalTokens / (result.totalTimeMs / 1000));
    result.throughputChunksPerSec = Math.round(chunks.length / (result.totalTimeMs / 1000));

    return result;
  } catch (e: any) {
    result.status = "error";
    result.error = e.message;
    return result;
  }
}

async function benchmarkTEI(
  modelId: string,
  chunks: PreparedChunk[],
  maxTokens: number
): Promise<BenchmarkResult> {
  const result: BenchmarkResult = {
    id: modelId,
    provider: "tei",
    model: "",
    device: "GPU",
    contextTokens: maxTokens,
    dimensions: 0,
    totalChunks: chunks.length,
    totalTimeMs: 0,
    initTimeMs: 0,
    perChunkMs: 0,
    tokensPerSec: 0,
    throughputChunksPerSec: 0,
    status: "success",
  };

  try {
    // Check health and get model info
    const infoRes = await fetch(`${TEI_ENDPOINT}/info`);
    if (!infoRes.ok) {
      result.status = "skip";
      result.error = "TEI not running";
      return result;
    }

    const info = await infoRes.json();
    result.model = info.model_id || "unknown";
    result.dimensions = info.model_type?.dims || 0;

    // Warmup
    await fetch(`${TEI_ENDPOINT}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: ["warmup"], truncate: true }),
    });

    // Benchmark with native batching
    const BATCH_SIZE = 32;
    const texts = chunks.map(c => c.content);

    const batchStart = Date.now();

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await fetch(`${TEI_ENDPOINT}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: batch, truncate: true }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const embeddings = await res.json();
      if (!result.dimensions && embeddings[0]) {
        result.dimensions = embeddings[0].length;
      }
    }

    result.totalTimeMs = Date.now() - batchStart;

    // Calculate metrics
    const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    result.perChunkMs = result.totalTimeMs / chunks.length;
    result.tokensPerSec = Math.round(totalTokens / (result.totalTimeMs / 1000));
    result.throughputChunksPerSec = Math.round(chunks.length / (result.totalTimeMs / 1000));

    return result;
  } catch (e: any) {
    result.status = "error";
    result.error = e.message;
    return result;
  }
}

// ============================================================================
// Check Available Providers
// ============================================================================

async function checkOllamaModels(): Promise<Set<string>> {
  try {
    const res = await fetch(`${OLLAMA_ENDPOINT}/api/tags`);
    const data = await res.json();
    return new Set(data.models?.map((m: any) => m.name.split(":")[0]) || []);
  } catch {
    return new Set();
  }
}

async function checkTEI(): Promise<boolean> {
  try {
    const res = await fetch(`${TEI_ENDPOINT}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(results: BenchmarkResult[], entities: CodeEntity[], date: string): string {
  const successful = results.filter(r => r.status === "success").sort((a, b) => a.perChunkMs - b.perChunkMs);
  const skipped = results.filter(r => r.status === "skip");
  const errored = results.filter(r => r.status === "error");

  const totalEntities = entities.length;
  const avgEntitySize = Math.round(entities.reduce((s, e) => s + e.lineCount, 0) / entities.length);
  const largestEntity = entities.reduce((max, e) => e.lineCount > max.lineCount ? e : max, entities[0]!);

  let md = `# Embedding Models Benchmark Results

**Date:** ${date}
**Project:** ultrascript-tools-mcp

## Hardware

| Component | Specification |
|-----------|---------------|
| CPU | Intel Core Ultra 9 275HX (24 cores) |
| GPU | NVIDIA GeForce RTX 5060 Laptop GPU (8GB VRAM) |
| RAM | System RAM |

## Test Dataset

| Metric | Value |
|--------|-------|
| Total Entities | ${totalEntities} |
| Average Lines/Entity | ${avgEntitySize} |
| Largest Entity | ${largestEntity.name} (${largestEntity.lineCount} lines) |
| SmartChunker | Enabled (adaptive chunking) |

## Performance Results

### Ranking by Speed (chunks/sec)

| Rank | Model | Provider | Device | Chunks/s | ms/chunk | Tokens/s | Context | Dim |
|------|-------|----------|--------|----------|----------|----------|---------|-----|
`;

  let rank = 1;
  for (const r of successful) {
    md += `| ${rank++} | ${r.model} | ${r.provider} | ${r.device} | ${r.throughputChunksPerSec} | ${r.perChunkMs.toFixed(1)} | ${r.tokensPerSec} | ${r.contextTokens} | ${r.dimensions} |\n`;
  }

  md += `
### Detailed Results

`;

  for (const r of successful) {
    md += `#### ${r.model} (${r.provider})

- **Device:** ${r.device}
- **Init Time:** ${r.initTimeMs}ms
- **Total Time:** ${r.totalTimeMs}ms for ${r.totalChunks} chunks
- **Throughput:** ${r.throughputChunksPerSec} chunks/sec, ${r.tokensPerSec} tokens/sec
- **Latency:** ${r.perChunkMs.toFixed(2)}ms per chunk
- **Context:** ${r.contextTokens} tokens
- **Dimensions:** ${r.dimensions}

`;
  }

  if (skipped.length > 0) {
    md += `### Skipped Models

| Model | Provider | Reason |
|-------|----------|--------|
`;
    for (const r of skipped) {
      md += `| ${r.model || r.id} | ${r.provider} | ${r.error} |\n`;
    }
    md += "\n";
  }

  if (errored.length > 0) {
    md += `### Errors

| Model | Provider | Error |
|-------|----------|-------|
`;
    for (const r of errored) {
      md += `| ${r.model || r.id} | ${r.provider} | ${r.error} |\n`;
    }
    md += "\n";
  }

  // Recommendations
  const bestOverall = successful[0];
  const bestLargeContext = successful.find(r => r.contextTokens >= 8192);
  const bestOpenVINO = successful.find(r => r.provider === "openvino");
  const bestOllama = successful.find(r => r.provider === "ollama");

  md += `## Recommendations

### By Use Case

| Use Case | Recommended Model | Provider | Throughput |
|----------|-------------------|----------|------------|
`;

  if (bestOverall) {
    md += `| **Fastest Overall** | ${bestOverall.model} | ${bestOverall.provider} | ${bestOverall.throughputChunksPerSec} chunks/s |\n`;
  }
  if (bestLargeContext) {
    md += `| **Large Context (8K+)** | ${bestLargeContext.model} | ${bestLargeContext.provider} | ${bestLargeContext.throughputChunksPerSec} chunks/s |\n`;
  }
  if (bestOpenVINO) {
    md += `| **Best CPU Only** | ${bestOpenVINO.model} | ${bestOpenVINO.provider} | ${bestOpenVINO.throughputChunksPerSec} chunks/s |\n`;
  }
  if (bestOllama) {
    md += `| **Best Ollama** | ${bestOllama.model} | ${bestOllama.provider} | ${bestOllama.throughputChunksPerSec} chunks/s |\n`;
  }

  md += `
### Quick Selection Guide

- **Development (fast indexing):** ${bestOverall?.model || "N/A"} - fastest iteration
- **Production (quality):** ${bestLargeContext?.model || bestOverall?.model || "N/A"} - large context for full entities
- **No GPU:** ${bestOpenVINO?.model || "N/A"} - OpenVINO CPU inference
- **Easy setup:** ${bestOllama?.model || "N/A"} - just \`ollama pull\`
`;

  return md;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Embedding Models Benchmark                                    ║");
  console.log("║  Using SmartChunker for realistic code chunks                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Parse args
  const args = process.argv.slice(2);
  const providerFilter = args.find(a => a.startsWith("--provider="))?.split("=")[1];
  const modelFilter = args.find(a => a.startsWith("--model="))?.split("=")[1];

  // Load entities
  console.log("📂 Loading project entities...");
  const entities = loadProjectEntities(100);
  console.log(`   Found ${entities.length} entities`);

  const largestEntity = entities.reduce((max, e) => e.lineCount > max.lineCount ? e : max, entities[0]!);
  console.log(`   Largest: ${largestEntity.name} (${largestEntity.lineCount} lines, ~${largestEntity.tokenEstimate} tokens)\n`);

  // Check providers
  console.log("🔍 Checking available providers...");
  const ollamaModels = await checkOllamaModels();
  const teiRunning = await checkTEI();

  console.log(`   OpenVINO: ✓ Available (CPU)`);
  console.log(`   Ollama: ${ollamaModels.size > 0 ? `✓ ${ollamaModels.size} models` : "✗ Not running"}`);
  if (ollamaModels.size > 0) {
    console.log(`     Models: ${[...ollamaModels].slice(0, 5).join(", ")}${ollamaModels.size > 5 ? "..." : ""}`);
  }
  console.log(`   TEI: ${teiRunning ? "✓ Running" : "✗ Not running"}\n`);

  const results: BenchmarkResult[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // OpenVINO Models
  // ═══════════════════════════════════════════════════════════════════════════

  if (!providerFilter || providerFilter === "openvino") {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  OpenVINO Models (CPU INT8)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const openvinoModels = [
      { id: "openvino-minilm-int8", name: "all-MiniLM-L6-v2", maxTokens: 256 },
      { id: "openvino-bge-int8", name: "bge-small-en-v1.5", maxTokens: 512 },
      { id: "openvino-gte-int8", name: "gte-small", maxTokens: 512 },
      { id: "openvino-multilingual-e5-int8", name: "multilingual-e5-small", maxTokens: 512 },
      { id: "openvino-paraphrase-multi-int8", name: "paraphrase-multilingual-MiniLM-L12-v2", maxTokens: 128 },
    ].filter(m => !modelFilter || m.id.includes(modelFilter) || m.name.includes(modelFilter));

    for (const model of openvinoModels) {
      console.log(`  Testing ${model.name}...`);

      // Prepare chunks for this model's context window
      const chunks = prepareChunksForProvider(entities, model.maxTokens);
      console.log(`    Prepared ${chunks.length} chunks (max ${model.maxTokens} tokens)`);

      const result = await benchmarkOpenVINO(model.id, model.name, chunks, model.maxTokens);
      results.push(result);

      if (result.status === "success") {
        console.log(`    ✓ ${result.throughputChunksPerSec} chunks/s, ${result.perChunkMs.toFixed(1)}ms/chunk, ${result.tokensPerSec} tok/s`);
      } else {
        console.log(`    ✗ ${result.error}`);
      }
      console.log("");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Ollama Models
  // ═══════════════════════════════════════════════════════════════════════════

  if (ollamaModels.size > 0 && (!providerFilter || providerFilter === "ollama")) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Ollama Models (GPU)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const ollamaModelsList = [
      { id: "ollama-all-minilm", name: "all-minilm", maxTokens: 512 },
      { id: "ollama-snowflake-arctic", name: "snowflake-arctic-embed2", maxTokens: 8192 },
      { id: "ollama-snowflake-arctic-s", name: "snowflake-arctic-embed:s", maxTokens: 512 },
      { id: "ollama-mxbai-large", name: "mxbai-embed-large", maxTokens: 512 },
      { id: "ollama-nomic-embed", name: "nomic-embed-text", maxTokens: 8192 },
      { id: "ollama-granite-en", name: "granite-embedding:30m", maxTokens: 512 },
      { id: "ollama-granite-multilingual", name: "granite-embedding:278m", maxTokens: 512 },
    ].filter(m => !modelFilter || m.id.includes(modelFilter) || m.name.includes(modelFilter));

    for (const model of ollamaModelsList) {
      console.log(`  Testing ${model.name}...`);

      const baseModel = model.name.split(":")[0];
      if (!ollamaModels.has(baseModel)) {
        console.log(`    ⏭️  Not installed`);
        results.push({
          id: model.id,
          provider: "ollama",
          model: model.name,
          device: "GPU",
          contextTokens: model.maxTokens,
          dimensions: 0,
          totalChunks: 0,
          totalTimeMs: 0,
          initTimeMs: 0,
          perChunkMs: 0,
          tokensPerSec: 0,
          throughputChunksPerSec: 0,
          status: "skip",
          error: `Not installed. Run: ollama pull ${model.name}`,
        });
        console.log("");
        continue;
      }

      const chunks = prepareChunksForProvider(entities, model.maxTokens);
      console.log(`    Prepared ${chunks.length} chunks (max ${model.maxTokens} tokens)`);

      const result = await benchmarkOllama(model.id, model.name, chunks, model.maxTokens, ollamaModels);
      results.push(result);

      if (result.status === "success") {
        console.log(`    ✓ ${result.throughputChunksPerSec} chunks/s, ${result.perChunkMs.toFixed(1)}ms/chunk, ${result.tokensPerSec} tok/s`);
      } else {
        console.log(`    ✗ ${result.error}`);
      }
      console.log("");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEI
  // ═══════════════════════════════════════════════════════════════════════════

  if (teiRunning && (!providerFilter || providerFilter === "tei")) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  TEI Model (GPU Docker)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log(`  Testing TEI...`);
    const chunks = prepareChunksForProvider(entities, 8192);
    console.log(`    Prepared ${chunks.length} chunks (max 8192 tokens)`);

    const result = await benchmarkTEI("tei-current", chunks, 8192);
    results.push(result);

    if (result.status === "success") {
      console.log(`    ✓ ${result.throughputChunksPerSec} chunks/s, ${result.perChunkMs.toFixed(1)}ms/chunk, ${result.tokensPerSec} tok/s`);
      console.log(`    Model: ${result.model}`);
    } else {
      console.log(`    ✗ ${result.error}`);
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                              BENCHMARK RESULTS                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  const successful = results.filter(r => r.status === "success").sort((a, b) => b.throughputChunksPerSec - a.throughputChunksPerSec);

  if (successful.length > 0) {
    console.log("┌────────────────────────────────────────────────────────────────────────────────────┐");
    console.log("│  Rank  Model                          Provider   Device  Chunks/s  ms/chunk  Ctx  │");
    console.log("├────────────────────────────────────────────────────────────────────────────────────┤");

    let rank = 1;
    for (const r of successful) {
      const model = r.model.slice(0, 30).padEnd(30);
      const provider = r.provider.padEnd(8);
      const device = r.device.padEnd(5);
      const chunksPerSec = `${r.throughputChunksPerSec}`.padStart(6);
      const msPerChunk = `${r.perChunkMs.toFixed(1)}`.padStart(7);
      const ctx = `${r.contextTokens}`.padStart(5);
      console.log(`│  ${rank.toString().padStart(2)}    ${model}  ${provider}  ${device}  ${chunksPerSec}   ${msPerChunk}  ${ctx}  │`);
      rank++;
    }

    console.log("└────────────────────────────────────────────────────────────────────────────────────┘");
  }

  // Save report
  const date = new Date().toISOString().split("T")[0];
  const report = generateReport(results, entities, date);

  const resultsDir = join(PROJECT_ROOT, "benchmarks", "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const reportPath = join(resultsDir, `embedding-benchmark-${date}.md`);
  writeFileSync(reportPath, report);
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  // Also save JSON for analysis
  const jsonPath = join(resultsDir, `embedding-benchmark-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify({ date, entities: entities.length, results }, null, 2));
  console.log(`📊 Raw data saved to: ${jsonPath}`);
}

main().catch(console.error);
