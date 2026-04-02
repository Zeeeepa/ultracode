/**
 * Selection UI for setup command - language, provider, model
 *
 * Model catalog is hardcoded from the Zig reference implementation
 * (ultracode.zig/src/config/semantic_config.zig) to keep both versions in sync.
 */

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { getSetupLanguage, t, ta, ti } from "./i18n/index.js";
import type { EmbeddingModel, GPUInfo, ModelsConfig, ProviderOption } from "./setup-types.js";
import { c, clearScreen, printBanner, printError, printInfo, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Zig Embedding Model Catalog
// Source: ultracode.zig/src/config/semantic_config.zig:26-37
// This is the single source of truth for available models.
// ═══════════════════════════════════════════════════════════════

export interface ZigEmbeddingModel {
  id: string;
  name: string;
  dimension: number;
  context: number;
  lang: "en" | "multi";
  mteb: number;
  note_en: string;
  note_ru: string;
  hf_repo: string;
  size_mb: number;
}

export const ZIG_EMBEDDING_MODELS: ZigEmbeddingModel[] = [
  // Multilingual (sorted by size: fastest first)
  {
    id: "multilingual-e5-small",
    name: "E5 Small",
    dimension: 384,
    context: 512,
    lang: "multi",
    mteb: 57.79,
    note_en: "Fast, 94 languages",
    note_ru: "Быстрая, 94 языка",
    hf_repo: "intfloat/multilingual-e5-small",
    size_mb: 118,
  },
  {
    id: "multilingual-e5-base",
    name: "E5 Base",
    dimension: 768,
    context: 512,
    lang: "multi",
    mteb: 59.45,
    note_en: "Balanced, 94 languages",
    note_ru: "Сбалансированная, 94 языка",
    hf_repo: "intfloat/multilingual-e5-base",
    size_mb: 470,
  },
  // English-only (sorted by size: fastest first)
  {
    id: "snowflake-arctic-embed-xs",
    name: "Arctic XS",
    dimension: 384,
    context: 512,
    lang: "en",
    mteb: 50.0,
    note_en: "Smallest, code-optimized",
    note_ru: "Самая компактная, для кода",
    hf_repo: "Snowflake/snowflake-arctic-embed-xs",
    size_mb: 90,
  },
  {
    id: "all-MiniLM-L6-v2",
    name: "MiniLM L6 v2",
    dimension: 384,
    context: 512,
    lang: "en",
    mteb: 56.26,
    note_en: "Fastest, English",
    note_ru: "Быстрейшая, English",
    hf_repo: "sentence-transformers/all-MiniLM-L6-v2",
    size_mb: 91,
  },
  {
    id: "mxbai-embed-xsmall-v1",
    name: "MxbAI XSmall",
    dimension: 384,
    context: 4096,
    lang: "en",
    mteb: 0,
    note_en: "MiniLM upgrade, Matryoshka, 24MB INT8",
    note_ru: "Замена MiniLM, Matryoshka, 24МБ INT8",
    hf_repo: "mixedbread-ai/mxbai-embed-xsmall-v1",
    size_mb: 23,
  },
  {
    id: "nomic-embed-text-v1.5",
    name: "Nomic v1.5",
    dimension: 768,
    context: 8192,
    lang: "en",
    mteb: 62.28,
    note_en: "8K context — best for Java/C#",
    note_ru: "8K контекст — рек. для Java/C#",
    hf_repo: "nomic-ai/nomic-embed-text-v1.5",
    size_mb: 548,
  },
  {
    id: "gte-modernbert-base",
    name: "GTE ModernBERT",
    dimension: 768,
    context: 8192,
    lang: "en",
    mteb: 64.38,
    note_en: "Top quality 8K — best for Java/C#",
    note_ru: "Лучшее качество 8K — рек. для Java/C#",
    hf_repo: "Alibaba-NLP/gte-modernbert-base",
    size_mb: 149,
  },
  {
    id: "modernbert-embed-base",
    name: "Nomic ModernBERT",
    dimension: 768,
    context: 8192,
    lang: "en",
    mteb: 62.62,
    note_en: "Matryoshka 768>256d 8K — best for Java/C#",
    note_ru: "Matryoshka 768>256d 8K — рек. для Java/C#",
    hf_repo: "nomic-ai/modernbert-embed-base",
    size_mb: 149,
  },
];

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
  const isMetal = gpu.available && gpu.architecture === "metal";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // ══════════════════════════════════════════════════════════════════════
  // Apple Silicon → MLX (native Metal GPU) + llama.cpp fallback
  // ══════════════════════════════════════════════════════════════════════
  if (isMetal) {
    options.push({
      id: "mlx",
      name: "MLX (Apple Metal Native)",
      recommended: true,
      speed: "~400 emb/s (Metal GPU)",
      pros: [
        "Native Metal GPU — прямой inference на Apple Silicon",
        "Никаких зависимостей — всё в комплекте",
        "Модель скачивается из CDN (~100-500MB)",
      ],
      cons: ["Только macOS Apple Silicon"],
      available: true,
    });

    options.push({
      id: "llamacpp",
      name: t("provider.llamacpp.name"),
      recommended: false,
      speed: "~300 emb/s (CPU)",
      pros: ta("provider.llamacpp.pros"),
      cons: ta("provider.llamacpp.cons"),
      available: true,
    });

    return options;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 1. TEI - recommended for NVIDIA GPU (measured: 1193 emb/s)
  // ══════════════════════════════════════════════════════════════════════
  if (isNvidiaGPU || isLinux) {
    options.push({
      id: "tei",
      name: t("provider.tei.name"),
      recommended: isNvidiaGPU,
      speed: isNvidiaGPU ? "1193 emb/s" : "~150 emb/s (CPU)",
      pros: ta("provider.tei.pros"),
      cons: [...ta("provider.tei.cons")],
      available: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. vLLM - NVIDIA GPU alternative (measured: 1352 emb/s)
  // ══════════════════════════════════════════════════════════════════════
  if (isNvidiaGPU) {
    options.push({
      id: "vllm",
      name: t("provider.vllm.name"),
      recommended: false,
      speed: "1352 emb/s",
      pros: ta("provider.vllm.pros"),
      cons: ta("provider.vllm.cons"),
      available: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. llama.cpp - native GGUF (441 emb/s). For AMD GPU / no-Docker
  // ══════════════════════════════════════════════════════════════════════
  if (!isNvidiaGPU) {
    options.push({
      id: "llamacpp",
      name: t("provider.llamacpp.name"),
      recommended: isAmdGPU,
      speed: "441 emb/s",
      pros: ta("provider.llamacpp.pros"),
      cons: ta("provider.llamacpp.cons"),
      available: true,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. OVMS Native - OpenVINO (260-326 emb/s). CPU-only, Intel optimized
  // ══════════════════════════════════════════════════════════════════════
  if (!gpu.available && (isWindows || isLinux)) {
    options.push({
      id: "ovms-native",
      name: t("provider.ovms.name"),
      recommended: true,
      speed: "260-326 emb/s",
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
// Model Selection (Zig catalog — single source of truth)
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a ZigEmbeddingModel to the EmbeddingModel interface used by installers.
 * The `provider` field is set later based on the selected provider.
 */
export function zigModelToEmbeddingModel(zigModel: ZigEmbeddingModel, provider: string): EmbeddingModel {
  const base: EmbeddingModel = {
    id: zigModel.id,
    provider,
    name: zigModel.name,
    model_id: provider === "ovms" || provider === "ovms-native" ? zigModel.id : zigModel.hf_repo,
    gpu_architectures: ["cpu", "turing", "ampere", "ada", "hopper", "blackwell"],
    gpu_support: true,
    language: zigModel.lang,
    context_tokens: zigModel.context,
    dimensions: zigModel.dimension,
    size_mb: zigModel.size_mb,
    use_case: "general",
    description: getSetupLanguage() === "ru" ? zigModel.note_ru : zigModel.note_en,
    hf_model: zigModel.hf_repo,
  };

  // TEI Docker images — same for all TEI models, Blackwell needs sm_120 build
  if (provider === "tei") {
    base.image_gpu = "ghcr.io/huggingface/text-embeddings-inference:latest";
    base.image_gpu_blackwell = "ghcr.io/huggingface/text-embeddings-inference:120-latest";
    base.image_cpu = "ghcr.io/huggingface/text-embeddings-inference:cpu-latest";
  }

  return base;
}

/**
 * Select an embedding model from the Zig catalog.
 * Filters by language: "en" → English-only models, "multi" → multilingual-only models.
 * Returns null if the user chooses "Skip (text search only)".
 */
export async function selectModel(
  provider: string,
  language: "en" | "multi",
  _config: ModelsConfig,
  _gpu: GPUInfo,
): Promise<EmbeddingModel> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("model.title")}${c.reset}`);
  console.error("");

  const isRu = getSetupLanguage() === "ru";

  // Filter by language (strict: en→en only, multi→multi only)
  const filtered = ZIG_EMBEDDING_MODELS.filter((m) => m.lang === language);

  if (filtered.length === 0) {
    printError(ti("model.no_models", { provider, language }));
    process.exit(1);
  }

  // Display models
  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i]!;
    const num = i + 1;
    const recommended = i === 0 ? `  ${c.green}[RECOMMENDED]${c.reset}` : "";
    const note = isRu ? m.note_ru : m.note_en;
    const mtebStr = m.mteb > 0 ? `MTEB:${m.mteb.toFixed(1)}` : "";

    console.error(`  ${c.bright}${num})${c.reset} ${m.name}${recommended}`);
    console.error(
      `     ${c.dim}${m.dimension}d | ${m.context} tok | ${m.size_mb}MB${mtebStr ? ` | ${mtebStr}` : ""}${c.reset}`,
    );
    console.error(`     ${c.dim}${note}${c.reset}`);
    console.error("");
  }

  // Skip option
  const skipNum = filtered.length + 1;
  console.error(`  ${c.bright}${skipNum})${c.reset} ${c.dim}${t("model.skip")}${c.reset}`);
  console.error("");

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: skipNum, def: 1 })} `);
  const idx = (parseInt(choice, 10) || 1) - 1;

  if (idx === filtered.length) {
    // Skip — return a dummy "disabled" model; setup-command will handle embedding.enabled = false
    return zigModelToEmbeddingModel(
      {
        id: "none",
        name: "None",
        dimension: 384,
        context: 0,
        lang: language,
        mteb: 0,
        note_en: "Text search only",
        note_ru: "Только текстовый поиск",
        hf_repo: "",
        size_mb: 0,
      },
      provider,
    );
  }

  if (idx < 0 || idx >= filtered.length) {
    printError(t("common.invalid_choice"));
    process.exit(1);
  }

  const selected = filtered[idx]!;
  clearScreen();
  printInfo(ti("model.selected", { name: selected.name }));
  console.error("");

  return zigModelToEmbeddingModel(selected, provider);
}
