/**
 * Selection UI for setup command - language, provider, model
 */

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import type { EmbeddingModel, GPUInfo, ModelsConfig, ProviderOption } from "./setup-types.js";
import { c, printError, printInfo, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Language Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLanguage(): Promise<"en" | "multi"> {
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
// Provider Selection
// ═══════════════════════════════════════════════════════════════

export function getProviderRecommendations(cpu: CPUInfo, gpu: GPUInfo): ProviderOption[] {
  const options: ProviderOption[] = [];

  // Hardware detection
  const isNvidiaGPU = gpu.available && /nvidia|geforce|rtx|gtx|quadro/i.test(gpu.name);
  const isIntelGPU = gpu.available && gpu.name.toLowerCase().includes("intel");
  const isAmdGPU = gpu.available && /amd|radeon|rx\s?\d|vega|navi/.test(gpu.name.toLowerCase());
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // ══════════════════════════════════════════════════════════════════════
  // 1. vLLM - NVIDIA GPU champion (measured: 1352 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  if (isNvidiaGPU) {
    options.push({
      id: "vllm",
      name: "vLLM Docker (NVIDIA GPU)",
      recommended: true, // Fastest option for NVIDIA
      speed: "1352 emb/s", // Measured with e5-small on RTX 5090
      pros: ["Самый быстрый", "NVIDIA GPU ускорение", "OpenAI API", "Continuous batching"],
      cons: ["Требует Docker", "Требует 8GB+ VRAM"],
      available: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. TEI - GPU runner-up (measured: 1193 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  if (gpu.available) {
    const teiOption: ProviderOption = {
      id: "tei",
      name: gpu.isBlackwell ? "TEI (GPU) — Blackwell edition" : "TEI (GPU)",
      recommended: !isNvidiaGPU && !gpu.isBlackwell && gpu.computeCap >= 8.0, // Recommend if no NVIDIA
      speed: "1193 emb/s", // Measured with e5-small on RTX 5090
      pros: ["Native batch", "HuggingFace оптимизация", "Низкая латентность"],
      cons: ["Требует Docker"],
      available: true,
    };
    if (gpu.isBlackwell) {
      teiOption.cons.push("Требует специальный образ: hotchpotch/tei-blackwell-testing");
    }
    options.push(teiOption);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. llama.cpp - native GGUF (measured: 373 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  options.push({
    id: "llamacpp",
    name: "llama.cpp (Native GGUF)",
    recommended: isAmdGPU, // Recommend for AMD GPUs (Vulkan backend)
    speed: "373 emb/s", // Measured with e5-small on RTX 5090
    pros: ["Без Docker", "GGUF модели", "CUDA/Vulkan/CPU", "Низкое потребление VRAM"],
    cons: ["Медленнее vLLM/TEI", "/v1/embeddings API"],
    available: true,
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4. OVMS Native - OpenVINO (TBD - needs benchmark)
  // ══════════════════════════════════════════════════════════════════════
  if (isWindows || isLinux) {
    const speedMap = { optimal: "TBD", excellent: "TBD", good: "TBD", basic: "TBD" };
    const ovmsSpeed = isIntelGPU ? "TBD (Intel GPU)" : speedMap[cpu.openvinoTier as keyof typeof speedMap] || "TBD";

    options.push({
      id: "ovms-native",
      name: "OVMS Native (без Docker)",
      recommended: !gpu.available && (isWindows || isLinux), // Recommend for CPU-only without Docker
      speed: ovmsSpeed, // TODO: benchmark
      pros: ["Без Docker", "Простая установка", "INT8 квантизация", "Большие batch size"],
      cons: isIntelGPU ? ["Intel GPU требует драйвера", "Не протестирован"] : ["Не протестирован"],
      available: true,
    });
  }

  return options;
}

export async function selectProvider(cpu: CPUInfo, gpu: GPUInfo): Promise<string> {
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
// Model Selection
// ═══════════════════════════════════════════════════════════════

export async function selectModel(
  provider: string,
  language: "en" | "multi",
  config: ModelsConfig,
  gpu: GPUInfo,
): Promise<EmbeddingModel> {
  console.error(`${c.yellow}[STEP 3] Model Selection${c.reset}`);
  console.error("");

  // Filter models by provider and language
  // ovms-native uses models with provider === "ovms", vllm has its own provider
  let modelProvider = provider;
  if (provider.startsWith("ovms")) {
    modelProvider = "ovms";
  }
  let models = config.models.filter((m) => m.provider === modelProvider);

  // Filter out unavailable models (e.g., jina-v3 with Task LoRA)
  models = models.filter((m) => (m as any).available !== false);

  // Filter by language - code models appear in both modes (code is language-agnostic)
  if (language === "en") {
    models = models.filter((m) => m.language === "en" || m.language === "code");
  } else {
    // For multi, show multilingual + code models
    models = models.filter((m) => m.language === "multi" || m.language === "code");
  }

  // Filter by GPU compatibility
  if (provider === "tei" && gpu.available) {
    const arch = gpu.isBlackwell ? "blackwell-patch" : gpu.architecture;
    models = models.filter((m) => m.gpu_architectures.includes(arch) || m.gpu_architectures.includes("cpu"));
  }

  // Filter by VRAM for GPU models (Ollama, TEI)
  if (gpu.available && gpu.vramMB > 0 && (provider === "ollama" || provider === "tei")) {
    const availableVRAM = gpu.vramMB;
    models = models.filter((m) => {
      const requiredVRAM = m.vram_mb || 0;
      // Allow models that fit in VRAM with 500MB headroom, or CPU-capable models
      return requiredVRAM <= availableVRAM + 500 || m.gpu_architectures?.includes("cpu");
    });
  }

  if (models.length === 0) {
    printError(`No models available for ${provider} + ${language}`);
    process.exit(1);
  }

  // Split into 512 and 8K, then sort by benchmark (faster first)
  const models512 = models
    .filter((m) => m.context_tokens <= 512)
    .sort((a, b) => (b.benchmark_chunks_per_sec || 0) - (a.benchmark_chunks_per_sec || 0));
  const models8K = models
    .filter((m) => m.context_tokens > 512)
    .sort((a, b) => (b.benchmark_chunks_per_sec || 0) - (a.benchmark_chunks_per_sec || 0));

  // Display 512 models (limit to 5)
  console.error(`  ${c.bright}── 512 токенов (Smart Chunker для длинных методов) ──${c.reset}`);
  console.error("");

  const display512 = models512.slice(0, 5);
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
