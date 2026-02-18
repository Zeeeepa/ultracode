/**
 * vLLM Docker Installation (NVIDIA GPU)
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import { toError } from "../../../utils/error-handling.js";
import { t, ti } from "../i18n/index.js";
import type { EmbeddingModel, GPUInfo } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { checkDocker, checkNvidiaContainerToolkit, sleep } from "../utils/index.js";

export async function installVLLM(model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
  printInfo(t("vllm.setup"));
  console.error("");

  if (!gpu.available || !/nvidia|geforce|rtx|gtx|quadro/i.test(gpu.name)) {
    printError(t("vllm.nvidia_required"));
    printInfo(t("vllm.use_alternative"));
    return false;
  }

  if (!checkDocker()) {
    printError(t("install.docker_required"));
    console.error("");
    console.error(`  ${t("install.docker_install_hint")}`);
    console.error(`  ${t("install.docker_install_url")}`);
    return false;
  }

  printOK(t("install.docker_available"));

  // Check NVIDIA Container Toolkit
  const nvidiaReady = await checkNvidiaContainerToolkit();
  if (!nvidiaReady) {
    return false;
  }

  const imageTag = "vllm/vllm-openai:latest-cu130";
  const containerName = "vllm-server";
  const port = 8000;

  // Check existing container
  try {
    const existing = spawnSync("docker", ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], {
      encoding: "utf-8",
      windowsHide: true,
    });

    if (existing.stdout.trim() === containerName) {
      printWarn(ti("install.container_exists", { name: containerName }));
      const action = await prompt(
        `  [1=${t("install.container_action_restart")}, 2=${t("install.container_action_reinstall")}, 3=${t("install.container_action_cancel")}]: `,
      );

      if (action === "1") {
        spawnSync("docker", ["restart", containerName], { stdio: "inherit", windowsHide: true });
        printOK(t("install.container_restarted"));
        return true;
      }
      if (action === "2") {
        spawnSync("docker", ["stop", containerName], { stdio: "pipe", windowsHide: true });
        spawnSync("docker", ["rm", containerName], { stdio: "pipe", windowsHide: true });
        printOK(t("install.container_removed"));
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
    printOK(ti("install.image_exists", { tag: imageTag }));
  } else {
    printInfo(ti("install.pulling_image", { tag: imageTag }));
    console.error(`  ${t("vllm.image_size_hint")}`);

    try {
      const pullOutput = execSync(`docker pull "${imageTag}"`, {
        encoding: "utf-8",
        timeout: 1200000, // 20 min for large image
        windowsHide: true,
      });
      if (pullOutput) console.error(pullOutput.trim());
      printOK(t("vllm.image_downloaded"));
    } catch (e: unknown) {
      const err = toError(e);
      console.error(`[DEBUG] Pull failed: ${err.message}`);
      printError(t("install.pull_failed"));
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
    printOK(t("vllm.hf_token_found"));
  } else {
    printWarn(t("vllm.hf_token_missing"));
  }

  // Create container with vLLM
  printInfo(ti("vllm.creating_container", { model: model.model_id }));
  console.error(`${c.dim}  ${t("vllm.openai_api_hint")}${c.reset}`);

  let dockerCmd = `docker run -d --name ${containerName} -p ${port}:8000 --gpus all --restart unless-stopped`;
  dockerCmd += ` -v "${cacheDirDocker}:/root/.cache/huggingface"`;

  if (hfToken) {
    dockerCmd += ` -e HF_TOKEN="${hfToken}"`;
  }

  // vLLM v0.14+: model as positional argument, auto-detects embedding models
  dockerCmd += ` "${imageTag}" "${model.model_id}"`;
  const maxModelLen = (model as any).vllm_config?.max_model_len || model.context_tokens || 512;
  dockerCmd += ` --max-model-len ${maxModelLen}`; // Dynamic context: 512 for short texts, 8192 for BGE-M3
  dockerCmd += ` --dtype auto`; // Auto-select best dtype for GPU
  dockerCmd += ` --gpu-memory-utilization 0.8`; // 80% GPU memory (was 0.7)
  // Embedding throughput optimizations
  dockerCmd += ` --max-num-batched-tokens 16384`; // Higher for encoder models (default ~2048)
  dockerCmd += ` --max-num-seqs 256`; // More concurrent sequences for batching
  dockerCmd += ` --disable-log-requests`; // Reduce server logging overhead (vLLM 0.14+)

  console.error(`[DEBUG] Running: ${dockerCmd}`);

  try {
    const runOutput = execSync(dockerCmd, {
      encoding: "utf-8",
      windowsHide: true,
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    });
    if (runOutput) console.error(`Container ID: ${runOutput.trim().slice(0, 12)}`);
  } catch (e: unknown) {
    const err = toError(e);
    console.error(`[DEBUG] Docker run failed: ${err.message}`);
    printError(
      ti("install.container_created", { name: containerName }).replace(
        ti("install.container_created", { name: "" }),
        "Failed to create container",
      ),
    );
    return false;
  }

  printOK(ti("install.container_created", { name: containerName }));
  console.error(`${c.dim}  Cache: ${cacheDir}${c.reset}`);

  // Wait for health (vLLM takes time to load model)
  printInfo(t("vllm.waiting_init"));

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
        printOK(t("vllm.server_ready"));
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
  printWarn(ti("install.health_timeout", { container: containerName }));
  printInfo(t("vllm.health_timeout_hint"));
  return true;
}
