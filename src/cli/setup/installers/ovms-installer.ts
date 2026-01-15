/**
 * OVMS Native Installation (without Docker)
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CPUInfo } from "../../../cpu/cpu-detector.js";
import { getDataDir } from "../../../utils/config-paths.js";
import { toError } from "../../../utils/error-handling.js";
import { t, ti } from "../i18n/index.js";
import type { EmbeddingModel, GPUInfo, InstallResult } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { createMultiDeviceConfig, generateEndpointsArray } from "../utils/index.js";

export async function installOVMSNative(model: EmbeddingModel, cpu: CPUInfo, gpu: GPUInfo): Promise<InstallResult> {
  printInfo(t("ovms.setup"));
  console.error("");

  const OVMS_VERSION = "2025.4";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // Detect hardware
  const hasNPU = cpu.model.toLowerCase().includes("ultra");
  const cpuModel = cpu.model.toLowerCase();
  const gpuName = gpu.name?.toLowerCase() || "";
  const isIntelGPU = gpu.available && gpuName.includes("intel");
  const isIntelArc = isIntelGPU && /arc|a770|a750|a580|a380|a310/.test(gpuName);
  const isNvidiaGPU = gpu.available && /nvidia|geforce|rtx|gtx|quadro/.test(gpuName);

  // Check if system likely has Intel iGPU (even if NVIDIA is primary)
  // Intel CPUs (non-F/KF variants) have integrated GPU - OVMS sees it as GPU.0
  const isIntelCPU = cpuModel.includes("intel") || cpuModel.includes("core");
  const hasIntelIGPU = isIntelGPU || (isIntelCPU && !cpuModel.includes("-f") && !cpuModel.includes("kf"));

  // Determine target device for model compilation
  // OpenVINO device names: CPU, GPU.0 (Intel iGPU), GPU.1 (NVIDIA if present), NPU
  // Note: NPU doesn't support BERT/embedding models well
  // Note: NVIDIA via OpenVINO is GPU.1 but experimental, prefer Intel GPU.0
  let targetDevice = "CPU";
  if (isIntelArc) {
    targetDevice = "GPU";
    printInfo(ti("ovms.intel_arc_detected", { gpu: gpu.name }));
  } else if (isIntelGPU) {
    targetDevice = "GPU";
    printInfo(ti("ovms.intel_igpu_detected", { gpu: gpu.name }));
  } else if (isNvidiaGPU && hasIntelIGPU) {
    // NVIDIA is primary GPU but Intel iGPU exists - compile for GPU (Intel iGPU = GPU.0)
    // NVIDIA via OpenVINO (GPU.1) is experimental and fails on Blackwell architecture
    targetDevice = "GPU";
    printInfo(ti("ovms.nvidia_with_igpu", { gpu: gpu.name }));
    printInfo(t("ovms.nvidia_igpu_note"));
  } else if (isNvidiaGPU) {
    // Only NVIDIA, no Intel iGPU - must use CPU
    targetDevice = "CPU";
    printInfo(ti("ovms.nvidia_no_igpu", { gpu: gpu.name }));
  } else if (hasNPU) {
    targetDevice = "CPU";
    printInfo(t("ovms.npu_detected"));
  } else {
    printInfo(t("ovms.cpu_fallback"));
  }

  if (!isWindows && !isLinux) {
    printError(t("ovms.platform_not_supported"));
    printInfo(t("ovms.use_alternative"));
    return { success: false };
  }

  // Get installation directories
  const dataDir = getDataDir();
  const ovmsDir = join(dataDir, "ovms");
  const modelsDir = join(dataDir, "models");

  mkdirSync(ovmsDir, { recursive: true });
  mkdirSync(modelsDir, { recursive: true });

  // Windows ZIP extracts to ovms/ovms/ subfolder
  const getOvmsBinPath = (): string => {
    if (isWindows) {
      const nestedPath = join(ovmsDir, "ovms", "ovms.exe");
      const flatPath = join(ovmsDir, "ovms.exe");
      return existsSync(nestedPath) ? nestedPath : flatPath;
    }
    return join(ovmsDir, "ovms");
  };

  let ovmsBin = getOvmsBinPath();

  // Track detected dimensions for return value (may be set when reusing existing installation)
  let detectedDimensions: number | undefined;
  let detectedModelId: string | undefined;

  // Check if already installed
  if (existsSync(ovmsBin)) {
    printOK(t("ovms.already_installed"));
    const action = await prompt(
      `  [1=${t("ovms.action_use")}, 2=${t("ovms.action_reinstall")}, 3=${t("ovms.action_cancel")}]: `,
    );
    if (action === "3") return { success: false };
    if (action !== "2") {
      printInfo(t("ovms.configuring_model"));
    } else {
      printInfo(t("ovms.action_reinstall") + "...");
    }
  }

  // Download OVMS binary if needed
  if (!existsSync(ovmsBin)) {
    printInfo(ti("ovms.downloading", { version: OVMS_VERSION, platform: isWindows ? "Windows" : "Linux" }));

    let downloadUrl: string;
    let archiveName: string;

    if (isWindows) {
      downloadUrl = `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_windows_python_on.zip`;
      archiveName = "ovms_windows_python_on.zip";
    } else {
      let ubuntuVersion = "24";
      try {
        const osRelease = execSync("cat /etc/os-release 2>/dev/null || echo ''", { encoding: "utf-8" });
        if (osRelease.includes("22.04") || osRelease.includes("jammy")) {
          ubuntuVersion = "22";
        }
      } catch {
        /* default 24 */
      }

      downloadUrl = `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`;
      archiveName = `ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`;
    }

    const archivePath = join(ovmsDir, archiveName);

    try {
      printInfo(`URL: ${downloadUrl}`);
      const response = await fetch(downloadUrl, {
        headers: { "User-Agent": "ultrascript-tools-mcp/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
      printInfo(ti("ovms.size_mb", { size: (totalSize / 1024 / 1024).toFixed(1) }));

      const buffer = await response.arrayBuffer();
      writeFileSync(archivePath, Buffer.from(buffer));
      printOK(t("ovms.downloaded"));

      printInfo(t("ovms.extracting"));

      if (isWindows) {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${ovmsDir}' -Force"`, {
          stdio: "pipe",
          windowsHide: true,
        });
      } else {
        execSync(`tar -xzf "${archivePath}" -C "${ovmsDir}" --strip-components=1`, { stdio: "pipe" });
        execSync(`chmod +x "${ovmsBin}"`, { stdio: "pipe" });
      }

      // Cleanup
      try {
        require("node:fs").unlinkSync(archivePath);
      } catch {
        /* ignore */
      }

      ovmsBin = getOvmsBinPath();
      printOK(t("ovms.installed"));
    } catch (error: unknown) {
      const err = toError(error);
      printError(ti("ovms.download_error", { error: err.message }));
      return { success: false };
    }
  }

  // Download and prepare embedding model
  printInfo(ti("ovms.preparing_model", { model: model.model_id }));

  const hfModel = model.hf_model;
  if (!hfModel) {
    printError(t("ovms.no_hf_model"));
    return { success: false };
  }

  // Determine model directory name - always use model_id for proper multi-device support
  const modelDirName = model.model_id;

  // Check for graph.pbtxt - indicates properly exported model with MediaPipe support
  const graphPath = join(modelsDir, modelDirName, "graph.pbtxt");
  let modelExported = existsSync(graphPath);
  let hasTokenizer = false;

  if (modelExported) {
    printOK(t("ovms.model_exported_mediapipe"));
    hasTokenizer = true;
  } else {
    // Strategy 1: Use OVMS export_model.py (best - creates proper MediaPipe graph)
    const exportModelPaths = [
      "C:\\opt\\model_server\\demos\\common\\export_models\\export_model.py",
      join(dataDir, "ovms-src", "demos", "common", "export_models", "export_model.py"),
    ];
    const exportModelPy = exportModelPaths.find((p) => existsSync(p));

    if (exportModelPy) {
      printInfo(t("ovms.exporting_via_ovms"));
      printInfo(ti("ovms.source", { source: hfModel }));

      const weightFormat = model.weight_format || "int8";

      try {
        const exportArgs = [
          exportModelPy,
          "embeddings_ov",
          "--source_model",
          hfModel,
          "--model_name",
          modelDirName,
          "--weight-format",
          weightFormat,
          "--pooling",
          "MEAN",
          "--model_repository_path",
          modelsDir,
          "--config_file_path",
          join(modelsDir, "config.json"),
          "--target_device",
          targetDevice,
          "--overwrite_models",
        ];

        printInfo(t("ovms.export_time_hint"));

        const exitCode = await new Promise<number>((resolve, reject) => {
          const proc = spawn("python", exportArgs, {
            stdio: ["ignore", "inherit", "inherit"],
            windowsHide: true,
            cwd: dirname(exportModelPy),
          });
          proc.on("error", reject);
          proc.on("close", resolve);
        });

        if (exitCode === 0 && existsSync(graphPath)) {
          printOK(t("ovms.export_success"));
          modelExported = true;
          hasTokenizer = true;

          // Create OVMS config.json in models root
          const ovmsConfigPath = join(modelsDir, "config.json");
          if (!existsSync(ovmsConfigPath)) {
            const ovmsConfig = {
              model_config_list: [
                {
                  config: {
                    name: modelDirName,
                    base_path: modelDirName,
                  },
                },
              ],
              mediapipe_config_list: [
                {
                  name: modelDirName,
                  base_path: modelDirName,
                },
              ],
            };
            writeFileSync(ovmsConfigPath, JSON.stringify(ovmsConfig, null, 2));
            printOK(ti("ovms.ovms_config_created", { path: ovmsConfigPath }));
          }
        } else {
          printWarn(ti("ovms.export_exit_code", { code: String(exitCode) }));
        }
      } catch (error: unknown) {
        const err = toError(error);
        printWarn(ti("ovms.export_error", { error: err.message }));
      }
    }

    // Strategy 2: Convert using Docker + optimum-cli (fallback - no MediaPipe)
    if (!modelExported) {
      printWarn(t("ovms.docker_fallback"));
      printInfo(t("ovms.no_mediapipe_note"));

      let hasDocker = false;
      try {
        execSync("docker --version", { stdio: "pipe", windowsHide: true });
        hasDocker = true;
      } catch {
        /* no docker */
      }

      if (!hasDocker) {
        printError(t("ovms.need_docker_or_ovms"));
        printInfo(t("ovms.build_ovms_hint"));
        return { success: false };
      }

      const modelDir = join(modelsDir, model.model_id, "1");
      mkdirSync(modelDir, { recursive: true });

      const irXmlPath = join(modelDir, "openvino_model.xml");

      printInfo(ti("ovms.docker_converting", { model: hfModel }));
      printInfo(t("ovms.convert_time_hint"));

      const modelDirDocker = modelDir.replace(/\\/g, "/");
      const pythonImage = "python:3.11-slim";

      try {
        let pythonImageExists = false;
        try {
          const check = execSync(`docker images -q "${pythonImage}"`, { encoding: "utf-8", windowsHide: true });
          pythonImageExists = check.trim().length > 0;
        } catch {
          /* ignore */
        }

        if (!pythonImageExists) {
          printInfo(ti("ovms.downloading_image", { image: pythonImage }));
          execSync(`docker pull "${pythonImage}"`, { stdio: "inherit", timeout: 300000, windowsHide: true });
        }

        const weightFormat = model.weight_format || "int8";
        printInfo(ti("ovms.convert_quantization", { format: weightFormat.toUpperCase() }));

        const dockerArgs = [
          "run",
          "--rm",
          "-v",
          `${modelDirDocker}:/output`,
          pythonImage,
          "bash",
          "-c",
          `pip install optimum[openvino] sentence-transformers && optimum-cli export openvino --model ${hfModel} --weight-format ${weightFormat} --library sentence_transformers --task feature-extraction /output`,
        ];

        const exitCode = await new Promise<number>((resolve, reject) => {
          const proc = spawn("docker", dockerArgs, {
            stdio: ["ignore", "inherit", "inherit"],
            windowsHide: true,
          });
          proc.on("error", reject);
          proc.on("close", resolve);
        });
        if (exitCode !== 0) throw new Error(`Docker exited with code ${exitCode}`);

        if (existsSync(irXmlPath)) {
          printOK(t("ovms.model_converted_no_mediapipe"));
          modelExported = true;

          // Create simple OVMS config for this model
          const ovmsConfig = {
            model_config_list: [
              {
                config: {
                  name: modelDirName,
                  base_path: join(modelsDir, modelDirName).replace(/\\/g, "/"),
                },
              },
            ],
          };
          writeFileSync(join(modelsDir, "config.json"), JSON.stringify(ovmsConfig, null, 2));
        }
      } catch (error: unknown) {
        const err = toError(error);
        printError(ti("ovms.convert_error", { error: err.message }));
        return { success: false };
      }
    }

    if (!modelExported) {
      printError(t("ovms.export_failed"));
      return { success: false };
    }
  }

  // Check tokenizer status
  const tokenizerXmlPath = join(modelsDir, modelDirName, "openvino_tokenizer.xml");
  if (!hasTokenizer && existsSync(tokenizerXmlPath)) {
    hasTokenizer = true;
  }

  if (hasTokenizer) {
    printOK(t("ovms.v3_api_available"));
  } else {
    printInfo(t("ovms.v2_api_only"));
  }

  // Create startup script
  const startScript = isWindows ? join(ovmsDir, "start-ovms.bat") : join(ovmsDir, "start-ovms.sh");

  if (isWindows) {
    const batchContent = `@echo off
REM OVMS Native Startup Script
echo Starting OpenVINO Model Server...
"${ovmsBin}" --rest_port 8083 --port 9001 --config_path "${modelsDir}\\config.json"
`;
    writeFileSync(startScript, batchContent);
  } else {
    const shellContent = `#!/bin/bash
# OVMS Native Startup Script
echo "Starting OpenVINO Model Server..."
"${ovmsBin}" --rest_port 8083 --port 9001 --config_path "${modelsDir}/config.json"
`;
    writeFileSync(startScript, shellContent);
    execSync(`chmod +x "${startScript}"`, { stdio: "pipe" });
  }

  printOK(ti("ovms.startup_script_created", { path: startScript }));

  // Summary
  console.error("");
  console.error(`${c.green}${t("ovms.setup_complete_full")}${c.reset}`);
  console.error("");
  console.error(`  ${c.cyan}${t("ovms.rest_api")}:${c.reset} http://127.0.0.1:8083`);
  console.error(`  ${c.cyan}${t("ovms.grpc")}:${c.reset} 127.0.0.1:9001`);
  console.error(`  ${c.cyan}${t("ovms.target")}:${c.reset} ${targetDevice}`);
  if (hasTokenizer) {
    console.error(
      `  ${c.cyan}${t("ovms.api")}:${c.reset} ${c.green}/v3/embeddings${c.reset} (server-side tokenization)`,
    );
  } else {
    console.error(`  ${c.cyan}${t("ovms.api")}:${c.reset} /v2/models/embeddings/infer (client-side tokenization)`);
  }
  console.error("");
  console.error(`  ${c.dim}${t("ovms.auto_start_hint")}${c.reset}`);
  console.error(`  ${c.dim}${t("ovms.auto_stop_hint")}${c.reset}`);
  console.error("");
  console.error(`  ${c.dim}${ti("ovms.manual_start", { path: startScript })}${c.reset}`);

  // Create multi-device configuration for GPU + CPU load balancing
  // Note: For NVIDIA systems with Intel iGPU, we use Intel iGPU (GPU.0) for embeddings
  const hasGPU = hasIntelIGPU || isIntelArc || isIntelGPU;
  let endpoints: string[] = [modelDirName];

  if (hasGPU && hasTokenizer) {
    const createdEndpoints = createMultiDeviceConfig(modelsDir, hasGPU, modelsDir, modelDirName, isNvidiaGPU);
    if (createdEndpoints.length > 1) {
      endpoints = generateEndpointsArray(createdEndpoints);
      printOK(ti("ovms.multi_device_config", { devices: createdEndpoints.join(", ") }));
      const gpuCount = endpoints.filter((e) => e.includes("gpu")).length;
      const cpuCount = endpoints.filter((e) => e.includes("cpu")).length;
      printInfo(
        ti("ovms.round_robin_hint", { slots: String(endpoints.length), gpu: String(gpuCount), cpu: String(cpuCount) }),
      );
    }
  }

  // Final check: Always verify actual model dimensions from file (most reliable)
  // This handles all cases: reuse existing, reinstall, fresh install
  // Works silently - no output, just sets the correct values
  const finalModelConfigPath = join(modelsDir, modelDirName, "config.json");
  if (existsSync(finalModelConfigPath)) {
    try {
      const configData = JSON.parse(readFileSync(finalModelConfigPath, "utf-8"));
      if (configData.hidden_size) {
        detectedDimensions = configData.hidden_size;
        // Determine model_id based on dimensions
        if (configData.hidden_size === 768) {
          detectedModelId = "multilingual-e5-base";
        } else if (configData.hidden_size === 384) {
          detectedModelId = "multilingual-e5-small";
        } else if (configData.hidden_size === 1024) {
          detectedModelId = "multilingual-e5-large";
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return { success: true, endpoints, modelName: modelDirName, detectedDimensions, detectedModelId };
}
