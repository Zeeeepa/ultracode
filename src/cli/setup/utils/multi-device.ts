/**
 * Multi-Device Configuration Helper
 *
 * Creates multi-device OVMS configuration with separate endpoints for GPU and CPU.
 *
 * ## OpenVINO Device Naming:
 * - CPU: Always available
 * - GPU.0: Intel integrated GPU (iGPU) - best supported
 * - GPU.1: NVIDIA GPU (via OpenVINO NVIDIA plugin) - experimental
 * - NPU: Intel Neural Processing Unit - not optimal for BERT/embeddings
 *
 * ## NVIDIA GPU Support Status (as of 2025):
 * OpenVINO NVIDIA plugin exists but has compatibility issues with embedding models.
 * Tested on RTX 5090 (Blackwell) - GPU.1 fails with:
 *   "CalculatorGraph::Run() failed: Calculator::Process() for node EmbeddingsExecutor failed"
 *
 * Older NVIDIA architectures (Turing, Ampere, Ada) may work - not tested.
 * To enable GPU.1 for NVIDIA when fixed, set USE_NVIDIA_GPU_1 = true below.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { printOK, printWarn } from "../setup-ui.js";

/**
 * NVIDIA GPU.1 support toggle.
 *
 * Set to `true` to use NVIDIA GPU (GPU.1) instead of Intel iGPU (GPU.0).
 * Only enable this when OpenVINO NVIDIA plugin properly supports embedding models.
 *
 * Current status: DISABLED - OpenVINO NVIDIA plugin doesn't support MediaPipe embeddings
 * - Tested: RTX 5090 (Blackwell) with CPU-compiled model - FAILS
 * - Tested: RTX 5090 (Blackwell) with GPU-compiled model - FAILS
 * - Error: "RET_CHECK failure (embeddings_calculator_ov.cc:272)"
 * - Untested: RTX 4090 (Ada), RTX 3090 (Ampere), RTX 2080 (Turing)
 *
 * When enabling, rebuild and re-run setup to regenerate graph.pbtxt with GPU.1
 */
export const USE_NVIDIA_GPU_1 = false;

/**
 * Creates multi-device OVMS configuration with separate endpoints for GPU and CPU.
 * This enables parallel inference and round-robin load balancing.
 *
 * @param modelsDir Base models directory
 * @param hasGPU Whether GPU is available (Intel or NVIDIA)
 * @param modelsPath Path to models directory (for config.json paths)
 * @param modelName Model subdirectory name (default: "embeddings")
 * @param hasNvidiaGPU Whether NVIDIA GPU is present (affects GPU device selection)
 * @returns Array of endpoint names created (e.g., ["embeddings-gpu", "embeddings-cpu"])
 */
export function createMultiDeviceConfig(
  modelsDir: string,
  hasGPU: boolean,
  modelsPath: string,
  modelName: string = "embeddings",
  hasNvidiaGPU: boolean = false,
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

    // Determine GPU device based on hardware and configuration
    // - GPU.0: Intel iGPU (default, best supported for embeddings)
    // - GPU.1: NVIDIA GPU (experimental, may not work on all architectures)
    //
    // TO ENABLE NVIDIA GPU.1:
    // 1. Set USE_NVIDIA_GPU_1 = true at the top of this file
    // 2. Rebuild the project: npm run build
    // 3. Re-run OVMS setup: ulog setup
    //
    // KNOWN ISSUES:
    // - RTX 5090 (Blackwell): FAILS with "CalculatorGraph::Run() failed"
    // - RTX 4090 (Ada): Untested
    // - RTX 3090 (Ampere): Untested
    // - RTX 2080 (Turing): Untested
    const gpuDevice = hasNvidiaGPU && USE_NVIDIA_GPU_1 ? "GPU.1" : "GPU.0";
    const gpuDeviceLabel = gpuDevice === "GPU.1" ? "NVIDIA" : "Intel iGPU";

    // Create GPU graph.pbtxt with AUTO_BATCH for better throughput
    // NUM_STREAMS=4, batch size 16 gives best results on Intel iGPU
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
      plugin_config: '{"NUM_STREAMS": "4", "AUTO_BATCH_TIMEOUT": "50"}'
      normalize_embeddings: true
      pooling: MEAN
      target_device: "BATCH:${gpuDevice}(16)"
    }
  }
}
`;
    writeFileSync(join(gpuDir, "graph.pbtxt"), gpuGraphContent);
    endpoints.push(gpuEndpointName);
    printOK(`Создан endpoint: ${gpuEndpointName} (BATCH:${gpuDevice}(16) - ${gpuDeviceLabel}, streams=4)`);
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

  // Create CPU graph.pbtxt with optimized streams
  // NUM_STREAMS=8 for better CPU utilization, INFERENCE_NUM_THREADS=0 for auto
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
      plugin_config: '{"NUM_STREAMS": "8", "INFERENCE_NUM_THREADS": "0"}'
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
 * Ratio 3:5 (GPU:CPU) - iGPU is weaker, needs more CPU support
 */
export function generateEndpointsArray(endpoints: string[]): string[] {
  const gpuEndpoint = endpoints.find((e) => e.endsWith("-gpu"));
  const cpuEndpoint = endpoints.find((e) => e.endsWith("-cpu"));

  if (gpuEndpoint && cpuEndpoint) {
    // 3:5 ratio - iGPU is weaker than CPU on sustained load, CPU handles more
    return [gpuEndpoint, gpuEndpoint, gpuEndpoint, cpuEndpoint, cpuEndpoint, cpuEndpoint, cpuEndpoint, cpuEndpoint];
  } else if (gpuEndpoint) {
    return [gpuEndpoint];
  } else if (cpuEndpoint) {
    return [cpuEndpoint];
  }
  return endpoints.length > 0 ? [endpoints[0]!] : ["embeddings"];
}
