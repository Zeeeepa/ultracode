/**
 * Provider installation functions for setup command
 * Handles OVMS (Docker & Native), TEI, and Ollama embedding providers
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { getDataDir } from "../../utils/config-paths.js";

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import type { EmbeddingModel, GPUInfo, InstallResult } from "./setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

export function checkDocker(): boolean {
  try {
    // Try docker info first (requires daemon running)
    const result = spawnSync("docker", ["info"], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      windowsHide: true,
    });

    if (result.status === 0) {
      console.error("[DEBUG] docker info succeeded");
      return true;
    }

    console.error(`[DEBUG] docker info failed: status=${result.status}`);
    if (result.stderr) {
      console.error(`[DEBUG] docker info stderr: ${result.stderr.slice(0, 300)}`);
    }

    // Fallback: try docker --version (works even if daemon is stopped)
    const versionResult = spawnSync("docker", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
      windowsHide: true,
    });

    if (versionResult.status === 0) {
      console.error("[DEBUG] Docker found but daemon may not be running");
      console.error(`[DEBUG] docker --version: ${versionResult.stdout?.trim()}`);
      return true;
    }

    return false;
  } catch (e: any) {
    console.error(`[DEBUG] checkDocker exception: ${e.message}`);
    return false;
  }
}

export function checkOllama(): boolean {
  // Try up to 3 times with increasing timeout (Ollama may be busy pulling/serving)
  const timeouts = [5000, 15000, 30000];

  for (let i = 0; i < timeouts.length; i++) {
    try {
      const result = spawnSync("ollama", ["--version"], {
        encoding: "utf-8",
        timeout: timeouts[i],
        stdio: "pipe",
        windowsHide: true,
      });

      if (result.status === 0) {
        return true;
      }

      // If not timeout error, don't retry
      if (!result.error?.message?.includes("ETIMEDOUT") && !result.error?.message?.includes("TIMEOUT")) {
        console.error(
          `${c.dim}[DEBUG] ollama --version: status=${result.status}, error=${result.error}, stderr=${result.stderr}${c.reset}`,
        );
        return false;
      }

      // Timeout - Ollama might be busy, retry with longer timeout
      if (i < timeouts.length - 1) {
        console.error(
          `${c.dim}[DEBUG] ollama timeout (${timeouts[i]}ms), retrying with ${timeouts[i + 1]}ms...${c.reset}`,
        );
      }
    } catch (e) {
      console.error(`${c.dim}[DEBUG] checkOllama exception: ${e}${c.reset}`);
      return false;
    }
  }

  console.error(`${c.dim}[DEBUG] ollama --version: all retries timed out (Ollama may be busy)${c.reset}`);
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Multi-Device Configuration Helper
// ═══════════════════════════════════════════════════════════════

/**
 * Creates multi-device OVMS configuration with separate endpoints for GPU and CPU.
 * This enables parallel inference and round-robin load balancing.
 *
 * @param modelsDir Base models directory
 * @param hasGPU Whether GPU is available (Intel or NVIDIA)
 * @param modelsPath Path to models directory (for config.json paths)
 * @param modelName Model subdirectory name (default: "embeddings")
 * @returns Array of endpoint names created (e.g., ["embeddings-gpu", "embeddings-cpu"])
 */
