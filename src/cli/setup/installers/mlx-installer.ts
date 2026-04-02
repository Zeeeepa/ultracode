/**
 * MLX Native Installation (Apple Silicon / Metal GPU)
 *
 * dylibs (libmlx_embed + libmlx) bundled in npm package.
 * Only downloads safetensors model from CDN (GitHub Releases).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, InstallResult } from "../setup-types.js";
import { printError, printInfo, printOK } from "../setup-ui.js";

const CDN_BASE = "https://github.com/faxenoff/ultracode/releases/download/v.6.0.2-zig";

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

function curlDownload(url: string, dest: string): boolean {
  const r = spawnSync("curl", ["-fSL", "--progress-bar", "-o", dest, url], {
    stdio: ["pipe", "inherit", "inherit"],
    timeout: 600_000,
  });
  return r.status === 0;
}

function ensureModel(mlxDir: string, modelId: string): string | null {
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

  const files = ["model.safetensors", "config.json", "mlx_config.json"];

  for (const file of files) {
    const dest = join(modelDir, file);
    if (existsSync(dest)) continue;

    const label = file === "model.safetensors" ? `${file} (это может занять пару минут)` : file;
    printInfo(`Скачивание ${label}...`);

    const url = `${CDN_BASE}/models/${cdnName}/model_gpu_mlx/${file}`;
    if (!curlDownload(url, dest)) {
      printError(`Не удалось скачать ${file}`);
      return null;
    }
    printOK(file);
  }

  printOK(`Модель ${modelId} готова`);
  return modelDir;
}

export async function installMLX(model: EmbeddingModel, _language: "en" | "multi"): Promise<InstallResult> {
  printInfo("Настройка MLX Native (Apple Metal GPU)...");
  console.error("");

  if (process.platform !== "darwin" || process.arch !== "arm64") {
    printError("MLX доступен только на macOS Apple Silicon");
    return { success: false, error: "macOS ARM64 required" };
  }

  const dataDir = getDataDir();
  const mlxDir = join(dataDir, "mlx");
  mkdirSync(mlxDir, { recursive: true });

  // Resolve model ID
  let cdnModelId = model.id;
  if (cdnModelId.startsWith("mlx-")) {
    cdnModelId = cdnModelId
      .replace("mlx-e5-small", "multilingual-e5-small")
      .replace("mlx-e5-base", "multilingual-e5-base")
      .replace("mlx-bge-m3", "bge-m3");
  }

  // Download model from CDN
  const modelDir = ensureModel(mlxDir, cdnModelId);
  if (!modelDir) {
    return { success: false, error: "Failed to download model" };
  }

  console.error("");
  printOK(`Провайдер: MLX Native (Metal GPU)`);
  printOK(`Модель: ${cdnModelId}`);
  printOK(`Путь: ${modelDir}`);
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
