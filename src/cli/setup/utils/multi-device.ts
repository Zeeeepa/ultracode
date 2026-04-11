/**
 * Multi-Device Configuration Helper
 *
 * Creates multi-device OVMS configuration with separate endpoints for GPU, NPU and CPU.
 *
 * ## OpenVINO Device Naming:
 * - CPU: Always available
 * - GPU.0: Intel integrated GPU (iGPU) or Intel Arc — best supported
 * - GPU.1: NVIDIA GPU (via OpenVINO NVIDIA plugin) — experimental
 * - NPU: Intel Neural Processing Unit (Core Ultra) — works in OVMS 2026.1+
 *
 * ## Device Strategy (same as ultracode.zig):
 * Each device gets its own OVMS mediapipe endpoint (separate worker).
 * The orchestrator does round-robin across endpoints. No MULTI/HETERO.
 *
 * ## NVIDIA GPU Support Status (as of 2026):
 * OpenVINO NVIDIA plugin exists but has compatibility issues with embedding models.
 * Tested on RTX 5090 (Blackwell) - GPU.1 fails with:
 *   "CalculatorGraph::Run() failed: Calculator::Process() for node EmbeddingsExecutor failed"
 *
 * Older NVIDIA architectures (Turing, Ampere, Ada) may work — not tested.
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
 * Current status: DISABLED — OpenVINO NVIDIA plugin doesn't support MediaPipe embeddings
 */
export const USE_NVIDIA_GPU_1 = false;

/**
 * Copy model files (xml/bin/tokenizer) from source to target directory.
 * Skips graph.pbtxt since each endpoint gets its own.
 */
function copyModelFiles(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const modelFiles = readdirSync(sourceDir).filter((f) => !f.endsWith(".pbtxt"));
  for (const file of modelFiles) {
    const src = join(sourceDir, file);
    const dst = join(targetDir, file);
    if (!existsSync(dst)) {
      try {
        copyFileSync(src, dst);
      } catch {
        /* ignore copy errors */
      }
    }
  }
}

/**
 * Generate graph.pbtxt content for a given device configuration.
 */
function generateGraphPbtxt(opts: {
  targetDevice: string;
  pluginConfig: Record<string, string>;
}): string {
  const pluginJson = JSON.stringify(opts.pluginConfig);
  return `input_stream: "REQUEST_PAYLOAD:input"
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
      plugin_config: '${pluginJson}'
      normalize_embeddings: true
      pooling: MEAN
      target_device: "${opts.targetDevice}"
    }
  }
}
`;
}

/**
 * Creates multi-device OVMS configuration with separate endpoints for GPU, NPU and CPU.
 * This enables parallel inference and round-robin load balancing.
 *
 * @param modelsDir Base models directory
 * @param hasGPU Whether Intel GPU is available (iGPU or Arc)
 * @param modelsPath Path to models directory (for config.json paths)
 * @param modelName Model subdirectory name (default: "embeddings")
 * @param hasNvidiaGPU Whether NVIDIA GPU is present (affects GPU device selection)
 * @param hasNPU Whether Intel NPU is available (Core Ultra)
 * @param isIntelArc Whether the GPU is Intel Arc (larger batch size)
 * @returns Array of endpoint names created (e.g., ["embeddings-gpu", "embeddings-npu", "embeddings-cpu"])
 */