function createMultiDeviceConfig(
  modelsDir: string,
  hasGPU: boolean,
  modelsPath: string,
  modelName: string = "embeddings",
): string[] {
  const sourceDir = join(modelsDir, modelName);

  // Check if source model exists
  if (!existsSync(join(sourceDir, "openvino_model.xml"))) {
    printWarn(`Модель не найдена для multi-device конфигурации: ${modelName}`);
    return [modelName]; // Fallback to single endpoint
  }

  const endpoints: string[] = [];
  const isWindows = process.platform === "win32";
  const gpuEndpointName = `${modelName}-gpu`;
  const cpuEndpointName = `${modelName}-cpu`;

  // Create GPU endpoint (supports Intel iGPU, Intel Arc, and NVIDIA via OpenVINO GPU plugin)
  if (hasGPU) {
    const gpuDir = join(modelsDir, gpuEndpointName);
    mkdirSync(gpuDir, { recursive: true });

    // Copy model files
    const modelFiles = readdirSync(sourceDir).filter((f) => !f.endsWith(".pbtxt"));
    for (const file of modelFiles) {
      const src = join(sourceDir, file);
      const dst = join(gpuDir, file);
      if (!existsSync(dst)) {
        try {
          copyFileSync(src, dst);
        } catch {
          /* ignore copy errors */
        }
      }
    }

    // Create GPU graph.pbtxt with AUTO_BATCH for better throughput
    // Batch size 12 instead of 16 leaves ~25% GPU headroom for UI rendering
    const gpuGraphContent = `input_stream: "REQUEST_PAYLOAD:input"
output_stream: "RESPONSE_PAYLOAD:output"
node {
  name: "EmbeddingsExecutor"
  input_side_packet: "EMBEDDINGS_NODE_RESOURCES:embeddings_servable"
  calculator: "EmbeddingsCalculatorOV"
  input_stream: "REQUEST_PAYLOAD:input"
  output_stream: "RESPONSE_PAYLOAD:output"
  node_options: {
    [type.googleapis.com / mediapipe.EmbeddingsCalculatorOVOptions]: {
      models_path: "./"
      plugin_config: '{"NUM_STREAMS": "2", "AUTO_BATCH_TIMEOUT": "100" }'
      normalize_embeddings: true
      pooling: MEAN
      target_device: "BATCH:GPU.0(12)"
    }
  }
}
`;
    writeFileSync(join(gpuDir, "graph.pbtxt"), gpuGraphContent);
    endpoints.push(gpuEndpointName);
    printOK(`Создан endpoint: ${gpuEndpointName} (BATCH:GPU.0(12))`);
  }

  // Create CPU endpoint
  const cpuDir = join(modelsDir, cpuEndpointName);
  mkdirSync(cpuDir, { recursive: true });

  // Copy model files
  const modelFiles = readdirSync(sourceDir).filter((f) => !f.endsWith(".pbtxt"));
  for (const file of modelFiles) {
    const src = join(sourceDir, file);
    const dst = join(cpuDir, file);
    if (!existsSync(dst)) {
      try {
        copyFileSync(src, dst);
      } catch {
        /* ignore copy errors */
      }
    }
  }

  // Create CPU graph.pbtxt with multiple streams
  const cpuGraphContent = `input_stream: "REQUEST_PAYLOAD:input"
output_stream: "RESPONSE_PAYLOAD:output"
node {
  name: "EmbeddingsExecutor"
  input_side_packet: "EMBEDDINGS_NODE_RESOURCES:embeddings_servable"
  calculator: "EmbeddingsCalculatorOV"
  input_stream: "REQUEST_PAYLOAD:input"
  output_stream: "RESPONSE_PAYLOAD:output"
  node_options: {
    [type.googleapis.com / mediapipe.EmbeddingsCalculatorOVOptions]: {
      models_path: "./"
      plugin_config: '{"NUM_STREAMS": "4" }'
      normalize_embeddings: true
      pooling: MEAN
      target_device: "CPU"
    }
  }
}
`;
  writeFileSync(join(cpuDir, "graph.pbtxt"), cpuGraphContent);
  endpoints.push(cpuEndpointName);
  printOK(`Создан endpoint: ${cpuEndpointName} (CPU)`);

  // Create OVMS config.json with mediapipe_config_list
  const configPath = join(modelsDir, "config.json");
  const pathPrefix = isWindows ? modelsPath.replace(/\\/g, "/") : modelsPath;

  const ovmsConfig = {
    model_config_list: [] as any[],
    mediapipe_config_list: endpoints.map((name) => ({
      name,
      base_path: `${pathPrefix}/${name}`,
    })),
  };

  writeFileSync(configPath, JSON.stringify(ovmsConfig, null, 2));
  printOK(`OVMS config.json обновлён с ${endpoints.length} endpoints`);

  return endpoints;
}

