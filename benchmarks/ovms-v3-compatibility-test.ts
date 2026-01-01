#!/usr/bin/env bun
/**
 * OVMS V3 Embeddings API Compatibility Test
 *
 * Tests which models support the /v3/embeddings endpoint with --task embeddings --pooling cls
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODELS = [
  {
    id: "all-MiniLM-L6-v2",
    ir_repo: "sentence-transformers/all-MiniLM-L6-v2",
    ir_subdir: "openvino",
    dimensions: 384,
  },
  {
    id: "multilingual-e5-base",
    ir_repo: "intfloat/multilingual-e5-base",
    ir_subdir: "openvino",
    dimensions: 768,
  },
  {
    id: "gte-small",
    ir_repo: "thenlper/gte-small",
    ir_subdir: "openvino",
    dimensions: 384,
  },
  {
    id: "distiluse-base-multilingual-cased-v2",
    ir_repo: "sentence-transformers/distiluse-base-multilingual-cased-v2",
    ir_subdir: "openvino",
    dimensions: 512,
  },
  {
    id: "paraphrase-multilingual-MiniLM-L12-v2",
    ir_repo: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    ir_subdir: "openvino",
    dimensions: 384,
  },
];

const POOLING_MODES = ["cls", "last"];
const CONTAINER_NAME = "ovms-v3-test";
const PORT = 8099;
const MODELS_DIR = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "UltraScriptTools", "models")
  : join(process.env.HOME || "/tmp", ".ultrascript", "models");

async function downloadModel(model: typeof MODELS[0]): Promise<string> {
  const modelDir = join(MODELS_DIR, model.id, "1");
  const xmlPath = join(modelDir, "openvino_model.xml");
  const binPath = join(modelDir, "openvino_model.bin");

  if (existsSync(xmlPath) && existsSync(binPath)) {
    console.log(`  ✓ Model ${model.id} already exists`);
    return join(MODELS_DIR, model.id);
  }

  console.log(`  Downloading ${model.id}...`);
  mkdirSync(modelDir, { recursive: true });

  const baseUrl = `https://huggingface.co/${model.ir_repo}/resolve/main`;
  const subdir = model.ir_subdir ? `/${model.ir_subdir}` : "";

  // Download XML
  const xmlUrl = `${baseUrl}${subdir}/openvino_model.xml`;
  const xmlRes = await fetch(xmlUrl, { headers: { "User-Agent": "ovms-test/1.0" } });
  if (!xmlRes.ok) throw new Error(`Failed to download XML: ${xmlRes.status}`);
  writeFileSync(xmlPath, Buffer.from(await xmlRes.arrayBuffer()));

  // Download BIN
  const binUrl = `${baseUrl}${subdir}/openvino_model.bin`;
  const binRes = await fetch(binUrl, { headers: { "User-Agent": "ovms-test/1.0" } });
  if (!binRes.ok) throw new Error(`Failed to download BIN: ${binRes.status}`);
  writeFileSync(binPath, Buffer.from(await binRes.arrayBuffer()));

  console.log(`  ✓ Downloaded ${model.id}`);
  return join(MODELS_DIR, model.id);
}

function stopContainer() {
  try {
    spawnSync("docker", ["stop", CONTAINER_NAME], { stdio: "pipe" });
    spawnSync("docker", ["rm", CONTAINER_NAME], { stdio: "pipe" });
  } catch { /* ignore */ }
}

async function startContainer(modelPath: string, pooling: string): Promise<boolean> {
  stopContainer();

  // Convert Windows path to Docker path
  const dockerPath = modelPath.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => `/${d.toLowerCase()}`);

  const cmd = [
    "docker", "run", "-d",
    "--name", CONTAINER_NAME,
    "-p", `${PORT}:8080`,
    "-v", `${dockerPath}:/models/embeddings`,
    "openvino/model_server:latest",
    "--model_path", "/models/embeddings",
    "--model_name", "embeddings",
    "--port", "9000",
    "--rest_port", "8080",
    "--target_device", "CPU",
    "--task", "embeddings",
    "--pooling", pooling,
  ];

  console.log(`  Starting OVMS with --pooling ${pooling}...`);
  const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", stdio: "pipe" });

  if (result.status !== 0) {
    console.log(`  ✗ Failed to start container: ${result.stderr}`);
    return false;
  }

  // Wait for startup
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const health = await fetch(`http://127.0.0.1:${PORT}/v2/health/ready`, {
        signal: AbortSignal.timeout(2000)
      });
      if (health.ok) {
        console.log(`  ✓ Container started`);
        return true;
      }
    } catch { /* retry */ }
  }

  // Check logs for errors
  const logs = spawnSync("docker", ["logs", CONTAINER_NAME], { encoding: "utf-8", stdio: "pipe" });
  if (logs.stdout?.includes("Only CLS and LAST pooling") || logs.stderr?.includes("Only CLS and LAST pooling")) {
    console.log(`  ✗ Model doesn't support embeddings task`);
    return false;
  }

  console.log(`  ✗ Container failed to start (timeout)`);
  return false;
}

async function testV3Api(dimensions: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/v3/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "embeddings",
        input: ["Hello world", "Test embedding"],
        encoding_format: "float",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  ✗ V3 API error: ${response.status} - ${text.slice(0, 100)}`);
      return false;
    }

    const json = await response.json() as any;
    if (json.data && json.data.length === 2) {
      const dim = json.data[0].embedding?.length || 0;
      console.log(`  ✓ V3 API works! Got ${dim} dimensions (expected ${dimensions})`);
      return dim === dimensions;
    }

    console.log(`  ✗ Unexpected response format`);
    return false;
  } catch (e: any) {
    console.log(`  ✗ V3 API request failed: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("OVMS V3 Embeddings API Compatibility Test");
  console.log("==========================================\n");

  const results: Array<{ model: string; pooling: string; v3Works: boolean }> = [];

  for (const model of MODELS) {
    console.log(`\nTesting: ${model.id}`);
    console.log("-".repeat(40));

    let modelPath: string;
    try {
      modelPath = await downloadModel(model);
    } catch (e: any) {
      console.log(`  ✗ Download failed: ${e.message}`);
      continue;
    }

    for (const pooling of POOLING_MODES) {
      const started = await startContainer(modelPath, pooling);
      if (started) {
        const v3Works = await testV3Api(model.dimensions);
        results.push({ model: model.id, pooling, v3Works });
      } else {
        results.push({ model: model.id, pooling, v3Works: false });
      }
      stopContainer();
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log("\nModel                                    | CLS  | LAST |");
  console.log("-".repeat(60));

  for (const model of MODELS) {
    const clsResult = results.find(r => r.model === model.id && r.pooling === "cls");
    const lastResult = results.find(r => r.model === model.id && r.pooling === "last");
    const cls = clsResult?.v3Works ? "✓" : "✗";
    const last = lastResult?.v3Works ? "✓" : "✗";
    console.log(`${model.id.padEnd(40)} | ${cls.padEnd(4)} | ${last.padEnd(4)} |`);
  }

  console.log("-".repeat(60));

  const compatible = results.filter(r => r.v3Works);
  if (compatible.length > 0) {
    console.log("\n✓ V3-compatible configurations:");
    for (const c of compatible) {
      console.log(`  - ${c.model} with --pooling ${c.pooling}`);
    }
  } else {
    console.log("\n✗ No V3-compatible models found.");
    console.log("  Recommendation: Use V2 API with client-side tokenization + pooling");
  }
}

main().catch(console.error);
