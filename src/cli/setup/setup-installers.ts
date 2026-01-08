/**
 * Provider Installation Functions
 *
 * Handles OVMS (Native), TEI, vLLM, and Ollama embedding providers.
 * This file re-exports from the modular installers/ and utils/ directories.
 *
 * Structure:
 * - installers/vllm-installer.ts - vLLM Docker Installation (NVIDIA GPU)
 * - installers/tei-installer.ts - TEI Docker Installation
 * - installers/ollama-installer.ts - Ollama Installation
 * - installers/ovms-installer.ts - OVMS Native Installation
 * - utils/docker.ts - Docker/Ollama detection utilities
 * - utils/runtime.ts - Cross-runtime utilities (sleep)
 * - utils/multi-device.ts - Multi-device OVMS configuration
 * - utils/nvidia-toolkit.ts - NVIDIA Container Toolkit setup
 */

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import type { EmbeddingModel, GPUInfo, InstallResult } from "./setup-types.js";
import { c } from "./setup-ui.js";

// Re-export utilities
export { checkDocker, checkOllama } from "./utils/docker.js";

import { installLlamaCpp } from "./installers/llamacpp-installer.js";
import { installOllama } from "./installers/ollama-installer.js";
// Import installers
import { installOVMSNative } from "./installers/ovms-installer.js";
import { installTEI } from "./installers/tei-installer.js";
import { installVLLM } from "./installers/vllm-installer.js";

/**
 * Main Installation Router
 */
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
  } else if (provider === "llamacpp") {
    const result = await installLlamaCpp(model, gpu, cpu);
    return result;
  }

  return { success: false };
}