/**
 * Generate default endpoints array for semantic-config.json
 * Ratio 6:2 (GPU:CPU) provides good balance for parallel processing
 */
function generateEndpointsArray(endpoints: string[]): string[] {
  const gpuEndpoint = endpoints.find((e) => e.endsWith("-gpu"));
  const cpuEndpoint = endpoints.find((e) => e.endsWith("-cpu"));

  if (gpuEndpoint && cpuEndpoint) {
    // 6:2 ratio - GPU handles more work (it's faster with AUTO_BATCH)
    return [gpuEndpoint, gpuEndpoint, gpuEndpoint, gpuEndpoint, gpuEndpoint, gpuEndpoint, cpuEndpoint, cpuEndpoint];
  } else if (gpuEndpoint) {
    return [gpuEndpoint];
  } else if (cpuEndpoint) {
    return [cpuEndpoint];
  }
  return endpoints.length > 0 ? [endpoints[0]!] : ["embeddings"];
}

// ═══════════════════════════════════════════════════════════════
// Main Installation Router
// ═══════════════════════════════════════════════════════════════

export async function installProvider(
  provider: string,
  model: EmbeddingModel,
  gpu: GPUInfo,
  cpu: CPUInfo,
): Promise<InstallResult> {
  console.error(`${c.yellow}[STEP 4] Installation${c.reset}`);
  console.error("");

  if (provider === "ovms" || provider === "ovms-native") {
    const result = await installOVMSNative(model, cpu, gpu);
    return result;
  } else if (provider === "vllm") {
    const success = await installVLLM(model, gpu);
    return { success };
  } else if (provider === "tei") {
    const success = await installTEI(model, gpu);
    return { success };
  } else if (provider === "ollama") {
    const success = await installOllama(model);
    return { success };
  }

  return { success: false };
}

// ═══════════════════════════════════════════════════════════════
// vLLM Docker Installation (NVIDIA GPU)
// ═══════════════════════════════════════════════════════════════

/**
 * Check and ensure NVIDIA Container Toolkit is working for Docker GPU access
 */
