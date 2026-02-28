/**
 * TEI (Text Embeddings Inference) Docker Installation
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import { toError } from "../../../utils/error-handling.js";
import { t, ti } from "../i18n/index.js";
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
  printInfo(t("tei.setup"));
  console.error("");

  if (!checkDocker()) {
    printError(t("install.docker_required"));
    console.error("");
    console.error(`  ${t("install.docker_install_hint")}`);
    console.error(`  ${t("install.docker_install_url")}`);
    return false;
  }

  printOK(t("install.docker_available"));

  // Check for HuggingFace token
  const hfToken = getHFToken();
  if (hfToken) {
    printOK(t("vllm.hf_token_found"));
  } else {
    printWarn(t("vllm.hf_token_missing"));
    console.error(`${c.dim}  ${t("tei.hf_token_set_hint")}${c.reset}`);
  }

  // Select image based on GPU (Blackwell needs separate image with sm_120 support)
  let imageTag: string;
  if (gpu.available && gpu.isBlackwell && model.image_gpu_blackwell) {
    imageTag = model.image_gpu_blackwell;
    printInfo(t("tei.blackwell_image"));
  } else if (gpu.available) {
    imageTag = model.image_gpu || "ghcr.io/huggingface/text-embeddings-inference:latest";
  } else {
    imageTag = model.image_cpu || "ghcr.io/huggingface/text-embeddings-inference:cpu-latest";
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

  // Pull image
  printInfo(ti("install.pulling_image", { tag: imageTag }));
  console.error(`  ${t("tei.pull_time_hint")}`);

  try {
    const pullOutput = execSync(`docker pull "${imageTag}"`, {
      encoding: "utf-8",
      timeout: 600000,
      windowsHide: true,
    });
    if (pullOutput) console.error(pullOutput.trim());
  } catch (e: unknown) {
    const err = toError(e);
    console.error(`[DEBUG] Pull failed: ${err.message}`);
    printError(t("install.pull_failed"));
    return false;
  }

  printOK(t("install.model_downloaded"));
  console.error("");

  // Create container
  printInfo(ti("vllm.creating_container", { model: model.model_id }));

  // Setup cache directory for model persistence
  const cacheDir = join(getDataDir(), "hf-cache");
  mkdirSync(cacheDir, { recursive: true });
  const cacheDirDocker = cacheDir.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);

  // Get TEI config from model or use defaults (pure defaults - tested fastest)
  const modelExtended = model as EmbeddingModel & {
    tei_config?: { max_batch_tokens?: number; max_client_batch_size?: number; dtype?: string };
  };
  const teiConfig = modelExtended.tei_config || {};
  const maxBatchTokens = teiConfig.max_batch_tokens || 16384;
  const maxClientBatchSize = teiConfig.max_client_batch_size || 500;
  const dtype = teiConfig.dtype; // e.g. "float32" for models that don't support fp16

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
  if (dtype) {
    dockerCmd += ` --dtype ${dtype}`;
  }
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
  } catch (e: unknown) {
    const err = toError(e);
    console.error(`[DEBUG] Docker run failed: ${err.message}`);
    printError("Failed to create container");
    return false;
  }

  printOK(ti("install.container_created", { name: containerName }));
  console.error(`${c.dim}  Cache: ${cacheDir}${c.reset}`);
  console.error(
    `${c.dim}  ${ti("tei.batch_config", { texts: String(maxClientBatchSize), tokens: String(maxBatchTokens) })}${c.reset}`,
  );
  if (hfToken) {
    console.error(`${c.dim}  ${ti("tei.hf_token_partial", { suffix: hfToken.slice(-4) })}${c.reset}`);
  }

  // Wait for health (up to 5 minutes for large model downloads like BGE-M3)
  printInfo(t("tei.waiting_init"));

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
        printOK(t("tei.server_ready"));
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
  printInfo(t("vllm.health_timeout_hint").replace("8000", "8081"));
  return true;
}
