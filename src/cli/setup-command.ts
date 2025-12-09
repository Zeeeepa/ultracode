#!/usr/bin/env node
/**
 * UltraScript Tools MCP - Semantic Embedding Setup Command v2
 *
 * Smart setup with hardware detection and guided recommendations.
 *
 * Flow:
 * 0. Detect CPU (AVX2/VNNI/AMX) + GPU (NVIDIA arch)
 * 1. Ask: Comment language (English / Multilingual)
 * 2. Recommend best provider based on hardware
 * 3. Select model (512 tok + 8K legacy)
 * 4. Auto-detect installed, install required
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { CPUDetector, type CPUInfo } from "../cpu/cpu-detector.js";
import {
  ensureConfigDir,
  getConfigDir,
  getDisplayPath,
  type SemanticConfig,
  saveSemanticConfig,
} from "../utils/config-paths.js";

// Get package root directory
function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const standardRoot = join(__dirname, "..", "..");
  if (existsSync(join(standardRoot, "config", "embedding-models.json"))) {
    return standardRoot;
  }
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, "package.json"))) {
      const pkgContent = readFileSync(join(current, "package.json"), "utf-8");
      try {
        const pkg = JSON.parse(pkgContent);
        if (pkg.name === "ultrascript-tools-mcp" && existsSync(join(current, "config", "embedding-models.json"))) {
          return current;
        }
      } catch {
        /* continue */
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return standardRoot;
}

const PACKAGE_ROOT = getPackageRoot();
const MODELS_CONFIG_PATH = join(PACKAGE_ROOT, "config", "embedding-models.json");
const LLM_MODELS_CONFIG_PATH = join(PACKAGE_ROOT, "config", "llm-models.json");

// Colors (avoiding bold \x1b[1m which shows as red on some Windows terminals)
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[97m", // Bright white instead of bold
  dim: "\x1b[90m", // Gray
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function printBanner(): void {
  console.error("");
  console.error(`${c.cyan}${c.bright}╔═══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.error(`${c.cyan}${c.bright}║     UltraScript Tools MCP - Semantic Embedding Setup v2       ║${c.reset}`);
  console.error(`${c.cyan}${c.bright}╚═══════════════════════════════════════════════════════════════╝${c.reset}`);
  console.error("");
}

function printOK(msg: string): void {
  console.error(`${c.green}[OK]${c.reset} ${msg}`);
}
function printInfo(msg: string): void {
  console.error(`${c.cyan}[INFO]${c.reset} ${msg}`);
}
function printWarn(msg: string): void {
  console.error(`${c.yellow}[WARN]${c.reset} ${msg}`);
}
function printError(msg: string): void {
  console.error(`${c.red}[ERROR]${c.reset} ${msg}`);
}

interface EmbeddingModel {
  id: string;
  provider: string;
  name: string;
  badge?: string;
  model_id: string;
  gpu_architectures: string[];
  gpu_support: boolean;
  image_gpu?: string;
  image_cpu?: string;
  language: string;
  context_tokens: number;
  dimensions: number;
  size_mb: number;
  vram_mb?: number;
  ram_mb?: number;
  benchmark_toks?: number;
  use_case: string;
  description: string;
  device?: string;
  avg_ms?: number;
}

interface ModelsConfig {
  version: string;
  providers: Record<string, { name: string; description: string; default_port?: number }>;
  models: EmbeddingModel[];
  default_models: Record<string, string>;
}

interface GPUInfo {
  available: boolean;
  name: string;
  architecture: string;
  computeCap: number;
  isBlackwell: boolean;
  vramMB: number;
}

interface LLMModel {
  id: string;
  provider: string;
  name: string;
  badge?: string;
  model_id: string;
  devices: string[];
  context_tokens: number;
  size_gb: number;
  ram_gb: number;
  tokens_per_sec_cpu?: number;
  tokens_per_sec_npu?: number;
  quality: Record<string, number>;
  use_case: string;
  description: string;
  license?: string;
}

interface TGIModel {
  id: string;
  provider: string;
  name: string;
  badge?: string;
  model_id: string;
  gpu_architectures: string[];
  context_tokens: number;
  size_gb: number;
  vram_gb: number;
  use_case: string;
  description: string;
  docker_args?: string;
}

interface OllamaLLMModel {
  id: string;
  name: string;
  context_tokens: number;
  size_gb: number;
  vram_gb?: number;
  tokens_per_sec_gpu?: number;
  quality_overall: number;
  use_case: string;
  benchmark_note?: string;
}

interface LLMConfig {
  version: string;
  scenarios: Record<string, { name: string; description: string; openvino?: string; ollama?: string; tgi?: string }>;
  providers: Record<string, { name: string; description: string; blackwell_status?: string }>;
  models: LLMModel[];
  ollama_models: OllamaLLMModel[];
  tgi_models: TGIModel[];
  default_models: Record<string, string>;
}

function loadModelsConfig(): ModelsConfig | null {
  if (!existsSync(MODELS_CONFIG_PATH)) {
    printError(`Models configuration not found: ${MODELS_CONFIG_PATH}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(MODELS_CONFIG_PATH, "utf-8")) as ModelsConfig;
  } catch (error) {
    printError(`Failed to parse models config: ${error}`);
    return null;
  }
}

