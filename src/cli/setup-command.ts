#!/usr/bin/env node
/**
 * UltraCode - Semantic Embedding Setup Command v2
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

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CPUDetector, type CPUInfo } from "../cpu/cpu-detector.js";
import { detectSystemLocale } from "../i18n/index.js";
import {
  ensureConfigDir,
  getConfigDir,
  getDisplayPath,
  loadSemanticConfig,
  type SemanticConfig,
  saveSemanticConfig,
} from "../utils/config-paths.js";

import { setSetupLanguage } from "./setup/i18n/index.js";

// Import from setup modules
import {
  c,
  detectGPU,
  type EmbeddingModel,
  type GPUInfo,
  type InstallResult,
  installMcpConfigs,
  installProvider,
  type LLMResult,
  type ModelsConfig,
  printBanner,
  printCompleteBanner,
  printError,
  printHardwareInfo,
  printInfo,
  printOK,
  printWarn,
  selectLanguage,
  selectModel,
  selectProvider,
  setupLLM,
  ZIG_EMBEDDING_MODELS,
} from "./setup/index.js";
import { checkDocker } from "./setup/setup-installers.js";
import { cleanupDockerLlamaServer } from "./setup/utils/docker.js";

// ═══════════════════════════════════════════════════════════════
// Package Root Detection
// ═══════════════════════════════════════════════════════════════

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
        if (
          (pkg.name === "ultracode" || pkg.name === "ultrascript-tools-mcp") &&
          existsSync(join(current, "config", "embedding-models.json"))
        ) {
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

// ═══════════════════════════════════════════════════════════════
// Config Loading
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Setup Helpers
// ═══════════════════════════════════════════════════════════════

interface SetupArgs {
  providerArg?: string | undefined;
  modelArg?: string | undefined;
  langArg?: string | undefined;
  llmOnly: boolean;
}

function parseSetupArgs(args: string[]): SetupArgs {
  let providerArg: string | undefined;
  let modelArg: string | undefined;
  let langArg: string | undefined;
  let llmOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerArg = args[++i];
    }
    if (args[i] === "--model" && args[i + 1]) {
      modelArg = args[++i];
    }
    if ((args[i] === "--lang" || args[i] === "-l") && args[i + 1]) {
      langArg = args[++i];
    }
    if (args[i] === "--llm-only" || args[i] === "--llm") {
      llmOnly = true;
    }
  }

  return { providerArg, modelArg, langArg, llmOnly };
}

// runLlmOnlySetup removed — replaced by inline code in runSetup() using setupLLM()

function buildEmbeddingConfig(
  provider: string,
  selectedModel: EmbeddingModel,
  installResult: InstallResult,
  gpu: GPUInfo,
  cpu: CPUInfo,
): SemanticConfig {
  // Keep exact provider name for proper port selection
  const isOVMS = provider === "ovms" || provider === "ovms-native";
  const isOVMSNative = provider === "ovms-native";
  // OVMS Native uses port 8083, Docker uses 8082
  const ovmsPort = isOVMSNative ? 8083 : 8082;

  // Determine target device for OVMS (auto-detect NPU/GPU/CPU)
  let targetDevice = "CPU";
  if (isOVMS) {
    const gpuName = gpu.name?.toLowerCase() || "";
    const hasNPU = cpu.model.toLowerCase().includes("ultra");
    const isIntelGPU = gpu.available && gpuName.includes("intel");
    const isNvidiaGPU =
      gpu.available &&
      (gpuName.includes("nvidia") || gpuName.includes("geforce") || gpuName.includes("rtx") || gpuName.includes("gtx"));
    if (hasNPU) {
      targetDevice = "NPU";
    } else if (isNvidiaGPU) {
      targetDevice = "NVIDIA";
    } else if (isIntelGPU) {
      targetDevice = "GPU";
    }
  }

  return {
    enabled: true,
    embedding: {
      // TS-specific fields
      platform: provider as "tei" | "ovms" | "ovms-native" | "vllm" | "llamacpp",
      architecture: gpu.architecture,
      ovms: isOVMS
        ? {
            endpoint: `http://127.0.0.1:${ovmsPort}`,
            // batch_size is for tokenization (should be large for efficiency)
            // OVMS V3 API handles batching internally, use larger batches
            batch_size: 200,
            ovms_mini_batch: 8, // V3 API mini-batch size for parallel requests
            // Use detected model from running OVMS if available, otherwise use selected model
            selected_model: installResult.detectedModelId ?? selectedModel.model_id,
            // OpenVINO target device: NPU, GPU, CPU (auto-detected by setup)
            target_device: targetDevice,
            // Multi-device endpoints for round-robin load balancing (GPU + CPU parallel processing)
            endpoints: installResult.endpoints,
            models: [
              {
                id: installResult.detectedModelId ?? selectedModel.model_id,
                languages: [selectedModel.language],
                // Use detected dimensions from running OVMS if available
                vector_size: installResult.detectedDimensions ?? selectedModel.dimensions,
              },
            ],
            // OVMS API mode:
            // - V3 /v3/embeddings OpenAI-compatible API - for pre-converted models with pooling layer
            // - V2 /v2/models/{model}/infer - tokenization + pooling on client (fallback)
            useEmbeddingsApi: selectedModel.v3_api === true, // Use V3 if model supports it
            encodingFormat: selectedModel.v3_api === true ? "base64" : "float", // base64 for V3, float for V2
          }
        : undefined,
      tei:
        provider === "tei"
          ? (() => {
              const teiCfg = (selectedModel as unknown as Record<string, unknown>)["tei_config"] as
                | { max_batch_tokens?: number; max_client_batch_size?: number; concurrency?: number }
                | undefined;
              return {
                endpoint: "http://127.0.0.1:8081",
                max_batch_tokens: teiCfg?.max_batch_tokens ?? 16384,
                max_client_batch_size: teiCfg?.max_client_batch_size ?? 500,
                concurrency: teiCfg?.concurrency,
                selected_model: selectedModel.model_id,
                models: [
                  {
                    id: selectedModel.model_id,
                    languages: [selectedModel.language],
                    vector_size: selectedModel.dimensions,
                  },
                ],
              };
            })()
          : undefined,
      vllm:
        provider === "vllm"
          ? {
              endpoint: "http://127.0.0.1:8000",
              max_batch_size: 200, // vLLM 0.14+ handles larger batches well
              encoding_format: "base64", // ~33% smaller payloads (vLLM 0.14+)
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
      llamacpp:
        provider === "llamacpp"
          ? {
              endpoint: "http://127.0.0.1:8085",
              selected_model: selectedModel.model_id,
              // IMPORTANT: ctx-size is divided by parallel slots!
              // So for 512 tokens per request with parallel=8, need ctx-size = 512 * 8 = 4096
              context_size: (selectedModel.context_tokens || 512) * 8,
              // Server performance tuning (optimized for throughput)
              parallel_slots: 8, // --parallel: concurrent request slots
              ubatch_size: 1536, // --ubatch-size: micro-batch for processing
              batch_size: 3072, // --batch-size: prompt processing batch
              // Client tuning
              max_batch_size: 256, // texts per HTTP request
              concurrency: 8, // parallel HTTP requests (should match parallel_slots)
              auto_start: true,
              models: [
                {
                  id: selectedModel.model_id,
                  languages: [selectedModel.language],
                  vector_size: selectedModel.dimensions,
                },
              ],
            }
          : undefined,
    },
    auto_detection: { gpu_architecture: true, codebase_size: true, language: true },
  };
}

/**
 * Build Zig-compatible LLM config from setupLLM() result.
 * Writes BOTH Zig fields (platform, model, endpoint, api_key, context_tokens)
 * AND TS fields (enabled, claude/ollama nested objects).
 */
