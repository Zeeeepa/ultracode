/**
 * Selection UI for setup command - language, provider, model
 */

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { t, ta, ti } from "./i18n/index.js";
import type { EmbeddingModel, GPUInfo, ModelsConfig, ProviderOption } from "./setup-types.js";
import { c, clearScreen, printBanner, printError, printInfo, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Language Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLanguage(): Promise<"en" | "multi"> {
  clearScreen();
  printBanner();
  console.error(`  ${c.bright}${t("codeLanguage.title")}${c.reset}`);
  console.error("");
  console.error("");
  console.error(`  ${c.bright}1)${c.reset} ${t("codeLanguage.option_en")}`);
  console.error(`     ${c.dim}${t("codeLanguage.option_en_hint")}${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}2)${c.reset} ${t("codeLanguage.option_multi")}`);
  console.error(`     ${c.dim}${t("codeLanguage.option_multi_hint")}${c.reset}`);
  console.error("");

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: 2, def: 1 })} `);
  const lang = choice === "2" ? "multi" : "en";
  clearScreen();
  return lang;
}

// ═══════════════════════════════════════════════════════════════
// Provider Selection
// ═══════════════════════════════════════════════════════════════

export function getProviderRecommendations(_cpu: CPUInfo, gpu: GPUInfo): ProviderOption[] {
  const options: ProviderOption[] = [];

  // Hardware detection
  const isNvidiaGPU = gpu.available && /nvidia|geforce|rtx|gtx|quadro/i.test(gpu.name);
  const isAmdGPU = gpu.available && /amd|radeon|rx\s?\d|vega|navi/.test(gpu.name.toLowerCase());
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // ══════════════════════════════════════════════════════════════════════
  // 1. vLLM - NVIDIA GPU champion (measured: 1352 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  if (isNvidiaGPU) {
    options.push({
      id: "vllm",
      name: t("provider.vllm.name"),
      recommended: true, // Fastest option for NVIDIA
      speed: "1352 emb/s", // Measured with e5-small on RTX 5090
      pros: ta("provider.vllm.pros"),
      cons: ta("provider.vllm.cons"),
      available: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. TEI - GPU runner-up (measured: 1193 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  if (gpu.available) {
    const teiOption: ProviderOption = {
      id: "tei",
      name: gpu.isBlackwell ? `${t("provider.tei.name")} — Blackwell edition` : t("provider.tei.name"),
      recommended: !isNvidiaGPU && !gpu.isBlackwell && gpu.computeCap >= 8.0, // Recommend if no NVIDIA
      speed: "1193 emb/s", // Measured with e5-small on RTX 5090
      pros: ta("provider.tei.pros"),
      cons: [...ta("provider.tei.cons")],
      available: true,
    };
    if (gpu.isBlackwell) {
      teiOption.cons.push(t("provider.tei_blackwell"));
    }
    options.push(teiOption);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. llama.cpp - native GGUF (measured: 441 emb/s centralized mode)
  // ══════════════════════════════════════════════════════════════════════
  options.push({
    id: "llamacpp",
    name: t("provider.llamacpp.name"),
    recommended: isAmdGPU, // Recommend for AMD GPUs (Vulkan backend)
    speed: "441 emb/s", // Measured with e5-small, centralized mode, parallel=8
    pros: ta("provider.llamacpp.pros"),
    cons: ta("provider.llamacpp.cons"),
    available: true,
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4. OVMS Native - OpenVINO (measured: 260-326 emb/s with e5-small)
  // ══════════════════════════════════════════════════════════════════════
  if (isWindows || isLinux) {
    options.push({
      id: "ovms-native",
      name: t("provider.ovms.name"),
      recommended: !gpu.available && (isWindows || isLinux), // Recommend for CPU-only without Docker
      speed: "260-326 emb/s", // Measured with e5-small, iGPU + CPU, ratio 3:5
      pros: ta("provider.ovms.pros"),
      cons: ta("provider.ovms.cons"),
      available: true,
    });
  }

  return options;
}

export async function selectProvider(cpu: CPUInfo, gpu: GPUInfo): Promise<string> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("provider.title")}${c.reset}`);
  console.error("");
  console.error("");

  const options = getProviderRecommendations(cpu, gpu);

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const recBadge = opt.recommended ? ` ${c.green}${t("provider.recommended")}${c.reset}` : "";
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

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: options.length, def: defaultChoice })} `);
  const idx = (parseInt(choice, 10) || defaultChoice) - 1;

  if (idx < 0 || idx >= options.length) {
    printError(t("common.invalid_choice"));
    process.exit(1);
  }

  const selected = options[idx]!;
  clearScreen();
  printInfo(ti("provider.selected", { name: selected.name }));
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
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("model.title")}${c.reset}`);
  console.error("");
  console.error("");

  // Filter models by provider and language
  // ovms-native uses models with provider === "ovms", vllm has its own provider
  let modelProvider = provider;
  if (provider.startsWith("ovms")) {
    modelProvider = "ovms";
  }
  let models = config.models.filter((m) => m.provider === modelProvider);

  // Filter out unavailable models (e.g., jina-v3 with Task LoRA)
  type ModelWithAvailable = EmbeddingModel & { available?: boolean };
  models = models.filter((m) => (m as ModelWithAvailable).available !== false);

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
    printError(ti("model.no_models", { provider, language }));
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
  console.error(`  ${c.bright}${t("model.section_512")}${c.reset}`);
  console.error("");

  const display512 = models512.slice(0, 5);
  let idx = 0;

  for (const model of display512) {
    idx++;
    const recBadge = idx === 1 ? ` ${c.green}${t("model.recommended")}${c.reset}` : "";
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
    console.error(`  ${c.bright}${t("model.section_8k")}${c.reset}`);
    console.error(`  ${c.yellow}⚠️ ${t("model.section_8k_warning")}${c.reset}`);
    console.error(`  ${c.dim}   ${t("model.section_8k_hint")}${c.reset}`);
    console.error("");

    const display8K = models8K.slice(0, 2);

    for (const model of display8K) {
      idx++;
      const badge = model.badge ? ` ${model.badge}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge} ${c.yellow}${t("model.legacy")}${c.reset}`);

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
  const choice = await prompt(`  ${ti("common.prompt_choice", { max: allDisplayed.length, def: 1 })} `);
  const modelIdx = (parseInt(choice, 10) || 1) - 1;

  if (modelIdx < 0 || modelIdx >= allDisplayed.length) {
    printError(t("common.invalid_choice"));
    process.exit(1);
  }

  const selected = allDisplayed[modelIdx]!;
  clearScreen();
  printInfo(ti("model.selected", { name: selected.name }));
  console.error("");

  return selected;
}
