/**
 * MLX Native Installation (Apple Silicon / Metal GPU)
 *
 * Downloads libmlx_embed.dylib + libmlx.dylib and safetensors model
 * from CDN (GitHub Releases). No Python, no Docker — direct Metal GPU.
 */

import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, InstallResult } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn } from "../setup-ui.js";

const CDN_BASE = "https://github.com/faxenoff/ultracode/releases/download/v.6.0.2-zig";

// Map model IDs to CDN archive names
const MODEL_CDN_MAP: Record<string, string> = {
  "multilingual-e5-small": "multilingual-e5-small",
  "multilingual-e5-base": "multilingual-e5-base",
  "snowflake-arctic-embed-xs": "snowflake-arctic-embed-xs",
  "all-MiniLM-L6-v2": "all-MiniLM-L6-v2",
  "nomic-embed-text-v1.5": "nomic-embed-text-v1.5",
  "gte-modernbert-base": "gte-modernbert-base",
  "modernbert-embed-base": "modernbert-embed-base",
  "mxbai-embed-xsmall-v1": "mxbai-embed-xsmall-v1",
  "bge-m3": "bge-m3",
};

async function downloadFile(url: string, dest: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok || !resp.body) {
      printError(`Download failed: ${resp.status} ${url}`);
      return false;
    }
    const stream = Readable.fromWeb(resp.body as any);
    await pipeline(stream, createWriteStream(dest));
    return true;
  } catch (e) {
    printError(`Download error: ${e}`);
    return false;
  }
}

async function downloadDylibs(mlxDir: string): Promise<boolean> {
  const libDir = join(mlxDir, "lib");
  mkdirSync(libDir, { recursive: true });

  const embedDylib = join(libDir, "libmlx_embed.dylib");
  const mlxDylib = join(libDir, "libmlx.dylib");

  if (existsSync(embedDylib) && existsSync(mlxDylib)) {
    printOK("MLX dylibs уже скачаны");
    return true;
  }

  printInfo("Скачивание libmlx_embed.dylib (~100KB)...");
  if (!await downloadFile(`${CDN_BASE}/libmlx_embed.dylib`, embedDylib)) return false;
  printOK("libmlx_embed.dylib");

  printInfo("Скачивание libmlx.dylib (~16MB)...");
  if (!await downloadFile(`${CDN_BASE}/libmlx.dylib`, mlxDylib)) return false;
  printOK("libmlx.dylib");

  return true;
}

async function downloadModel(mlxDir: string, modelId: string): Promise<string | null> {
  const cdnName = MODEL_CDN_MAP[modelId];
  if (!cdnName) {
    printError(`Неизвестная модель: ${modelId}`);
    return null;
  }

  const modelDir = join(mlxDir, "models", modelId, "model_gpu_mlx");
  const safetensors = join(modelDir, "model.safetensors");

  if (existsSync(safetensors)) {
    printOK(`Модель ${modelId} уже скачана`);
    return modelDir;
  }

  mkdirSync(modelDir, { recursive: true });

  // Download model files: model.safetensors, config.json, mlx_config.json
  const files = ["model.safetensors", "config.json", "mlx_config.json"];

  for (const file of files) {
    const url = `${CDN_BASE}/models/${cdnName}/model_gpu_mlx/${file}`;
    const dest = join(modelDir, file);

    if (existsSync(dest)) continue;

    const label = file === "model.safetensors" ? `${file} (может занять 1-2 минуты)` : file;
    printInfo(`Скачивание ${label}...`);

    if (!await downloadFile(url, dest)) {
      printError(`Не удалось скачать ${file}`);
      return null;
    }
  }

  printOK(`Модель ${modelId} скачана`);
  return modelDir;
}

export async function installMLX(
  model: EmbeddingModel,
  _language: "en" | "multi",
): Promise<InstallResult> {
  printInfo("Настройка MLX Native (Apple Metal GPU)...");
  console.error("");

  if (process.platform !== "darwin" || process.arch !== "arm64") {
    printError("MLX доступен только на macOS Apple Silicon");
    return { success: false, error: "macOS ARM64 required" };
  }

  const dataDir = getDataDir();
  const mlxDir = join(dataDir, "mlx");
  mkdirSync(mlxDir, { recursive: true });

  // Step 1: Download dylibs
  if (!await downloadDylibs(mlxDir)) {
    return { success: false, error: "Failed to download MLX libraries" };
  }

  // Step 2: Download model
  // Map embedding model to CDN model ID
  let cdnModelId = model.id;
  // Handle mlx-prefixed model IDs from config
  if (cdnModelId.startsWith("mlx-")) {
    cdnModelId = cdnModelId.replace("mlx-", "").replace("e5-small", "multilingual-e5-small").replace("e5-base", "multilingual-e5-base");
  }

  const modelDir = await downloadModel(mlxDir, cdnModelId);
  if (!modelDir) {
    return { success: false, error: "Failed to download model" };
  }

  console.error("");
  printOK(`Модель: ${model.name} (${cdnModelId})`);
  printOK(`Metal GPU inference — без Python, без Docker`);
  printOK(`Модель: ${modelDir}`);
  printInfo("MLX загрузится автоматически при индексации");

  return {
    success: true,
    config: {
      provider: "mlx-native",
      model: cdnModelId,
      modelDir,
      dimensions: model.dimensions,
    },
  };
}
