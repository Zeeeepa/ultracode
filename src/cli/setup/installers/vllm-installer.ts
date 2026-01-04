/**
 * vLLM Docker Installation (NVIDIA GPU)
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, GPUInfo } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { checkDocker, checkNvidiaContainerToolkit, sleep } from "../utils/index.js";

export async function installVLLM(model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
  printInfo("vLLM Docker setup (NVIDIA GPU)...");
  console.error("");

  if (!gpu.available || !/nvidia|geforce|rtx|gtx|quadro/i.test(gpu.name)) {
    printError("vLLM требует NVIDIA GPU");
    printInfo("Используйте OVMS Native или TEI для CPU/Intel GPU");
    return false;
  }

  if (!checkDocker()) {
    printError("Docker не установлен или не запущен");
    console.error("");
    console.error("  Установите Docker Desktop:");
    console.error("  https://www.docker.com/products/docker-desktop");
    return false;
  }

  printOK("Docker доступен");

  // Check NVIDIA Container Toolkit
  const nvidiaReady = await checkNvidiaContainerToolkit();
  if (!nvidiaReady) {
    return false;
  }

  const imageTag = "vllm/vllm-openai:latest";
  const containerName = "vllm-server";
  const port = 8000;

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

  // Check if image already exists locally
  let imageExists = false;
  try {
    const imageCheck = execSync(`docker images -q "${imageTag}"`, { encoding: "utf-8", windowsHide: true });
    imageExists = imageCheck.trim().length > 0;
  } catch {
    /* ignore */
  }

  if (imageExists) {
    printOK(`Image already exists: ${imageTag}`);
  } else {
    printInfo(`Pulling image: ${imageTag}`);
    console.error("  This may take several minutes (image is ~8GB)...");

    try {
      const pullOutput = execSync(`docker pull "${imageTag}"`, {
        encoding: "utf-8",
        timeout: 1200000, // 20 min for large image
        windowsHide: true,
      });
      if (pullOutput) console.error(pullOutput.trim());
      printOK("vLLM image downloaded");
    } catch (e: any) {
      console.error(`[DEBUG] Pull failed: ${e.message}`);
      printError("Failed to pull Docker image. Check network/VPN settings.");
      return false;
    }
  }
  console.error("");

  // Setup HuggingFace cache directory for model persistence
  const cacheDir = join(getDataDir(), "hf-cache");
  mkdirSync(cacheDir, { recursive: true });
  const cacheDirDocker = cacheDir.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);

  // Get HuggingFace token
  const hfToken = process.env["HF_TOKEN"] || process.env["HUGGING_FACE_HUB_TOKEN"] || process.env["HF_API_TOKEN"];
  if (hfToken) {
    printOK("HuggingFace токен найден");
  } else {
    printWarn("HF_TOKEN не найден — загрузка моделей может быть ограничена");
  }

  // Create container with vLLM
  printInfo(`Creating vLLM container with model: ${model.model_id}`);
  console.error(`${c.dim}  vLLM использует OpenAI-compatible API на /v1/embeddings${c.reset}`);

  let dockerCmd = `docker run -d --name ${containerName} -p ${port}:8000 --gpus all --restart unless-stopped`;
  dockerCmd += ` -v "${cacheDirDocker}:/root/.cache/huggingface"`;

  if (hfToken) {
    dockerCmd += ` -e HF_TOKEN="${hfToken}"`;
  }

  // vLLM v0.12+: model as positional argument, auto-detects embedding models
  dockerCmd += ` "${imageTag}" "${model.model_id}"`;
  dockerCmd += ` --max-model-len 512`; // Limit context for embeddings (short texts)
  dockerCmd += ` --dtype auto`; // Auto-select best dtype for GPU
  dockerCmd += ` --gpu-memory-utilization 0.7`; // Leave headroom for other processes

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

  // Wait for health (vLLM takes time to load model)
  printInfo("Waiting for vLLM to initialize (model download may take several minutes)...");

  const maxWaitSeconds = 300; // 5 minutes
  const checkIntervalMs = 3000;
  const maxAttempts = Math.ceil((maxWaitSeconds * 1000) / checkIntervalMs);

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(checkIntervalMs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        console.error("");
        printOK("vLLM server is ready!");
        console.error("");
        console.error(`  ${c.cyan}API:${c.reset} http://127.0.0.1:${port}/v1/embeddings`);
        console.error(`  ${c.cyan}Model:${c.reset} ${model.model_id}`);
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
  printWarn("Health check timed out. Check: docker logs vllm-server");
  printInfo("Model may still be downloading. Wait and check: curl http://127.0.0.1:8000/health");
  return true;
}