async function checkNvidiaContainerToolkit(): Promise<boolean> {
  const isWindows = process.platform === "win32";

  // Test if nvidia-docker works
  printInfo("Проверка NVIDIA Container Toolkit...");

  const testResult = spawnSync(
    "docker",
    ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
    {
      encoding: "utf-8",
      timeout: 60000,
      windowsHide: true,
      stdio: "pipe",
    },
  );

  if (testResult.status === 0) {
    printOK("NVIDIA Container Toolkit работает");
    return true;
  }

  printWarn("NVIDIA Container Toolkit не настроен");

  if (isWindows) {
    // On Windows, Docker Desktop handles GPU passthrough via WSL2
    // Check NVIDIA driver version (must be 525+ for WSL2 GPU)
    try {
      const driverCheck = spawnSync("nvidia-smi", ["--query-gpu=driver_version", "--format=csv,noheader"], {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
        stdio: "pipe",
      });

      if (driverCheck.status === 0) {
        const driverVersion = driverCheck.stdout.trim();
        const majorVersion = parseInt(driverVersion.split(".")[0] || "0", 10);

        if (majorVersion >= 525) {
          printOK(`NVIDIA драйвер ${driverVersion} (✓ поддерживает WSL2 GPU)`);
        } else {
          printError(`NVIDIA драйвер ${driverVersion} слишком старый. Требуется 525+`);
          console.error("");
          console.error("  Обновите драйвер NVIDIA:");
          console.error("  https://www.nvidia.com/download/index.aspx");
          return false;
        }
      }
    } catch {
      printError("nvidia-smi не найден. Установите NVIDIA драйвер.");
      return false;
    }

    // Check Docker Desktop WSL2 backend
    printInfo("Проверка Docker Desktop WSL2 backend...");
    console.error("");
    console.error(`  ${c.yellow}Для GPU в Docker Desktop нужно:${c.reset}`);
    console.error(`  1. Docker Desktop → Settings → General → "Use the WSL 2 based engine" ✓`);
    console.error(`  2. Docker Desktop → Settings → Resources → WSL Integration → Enable`);
    console.error("");

    const answer = await prompt("  Docker Desktop настроен для WSL2? [y/N]: ");
    if (answer.toLowerCase() !== "y") {
      printInfo("Откройте Docker Desktop → Settings и настройте WSL2 backend");
      return false;
    }

    // Restart Docker Desktop to apply GPU settings
    printInfo("Перезапуск Docker Desktop для применения GPU настроек...");
    try {
      spawnSync(
        "powershell",
        ["-Command", "Stop-Process -Name 'Docker Desktop' -Force -ErrorAction SilentlyContinue"],
        {
          windowsHide: true,
          stdio: "pipe",
        },
      );
      await sleep(2000);

      // Start Docker Desktop
      const dockerPath = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
      if (existsSync(dockerPath)) {
        const proc = spawn(dockerPath, [], { detached: true, stdio: "ignore", windowsHide: true });
        proc.unref();
        printInfo("Docker Desktop запускается...");
        await sleep(10000); // Wait for Docker to start
      }
    } catch {
      printWarn("Не удалось перезапустить Docker Desktop. Перезапустите вручную.");
    }

    // Test again
    const retestResult = spawnSync(
      "docker",
      ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
      {
        encoding: "utf-8",
        timeout: 60000,
        windowsHide: true,
        stdio: "pipe",
      },
    );

    if (retestResult.status === 0) {
      printOK("NVIDIA Container Toolkit теперь работает!");
      return true;
    }

    printError("GPU всё ещё недоступен в Docker");
    console.error("");
    console.error("  Попробуйте:");
    console.error("  1. Перезагрузить компьютер");
    console.error("  2. Обновить NVIDIA драйвер до последней версии");
    console.error("  3. Переустановить Docker Desktop");
    return false;
  } else {
    // Linux: Install NVIDIA Container Toolkit
    printInfo("Установка NVIDIA Container Toolkit...");

    try {
      execSync(
        `curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg`,
        { stdio: "pipe" },
      );
      execSync(
        `curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
         sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
         sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list`,
        { stdio: "pipe" },
      );
      execSync(`sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit`, { stdio: "inherit" });
      execSync(`sudo nvidia-ctk runtime configure --runtime=docker`, { stdio: "pipe" });
      execSync(`sudo systemctl restart docker`, { stdio: "pipe" });

      printOK("NVIDIA Container Toolkit установлен");

      // Test again
      await sleep(3000);
      const retestResult = spawnSync(
        "docker",
        ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
        {
          encoding: "utf-8",
          timeout: 60000,
          stdio: "pipe",
        },
      );

      if (retestResult.status === 0) {
        printOK("GPU доступен в Docker!");
        return true;
      }
    } catch (e: any) {
      printError(`Ошибка установки: ${e.message}`);
    }

    return false;
  }
}