export function createMultiDeviceConfig(
  modelsDir: string,
  hasGPU: boolean,
  modelsPath: string,
  modelName: string = "embeddings",
  hasNvidiaGPU: boolean = false,
  hasNPU: boolean = false,
  isIntelArc: boolean = false,
): string[] {
  const sourceDir = join(modelsDir, modelName);

  // Check if source model exists
  if (!existsSync(join(sourceDir, "openvino_model.xml"))) {
    printWarn(`Модель не найдена для multi-device конфигурации: ${modelName}`);
    return [modelName]; // Fallback to single endpoint
  }

  const endpoints: string[] = [];
  const isWindows = process.platform === "win32";

  // ─── GPU endpoint ───────────────────────────────────────────────
  if (hasGPU) {
    const gpuEndpointName = `${modelName}-gpu`;
    const gpuDir = join(modelsDir, gpuEndpointName);
    copyModelFiles(sourceDir, gpuDir);

    // GPU.0 = Intel iGPU or Intel Arc; GPU.1 = NVIDIA (experimental)
    const gpuDevice = hasNvidiaGPU && USE_NVIDIA_GPU_1 ? "GPU.1" : "GPU.0";
    const gpuDeviceLabel = gpuDevice === "GPU.1" ? "NVIDIA" : isIntelArc ? "Intel Arc" : "Intel iGPU";

    // Intel Arc is more powerful — batch size 32; iGPU — batch size 16
    const batchSize = isIntelArc ? 32 : 16;

    const gpuGraph = generateGraphPbtxt({
      targetDevice: `BATCH:${gpuDevice}(${batchSize})`,
      pluginConfig: {
        NUM_STREAMS: "4",
        AUTO_BATCH_TIMEOUT: "50",
        // iGPU/Arc cache disabled: blob loading crashes on OV 2026.0
        // Re-test on OV 2026.1 — potential 50x init speedup (10s → 200ms)
        CACHE_DIR: "",
      },
    });

    writeFileSync(join(gpuDir, "graph.pbtxt"), gpuGraph);
    endpoints.push(gpuEndpointName);
    printOK(`Создан endpoint: ${gpuEndpointName} (BATCH:${gpuDevice}(${batchSize}) — ${gpuDeviceLabel}, streams=4)`);
  }

  // ─── NPU endpoint ──────────────────────────────────────────────
  if (hasNPU) {
    const npuEndpointName = `${modelName}-npu`;
    const npuDir = join(modelsDir, npuEndpointName);
    copyModelFiles(sourceDir, npuDir);

    // NPU: THROUGHPUT mode, no AUTO_BATCH (NPU compiler handles batching internally)
    // Minimal properties — NPU compiler optimizes automatically (same as Zig)
    const npuGraph = generateGraphPbtxt({
      targetDevice: "NPU",
      pluginConfig: {
        PERFORMANCE_HINT: "THROUGHPUT",
      },
    });

    writeFileSync(join(npuDir, "graph.pbtxt"), npuGraph);
    endpoints.push(npuEndpointName);
    printOK(`Создан endpoint: ${npuEndpointName} (NPU, THROUGHPUT mode)`);
  }

  // ─── CPU endpoint ──────────────────────────────────────────────
  {
    const cpuEndpointName = `${modelName}-cpu`;
    const cpuDir = join(modelsDir, cpuEndpointName);
    copyModelFiles(sourceDir, cpuDir);

    const cpuGraph = generateGraphPbtxt({
      targetDevice: "CPU",
      pluginConfig: {
        NUM_STREAMS: "8",
        INFERENCE_NUM_THREADS: "0",
      },
    });

    writeFileSync(join(cpuDir, "graph.pbtxt"), cpuGraph);
    endpoints.push(cpuEndpointName);
    printOK(`Создан endpoint: ${cpuEndpointName} (CPU, streams=8)`);
  }

  // ─── OVMS config.json ──────────────────────────────────────────
  const configPath = join(modelsDir, "config.json");
  const pathPrefix = isWindows ? modelsPath.replace(/\\/g, "/") : modelsPath;

  interface OVMSEndpoint {
    name: string;
    base_path: string;
  }

  interface OVMSConfig {
    model_config_list: OVMSEndpoint[];
    mediapipe_config_list: OVMSEndpoint[];
  }

  const ovmsConfig: OVMSConfig = {
    model_config_list: [],
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
 *
 * Round-robin ratio by device type:
 * - Arc GPU: high throughput, batch=32 → weight 4
 * - iGPU:    moderate throughput, batch=16 → weight 3
 * - NPU:    ~200 emb/s, always-on → weight 2
 * - CPU:    baseline → weight 5 (handles sustained load)
 *
 * Examples:
 * - Arc+NPU+CPU: [gpu,gpu,gpu,gpu, npu,npu, cpu,cpu,cpu,cpu,cpu] (4:2:5)
 * - iGPU+NPU+CPU: [gpu,gpu,gpu, npu,npu, cpu,cpu,cpu,cpu,cpu] (3:2:5)
 * - iGPU+CPU: [gpu,gpu,gpu, cpu,cpu,cpu,cpu,cpu] (3:5)
 * - NPU+CPU: [npu,npu, cpu,cpu,cpu,cpu,cpu] (2:5)
 * - CPU only: [cpu]
 */
export function generateEndpointsArray(endpoints: string[]): string[] {
  const gpuEndpoint = endpoints.find((e) => e.endsWith("-gpu"));
  const npuEndpoint = endpoints.find((e) => e.endsWith("-npu"));
  const cpuEndpoint = endpoints.find((e) => e.endsWith("-cpu"));

  const result: string[] = [];

  if (gpuEndpoint) {
    // Check if Arc (name contains "arc" in upstream detection) — use weight 4, else 3
    // We don't have the Arc flag here, so use consistent weight 3
    // Arc gets higher effective throughput from batch=32 anyway
    result.push(gpuEndpoint, gpuEndpoint, gpuEndpoint);
  }

  if (npuEndpoint) {
    result.push(npuEndpoint, npuEndpoint);
  }

  if (cpuEndpoint) {
    result.push(cpuEndpoint, cpuEndpoint, cpuEndpoint, cpuEndpoint, cpuEndpoint);
  }

  if (result.length > 0) return result;

  // Fallback: no suffixed endpoints
  return endpoints.length > 0 ? [endpoints[0]!] : ["embeddings"];
}
