#!/usr/bin/env bun
/**
 * LLM Benchmark Script
 * Tests Ollama, OpenVINO CPU, OpenVINO NPU performance on code documentation
 */

import { spawn, execSync } from "child_process";

interface BenchmarkResult {
  model: string;
  provider: string;
  device: string;
  ttft: number; // Time to first token (seconds)
  totalTime: number;
  tokensGenerated: number;
  tokensPerSec: number;
  outputChars: number;
  error?: string;
}

// Test prompt - generate documentation for a TypeScript class
const TEST_CODE = `
class SemanticAgent {
  private embeddingGenerator: EmbeddingGenerator;
  private searchEngine: HybridSearchEngine;
  private cache: SemanticCache;
  private circuitBreaker: CircuitBreaker;

  constructor(config: SemanticConfig) {
    this.embeddingGenerator = new EmbeddingGenerator(config);
    this.searchEngine = new HybridSearchEngine(config);
    this.cache = new SemanticCache(config.cacheSize);
    this.circuitBreaker = new CircuitBreaker(config.failureThreshold);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return this.circuitBreaker.execute(async () => {
      const cached = await this.cache.getMany(texts);
      const missing = texts.filter((_, i) => !cached[i]);
      if (missing.length > 0) {
        const generated = await this.embeddingGenerator.batchGenerate(missing);
        await this.cache.setMany(missing, generated);
      }
      return texts.map((t, i) => cached[i] || this.cache.get(t));
    });
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const embedding = await this.generateEmbeddings([query]);
    return this.searchEngine.hybridSearch(embedding[0], options);
  }
}
`;

const PROMPT = `Generate documentation for the following TypeScript class. Include overview, key methods, and design patterns used:

${TEST_CODE}`;

async function benchmarkOllama(model: string): Promise<BenchmarkResult> {
  console.log(`\n🦙 Testing Ollama: ${model}...`);

  const startTime = Date.now();
  let ttft = 0;
  let output = "";
  let firstToken = false;

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: PROMPT,
        stream: true,
        options: {
          num_predict: 512,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            if (!firstToken) {
              ttft = (Date.now() - startTime) / 1000;
              firstToken = true;
            }
            output += data.response;
          }
        } catch {}
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const tokensGenerated = Math.round(output.length / 4); // ~4 chars per token estimate

    return {
      model,
      provider: "ollama",
      device: "GPU",
      ttft,
      totalTime,
      tokensGenerated,
      tokensPerSec: tokensGenerated / totalTime,
      outputChars: output.length,
    };
  } catch (error) {
    return {
      model,
      provider: "ollama",
      device: "GPU",
      ttft: 0,
      totalTime: 0,
      tokensGenerated: 0,
      tokensPerSec: 0,
      outputChars: 0,
      error: String(error),
    };
  }
}