async function installVLLM(model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
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
  // Docker entrypoint is "vllm serve", so just pass model and options
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

// ═══════════════════════════════════════════════════════════════
// OVMS Native Installation
// ═══════════════════════════════════════════════════════════════

async function installOVMSNative(model: EmbeddingModel, cpu: CPUInfo, gpu: GPUInfo): Promise<InstallResult> {
  printInfo("OVMS Native setup (без Docker)...");
  console.error("");

  const OVMS_VERSION = "2025.4";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // Detect hardware
  const hasNPU = cpu.model.toLowerCase().includes("ultra");
  const gpuName = gpu.name?.toLowerCase() || "";
  const isIntelGPU = gpu.available && gpuName.includes("intel");
  const isIntelArc = isIntelGPU && /arc|a770|a750|a580|a380|a310/.test(gpuName);
  const isNvidiaGPU = gpu.available && /nvidia|geforce|rtx|gtx|quadro/.test(gpuName);

  // Determine target device
  let targetDevice = "CPU";
  if (hasNPU) {
    targetDevice = "NPU";
    printInfo("NPU detected (Intel Core Ultra) - will use NPU acceleration");
  } else if (isNvidiaGPU) {
    targetDevice = "NVIDIA";
    printInfo(`NVIDIA GPU detected (${gpu.name}) - will use NVIDIA acceleration`);
  } else if (isIntelArc) {
    targetDevice = "GPU";
    printInfo(`Intel Arc GPU detected (${gpu.name}) - will use GPU acceleration`);
  } else if (isIntelGPU) {
    targetDevice = "GPU";
    printInfo(`Intel integrated GPU detected (${gpu.name}) - will use GPU acceleration`);
  } else {
    printInfo("Using CPU for inference (no GPU/NPU detected)");
  }

  if (!isWindows && !isLinux) {
    printError("OVMS Native поддерживается только на Windows и Linux");
    printInfo("Используйте OVMS Docker или Ollama");
    return { success: false };
  }

  // Get installation directories
  const dataDir = getDataDir();
  const ovmsDir = join(dataDir, "ovms");
  const modelsDir = join(dataDir, "models");

  mkdirSync(ovmsDir, { recursive: true });
  mkdirSync(modelsDir, { recursive: true });

  // Windows ZIP extracts to ovms/ovms/ subfolder
  const getOvmsBinPath = (): string => {
    if (isWindows) {
      const nestedPath = join(ovmsDir, "ovms", "ovms.exe");
      const flatPath = join(ovmsDir, "ovms.exe");
      return existsSync(nestedPath) ? nestedPath : flatPath;
    }
    return join(ovmsDir, "ovms");
  };

  let ovmsBin = getOvmsBinPath();

  // Check if already installed
  if (existsSync(ovmsBin)) {
    printOK("OVMS уже установлен");

    const action = await prompt("  [1=Использовать, 2=Переустановить, 3=Отмена]: ");
    if (action === "3") return { success: false };
    if (action !== "2") {
      printInfo("Настройка модели...");
    } else {
      printInfo("Переустановка OVMS...");
    }
  }

  // Download OVMS binary if needed
  if (!existsSync(ovmsBin)) {
    printInfo(`Скачивание OVMS ${OVMS_VERSION}...`);

    let downloadUrl: string;
    let archiveName: string;

    if (isWindows) {
      downloadUrl = `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_windows_python_on.zip`;
      archiveName = "ovms_windows_python_on.zip";
    } else {
      let ubuntuVersion = "24";
      try {
        const osRelease = execSync("cat /etc/os-release 2>/dev/null || echo ''", { encoding: "utf-8" });
        if (osRelease.includes("22.04") || osRelease.includes("jammy")) {
          ubuntuVersion = "22";
        }
      } catch {
        /* default 24 */
      }

      downloadUrl = `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`;
      archiveName = `ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`;
    }

    const archivePath = join(ovmsDir, archiveName);

    try {
      printInfo(`URL: ${downloadUrl}`);
      const response = await fetch(downloadUrl, {
        headers: { "User-Agent": "ultrascript-tools-mcp/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
      printInfo(`Размер: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

      const buffer = await response.arrayBuffer();
      writeFileSync(archivePath, Buffer.from(buffer));
      printOK("Скачано");

      printInfo("Распаковка...");

      if (isWindows) {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${ovmsDir}' -Force"`, {
          stdio: "pipe",
          windowsHide: true,
        });
      } else {
        execSync(`tar -xzf "${archivePath}" -C "${ovmsDir}" --strip-components=1`, { stdio: "pipe" });
        execSync(`chmod +x "${ovmsBin}"`, { stdio: "pipe" });
      }

      // Cleanup
      try {
        require("node:fs").unlinkSync(archivePath);
      } catch {
        /* ignore */
      }

      ovmsBin = getOvmsBinPath();
      printOK("OVMS установлен");
    } catch (error: any) {
      printError(`Ошибка загрузки: ${error.message}`);
      return { success: false };
    }
  }

  // Download and prepare embedding model
  printInfo(`Подготовка модели: ${model.model_id}`);

  const hfModel = model.hf_model;
  if (!hfModel) {
    printError("Нет HuggingFace модели в конфигурации");
    return { success: false };
  }

  // Determine model directory name
  // For multi_device models (like Granite), use model_id for uniqueness
  // For other models, use "embeddings" for backward compatibility
  const modelDirName = (model as any).multi_device ? model.model_id : "embeddings";

  // Check for graph.pbtxt - indicates properly exported model with MediaPipe support
  const graphPath = join(modelsDir, modelDirName, "graph.pbtxt");
  let modelExported = existsSync(graphPath);
  let hasTokenizer = false;

  if (modelExported) {
    printOK("Модель уже экспортирована с MediaPipe поддержкой");
    hasTokenizer = true;
  } else {
    // Strategy 1: Use OVMS export_model.py (best - creates proper MediaPipe graph)
    const exportModelPaths = [
      "C:\\opt\\model_server\\demos\\common\\export_models\\export_model.py",
      join(dataDir, "ovms-src", "demos", "common", "export_models", "export_model.py"),
    ];
    const exportModelPy = exportModelPaths.find((p) => existsSync(p));

    if (exportModelPy) {
      printInfo("Экспорт модели через OVMS export_model.py (создаст MediaPipe граф)...");
      printInfo(`Источник: ${hfModel}`);

      const weightFormat = model.weight_format || "int8";

      try {
        const exportArgs = [
          exportModelPy,
          "embeddings_ov",
          "--source_model",
          hfModel,
          "--model_name",
          modelDirName,
          "--weight-format",
          weightFormat,
          "--pooling",
          "MEAN",
          "--model_repository_path",
          modelsDir,
          "--config_file_path",
          join(modelsDir, "config.json"),
          "--target_device",
          targetDevice,
          "--overwrite_models",
        ];

        printInfo("Это займёт 3-10 минут (загрузка и конвертация модели)...");

        const exitCode = await new Promise<number>((resolve, reject) => {
          const proc = spawn("python", exportArgs, {
            stdio: ["ignore", "inherit", "inherit"],
            windowsHide: true,
            cwd: dirname(exportModelPy),
          });
          proc.on("error", reject);
          proc.on("close", resolve);
        });

        if (exitCode === 0 && existsSync(graphPath)) {
          printOK("Модель экспортирована с MediaPipe поддержкой");
          modelExported = true;
          hasTokenizer = true;

          // For MediaPipe graphs, files stay in model directory root (no version subdirectory)
          // graph.pbtxt uses models_path="./" to find openvino_model.* in same directory

          // Create OVMS config.json in models root (required for OVMS startup)
          // mediapipe_config_list enables /v3/embeddings API (requires OVMS built with MediaPipe)
          const ovmsConfigPath = join(modelsDir, "config.json");
          if (!existsSync(ovmsConfigPath)) {
            const ovmsConfig = {
              model_config_list: [
                {
                  config: {
                    name: modelDirName,
                    base_path: modelDirName,
                  },
                },
              ],
              mediapipe_config_list: [
                {
                  name: modelDirName,
                  base_path: modelDirName,
                },
              ],
            };
            writeFileSync(ovmsConfigPath, JSON.stringify(ovmsConfig, null, 2));
            printOK(`OVMS config.json создан: ${ovmsConfigPath}`);
          }
        } else {
          printWarn(`export_model.py завершился с кодом ${exitCode}`);
        }
      } catch (error: any) {
        printWarn(`Ошибка export_model.py: ${error.message}`);
      }
    }

    // Strategy 2: Convert using Docker + optimum-cli (fallback - no MediaPipe)
    if (!modelExported) {
      printWarn("export_model.py не найден, используем Docker конвертацию");
      printInfo("Примечание: /v3/embeddings API будет недоступен, только /v2/infer");

      let hasDocker = false;
      try {
        execSync("docker --version", { stdio: "pipe", windowsHide: true });
        hasDocker = true;
      } catch {
        /* no docker */
      }

      if (!hasDocker) {
        printError("Для конвертации модели нужен Docker или OVMS репозиторий (C:\\opt\\model_server)");
        printInfo("Соберите OVMS из исходников: scripts\\setup-ovms-nvidia.cmd");
        return { success: false };
      }

      const modelDir = join(modelsDir, model.model_id, "1");
      mkdirSync(modelDir, { recursive: true });

      const irXmlPath = join(modelDir, "openvino_model.xml");

      printInfo(`Конвертация модели через Docker: ${hfModel}`);
      printInfo("Это займёт 3-10 минут...");

      const modelDirDocker = modelDir.replace(/\\/g, "/");
      const pythonImage = "python:3.11-slim";

      try {
        let pythonImageExists = false;
        try {
          const check = execSync(`docker images -q "${pythonImage}"`, { encoding: "utf-8", windowsHide: true });
          pythonImageExists = check.trim().length > 0;
        } catch {
          /* ignore */
        }

        if (!pythonImageExists) {
          printInfo(`Скачивание ${pythonImage}...`);
          execSync(`docker pull "${pythonImage}"`, { stdio: "inherit", timeout: 300000, windowsHide: true });
        }

        const weightFormat = model.weight_format || "int8";
        printInfo(`Конвертация с ${weightFormat.toUpperCase()} квантизацией...`);

        const dockerArgs = [
          "run",
          "--rm",
          "-v",
          `${modelDirDocker}:/output`,
          pythonImage,
          "bash",
          "-c",
          `pip install optimum[openvino] sentence-transformers && optimum-cli export openvino --model ${hfModel} --weight-format ${weightFormat} --library sentence_transformers --task feature-extraction /output`,
        ];

        const exitCode = await new Promise<number>((resolve, reject) => {
          const proc = spawn("docker", dockerArgs, {
            stdio: ["ignore", "inherit", "inherit"],
            windowsHide: true,
          });
          proc.on("error", reject);
          proc.on("close", resolve);
        });
        if (exitCode !== 0) throw new Error(`Docker exited with code ${exitCode}`);

        if (existsSync(irXmlPath)) {
          printOK("Модель сконвертирована (без MediaPipe)");
          modelExported = true;

          // Create simple OVMS config for this model
          const ovmsConfig = {
            model_config_list: [
              {
                config: {
                  name: "embeddings",
                  base_path: join(modelsDir, model.model_id).replace(/\\/g, "/"),
                },
              },
            ],
          };
          writeFileSync(join(modelsDir, "config.json"), JSON.stringify(ovmsConfig, null, 2));
        }
      } catch (error: any) {
        printError(`Ошибка конвертации: ${error.message}`);
        return { success: false };
      }
    }

    if (!modelExported) {
      printError("Не удалось экспортировать модель");
      return { success: false };
    }
  }

  // Check tokenizer status
  const tokenizerXmlPath = join(modelsDir, "embeddings", "openvino_tokenizer.xml");
  if (!hasTokenizer && existsSync(tokenizerXmlPath)) {
    hasTokenizer = true;
  }

  if (hasTokenizer) {
    printOK("/v3/embeddings API доступен (server-side tokenization)");
  } else {
    printInfo("/v2/models/embeddings/infer API (client-side tokenization)");
  }

  // Create startup script
  const startScript = isWindows ? join(ovmsDir, "start-ovms.bat") : join(ovmsDir, "start-ovms.sh");

  if (isWindows) {
    const batchContent = `@echo off
REM OVMS Native Startup Script
echo Starting OpenVINO Model Server...
"${ovmsBin}" --rest_port 8083 --port 9001 --config_path "${modelsDir}\\config.json"
`;
    writeFileSync(startScript, batchContent);
  } else {
    const shellContent = `#!/bin/bash
# OVMS Native Startup Script
echo "Starting OpenVINO Model Server..."
"${ovmsBin}" --rest_port 8083 --port 9001 --config_path "${modelsDir}/config.json"
`;
    writeFileSync(startScript, shellContent);
    execSync(`chmod +x "${startScript}"`, { stdio: "pipe" });
  }

  printOK(`Создан скрипт запуска: ${startScript}`);

  // Summary
  console.error("");
  console.error(`${c.green}OVMS Native установлен!${c.reset}`);
  console.error("");
  console.error(`  ${c.cyan}REST API:${c.reset} http://127.0.0.1:8083`);
  console.error(`  ${c.cyan}gRPC:${c.reset} 127.0.0.1:9001`);
  console.error(`  ${c.cyan}Target:${c.reset} ${targetDevice}`);
  if (hasTokenizer) {
    console.error(`  ${c.cyan}API:${c.reset} ${c.green}/v3/embeddings${c.reset} (server-side tokenization)`);
  } else {
    console.error(`  ${c.cyan}API:${c.reset} /v2/models/embeddings/infer (client-side tokenization)`);
  }
  console.error("");
  console.error(`  ${c.dim}OVMS будет запущен автоматически при старте MCP${c.reset}`);
  console.error(`  ${c.dim}и остановлен при отключении всех клиентов.${c.reset}`);
  console.error("");
  console.error(`  ${c.dim}Ручной запуск: ${startScript}${c.reset}`);

  // Create multi-device configuration for GPU + CPU load balancing
  const hasGPU = isNvidiaGPU || isIntelArc || isIntelGPU;
  let endpoints: string[] = [modelDirName];

  if (hasGPU && hasTokenizer) {
    // createMultiDeviceConfig works for both Intel and NVIDIA GPUs
    // BATCH:GPU.0(16) target device is supported by OpenVINO for NVIDIA via GPU plugin
    const createdEndpoints = createMultiDeviceConfig(modelsDir, hasGPU, modelsDir, modelDirName);
    if (createdEndpoints.length > 1) {
      endpoints = generateEndpointsArray(createdEndpoints);
      printOK(`Multi-device конфигурация: ${createdEndpoints.join(", ")}`);
      const gpuCount = endpoints.filter((e) => e.includes("gpu")).length;
      const cpuCount = endpoints.filter((e) => e.includes("cpu")).length;
      printInfo(`Round-robin распределение: ${endpoints.length} слотов (${gpuCount} GPU, ${cpuCount} CPU)`);
    }
  }

  return { success: true, endpoints, modelName: modelDirName };
}

// ═══════════════════════════════════════════════════════════════
// TEI Installation
// ═══════════════════════════════════════════════════════════════

/**
 * Get HuggingFace token from environment variables
 * Checks: HF_TOKEN, HUGGING_FACE_HUB_TOKEN, HF_API_TOKEN
 */
function getHFToken(): string | undefined {
  return process.env["HF_TOKEN"] || process.env["HUGGING_FACE_HUB_TOKEN"] || process.env["HF_API_TOKEN"];
}

async function installTEI(model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
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

  // Get TEI config from model or use defaults
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

  // Add TEI arguments
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

// ═══════════════════════════════════════════════════════════════
// Ollama Installation
// ═══════════════════════════════════════════════════════════════

async function installOllama(model: EmbeddingModel): Promise<boolean> {
  printInfo("Ollama setup...");
  console.error("");

  if (!checkOllama()) {
    printWarn("Ollama не установлен");
    console.error("");
    console.error("  Установите Ollama:");
    console.error("  https://ollama.ai/download");
    console.error("");

    const open = await prompt("  Открыть страницу загрузки? [y/N]: ");
    if (open.toLowerCase() === "y") {
      const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(cmd, ["https://ollama.ai/download"], { shell: true, stdio: "pipe", windowsHide: true });
    }
    return false;
  }

  printOK("Ollama установлен");

  // Check if service running
  try {
    const check = spawnSync("curl", ["-sf", "http://127.0.0.1:11434/"], { timeout: 5000, windowsHide: true });
    if (check.status !== 0) {
      printInfo("Starting Ollama service...");
      const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
      proc.unref();
      await sleep(3000);
    }
  } catch {
    /* continue */
  }

  printOK("Ollama service running");
  console.error("");

  // Pull model
  printInfo(`Downloading model: ${model.model_id}`);
  console.error("  This may take several minutes...");
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1200000,
    windowsHide: true,
  });
  if (pullResult.status !== 0) {
    printError("Failed to download model");
    return false;
  }

  printOK("Model downloaded!");
  return true;
}
