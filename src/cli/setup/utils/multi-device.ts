/**
 * Multi-Device Configuration Helper
 *
 * Creates multi-device OVMS configuration with separate endpoints for GPU and CPU.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { printOK, printWarn } from "../setup-ui.js";

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
export function createMultiDeviceConfig(
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
export function generateEndpointsArray(endpoints: string[]): string[] {
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