function loadLLMConfig(): LLMConfig | null {
  if (!existsSync(LLM_MODELS_CONFIG_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(LLM_MODELS_CONFIG_PATH, "utf-8")) as LLMConfig;
  } catch (error) {
    printWarn(`Failed to parse LLM config: ${error}`);
    return null;
  }
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// STEP 0: Hardware Detection
// ═══════════════════════════════════════════════════════════════

function detectGPU(): GPUInfo {
  try {
    const result = spawnSync(
      "nvidia-smi",
      ["--query-gpu=name,compute_cap,memory.total", "--format=csv,noheader,nounits"],
      {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );

    if (result.status !== 0 || !result.stdout) {
      return { available: false, name: "None", architecture: "cpu", computeCap: 0, isBlackwell: false, vramMB: 0 };
    }

    const parts = result.stdout
      .trim()
      .split(",")
      .map((s) => s.trim());
    const gpuName = parts[0] || "Unknown GPU";
    const computeCap = parseFloat(parts[1] || "0");
    const vramMB = parseInt(parts[2] || "0", 10);

    let architecture = "cpu";
    let isBlackwell = false;

    if (computeCap >= 12.0) {
      architecture = "blackwell";
      isBlackwell = true;
    } else if (computeCap >= 10.0) {
      architecture = "blackwell";
      isBlackwell = true;
    } else if (computeCap >= 9.0) architecture = "hopper";
    else if (computeCap >= 8.9) architecture = "ada";
    else if (computeCap >= 8.6) architecture = "ampere-86";
    else if (computeCap >= 8.0) architecture = "ampere-80";
    else if (computeCap >= 7.5) architecture = "turing";
    else if (computeCap >= 7.0) architecture = "volta";

    return { available: true, name: gpuName, architecture, computeCap, isBlackwell, vramMB };
  } catch {
    return { available: false, name: "None", architecture: "cpu", computeCap: 0, isBlackwell: false, vramMB: 0 };
  }
}

function printHardwareInfo(cpu: CPUInfo, gpu: GPUInfo): void {
  console.error(`${c.dim}Hardware Detection${c.reset}`);
  console.error("");

  // CPU Info - simple user-friendly message
  const cpuMessage =
    {
      optimal: "Максимальная производительность на OpenVINO, GPU свободен для других задач",
      excellent: "Отличная производительность на OpenVINO, GPU свободен для других задач",
      good: "Хорошая производительность на OpenVINO",
      basic: "Базовая поддержка OpenVINO, рекомендуется GPU",
      unsupported: "OpenVINO не поддерживается, требуется GPU",
    }[cpu.openvinoTier] || "Неизвестно";

  console.error(`${c.dim}  CPU: ${cpu.model}${c.reset}`);
  console.error(`${c.dim}       ${cpuMessage}${c.reset}`);
  console.error("");

  // GPU Info - name + architecture + VRAM
  if (gpu.available) {
    const archName = gpu.architecture.charAt(0).toUpperCase() + gpu.architecture.slice(1);
    const vramGB = (gpu.vramMB / 1024).toFixed(0);
    console.error(`${c.dim}  GPU: ${gpu.name} (${archName}, ${vramGB}GB VRAM)${c.reset}`);
    console.error(`${c.dim}       Можно использовать GPU embedding/LLM модели через Ollama и TEI (docker)${c.reset}`);
  } else {
    console.error(`${c.dim}  GPU: Не обнаружен${c.reset}`);
  }
  console.error("");
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: Language Selection
// ═══════════════════════════════════════════════════════════════

async function selectLanguage(): Promise<"en" | "multi"> {
  console.error(`${c.yellow}[STEP 1] Comment Language${c.reset}`);
  console.error("");
  console.error(`  ${c.white}Какой язык используется в комментариях кода?${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}1)${c.reset} Использую только English`);
  console.error(`     ${c.dim}Можно использовать более быстрые embedding-модели${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}2)${c.reset} Есть комментарии на других языках (русский, китайский, ...)`);
  console.error(`     ${c.dim}Нужно использовать мультиязычные embedding-модели${c.reset}`);
  console.error("");

  const choice = await prompt("  Выбор [1-2, default=1]: ");
  const lang = choice === "2" ? "multi" : "en";
  console.error("");
  return lang;
}

// ═══════════════════════════════════════════════════════════════
// STEP 2: Provider Recommendation
// ═══════════════════════════════════════════════════════════════

interface ProviderOption {
  id: string;
  name: string;
  recommended: boolean;
  speed: string;
  pros: string[];
  cons: string[];
  available: boolean;
}

function getProviderRecommendations(cpu: CPUInfo, gpu: GPUInfo): ProviderOption[] {
  const options: ProviderOption[] = [];

  // OpenVINO — if CPU supports it
  if (cpu.openvinoTier !== "unsupported") {
    const speedMap = { optimal: "55K+ tok/s", excellent: "50K tok/s", good: "40K tok/s", basic: "20K tok/s" };
    options.push({
      id: "openvino",
      name: "OpenVINO (CPU)",
      recommended: cpu.openvinoTier === "optimal" || cpu.openvinoTier === "excellent" || !gpu.available,
      speed: speedMap[cpu.openvinoTier as keyof typeof speedMap] || "20K tok/s",
      pros: ["Не тратит GPU/VRAM", "Уже в комплекте", "INT8 квантизация"],
      cons: cpu.openvinoTier === "basic" ? ["Базовая скорость на старом CPU"] : [],
      available: true,
    });
  }

  // TEI — if GPU available
  if (gpu.available) {
    const teiOption: ProviderOption = {
      id: "tei",
      name: gpu.isBlackwell ? "TEI (GPU) — Blackwell edition" : "TEI (GPU)",
      recommended: !gpu.isBlackwell && gpu.computeCap >= 8.0,
      speed: "45K tok/s",
      pros: ["Native batch", "Максимальная скорость на GPU"],
      cons: ["Требует Docker"],
      available: true,
    };
    if (gpu.isBlackwell) {
      teiOption.cons.push("Требует специальный образ: hotchpotch/tei-blackwell-testing");
    }
    options.push(teiOption);
  }

  // Ollama — always available
  options.push({
    id: "ollama",
    name: "Ollama (GPU/CPU)",
    recommended: gpu.isBlackwell, // Recommend for Blackwell since TEI is tricky
    speed: gpu.available ? "53K tok/s" : "10K tok/s",
    pros: ["Простая установка", "Поддержка всех GPU", "Без Docker"],
    cons: ["Нет native batch"],
    available: true,
  });

  // Memory — fallback
  options.push({
    id: "memory",
    name: "Memory (без ML)",
    recommended: false,
    speed: "∞ (no ML)",
    pros: ["Мгновенно", "Без зависимостей"],
    cons: ["Только hash-based поиск", "Низкое качество"],
    available: true,
  });

  return options;
}

async function selectProvider(cpu: CPUInfo, gpu: GPUInfo): Promise<string> {
  console.error(`${c.yellow}[STEP 2] Provider Selection${c.reset}`);
  console.error("");

  const options = getProviderRecommendations(cpu, gpu);

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const recBadge = opt.recommended ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
    console.error(`  ${c.bright}${i + 1})${c.reset} ${opt.name}${recBadge}`);
    console.error(`     ${c.cyan}⚡ ${opt.speed}${c.reset}`);
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
    printError("Invalid choice");
    process.exit(1);
  }

  const selected = options[idx]!;
  console.error("");
  printInfo(`Выбран провайдер: ${selected.name}`);
  console.error("");

  return selected.id;
}

// ═══════════════════════════════════════════════════════════════
// STEP 3: Model Selection
// ═══════════════════════════════════════════════════════════════

async function selectModel(
  provider: string,
  language: "en" | "multi",
  config: ModelsConfig,
  gpu: GPUInfo,
): Promise<EmbeddingModel> {
  console.error(`${c.yellow}[STEP 3] Model Selection${c.reset}`);
  console.error("");

  // Filter models by provider and language
  let models = config.models.filter((m) => m.provider === provider);

  // Filter by language - strict filtering, no fallback
  if (language === "en") {
    models = models.filter((m) => m.language === "en" || m.language === "code");
  } else {
    // For multi, only show multilingual models (no English fallback)
    models = models.filter((m) => m.language === "multi");
  }

  // Filter by GPU compatibility
  if (provider === "tei" && gpu.available) {
    const arch = gpu.isBlackwell ? "blackwell-patch" : gpu.architecture;
    models = models.filter((m) => m.gpu_architectures.includes(arch) || m.gpu_architectures.includes("cpu"));
  }

  if (models.length === 0) {
    printError(`No models available for ${provider} + ${language}`);
    process.exit(1);
  }

  // Split into 512 and 8K
  const models512 = models.filter((m) => m.context_tokens <= 512);
  const models8K = models.filter((m) => m.context_tokens > 512);

  // Display 512 models (limit to 3)
  console.error(`  ${c.bright}── 512 токенов (Smart Chunker для длинных методов) ──${c.reset}`);
  console.error("");

  const display512 = models512.slice(0, 3);
  let idx = 0;

  for (const model of display512) {
    idx++;
    const recBadge = idx === 1 ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
    const badge = model.badge ? ` ${model.badge}` : "";
    console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge}${recBadge}`);

    // Build info line with memory and benchmark
    const memInfo = model.vram_mb
      ? `${model.vram_mb}MB VRAM`
      : model.ram_mb
        ? `${model.ram_mb}MB RAM`
        : `${model.size_mb}MB`;
    const tokInfo = model.benchmark_toks ? `${c.green}${Math.round(model.benchmark_toks / 1000)}K tok/s${c.reset}` : "";
    let info = `${model.context_tokens} tok | ${memInfo}`;
    if (tokInfo) info += ` | ${tokInfo}`;
    console.error(`     ${c.dim}${info}${c.reset}`);
    console.error(`     ${c.dim}${model.description}${c.reset}`);
    console.error("");
  }

  // Display 8K models (limit to 2)
  if (models8K.length > 0) {
    console.error(`  ${c.bright}── 8K токенов (для Legacy кодовых баз) ──${c.reset}`);
    console.error(`  ${c.yellow}⚠️ 8K актуально только для legacy проектов с методами 500+ строк.${c.reset}`);
    console.error(`  ${c.dim}   Smart Chunker эффективно обрабатывает длинный код с 512 моделями.${c.reset}`);
    console.error("");

    const display8K = models8K.slice(0, 2);

    for (const model of display8K) {
      idx++;
      const badge = model.badge ? ` ${model.badge}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge} ${c.yellow}[LEGACY]${c.reset}`);

      // Build info line with memory and benchmark
      const memInfo = model.vram_mb
        ? `${model.vram_mb}MB VRAM`
        : model.ram_mb
          ? `${model.ram_mb}MB RAM`
          : `${model.size_mb}MB`;
      const tokInfo = model.benchmark_toks
        ? `${c.green}${Math.round(model.benchmark_toks / 1000)}K tok/s${c.reset}`
        : "";
      let info = `${model.context_tokens} tok | ${memInfo}`;
      if (tokInfo) info += ` | ${tokInfo}`;
      console.error(`     ${c.dim}${info}${c.reset}`);
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }
  }

  const allDisplayed = [...display512, ...models8K.slice(0, 2)];
  const choice = await prompt(`  Выбор [1-${allDisplayed.length}, default=1]: `);
  const modelIdx = (parseInt(choice, 10) || 1) - 1;

  if (modelIdx < 0 || modelIdx >= allDisplayed.length) {
    printError("Invalid choice");
    process.exit(1);
  }

  const selected = allDisplayed[modelIdx]!;
  console.error("");
  printInfo(`Выбрана модель: ${selected.name}`);
  console.error("");

  return selected;
}

// ═══════════════════════════════════════════════════════════════
// STEP 4: Installation
// ═══════════════════════════════════════════════════════════════

function checkDocker(): boolean {
  try {
    const result = spawnSync("docker", ["info"], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function checkOllama(): boolean {
  // Try up to 3 times with increasing timeout (Ollama may be busy pulling/serving)
  const timeouts = [5000, 15000, 30000];

  for (let i = 0; i < timeouts.length; i++) {
    try {
      const result = spawnSync("ollama", ["--version"], {
        encoding: "utf-8",
        timeout: timeouts[i],
        stdio: "pipe",
        shell: true, // Required for Windows PATH resolution
        windowsHide: true, // Hide console window on Windows
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

async function installProvider(provider: string, model: EmbeddingModel, gpu: GPUInfo): Promise<boolean> {
  console.error(`${c.yellow}[STEP 4] Installation${c.reset}`);
  console.error("");

  if (provider === "openvino") {
    return await installOpenVINO(model);
  } else if (provider === "tei") {
    return await installTEI(model, gpu);
  } else if (provider === "ollama") {
    return await installOllama(model);
  } else if (provider === "memory") {
    printInfo("Memory provider не требует установки");
    return true;
  }

  return false;
}

async function installOpenVINO(model: EmbeddingModel): Promise<boolean> {
  printInfo("OpenVINO setup...");
  console.error("");

  // Check if openvino-node is available
  try {
    await import("openvino-node");
    printOK("openvino-node установлен");
  } catch {
    printWarn("openvino-node не найден в runtime");
    console.error("");
    console.error(`${c.dim}  Пакет должен быть в комплекте. Проверьте:${c.reset}`);
    console.error(`${c.dim}  bun add openvino-node @xenova/transformers${c.reset}`);
    return false;
  }

  // Download model
  console.error("");
  printInfo(`Загрузка модели: ${model.model_id}`);
  console.error(`${c.dim}  Это может занять несколько минут...${c.reset}`);
  console.error("");

  try {
    // Initialize provider which triggers model download
    const { OpenVINOProvider } = await import("../semantic/providers/openvino-provider.js");
    const provider = new OpenVINOProvider({
      model: model.model_id,
      device: (model.device as "CPU" | "GPU") ?? "CPU",
      autoDownload: true,
      logger: {
        debug: () => {},
        info: (msg: string) => console.error(`${c.dim}  ${msg}${c.reset}`),
        warn: (msg: string) => printWarn(msg),
        error: (msg: string) => printError(msg),
      },
    });
    await provider.initialize();
    await provider.close();

    printOK("Модель загружена!");
  } catch (error) {
    printWarn(`Не удалось загрузить модель: ${error}`);
    console.error(`${c.dim}  Модель будет скачана при первом использовании${c.reset}`);
  }

  console.error("");
  printOK("OpenVINO готов к использованию!");
  return true;
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

  // Select image based on GPU
  let imageTag: string;
  if (gpu.isBlackwell) {
    // Use Blackwell-compatible image
    imageTag = "hotchpotch/tei-blackwell-testing:latest";
    printWarn("Blackwell GPU detected — using special image");
  } else if (gpu.available) {
    imageTag = model.image_gpu || "ghcr.io/huggingface/text-embeddings-inference:1.8.3";
  } else {
    imageTag = model.image_cpu || "ghcr.io/huggingface/text-embeddings-inference:cpu-1.8.3";
  }

  const containerName = "tei-server";
  const port = 8080;

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

  const pullResult = spawnSync("docker", ["pull", imageTag], { stdio: "inherit", timeout: 600000, windowsHide: true });
  if (pullResult.status !== 0) {
    printError("Failed to pull Docker image");
    return false;
  }

  printOK("Image downloaded");
  console.error("");

  // Create container
  printInfo(`Creating container with model: ${model.model_id}`);

  const dockerArgs = ["run", "-d", "--name", containerName, "-p", `${port}:80`, "--restart", "unless-stopped"];
  if (gpu.available) {
    dockerArgs.push("--gpus", "all");
  }
  dockerArgs.push(imageTag, "--model-id", model.model_id, "--max-concurrent-requests", "512");

  const runResult = spawnSync("docker", dockerArgs, { stdio: "inherit", windowsHide: true });
  if (runResult.status !== 0) {
    printError("Failed to create container");
    return false;
  }

  printOK("Container created");

  // Wait for health
  printInfo("Waiting for TEI to initialize (max 60s)...");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
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
    process.stderr.write(".");
  }

  console.error("");
  printWarn("Health check timed out. Check: docker logs tei-server");
  return true;
}

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
      await new Promise((r) => setTimeout(r, 3000));
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

// ═══════════════════════════════════════════════════════════════
// LLM Provider Installation
// ═══════════════════════════════════════════════════════════════

function checkOpenVINOGenAI(): boolean {
  try {
    const result = spawnSync("python", ["-c", "import openvino_genai; print(openvino_genai.__version__)"], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function installLLMProvider(provider: string, model: SelectedLLMModel, gpu: GPUInfo): Promise<boolean> {
  console.error(`${c.yellow}[STEP 5.3] LLM Installation${c.reset}`);
  console.error("");

  if (provider === "tgi") {
    return await installTGI_LLM(model, gpu);
  } else if (provider === "ollama") {
    return await installOllamaLLM(model);
  } else if (provider === "openvino") {
    return await installOpenVINOGenAI(model);
  }

  return false;
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
  const port = 8081; // Different port from TEI embedding

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

  const pullResult = spawnSync("docker", ["pull", imageTag], { stdio: "inherit", timeout: 900000, windowsHide: true });
  if (pullResult.status !== 0) {
    printError("Failed to pull Docker image");
    return false;
  }

  printOK("Image downloaded");
  console.error("");

  // Create container
  printInfo(`Creating TGI container with model: ${model.model_id}`);

  const dockerArgs = [
    "run",
    "-d",
    "--name",
    containerName,
    "-p",
    `${port}:80`,
    "--restart",
    "unless-stopped",
    "--gpus",
    "all",
    "-e",
    "HUGGING_FACE_HUB_TOKEN=$" + "{HF_TOKEN:-}",
    "-v",
    "huggingface-cache:/data",
    imageTag,
    "--model-id",
    model.model_id,
    "--max-input-tokens",
    "4096",
    "--max-total-tokens",
    "8192",
  ];

  const runResult = spawnSync("docker", dockerArgs, { stdio: "inherit", windowsHide: true });
  if (runResult.status !== 0) {
    printError("Failed to create container");
    return false;
  }

  printOK("TGI container created");

  // Wait for health
  printInfo("Waiting for TGI to initialize (may take 2-5 min for model download)...");

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
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
      await new Promise((r) => setTimeout(r, 3000));
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

async function installOpenVINOGenAI(model: SelectedLLMModel): Promise<boolean> {
  printInfo("OpenVINO GenAI setup...");
  console.error("");

  // Check if openvino-genai is installed
  if (!checkOpenVINOGenAI()) {
    printWarn("openvino-genai не установлен");
    console.error("");

    const install = await prompt("  Установить openvino-genai через pip? [Y/n]: ");
    if (install.toLowerCase() !== "n") {
      printInfo("Installing openvino-genai...");
      console.error("  This may take 2-3 minutes...");
      console.error("");

      const pipResult = spawnSync("pip", ["install", "openvino-genai"], {
        stdio: "inherit",
        timeout: 300000,
        windowsHide: true,
      });

      if (pipResult.status !== 0) {
        printError("Failed to install openvino-genai");
        console.error("");
        console.error("  Try manually: pip install openvino-genai");
        return false;
      }

      printOK("openvino-genai installed");
    } else {
      printWarn("Skipping openvino-genai installation");
      return false;
    }
  } else {
    printOK("openvino-genai уже установлен");
  }

  console.error("");

  // Download model using huggingface_hub
  printInfo(`Downloading OpenVINO model: ${model.model_id}`);
  console.error(`  Size: ~${model.size_gb}GB, this may take several minutes...`);
  console.error("");

  const downloadScript = `
import os
from pathlib import Path
from huggingface_hub import snapshot_download

model_id = "${model.model_id}"
cache_dir = Path.home() / ".cache" / "openvino-models"
model_dir = cache_dir / model_id.replace("/", "_")

if model_dir.exists():
    print(f"Model already exists: {model_dir}")
else:
    print(f"Downloading {model_id}...")
    snapshot_download(
        repo_id=model_id,
        local_dir=str(model_dir),
        local_dir_use_symlinks=False
    )
    print(f"Downloaded to: {model_dir}")

print("SUCCESS")
`;

  const downloadResult = spawnSync("python", ["-c", downloadScript], {
    stdio: "inherit",
    timeout: 1800000,
    windowsHide: true,
  });

  if (downloadResult.status !== 0) {
    printWarn("Model download had issues, but may still work");
    console.error("  Model will be downloaded on first use");
  } else {
    printOK("OpenVINO model ready!");
  }

  // Test device availability
  if (model.device === "NPU") {
    printInfo("Checking NPU availability...");
    const npuCheck = spawnSync(
      "python",
      [
        "-c",
        `
from openvino import Core
core = Core()
if "NPU" in core.available_devices:
    driver = core.get_property("NPU", "NPU_DRIVER_VERSION")
    print(f"NPU available, driver: {driver}")
else:
    print("NPU not available, will use CPU")
`,
      ],
      { encoding: "utf-8", timeout: 10000, windowsHide: true },
    );

    if (npuCheck.stdout) {
      console.error(`  ${c.dim}${npuCheck.stdout.trim()}${c.reset}`);
    }
  }

  console.error("");
  printOK("OpenVINO GenAI setup complete!");
  return true;
}

// ═══════════════════════════════════════════════════════════════
// STEP 5: LLM Model Selection (for AutoDoc)
// ═══════════════════════════════════════════════════════════════

async function askEnableLLM(): Promise<boolean> {
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

async function selectLLMProvider(cpu: CPUInfo, gpu: GPUInfo): Promise<string | null> {
  console.error(`${c.yellow}[STEP 5.1] LLM Provider Selection${c.reset}`);
  console.error("");

  const options: ProviderOption[] = [];

  // TGI — only for non-Blackwell GPUs with Docker
  if (gpu.available && !gpu.isBlackwell && gpu.vramMB >= 4000) {
    options.push({
      id: "tgi",
      name: "TGI (Text Generation Inference)",
      recommended: gpu.computeCap >= 8.0 && gpu.vramMB >= 8000,
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
    recommended: gpu.isBlackwell || (gpu.available && gpu.vramMB >= 8000),
    speed: ollamaSpeed,
    pros: ["Простая установка", "Все GPU (включая RTX 50xx)", "Streaming"],
    cons: gpu.vramMB < 4000 ? ["Мало VRAM, только мелкие модели"] : [],
    available: true,
  });

  // OpenVINO — if CPU supports it
  if (cpu.openvinoTier !== "unsupported") {
    const speedMap = { optimal: "12 tok/s", excellent: "10 tok/s", good: "8 tok/s", basic: "5 tok/s" };
    const hasNPU = cpu.model.toLowerCase().includes("ultra");
    options.push({
      id: "openvino",
      name: hasNPU ? "OpenVINO GenAI (CPU/NPU)" : "OpenVINO GenAI (CPU)",
      recommended: !gpu.available && (cpu.openvinoTier === "optimal" || cpu.openvinoTier === "excellent"),
      speed: speedMap[cpu.openvinoTier as keyof typeof speedMap] || "5 tok/s",
      pros: hasNPU
        ? ["Не тратит GPU/VRAM", "INT4 квантизация", "NPU ~15W (энергоэффективно)"]
        : ["Не тратит GPU/VRAM", "INT4 квантизация"],
      cons: cpu.openvinoTier === "basic" ? ["Медленно на старом CPU"] : [],
      available: true,
    });
  }

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

interface SelectedLLMModel {
  id: string;
  model_id: string;
  name: string;
  context_tokens: number;
  size_gb: number;
  vram_gb?: number;
  device?: string;
}

async function selectLLMModel(
  provider: string,
  config: LLMConfig,
  cpu: CPUInfo,
  gpu: GPUInfo,
): Promise<SelectedLLMModel | null> {
  console.error(`${c.yellow}[STEP 5.2] LLM Model Selection${c.reset}`);
  console.error("");

  // Get available RAM/VRAM based on provider and hardware
  const availableVRAM = gpu.available ? Math.floor(gpu.vramMB / 1024) : 0;
  const hasNPU = cpu.model.toLowerCase().includes("ultra");

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

  if (provider === "openvino") {
    // OpenVINO models from models array
    const resourceInfo = hasNPU ? "CPU/NPU" : "CPU";
    console.error(`  ${c.dim}Устройство: ${resourceInfo}${c.reset}`);
    console.error("");

    let models = config.models.filter((m) => m.provider === "openvino");

    // If has NPU, prioritize NPU models
    if (hasNPU) {
      const npuModels = models.filter((m) => m.devices.includes("NPU"));
      const cpuModels = models.filter((m) => !m.devices.includes("NPU"));
      models = [...npuModels, ...cpuModels];
    }

    // Filter by RAM (assume 16GB available)
    models = models.filter((m) => m.ram_gb <= 16);

    if (models.length === 0) {
      printWarn("Нет OpenVINO моделей для вашего оборудования");
      return null;
    }

    const displayModels = models.slice(0, 5);
    let idx = 0;

    for (const model of displayModels) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}[РЕКОМЕНДУЕТСЯ]${c.reset}` : "";
      const badge = model.badge ? ` ${model.badge}` : "";
      const devices = model.devices.join("/");
      const speed = model.tokens_per_sec_cpu ? `${model.tokens_per_sec_cpu} tok/s` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge}${recBadge}`);
      console.error(
        `     ${c.dim}${model.ram_gb}GB RAM | ${devices} | ${Math.round(model.context_tokens / 1024)}K context${speed ? ` | ${speed}` : ""}${c.reset}`,
      );
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }

    const choice = await prompt(`  Выбор [1-${displayModels.length}, default=1]: `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= displayModels.length) return null;

    const selected = displayModels[modelIdx]!;
    console.error("");
    printInfo(`Выбрана OpenVINO модель: ${selected.name}`);
    console.error("");

    // Determine best device
    let device = "CPU";
    if (hasNPU && selected.devices.includes("NPU")) {
      device = "NPU";
    } else if (selected.devices.includes("GPU")) {
      device = "GPU";
    }

    return {
      id: selected.id,
      model_id: selected.model_id,
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      device,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Main Setup
// ═══════════════════════════════════════════════════════════════

export async function runSetup(args: string[]): Promise<void> {
  printBanner();

  const config = loadModelsConfig();
  if (!config) process.exit(1);

  // Parse args
  let providerArg: string | undefined;
  let modelArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerArg = args[++i];
    }
    if (args[i] === "--model" && args[i + 1]) {
      modelArg = args[++i];
    }
  }

  // Step 0: Detect hardware
  const cpu = CPUDetector.detect();
  const gpu = detectGPU();
  printHardwareInfo(cpu, gpu);

  // Step 1: Language selection
  const language = await selectLanguage();

  // Step 2: Provider selection
  const provider = providerArg || (await selectProvider(cpu, gpu));

  // Handle memory provider early
  if (provider === "memory") {
    const memConfig: SemanticConfig = {
      enabled: true,
      embedding: {
        platform: "memory",
        architecture: gpu.architecture,
        memory: { model_path: "./models/embedding", vector_size: 384 },
      },
    };
    ensureConfigDir();
    saveSemanticConfig(memConfig);
    printOK(`Config saved: ${getDisplayPath(getConfigDir())}/semantic-config.json`);
    return;
  }

  // Step 3: Model selection
  let selectedModel: EmbeddingModel;

  if (modelArg) {
    const found = config.models.find((m) => m.id === modelArg || m.model_id === modelArg);
    if (!found) {
      printError(`Model not found: ${modelArg}`);
      process.exit(1);
    }
    selectedModel = found;
    printInfo(`Using model: ${selectedModel.name}`);
  } else {
    selectedModel = await selectModel(provider, language, config, gpu);
  }

  // Step 4: Installation
  const success = await installProvider(provider, selectedModel, gpu);

  if (!success) {
    printWarn("Installation had issues, but config will be saved");
  }

  // Save config
  const finalConfig: SemanticConfig = {
    enabled: true,
    embedding: {
      platform: provider as "tei" | "ollama" | "memory" | "openvino",
      architecture: gpu.architecture,
      tei:
        provider === "tei"
          ? {
              endpoint: "http://127.0.0.1:8080",
              selected_model: selectedModel.model_id,
              models: [
                {
                  id: selectedModel.model_id,
                  languages: [selectedModel.language],
                  vector_size: selectedModel.dimensions,
                },
              ],
            }
          : undefined,
      ollama:
        provider === "ollama"
          ? {
              endpoint: "http://127.0.0.1:11434",
              selected_model: selectedModel.model_id,
              models: [
                {
                  id: selectedModel.model_id,
                  languages: [selectedModel.language],
                  vector_size: selectedModel.dimensions,
                },
              ],
            }
          : undefined,
      openvino:
        provider === "openvino"
          ? {
              selected_model: selectedModel.model_id,
              device: (selectedModel.device as "CPU" | "GPU") ?? "CPU",
              avg_ms: selectedModel.avg_ms,
              models: [
                {
                  id: selectedModel.model_id,
                  languages: [selectedModel.language],
                  vector_size: selectedModel.dimensions,
                  context_tokens: selectedModel.context_tokens,
                },
              ],
            }
          : undefined,
    },
    auto_detection: { gpu_architecture: true, codebase_size: true, language: true },
  };

  ensureConfigDir();
  saveSemanticConfig(finalConfig);

  // Step 5: LLM Model Selection (optional)
  console.error("");
  const enableLLM = await askEnableLLM();

  if (enableLLM) {
    const llmConfig = loadLLMConfig();
    if (llmConfig) {
      const llmProvider = await selectLLMProvider(cpu, gpu);
      if (llmProvider) {
        const llmModel = await selectLLMModel(llmProvider, llmConfig, cpu, gpu);
        if (llmModel) {
          // Install LLM provider and download model
          const llmSuccess = await installLLMProvider(llmProvider, llmModel, gpu);

          if (!llmSuccess) {
            printWarn("LLM installation had issues, but config will be saved");
          }

          // Update config with LLM settings
          finalConfig.llm = {
            enabled: true,
            platform: llmProvider as "openvino" | "ollama" | "tgi",
            openvino:
              llmProvider === "openvino"
                ? {
                    model_id: llmModel.model_id,
                    device: (llmModel.device as "CPU" | "GPU" | "NPU") ?? "CPU",
                    context_tokens: llmModel.context_tokens,
                  }
                : undefined,
            ollama:
              llmProvider === "ollama"
                ? {
                    endpoint: "http://127.0.0.1:11434",
                    model_id: llmModel.model_id,
                    context_tokens: llmModel.context_tokens,
                  }
                : undefined,
            tgi:
              llmProvider === "tgi"
                ? {
                    endpoint: "http://127.0.0.1:8081",
                    model_id: llmModel.model_id,
                    context_tokens: llmModel.context_tokens,
                    container_name: "tgi-llm-server",
                  }
                : undefined,
          };
          saveSemanticConfig(finalConfig);
        }
      }
    } else {
      printWarn("LLM config not found, skipping LLM setup");
    }
  }

  // Summary
  console.error("");
  console.error(`${c.green}${c.bright}╔═══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.error(`${c.green}${c.bright}║                     Setup Complete!                           ║${c.reset}`);
  console.error(`${c.green}${c.bright}╚═══════════════════════════════════════════════════════════════╝${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}Embedding:${c.reset}`);
  console.error(`  ${c.cyan}  Provider:${c.reset}   ${provider}`);
  console.error(`  ${c.cyan}  Model:${c.reset}      ${selectedModel.name}`);
  console.error(`  ${c.cyan}  Context:${c.reset}    ${selectedModel.context_tokens} tokens`);
  console.error(`  ${c.cyan}  Language:${c.reset}   ${language === "en" ? "English" : "Multilingual"}`);
  console.error("");

  if (finalConfig.llm?.enabled) {
    console.error(`  ${c.bright}LLM (AutoDoc):${c.reset}`);
    console.error(`  ${c.cyan}  Provider:${c.reset}   ${finalConfig.llm.platform}`);
    const llmModelId =
      finalConfig.llm.openvino?.model_id || finalConfig.llm.ollama?.model_id || finalConfig.llm.tgi?.model_id;
    const llmContext =
      finalConfig.llm.openvino?.context_tokens ||
      finalConfig.llm.ollama?.context_tokens ||
      finalConfig.llm.tgi?.context_tokens;
    console.error(`  ${c.cyan}  Model:${c.reset}      ${llmModelId}`);
    console.error(
      `  ${c.cyan}  Context:${c.reset}    ${llmContext ? `${Math.round(llmContext / 1024)}K` : "?"} tokens`,
    );
    if (finalConfig.llm.tgi) {
      console.error(`  ${c.cyan}  Endpoint:${c.reset}   ${finalConfig.llm.tgi.endpoint}`);
    }
    console.error("");
  }

  console.error(`  ${c.cyan}Config:${c.reset}       ${getDisplayPath(getConfigDir())}/semantic-config.json`);
  console.error("");

  if (provider === "openvino") {
    console.error(`${c.dim}OpenVINO Info:${c.reset}`);
    console.error(
      `${c.dim}  Performance: ~${selectedModel.avg_ms ?? 1.3}ms/request on ${selectedModel.device ?? "CPU"}${c.reset}`,
    );
    console.error(`${c.dim}  Models auto-download on first use${c.reset}`);
  } else if (provider === "tei") {
    console.error(`${c.dim}TEI Management:${c.reset}`);
    console.error(`${c.dim}  docker logs tei-server      # View logs${c.reset}`);
    console.error(`${c.dim}  docker restart tei-server   # Restart${c.reset}`);
  } else if (provider === "ollama") {
    console.error(`${c.dim}Ollama Management:${c.reset}`);
    console.error(`${c.dim}  ollama list                 # List models${c.reset}`);
    console.error(`${c.dim}  ollama pull <model>         # Download model${c.reset}`);
  }

  // LLM management hints
  if (finalConfig.llm?.tgi) {
    console.error("");
    console.error(`${c.dim}TGI LLM Management:${c.reset}`);
    console.error(`${c.dim}  docker logs tgi-llm-server    # View logs${c.reset}`);
    console.error(`${c.dim}  docker restart tgi-llm-server # Restart${c.reset}`);
  } else if (finalConfig.llm?.openvino) {
    console.error("");
    console.error(`${c.dim}OpenVINO LLM Info:${c.reset}`);
    console.error(`${c.dim}  Device: ${finalConfig.llm.openvino.device}${c.reset}`);
    console.error(`${c.dim}  Models: ~/.cache/openvino-models/${c.reset}`);
  }

  console.error("");
  console.error(`${c.yellow}Next: Restart your MCP client to enable semantic mode${c.reset}`);
  console.error("");
}

// Run if executed directly
const isMain =
  import.meta.url.endsWith("setup-command.ts") ||
  import.meta.url.includes("setup-command.ts?") ||
  process.argv[1]?.includes("setup-command");

if (isMain) {
  runSetup(process.argv.slice(2)).catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
}
