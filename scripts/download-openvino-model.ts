/**
 * Download pre-converted OpenVINO IR model from HuggingFace
 *
 * This avoids the need for Python-based model conversion.
 * OpenVINO IR format is optimized and may work better on NPU.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODELS_DIR = join(import.meta.dir, "..", "models");

interface ModelConfig {
  name: string;
  repo: string;
  files: string[];
  subdir?: string;
}

const MODELS: Record<string, ModelConfig> = {
  "all-MiniLM-L6-v2-ov": {
    name: "all-MiniLM-L6-v2-openvino",
    repo: "sentence-transformers/all-MiniLM-L6-v2",
    subdir: "openvino",
    files: [
      "openvino_model.xml",
      "openvino_model.bin",
    ],
  },
  "all-MiniLM-L6-v2-ov-int8": {
    name: "all-MiniLM-L6-v2-openvino-int8",
    repo: "sentence-transformers/all-MiniLM-L6-v2",
    subdir: "openvino",
    files: [
      "openvino_model_qint8_quantized.xml",
      "openvino_model_qint8_quantized.bin",
    ],
  },
  // Alternative from llmware (may have different optimizations)
  "llmware-minilm-ov": {
    name: "llmware-all-mini-lm-l6-v2-ov",
    repo: "llmware/all-mini-lm-l6-v2-ov",
    files: [
      "openvino_model.xml",
      "openvino_model.bin",
    ],
  },
  // BGE - ONNX format (OpenVINO can load ONNX directly)
  "bge-small-en-v1.5": {
    name: "bge-small-en-v1.5",
    repo: "Xenova/bge-small-en-v1.5",
    subdir: "onnx",
    files: ["model.onnx"],
  },
  "bge-small-en-v1.5-int8": {
    name: "bge-small-en-v1.5-int8",
    repo: "Xenova/bge-small-en-v1.5",
    subdir: "onnx",
    files: ["model_int8.onnx"],
  },
  // GTE - ONNX format
  "gte-small": {
    name: "gte-small",
    repo: "Xenova/gte-small",
    subdir: "onnx",
    files: ["model.onnx"],
  },
  "gte-small-int8": {
    name: "gte-small-int8",
    repo: "Xenova/gte-small",
    subdir: "onnx",
    files: ["model_int8.onnx"],
  },
};

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ultrascript-tools-mcp/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  writeFileSync(destPath, Buffer.from(buffer));

  const sizeMB = buffer.byteLength / 1024 / 1024;
  console.log(`  ✓ Saved: ${destPath} (${sizeMB.toFixed(2)} MB)`);
}

async function downloadModel(modelKey: string): Promise<string> {
  const config = MODELS[modelKey];
  if (!config) {
    throw new Error(`Unknown model: ${modelKey}. Available: ${Object.keys(MODELS).join(", ")}`);
  }

  const modelDir = join(MODELS_DIR, config.name);
  const xmlPath = join(modelDir, config.files[0]);

  // Check if already downloaded
  if (existsSync(xmlPath)) {
    console.log(`Model already exists: ${modelDir}`);
    return modelDir;
  }

  console.log(`\nDownloading model: ${modelKey}`);
  console.log(`  Repository: ${config.repo}`);
  console.log(`  Output: ${modelDir}`);

  mkdirSync(modelDir, { recursive: true });

  const baseUrl = `https://huggingface.co/${config.repo}/resolve/main`;
  const subdir = config.subdir ? `/${config.subdir}` : "";

  for (const file of config.files) {
    const url = `${baseUrl}${subdir}/${file}`;
    const destPath = join(modelDir, file);
    await downloadFile(url, destPath);
  }

  // Also download tokenizer files
  const tokenizerFiles = [
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "special_tokens_map.json",
  ];

  console.log("\n  Downloading tokenizer files...");
  for (const file of tokenizerFiles) {
    try {
      const url = `${baseUrl}/${file}`;
      const destPath = join(modelDir, file);
      await downloadFile(url, destPath);
    } catch (e: any) {
      // Some files may not exist, that's OK
      console.log(`  ⚠ ${file}: ${e.message}`);
    }
  }

  console.log(`\n✓ Model downloaded to: ${modelDir}`);
  return modelDir;
}

async function listModels(): Promise<void> {
  console.log("Available models:\n");
  for (const [key, config] of Object.entries(MODELS)) {
    const modelDir = join(MODELS_DIR, config.name);
    const exists = existsSync(modelDir);
    const status = exists ? "✓ Downloaded" : "  Not downloaded";
    console.log(`  ${status}  ${key}`);
    console.log(`             Repo: ${config.repo}`);
    console.log(`             Files: ${config.files.join(", ")}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--list") {
    await listModels();
    console.log("Usage: bun scripts/download-openvino-model.ts <model-key>");
    console.log("       bun scripts/download-openvino-model.ts --all");
    return;
  }

  if (args[0] === "--all") {
    for (const key of Object.keys(MODELS)) {
      await downloadModel(key);
    }
  } else {
    await downloadModel(args[0]);
  }
}

main().catch(console.error);