function buildLlmConfigFromResult(llmResult: LLMResult): Record<string, unknown> {
  const config: Record<string, unknown> = {
    // Zig-readable fields
    platform: llmResult.platform,
    endpoint: llmResult.endpoint,
    api_key: llmResult.api_key,
    model: llmResult.model,
    context_tokens: llmResult.context_tokens,
    // TS-readable fields
    enabled: true,
  };

  // Add TS nested objects based on platform
  if (llmResult.platform === "claude_cli" || llmResult.platform === "claude_api") {
    config["claude"] = {
      model_id: llmResult.model,
      context_tokens: llmResult.context_tokens,
    };
  } else if (llmResult.platform === "openai_compat") {
    config["ollama"] = {
      endpoint: llmResult.endpoint,
      model_id: llmResult.model,
      context_tokens: llmResult.context_tokens,
    };
  }

  return config;
}

/**
 * Build Zig-compatible inference section (default settings).
 * Source: ultracode.zig/src/config/semantic_config.zig:InferenceSettings
 */
function buildInferenceConfig(modelId: string): Record<string, unknown> {
  return {
    model_id: modelId,
    quantization: "int8",
    distribution_mode: "aggressive",
    aggressive_mode: true,
    min_batch_per_device: 16,
    efficient_target_seconds: 10.0,
    dump_batches: false,
    worker_stderr_log: false,
    workers: {
      "gpu-cuda": true,
      "gpu-vulkan": true,
      "gpu-metal": true,
      "cpu-all": true,
      "igpu-intel": true,
      "npu-intel": true,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Main Setup
// ═══════════════════════════════════════════════════════════════

export async function runSetup(args: string[]): Promise<void> {
  printBanner();

  // Parse args
  const { providerArg, modelArg, langArg, llmOnly } = parseSetupArgs(args);

  // Initialize UI language (auto-detect from system or use CLI override)
  const localeConfig = detectSystemLocale(langArg);
  setSetupLanguage(localeConfig.language);

  // Step 0: Docker check (required for embedding providers)
  if (!checkDocker()) {
    printError("Docker is required for embedding providers (OVMS / TEI / vLLM).");
    console.error("");
    console.error(`  Install Docker: ${c.cyan}https://docker.com${c.reset}`);
    console.error("");
    process.exit(1);
  }
  printOK("Docker detected");

  // Step 0.5: Detect hardware
  const cpu = CPUDetector.detect();
  const gpu = detectGPU();
  printHardwareInfo(cpu, gpu);

  // If --llm-only, skip embedding setup and go directly to LLM
  if (llmOnly) {
    const llmResult = await setupLLM();
    if (llmResult) {
      const existingConfig = loadSemanticConfig();
      if (existingConfig) {
        // Merge LLM into existing config via raw JSON to include both Zig and TS fields
        const merged: Record<string, unknown> = { ...(existingConfig as unknown as Record<string, unknown>) };
        merged["llm"] = buildLlmConfigFromResult(llmResult);
        merged["doc_language"] = llmResult.doc_language;
        saveSemanticConfig(merged as unknown as SemanticConfig);
        printOK("Config saved with LLM settings");
      } else {
        printWarn("No existing config found. Run full setup first.");
      }
    }
    await installMcpConfigs();
    return;
  }

  // Load models config (still needed for provider-specific metadata, but model list is from Zig catalog)
  const config = loadModelsConfig();
  if (!config) process.exit(1);

  // Step 1: Language selection
  const language = await selectLanguage();

  // Step 2: Provider selection
  const provider = providerArg || (await selectProvider(cpu, gpu));

  // Step 3: Model selection (from Zig catalog, filtered by language)
  let selectedModel: EmbeddingModel;
  const embeddingSkipped = { value: false };

  if (modelArg) {
    // Look up in Zig catalog first, then fallback to JSON config
    const zigModel = ZIG_EMBEDDING_MODELS.find((m) => m.id === modelArg);
    if (zigModel) {
      const { zigModelToEmbeddingModel } = await import("./setup/setup-selection.js");
      selectedModel = zigModelToEmbeddingModel(zigModel, provider);
    } else {
      const found = config.models.find((m) => m.id === modelArg || m.model_id === modelArg);
      if (!found) {
        printError(`Model not found: ${modelArg}`);
        process.exit(1);
      }
      selectedModel = found;
    }
    printInfo(`Using model: ${selectedModel.name}`);
  } else {
    selectedModel = await selectModel(provider, language, config, gpu);
    if (selectedModel.id === "none") {
      embeddingSkipped.value = true;
    }
  }

  // Step 4: Installation (skip if user chose "Skip")
  let installResult: InstallResult = { success: true };
  if (!embeddingSkipped.value) {
    installResult = await installProvider(provider, selectedModel, gpu, cpu);
    if (!installResult.success) {
      printWarn("Installation had issues, but config will be saved");
    }
  }

  // Build and save embedding config
  const finalConfig = buildEmbeddingConfig(provider, selectedModel, installResult, gpu, cpu);

  // Override embedding.enabled if skipped
  if (embeddingSkipped.value) {
    (finalConfig as unknown as Record<string, unknown>)["enabled"] = false;
  }

  ensureConfigDir();

  // Step 5: LLM setup (Zig-compatible flow: Claude CLI / Claude API / OpenAI-compat / Skip)
  const llmResult = await setupLLM();

  // Build final merged config with Zig-compatible fields
  const mergedConfig: Record<string, unknown> = { ...(finalConfig as unknown as Record<string, unknown>) };

  // Add Zig-compatible embedding fields (embedding.model, embedding.dimension, embedding.enabled)
  if (!embeddingSkipped.value) {
    const embObj = mergedConfig["embedding"] as Record<string, unknown> | undefined;
    if (embObj) {
      embObj["enabled"] = true;
      embObj["model"] = selectedModel.id;
      embObj["dimension"] = selectedModel.dimensions;
    }
  }

  // Add Zig inference section
  if (!embeddingSkipped.value) {
    mergedConfig["inference"] = buildInferenceConfig(selectedModel.id);
  }

  // Add LLM config (Zig + TS compatible)
  if (llmResult) {
    mergedConfig["llm"] = buildLlmConfigFromResult(llmResult);
    mergedConfig["doc_language"] = llmResult.doc_language;
  } else {
    mergedConfig["llm"] = null;
    mergedConfig["doc_language"] = "en";
  }

  saveSemanticConfig(mergedConfig as unknown as SemanticConfig);

  // Summary
  printCompleteBanner();
  console.error(`  ${c.bright}Embedding:${c.reset}`);
  if (embeddingSkipped.value) {
    console.error(`  ${c.dim}  Skipped (text search only)${c.reset}`);
  } else {
    console.error(`  ${c.cyan}  Provider:${c.reset}   ${provider}`);
    console.error(`  ${c.cyan}  Model:${c.reset}      ${selectedModel.name}`);
    console.error(`  ${c.cyan}  Context:${c.reset}    ${selectedModel.context_tokens} tokens`);
    console.error(`  ${c.cyan}  Language:${c.reset}   ${language === "en" ? "English" : "Multilingual"}`);
  }
  console.error("");

  if (llmResult) {
    console.error(`  ${c.bright}LLM (AutoDoc):${c.reset}`);
    console.error(`  ${c.cyan}  Platform:${c.reset}   ${llmResult.platform}`);
    console.error(`  ${c.cyan}  Model:${c.reset}      ${llmResult.model}`);
    console.error(`  ${c.cyan}  Context:${c.reset}    ${Math.round(llmResult.context_tokens / 1024)}K tokens`);
    if (llmResult.endpoint) {
      console.error(`  ${c.cyan}  Endpoint:${c.reset}   ${llmResult.endpoint}`);
    }
    console.error(`  ${c.cyan}  Doc lang:${c.reset}   ${llmResult.doc_language}`);
    console.error("");
  }

  console.error(`  ${c.cyan}Config:${c.reset}       ${getDisplayPath(getConfigDir())}/semantic-config.json`);
  console.error("");

  if (provider === "tei") {
    console.error(`${c.dim}TEI Management:${c.reset}`);
    console.error(`${c.dim}  docker logs tei-server      # View logs${c.reset}`);
    console.error(`${c.dim}  docker restart tei-server   # Restart${c.reset}`);
  } else if (provider === "vllm") {
    console.error(`${c.dim}vLLM Management:${c.reset}`);
    console.error(`${c.dim}  docker logs vllm-server     # View logs${c.reset}`);
    console.error(`${c.dim}  docker restart vllm-server  # Restart${c.reset}`);
  }

  // Cleanup: Kill Docker's built-in llama-server if running
  cleanupDockerLlamaServer();

  // Step 6: Auto-detect AI agents and install MCP config
  await installMcpConfigs();

  console.error(`${c.yellow}Next: Restart your MCP client to enable semantic mode${c.reset}`);
  console.error("");
}

// Run if executed directly
const isMain =
  import.meta.url.endsWith("setup-command.ts") ||
  import.meta.url.endsWith("setup-command.js") ||
  import.meta.url.includes("setup-command.ts?") ||
  import.meta.url.includes("setup-command.js?") ||
  process.argv[1]?.includes("setup-command");

if (isMain) {
  runSetup(process.argv.slice(2)).catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
}
