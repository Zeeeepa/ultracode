/**
 * TEI (Text Embeddings Inference) Docker Installation
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, GPUInfo } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { checkDocker, sleep } from "../utils/index.js";

/**
 * Get HuggingFace token from environment variables
 */
function getHFToken(): string | undefined {
  return process.env["HF_TOKEN"] || process.env["HUGGING_FACE_HUB_TOKEN"] || process.env["HF_API_TOKEN"];
}

export async function installTEI(model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
  printInfo("TEI setup...");
  console.error("");

  if (!checkDocker()) {
    printError("Docker не установлен или не запущен");
    console.error("");
    console.error("  Установите Docker Desktop:");
    console.error("  https://www.docker.com/products/docker-desktop");
    return false;
  }

  printOK("Docker доступен");

  // Check for HuggingFace token
  const hfToken = getHFToken();
  if (hfToken) {
    printOK("HuggingFace токен найден");
  } else {
    printWarn("HF_TOKEN не найден — загрузка моделей может быть ограничена");
    console.error(`${c.dim}  Установите: $env:HF_TOKEN = "hf_xxx" или export HF_TOKEN=hf_xxx${c.reset}`);
  }

  // Select image based on GPU
  let imageTag: string;
  if (gpu.isBlackwell) {
    imageTag = "hotchpotch/tei-blackwell-testing:latest";
    printWarn("Blackwell GPU detected — using special image");
  } else if (gpu.available) {
    imageTag = model.image_gpu || "ghcr.io/huggingface/text-embeddings-inference:1.8.3";
  } else {
    imageTag = model.image_cpu || "ghcr.io/huggingface/text-embeddings-inference:cpu-1.8.3";
  }

  const containerName = "tei-server";
  const port = 8081;

  // Check existing container
  try {
    const existing = spawnSync("docker", ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], {
      encoding: "utf-8",
      windowsHide: true,
    });

    if (existing.stdout.trim() === containerName) {
      printWarn(`Container '${containerName}' already exists`);
      const action = await prompt("  [1=Restart, 2=Remove & reinstall, 3=Cancel]: ");

      if (action === "1") {
        spawnSync("docker", ["restart", containerName], { stdio: "inherit", windowsHide: true });
        printOK("Container restarted");
        return true;
      }
      if (action === "2") {
        spawnSync("docker", ["stop", containerName], { stdio: "pipe", windowsHide: true });
        spawnSync("docker", ["rm", containerName], { stdio: "pipe", windowsHide: true });
        printOK("Container removed");
      } else {
        return false;
      }
    }
  } catch {
    /* continue */
  }

  // Pull image
  printInfo(`Pulling image: ${imageTag}`);
  console.error("  This may take a few minutes...");

  try {
    const pullOutput = execSync(`docker pull "${imageTag}"`, {
      encoding: "utf-8",
      timeout: 600000,
      windowsHide: true,
    });
    if (pullOutput) console.error(pullOutput.trim());
  } catch (e: any) {
    console.error(`[DEBUG] Pull failed: ${e.message}`);
    printError("Failed to pull Docker image");
    return false;
  }

  printOK("Image downloaded");
  console.error("");

  // Create container
  printInfo(`Creating container with model: ${model.model_id}`);

  // Setup cache directory for model persistence
  const cacheDir = join(getDataDir(), "hf-cache");
  mkdirSync(cacheDir, { recursive: true });
  const cacheDirDocker = cacheDir.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);

  // Get TEI config from model or use defaults (pure defaults - tested fastest)
  const teiConfig = (model as any).tei_config || {};
  const maxBatchTokens = teiConfig.max_batch_tokens || 16384;
  const maxClientBatchSize = teiConfig.max_client_batch_size || 500;

  let dockerCmd = `docker run -d --name ${containerName} -p ${port}:80 --restart unless-stopped`;

  // Add GPU support
  if (gpu.available) {
    dockerCmd += " --gpus all";
  }

  // Add cache volume for model persistence (avoids re-downloading)
  dockerCmd += ` -v "${cacheDirDocker}:/data"`;

  // Add HuggingFace token if available
  if (hfToken) {
    dockerCmd += ` -e HF_TOKEN="${hfToken}"`;
  }

  // Add TEI arguments (pure defaults - any tuning reduces performance)
  dockerCmd += ` "${imageTag}" --model-id "${model.model_id}"`;
  dockerCmd += ` --max-concurrent-requests 512`;
  dockerCmd += ` --max-batch-tokens ${maxBatchTokens}`;
  dockerCmd += ` --max-client-batch-size ${maxClientBatchSize}`;

  console.error(`[DEBUG] Running: ${dockerCmd}`);

  try {
    const runOutput = execSync(dockerCmd, {
      encoding: "utf-8",
      windowsHide: true,
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    });
    if (runOutput) console.error(`Container ID: ${runOutput.trim().slice(0, 12)}`);
  } catch (e: any) {
    console.error(`[DEBUG] Docker run failed: ${e.message}`);
    printError("Failed to create container");
    return false;
  }

  printOK("Container created");
  console.error(`${c.dim}  Cache: ${cacheDir}${c.reset}`);
  console.error(`${c.dim}  Batch: ${maxClientBatchSize} texts, ${maxBatchTokens} tokens${c.reset}`);
  if (hfToken) {
    console.error(`${c.dim}  HF_TOKEN: ****${hfToken.slice(-4)}${c.reset}`);
  }

  // Wait for health (up to 5 minutes for large model downloads like BGE-M3)
  printInfo("Waiting for TEI to initialize (model download may take several minutes)...");

  const maxWaitSeconds = 300; // 5 minutes
  const checkIntervalMs = 3000;
  const maxAttempts = Math.ceil((maxWaitSeconds * 1000) / checkIntervalMs);

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(checkIntervalMs);
    try {
      const health = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}/health`], {
        timeout: 2000,
        windowsHide: true,
      });
      if (health.status === 0) {
        console.error("");
        printOK("TEI server is ready!");
        return true;
      }
    } catch {
      /* continue */
    }
    // Show progress every 30 seconds
    if (i > 0 && i % 10 === 0) {
      const elapsed = Math.round((i * checkIntervalMs) / 1000);
      process.stderr.write(` ${elapsed}s`);
    } else {
      process.stderr.write(".");
    }
  }

  console.error("");
  printWarn("Health check timed out. Check: docker logs tei-server");
  printInfo("Model may still be downloading. Wait and check: curl http://127.0.0.1:8081/health");
  return true;
}
