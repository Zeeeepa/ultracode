/**
 * LLM provider selection and installation for setup command
 * Handles TGI and Ollama LLM providers for AutoDoc
 */

import { execSync, spawn, spawnSync } from "node:child_process";

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

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { checkDocker, checkOllama } from "./setup-installers.js";
import type { GPUInfo, LLMConfig, ProviderOption, SelectedLLMModel } from "./setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Docker Model Runner Check
// ═══════════════════════════════════════════════════════════════

// Docker Model Runner models (top 4: 2 quality, 2 fast)
const DMR_MODELS = [
  // Quality models (best reasoning)
  {
    id: "ai/qwen2.5",
    name: "Qwen 2.5",
    badge: "🏆 Quality + Multilingual",
    size_gb: 4.7,
    context_tokens: 32768,
    quality: "high",
    description: "Лучший мультиязычный (RU/EN), отличное reasoning",
  },
  {
    id: "ai/deepseek-r1-distill-llama",
    name: "DeepSeek R1 Distill",
    badge: "🧠 Best Reasoning",
    size_gb: 8,
    context_tokens: 32768,
    quality: "high",
    description: "Лучший reasoning, chain-of-thought",
  },
  // Fast models (smaller, quicker)
  {
    id: "ai/phi4",
    name: "Microsoft Phi-4",
    badge: "⚡ Fast + Compact",
    size_gb: 3,
    context_tokens: 16384,
    quality: "fast",
    description: "Компактный, быстрый, хорошее качество",
  },
  {
    id: "ai/llama3.2",
    name: "Llama 3.2",
    badge: "⚡ Fast + Balanced",
    size_gb: 2,
    context_tokens: 131072,
    quality: "fast",
    description: "Быстрый, большой контекст 128K",
  },
];

