#!/usr/bin/env bun
/**
 * LLM Models Benchmark for AutoDoc
 *
 * Tests LLM models on documentation generation for code entities.
 * Uses the largest module in the project as test case.
 *
 * Usage:
 *   bun benchmarks/llm-benchmark.ts
 *   bun benchmarks/llm-benchmark.ts --provider=ollama --model=deepseek-coder
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const PROJECT_ROOT = join(import.meta.dir, "..");

interface LLMBenchmarkResult {
  id: string;
  provider: string;
  model: string;
  device: string;
  // Performance
  promptTokens: number;
  completionTokens: number;
  totalTimeMs: number;
  tokensPerSec: number;
  timeToFirstToken: number;
  // Quality
  outputLength: number;
  generatedDocs: string;
  // Status
  status: "success" | "skip" | "error";
  error?: string;
}

interface CodeEntity {
  name: string;
  type: string;
  code: string;
  lineCount: number;
}

// ============================================================================
// Code Extraction
// ============================================================================

function extractClassesFromFile(filePath: string): CodeEntity[] {
  const code = readFileSync(filePath, "utf-8");
  const lines = code.split("\n");
  const entities: CodeEntity[] = [];

  const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
  let match;

  while ((match = classRegex.exec(code)) !== null) {
    const name = match[1]!;
    const startLine = code.substring(0, match.index).split("\n").length - 1;
    const endLine = findBlockEnd(lines, startLine);
    const entityCode = lines.slice(startLine, endLine + 1).join("\n");

    entities.push({
      name,
      type: "class",
      code: entityCode,
      lineCount: endLine - startLine + 1,
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

  return Math.min(startLine + 100, lines.length - 1);
}

// ============================================================================
// Prompts
// ============================================================================

const AUTODOC_PROMPT = `You are a technical documentation expert. Generate comprehensive documentation for the following TypeScript code.

Include:
1. A brief description of what the class/module does
2. Key responsibilities and features
3. Important methods with their purposes
4. Usage examples if applicable
5. Any notable design patterns or architectural decisions

Be concise but complete. Use markdown formatting.

CODE:
\`\`\`typescript
{code}
\`\`\`

Generate the documentation:`;

// ============================================================================
// Ollama Benchmark
// ============================================================================

async function benchmarkOllama(
  modelId: string,
  entity: CodeEntity,
  installedModels: Set<string>
): Promise<LLMBenchmarkResult> {
  const result: LLMBenchmarkResult = {
    id: `ollama-${modelId}`,
    provider: "ollama",
    model: modelId,
    device: "GPU",
    promptTokens: 0,
    completionTokens: 0,
    totalTimeMs: 0,
    tokensPerSec: 0,
    timeToFirstToken: 0,
    outputLength: 0,
    generatedDocs: "",
    status: "success",
  };

  const baseModel = modelId.split(":")[0];
  if (!installedModels.has(baseModel)) {
    result.status = "skip";
    result.error = `Not installed. Run: ollama pull ${modelId}`;
    return result;
  }

  try {
    // Truncate code if too long (max ~4000 chars for prompt)
    const maxCodeLength = 4000;
    const code = entity.code.length > maxCodeLength
      ? entity.code.substring(0, maxCodeLength) + "\n// ... (truncated)"
      : entity.code;

    const prompt = AUTODOC_PROMPT.replace("{code}", code);
    result.promptTokens = Math.round(prompt.length / 4); // Estimate

    const startTime = Date.now();
    let firstTokenTime = 0;
    let fullResponse = "";

    // Use streaming to measure time to first token
    const response = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        prompt,
        stream: true,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            if (firstTokenTime === 0) {
              firstTokenTime = Date.now() - startTime;
            }
            fullResponse += json.response;
          }
        } catch { }
      }
    }

    result.totalTimeMs = Date.now() - startTime;
    result.timeToFirstToken = firstTokenTime;
    result.generatedDocs = fullResponse;
    result.outputLength = fullResponse.length;
    result.completionTokens = Math.round(fullResponse.length / 4);
    result.tokensPerSec = Math.round(result.completionTokens / (result.totalTimeMs / 1000));

    return result;
  } catch (e: any) {
    result.status = "error";
    result.error = e.message;
    return result;
  }
}

// ============================================================================
// Check Available Models
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

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(results: LLMBenchmarkResult[], entity: CodeEntity, date: string): string {
  const successful = results.filter(r => r.status === "success").sort((a, b) => b.tokensPerSec - a.tokensPerSec);

  let md = `# LLM Models Benchmark for AutoDoc

**Date:** ${date}
**Test Entity:** ${entity.name} (${entity.type}, ${entity.lineCount} lines)

## Hardware

| Component | Specification |
|-----------|---------------|
| CPU | Intel Core Ultra 9 275HX (24 cores) |
| GPU | NVIDIA GeForce RTX 5060 Laptop GPU (8GB VRAM) |

## Performance Results

| Rank | Model | Provider | Tokens/s | TTFT | Total Time | Output |
|------|-------|----------|----------|------|------------|--------|
`;

  let rank = 1;
  for (const r of successful) {
    const ttft = `${(r.timeToFirstToken / 1000).toFixed(2)}s`;
    const total = `${(r.totalTimeMs / 1000).toFixed(1)}s`;
    const output = `${r.outputLength} chars`;
    md += `| ${rank++} | ${r.model} | ${r.provider} | ${r.tokensPerSec} | ${ttft} | ${total} | ${output} |\n`;
  }

  // Sample outputs
  md += `\n## Sample Generated Documentation\n\n`;

  for (const r of successful) {
    md += `### ${r.model}\n\n`;
    md += `**Time:** ${(r.totalTimeMs / 1000).toFixed(1)}s, **Tokens/s:** ${r.tokensPerSec}\n\n`;
    md += "```markdown\n";
    md += r.generatedDocs.substring(0, 2000);
    if (r.generatedDocs.length > 2000) md += "\n... (truncated)";
    md += "\n```\n\n";
  }

  return md;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  LLM Models Benchmark for AutoDoc                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Parse args
  const args = process.argv.slice(2);
  const providerFilter = args.find(a => a.startsWith("--provider="))?.split("=")[1];
  const modelFilter = args.find(a => a.startsWith("--model="))?.split("=")[1];

  // Load test entity
  const testFile = join(PROJECT_ROOT, "src", "agents", "semantic-agent.ts");
  console.log(`📂 Loading test file: ${testFile}`);

  if (!existsSync(testFile)) {
    console.error("Test file not found!");
    process.exit(1);
  }

  const entities = extractClassesFromFile(testFile);
  const testEntity = entities[0];

  if (!testEntity) {
    console.error("No class found in test file!");
    process.exit(1);
  }

  console.log(`   Found: ${testEntity.name} (${testEntity.lineCount} lines)\n`);

  // Check available models
  console.log("🔍 Checking available LLM models...");
  const ollamaModels = await checkOllamaModels();

  console.log(`   Ollama: ${ollamaModels.size > 0 ? `✓ ${ollamaModels.size} models` : "✗ Not running"}`);
  if (ollamaModels.size > 0) {
    console.log(`     Models: ${[...ollamaModels].join(", ")}`);
  }
  console.log("");

  const results: LLMBenchmarkResult[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // Ollama Models
  // ═══════════════════════════════════════════════════════════════════════════

  if (ollamaModels.size > 0 && (!providerFilter || providerFilter === "ollama")) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Ollama LLM Models");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const ollamaLLMs = [
      "qwen3-coder:30b",
      "deepseek-coder:6.7b",
    ].filter(m => !modelFilter || m.includes(modelFilter));

    for (const model of ollamaLLMs) {
      console.log(`  Testing ${model}...`);

      const baseModel = model.split(":")[0];
      if (!ollamaModels.has(baseModel)) {
        console.log(`    ⏭️  Not installed`);
        results.push({
          id: `ollama-${model}`,
          provider: "ollama",
          model,
          device: "GPU",
          promptTokens: 0,
          completionTokens: 0,
          totalTimeMs: 0,
          tokensPerSec: 0,
          timeToFirstToken: 0,
          outputLength: 0,
          generatedDocs: "",
          status: "skip",
          error: `Not installed. Run: ollama pull ${model}`,
        });
        console.log("");
        continue;
      }

      console.log(`    Generating documentation for ${testEntity.name}...`);
      const result = await benchmarkOllama(model, testEntity, ollamaModels);
      results.push(result);

      if (result.status === "success") {
        console.log(`    ✓ ${result.tokensPerSec} tok/s, TTFT: ${(result.timeToFirstToken / 1000).toFixed(2)}s`);
        console.log(`    Total: ${(result.totalTimeMs / 1000).toFixed(1)}s, Output: ${result.outputLength} chars`);
      } else {
        console.log(`    ✗ ${result.error}`);
      }
      console.log("");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                              BENCHMARK RESULTS                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  const successful = results.filter(r => r.status === "success").sort((a, b) => b.tokensPerSec - a.tokensPerSec);

  if (successful.length > 0) {
    console.log("┌────────────────────────────────────────────────────────────────────────────────────┐");
    console.log("│  Model                      Provider   Tokens/s   TTFT      Total     Output      │");
    console.log("├────────────────────────────────────────────────────────────────────────────────────┤");

    for (const r of successful) {
      const model = r.model.padEnd(25);
      const provider = r.provider.padEnd(8);
      const tokPerSec = `${r.tokensPerSec}`.padStart(6);
      const ttft = `${(r.timeToFirstToken / 1000).toFixed(2)}s`.padStart(7);
      const total = `${(r.totalTimeMs / 1000).toFixed(1)}s`.padStart(7);
      const output = `${r.outputLength}`.padStart(6);
      console.log(`│  ${model}  ${provider}  ${tokPerSec}    ${ttft}   ${total}   ${output}      │`);
    }

    console.log("└────────────────────────────────────────────────────────────────────────────────────┘");
  }

  // Save report
  const date = new Date().toISOString().split("T")[0];
  const report = generateReport(results, testEntity, date);

  const resultsDir = join(PROJECT_ROOT, "benchmarks", "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const reportPath = join(resultsDir, `llm-benchmark-${date}.md`);
  writeFileSync(reportPath, report);
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  // Also save JSON
  const jsonPath = join(resultsDir, `llm-benchmark-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify({ date, entity: testEntity.name, results }, null, 2));
  console.log(`📊 Raw data saved to: ${jsonPath}`);
}

main().catch(console.error);