async function benchmarkOpenVINO(modelId: string, device: string): Promise<BenchmarkResult> {
  console.log(`\n🔷 Testing OpenVINO: ${modelId} on ${device}...`);

  const script = `
import time
import openvino_genai as ov_genai

model_id = "${modelId}"
device = "${device}"
prompt = """${PROMPT}"""

try:
    start = time.time()
    pipe = ov_genai.LLMPipeline(model_id, device)
    load_time = time.time() - start

    start = time.time()
    ttft = 0
    tokens = 0
    output = ""

    streamer = ov_genai.StreamerBase()

    # Non-streaming for simplicity
    result = pipe.generate(prompt, max_new_tokens=512, temperature=0.3)

    total_time = time.time() - start
    output = result
    tokens = len(output.split())

    print(f"RESULT:ttft={load_time:.2f},total={total_time:.2f},tokens={tokens},chars={len(output)}")
except Exception as e:
    print(f"ERROR:{e}")
`;

  try {
    const result = execSync(`python -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: 120000,
    });

    if (result.includes("ERROR:")) {
      return {
        model: modelId,
        provider: "openvino",
        device,
        ttft: 0,
        totalTime: 0,
        tokensGenerated: 0,
        tokensPerSec: 0,
        outputChars: 0,
        error: result.split("ERROR:")[1].trim(),
      };
    }

    const match = result.match(
      /RESULT:ttft=(\d+\.?\d*),total=(\d+\.?\d*),tokens=(\d+),chars=(\d+)/,
    );
    if (match) {
      const ttft = parseFloat(match[1]);
      const totalTime = parseFloat(match[2]);
      const tokens = parseInt(match[3]);
      const chars = parseInt(match[4]);

      return {
        model: modelId,
        provider: "openvino",
        device,
        ttft,
        totalTime,
        tokensGenerated: tokens,
        tokensPerSec: tokens / totalTime,
        outputChars: chars,
      };
    }

    throw new Error("Could not parse OpenVINO output");
  } catch (error) {
    return {
      model: modelId,
      provider: "openvino",
      device,
      ttft: 0,
      totalTime: 0,
      tokensGenerated: 0,
      tokensPerSec: 0,
      outputChars: 0,
      error: String(error),
    };
  }
}

async function runBenchmarks() {
  console.log("=".repeat(70));
  console.log("LLM BENCHMARK - Code Documentation Generation");
  console.log("=".repeat(70));
  console.log("Task: Generate documentation for TypeScript class (~50 lines)");
  console.log("Max tokens: 512");
  console.log("");

  const results: BenchmarkResult[] = [];

  // Ollama benchmarks
  const ollamaModels = ["qwen2.5-coder:7b", "phi4-mini", "deepseek-coder:6.7b"];

  for (const model of ollamaModels) {
    const result = await benchmarkOllama(model);
    results.push(result);
    if (!result.error) {
      console.log(`  ✅ ${result.tokensPerSec.toFixed(1)} tok/s, TTFT: ${result.ttft.toFixed(2)}s`);
    } else {
      console.log(`  ❌ ${result.error}`);
    }
  }

  // OpenVINO CPU benchmarks
  // Note: These need models to be downloaded first
  const openvinoModels = [
    { id: "OpenVINO/Phi-4-mini-instruct-int4-ov", name: "phi-4-mini" },
    // { id: "OpenVINO/Qwen2.5-Coder-7B-Instruct-int4-ov", name: "qwen2.5-coder-7b" },
  ];

  for (const model of openvinoModels) {
    const result = await benchmarkOpenVINO(model.id, "CPU");
    results.push(result);
    if (!result.error) {
      console.log(`  ✅ ${result.tokensPerSec.toFixed(1)} tok/s, TTFT: ${result.ttft.toFixed(2)}s`);
    } else {
      console.log(`  ❌ ${result.error}`);
    }
  }

  // OpenVINO NPU benchmarks (if available)
  const npuModels = [{ id: "OpenVINO/Qwen3-4B-int4-ov", name: "qwen3-4b" }];

  for (const model of npuModels) {
    const result = await benchmarkOpenVINO(model.id, "NPU");
    results.push(result);
    if (!result.error) {
      console.log(`  ✅ ${result.tokensPerSec.toFixed(1)} tok/s, TTFT: ${result.ttft.toFixed(2)}s`);
    } else {
      console.log(`  ❌ ${result.error}`);
    }
  }

  // Print results table
  console.log("\n" + "=".repeat(70));
  console.log("RESULTS");
  console.log("=".repeat(70));
  console.log("");
  console.log("| Rank | Model | Provider | Device | Tok/s | TTFT | Total | Status |");
  console.log("|------|-------|----------|--------|-------|------|-------|--------|");

  const successful = results
    .filter((r) => !r.error)
    .sort((a, b) => b.tokensPerSec - a.tokensPerSec);
  const failed = results.filter((r) => r.error);

  successful.forEach((r, i) => {
    console.log(
      `| ${i + 1} | ${r.model} | ${r.provider} | ${r.device} | ${r.tokensPerSec.toFixed(1)} | ${r.ttft.toFixed(2)}s | ${r.totalTime.toFixed(1)}s | ✅ |`,
    );
  });

  failed.forEach((r) => {
    console.log(
      `| - | ${r.model} | ${r.provider} | ${r.device} | - | - | - | ❌ ${r.error?.substring(0, 30)} |`,
    );
  });

  console.log("\n✅ Benchmark complete!");
}

runBenchmarks().catch(console.error);