function checkDockerModelRunner(): boolean {
  try {
    const result = spawnSync("docker", ["model", "ls"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// LLM Enable Question
// ═══════════════════════════════════════════════════════════════

export async function askEnableLLM(): Promise<boolean> {
  console.error(`${c.yellow}[STEP 5] LLM для генерации документации (AutoDoc)${c.reset}`);
  console.error("");
  console.error(`  ${c.white}Хотите настроить LLM для автогенерации документации?${c.reset}`);
  console.error(`  ${c.dim}LLM модели генерируют docstrings, README, архитектурные описания.${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}1)${c.reset} Да, настроить LLM`);
  console.error(`  ${c.bright}2)${c.reset} Нет, пропустить`);
  console.error("");

  const choice = await prompt("  Выбор [1-2, default=2]: ");
  console.error("");
  return choice === "1";
}

// ═══════════════════════════════════════════════════════════════
// LLM Provider Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLLMProvider(_cpu: CPUInfo, gpu: GPUInfo): Promise<string | null> {
  console.error(`${c.yellow}[STEP 5.1] LLM Provider Selection${c.reset}`);
  console.error("");

  const options: ProviderOption[] = [];

  // Docker Model Runner — simplest option if Docker Desktop 4.40+ available
  const hasDMR = checkDockerModelRunner();
  if (hasDMR) {
    options.push({
      id: "docker-model-runner",
      name: "Docker Model Runner (Docker Desktop 4.40+)",
      recommended: true, // Simplest option
      speed: gpu.available ? "15-30 tok/s" : "5-10 tok/s",
      pros: ["Простейшая настройка", "docker model run", "Авто-GPU"],
      cons: ["Требует Docker Desktop 4.40+"],
      available: true,
    });
  }

  // TGI — only for non-Blackwell GPUs with Docker
  if (gpu.available && !gpu.isBlackwell && gpu.vramMB >= 4000) {
    options.push({
      id: "tgi",
      name: "TGI (Text Generation Inference)",
      recommended: !hasDMR && gpu.computeCap >= 8.0 && gpu.vramMB >= 8000,
      speed: "20-30 tok/s",
      pros: ["Native batch", "Continuous batching", "Best throughput"],
      cons: ["Требует Docker", "Не поддерживает RTX 50xx"],
      available: true,
    });
  }

  // Ollama — always available, works on Blackwell
  const ollamaSpeed = gpu.available ? `${Math.round(gpu.vramMB / 400)} tok/s` : "10 tok/s";
  options.push({
    id: "ollama",
    name: gpu.isBlackwell ? "Ollama (GPU) — Blackwell работает!" : "Ollama (GPU/CPU)",
    recommended: !hasDMR && (gpu.isBlackwell || (gpu.available && gpu.vramMB >= 8000)),
    speed: ollamaSpeed,
    pros: ["Простая установка", "Все GPU (включая RTX 50xx)", "Streaming"],
    cons: gpu.vramMB < 4000 ? ["Мало VRAM, только мелкие модели"] : [],
    available: true,
  });

  // Skip option
  options.push({
    id: "skip",
    name: "Пропустить настройку LLM",
    recommended: false,
    speed: "-",
    pros: ["Можно настроить позже"],
    cons: [],
    available: true,
  });

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const recBadge = opt.recommended ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
    console.error(`  ${c.bright}${i + 1})${c.reset} ${opt.name}${recBadge}`);
    if (opt.speed !== "-") {
      console.error(`     ${c.cyan}⚡ ~${opt.speed}${c.reset}`);
    }
    console.error(`     ${c.green}+${c.reset} ${opt.pros.join(" | ")}`);
    if (opt.cons.length > 0) {
      console.error(`     ${c.yellow}-${c.reset} ${opt.cons.join(" | ")}`);
    }
    console.error("");
  }

  const defaultIdx = options.findIndex((o) => o.recommended);
  const defaultChoice = defaultIdx >= 0 ? defaultIdx + 1 : 1;

  const choice = await prompt(`  Выбор [1-${options.length}, default=${defaultChoice}]: `);
  const idx = (parseInt(choice, 10) || defaultChoice) - 1;

  if (idx < 0 || idx >= options.length) {
    return null;
  }

  const selected = options[idx]!;
  if (selected.id === "skip") {
    printInfo("LLM настройка пропущена");
    console.error("");
    return null;
  }

  console.error("");
  printInfo(`Выбран LLM провайдер: ${selected.name}`);
  console.error("");

  return selected.id;
}

// ═══════════════════════════════════════════════════════════════
// LLM Model Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLLMModel(
  provider: string,
  config: LLMConfig,
  gpu: GPUInfo,
): Promise<SelectedLLMModel | null> {
  console.error(`${c.yellow}[STEP 5.2] LLM Model Selection${c.reset}`);
  console.error("");

  // Get available RAM/VRAM based on provider and hardware
  const availableVRAM = gpu.available ? Math.floor(gpu.vramMB / 1024) : 0;

  if (provider === "docker-model-runner") {
    // Docker Model Runner models
    console.error(`  ${c.dim}Docker Model Runner — 4 лучших модели для документации${c.reset}`);
    console.error("");

    let idx = 0;
    for (const model of DMR_MODELS) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name} ${model.badge}${recBadge}`);
      console.error(`     ${c.dim}${model.size_gb}GB | ${Math.round(model.context_tokens / 1024)}K context${c.reset}`);
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }

    const choice = await prompt(`  Выбор [1-${DMR_MODELS.length}, default=1]: `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= DMR_MODELS.length) return null;

    const selected = DMR_MODELS[modelIdx]!;
    console.error("");
    printInfo(`Выбрана модель: ${selected.name}`);
    console.error("");

    return {
      id: selected.id,
      model_id: selected.id,
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.size_gb,
    };
  }

  if (provider === "tgi") {
    // TGI models from tgi_models array
    console.error(`  ${c.dim}Доступно: ${availableVRAM}GB VRAM${c.reset}`);
    console.error("");

    const tgiModels = config.tgi_models.filter((m) => m.vram_gb <= availableVRAM + 1);

    if (tgiModels.length === 0) {
      printWarn("Нет TGI моделей для вашего объёма VRAM");
      return null;
    }

    // Sort by vram (smaller first for better fit)
    tgiModels.sort((a, b) => b.vram_gb - a.vram_gb);

    const displayModels = tgiModels.slice(0, 5);
    let idx = 0;

    for (const model of displayModels) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
      const badge = model.badge ? ` ${model.badge}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge}${recBadge}`);
      console.error(
        `     ${c.dim}${model.vram_gb}GB VRAM | ${Math.round(model.context_tokens / 1024)}K context${c.reset}`,
      );
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }

    const choice = await prompt(`  Выбор [1-${displayModels.length}, default=1]: `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= displayModels.length) return null;

    const selected = displayModels[modelIdx]!;
    console.error("");
    printInfo(`Выбрана TGI модель: ${selected.name}`);
    console.error("");

    return {
      id: selected.id,
      model_id: selected.model_id,
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.vram_gb,
    };
  }

  if (provider === "ollama") {
    // Ollama models from ollama_models array
    const resourceInfo = gpu.available ? `${availableVRAM}GB VRAM` : "CPU only";
    console.error(`  ${c.dim}Доступно: ${resourceInfo}${c.reset}`);
    console.error("");

    let ollamaModels = config.ollama_models;

    // Filter by VRAM if GPU available
    if (gpu.available) {
      ollamaModels = ollamaModels.filter((m) => (m.vram_gb || m.size_gb) <= availableVRAM + 1);
    }

    if (ollamaModels.length === 0) {
      printWarn("Нет Ollama моделей для вашего оборудования");
      return null;
    }

    // Sort by quality
    ollamaModels.sort((a, b) => b.quality_overall - a.quality_overall);

    const displayModels = ollamaModels.slice(0, 5);
    let idx = 0;

    for (const model of displayModels) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
      const speedInfo = model.tokens_per_sec_gpu ? ` | ${model.tokens_per_sec_gpu} tok/s` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${recBadge}`);
      console.error(
        `     ${c.dim}${model.vram_gb || model.size_gb}GB | ${Math.round(model.context_tokens / 1024)}K context${speedInfo}${c.reset}`,
      );
      if (model.benchmark_note) {
        console.error(`     ${c.dim}${model.benchmark_note}${c.reset}`);
      }
      console.error("");
    }

    const choice = await prompt(`  Выбор [1-${displayModels.length}, default=1]: `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= displayModels.length) return null;

    const selected = displayModels[modelIdx]!;
    console.error("");
    printInfo(`Выбрана Ollama модель: ${selected.name}`);
    console.error("");

    return {
      id: selected.id,
      model_id: selected.id, // Ollama uses id as model_id
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.vram_gb,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// LLM Provider Installation
// ═══════════════════════════════════════════════════════════════

export async function installLLMProvider(provider: string, model: SelectedLLMModel, gpu: GPUInfo): Promise<boolean> {
  console.error(`${c.yellow}[STEP 5.3] LLM Installation${c.reset}`);
  console.error("");

  if (provider === "docker-model-runner") {
    return await installDMR_LLM(model);
  } else if (provider === "tgi") {
    return await installTGI_LLM(model, gpu);
  } else if (provider === "ollama") {
    return await installOllamaLLM(model);
  }

  return false;
}

async function installDMR_LLM(model: SelectedLLMModel): Promise<boolean> {
  printInfo("Docker Model Runner LLM setup...");
  console.error("");

  // Check Docker Model Runner availability
  if (!checkDockerModelRunner()) {
    printError("Docker Model Runner не доступен");
    console.error("");
    console.error("  Требуется Docker Desktop 4.40+");
    console.error("  https://www.docker.com/products/docker-desktop");
    console.error("");
    console.error("  После установки включите Model Runner:");
    console.error("  Docker Desktop → Settings → Features in development → Docker Model Runner");
    return false;
  }

  printOK("Docker Model Runner доступен");
  console.error("");

  // Pull model
  printInfo(`Downloading model: ${model.model_id}`);
  console.error(`  Size: ~${model.size_gb}GB, this may take several minutes...`);
  console.error("");

  const pullResult = spawnSync("docker", ["model", "pull", model.model_id], {
    stdio: "inherit",
    timeout: 1800000,
    windowsHide: true,
  });

  if (pullResult.status !== 0) {
    printError("Failed to download model");
    console.error("");
    console.error("  Попробуйте вручную:");
    console.error(`  docker model pull ${model.model_id}`);
    return false;
  }

  printOK("Model downloaded!");
  console.error("");

  // Test the model
  printInfo("Testing model...");

  const testResult = spawnSync("docker", ["model", "run", model.model_id, "Hello"], {
    encoding: "utf-8",
    timeout: 60000,
    windowsHide: true,
    stdio: "pipe",
  });

  if (testResult.status === 0) {
    printOK("Model works correctly!");
    console.error("");
    console.error(`  ${c.green}Использование:${c.reset}`);
    console.error(`  docker model run ${model.model_id} "Your prompt here"`);
    console.error("");
    console.error(`  ${c.green}API endpoint:${c.reset}`);
    console.error(`  http://localhost:12434/engines/llama.cpp/v1/chat/completions`);
  } else {
    printWarn("Model test failed, but model may still work");
  }

  return true;
}

async function installTGI_LLM(model: SelectedLLMModel, _gpu: GPUInfo): Promise<boolean> {
  printInfo("TGI LLM setup...");
  console.error("");

  if (!checkDocker()) {
    printError("Docker не установлен или не запущен");
    console.error("");
    console.error("  Установите Docker Desktop:");
    console.error("  https://www.docker.com/products/docker-desktop");
    return false;
  }

  printOK("Docker доступен");

  const imageTag = "ghcr.io/huggingface/text-generation-inference:3.3.4";
  const containerName = "tgi-llm-server";
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
  printInfo(`Pulling TGI image: ${imageTag}`);
  console.error("  This may take 5-10 minutes...");

  try {
    execSync(`docker pull ${imageTag}`, {
      stdio: "inherit",
      timeout: 900000,
      windowsHide: true,
    });
  } catch (e: any) {
    console.error(`[DEBUG] TGI pull failed: ${e.message}`);
    printError("Failed to pull Docker image");
    return false;
  }

  printOK("Image downloaded");
  console.error("");

  // Create container
  printInfo(`Creating TGI container with model: ${model.model_id}`);

  const tgiCmd = `docker run -d --name ${containerName} -p ${port}:80 --restart unless-stopped --gpus all -e "HUGGING_FACE_HUB_TOKEN=\${HF_TOKEN:-}" -v huggingface-cache:/data ${imageTag} --model-id ${model.model_id} --max-input-tokens 4096 --max-total-tokens 8192`;

  console.error(`[DEBUG] Running: ${tgiCmd}`);

  try {
    execSync(tgiCmd, { stdio: "inherit", windowsHide: true });
  } catch (e: any) {
    console.error(`[DEBUG] TGI docker run failed: ${e.message}`);
    printError("Failed to create container");
    return false;
  }

  printOK("TGI container created");

  // Wait for health
  printInfo("Waiting for TGI to initialize (may take 2-5 min for model download)...");

  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      const health = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}/health`], {
        timeout: 5000,
        windowsHide: true,
      });
      if (health.status === 0) {
        console.error("");
        printOK("TGI LLM server is ready!");
        printInfo(`Endpoint: http://127.0.0.1:${port}`);
        return true;
      }
    } catch {
      /* continue */
    }
    process.stderr.write(".");
  }

  console.error("");
  printWarn("Health check timed out. Check: docker logs tgi-llm-server");
  return true;
}

async function installOllamaLLM(model: SelectedLLMModel): Promise<boolean> {
  printInfo("Ollama LLM setup...");
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
  printInfo(`Downloading LLM model: ${model.model_id}`);
  console.error(`  Size: ~${model.size_gb}GB, this may take several minutes...`);
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1800000,
    windowsHide: true,
  });
  if (pullResult.status !== 0) {
    printError("Failed to download model");
    return false;
  }

  printOK("LLM model downloaded!");
  return true;
}
