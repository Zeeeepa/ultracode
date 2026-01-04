/**
 * OVMS Native Installation (without Docker)
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CPUInfo } from "../../../cpu/cpu-detector.js";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, GPUInfo, InstallResult } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { createMultiDeviceConfig, generateEndpointsArray } from "../utils/index.js";

export async function installOVMSNative(model: EmbeddingModel, cpu: CPUInfo, gpu: GPUInfo): Promise<InstallResult> {
  printInfo("OVMS Native setup (без Docker)...");
  console.error("");

  const OVMS_VERSION = "2025.4";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";

  // Detect hardware
  const hasNPU = cpu.model.toLowerCase().includes("ultra");
  const gpuName = gpu.name?.toLowerCase() || "";
  const isIntelGPU = gpu.available && gpuName.includes("intel");
  const isIntelArc = isIntelGPU && /arc|a770|a750|a580|a380|a310/.test(gpuName);
  const isNvidiaGPU = gpu.available && /nvidia|geforce|rtx|gtx|quadro/.test(gpuName);

  // Determine target device
  let targetDevice = "CPU";
  if (hasNPU) {
    targetDevice = "NPU";
    printInfo("NPU detected (Intel Core Ultra) - will use NPU acceleration");
  } else if (isNvidiaGPU) {
    targetDevice = "NVIDIA";
    printInfo(`NVIDIA GPU detected (${gpu.name}) - will use NVIDIA acceleration`);
  } else if (isIntelArc) {
    targetDevice = "GPU";
    printInfo(`Intel Arc GPU detected (${gpu.name}) - will use GPU acceleration`);
  } else if (isIntelGPU) {
    targetDevice = "GPU";
    printInfo(`Intel integrated GPU detected (${gpu.name}) - will use GPU acceleration`);
  } else {
    printInfo("Using CPU for inference (no GPU/NPU detected)");
  }

  if (!isWindows && !isLinux) {
    printError("OVMS Native поддерживается только на Windows и Linux");
    printInfo("Используйте OVMS Docker или Ollama");
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

  // Check if already installed
  if (existsSync(ovmsBin)) {
    printOK("OVMS уже установлен");

    const action = await prompt("  [1=Использовать, 2=Переустановить, 3=Отмена]: ");
    if (action === "3") return { success: false };
    if (action !== "2") {
      printInfo("Настройка модели...");
    } else {
      printInfo("Переустановка OVMS...");
    }
  }

  // Download OVMS binary if needed
  if (!existsSync(ovmsBin)) {
    printInfo(`Скачивание OVMS ${OVMS_VERSION}...`);

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
      printInfo(`Размер: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

      const buffer = await response.arrayBuffer();
      writeFileSync(archivePath, Buffer.from(buffer));
      printOK("Скачано");

      printInfo("Распаковка...");

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
      printOK("OVMS установлен");
    } catch (error: any) {
      printError(`Ошибка загрузки: ${error.message}`);
      return { success: false };
    }
  }

  // Download and prepare embedding model
  printInfo(`Подготовка модели: ${model.model_id}`);

  const hfModel = model.hf_model;
  if (!hfModel) {
    printError("Нет HuggingFace модели в конфигурации");
    return { success: false };
  }

  // Determine model directory name
  const modelDirName = (model as any).multi_device ? model.model_id : "embeddings";

  // Check for graph.pbtxt - indicates properly exported model with MediaPipe support
  const graphPath = join(modelsDir, modelDirName, "graph.pbtxt");
  let modelExported = existsSync(graphPath);
  let hasTokenizer = false;

  if (modelExported) {
    printOK("Модель уже экспортирована с MediaPipe поддержкой");
    hasTokenizer = true;
  } else {
    // Strategy 1: Use OVMS export_model.py (best - creates proper MediaPipe graph)
    const exportModelPaths = [
      "C:\\opt\\model_server\\demos\\common\\export_models\\export_model.py",
      join(dataDir, "ovms-src", "demos", "common", "export_models", "export_model.py"),
    ];
    const exportModelPy = exportModelPaths.find((p) => existsSync(p));

    if (exportModelPy) {
      printInfo("Экспорт модели через OVMS export_model.py (создаст MediaPipe граф)...");
      printInfo(`Источник: ${hfModel}`);

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

        printInfo("Это займёт 3-10 минут (загрузка и конвертация модели)...");

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
          printOK("Модель экспортирована с MediaPipe поддержкой");
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
            printOK(`OVMS config.json создан: ${ovmsConfigPath}`);
          }
        } else {
          printWarn(`export_model.py завершился с кодом ${exitCode}`);
        }
      } catch (error: any) {
        printWarn(`Ошибка export_model.py: ${error.message}`);
      }
    }

    // Strategy 2: Convert using Docker + optimum-cli (fallback - no MediaPipe)
    if (!modelExported) {
      printWarn("export_model.py не найден, используем Docker конвертацию");
      printInfo("Примечание: /v3/embeddings API будет недоступен, только /v2/infer");

      let hasDocker = false;
      try {
        execSync("docker --version", { stdio: "pipe", windowsHide: true });
        hasDocker = true;
      } catch {
        /* no docker */
      }

      if (!hasDocker) {
        printError("Для конвертации модели нужен Docker или OVMS репозиторий (C:\\opt\\model_server)");
        printInfo("Соберите OVMS из исходников: scripts\\setup-ovms-nvidia.cmd");
        return { success: false };
      }

      const modelDir = join(modelsDir, model.model_id, "1");
      mkdirSync(modelDir, { recursive: true });

      const irXmlPath = join(modelDir, "openvino_model.xml");

      printInfo(`Конвертация модели через Docker: ${hfModel}`);
      printInfo("Это займёт 3-10 минут...");

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
          printInfo(`Скачивание ${pythonImage}...`);
          execSync(`docker pull "${pythonImage}"`, { stdio: "inherit", timeout: 300000, windowsHide: true });
        }

        const weightFormat = model.weight_format || "int8";
        printInfo(`Конвертация с ${weightFormat.toUpperCase()} квантизацией...`);

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
          printOK("Модель сконвертирована (без MediaPipe)");
          modelExported = true;

          // Create simple OVMS config for this model
          const ovmsConfig = {
            model_config_list: [
              {
                config: {
                  name: "embeddings",
                  base_path: join(modelsDir, model.model_id).replace(/\\/g, "/"),
                },
              },
            ],
          };
          writeFileSync(join(modelsDir, "config.json"), JSON.stringify(ovmsConfig, null, 2));
        }
      } catch (error: any) {
        printError(`Ошибка конвертации: ${error.message}`);
        return { success: false };
      }
    }

    if (!modelExported) {
      printError("Не удалось экспортировать модель");
      return { success: false };
    }
  }

  // Check tokenizer status
  const tokenizerXmlPath = join(modelsDir, "embeddings", "openvino_tokenizer.xml");
  if (!hasTokenizer && existsSync(tokenizerXmlPath)) {
    hasTokenizer = true;
  }

  if (hasTokenizer) {
    printOK("/v3/embeddings API доступен (server-side tokenization)");
  } else {
    printInfo("/v2/models/embeddings/infer API (client-side tokenization)");
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

  printOK(`Создан скрипт запуска: ${startScript}`);

  // Summary
  console.error("");
  console.error(`${c.green}OVMS Native установлен!${c.reset}`);
  console.error("");
  console.error(`  ${c.cyan}REST API:${c.reset} http://127.0.0.1:8083`);
  console.error(`  ${c.cyan}gRPC:${c.reset} 127.0.0.1:9001`);
  console.error(`  ${c.cyan}Target:${c.reset} ${targetDevice}`);
  if (hasTokenizer) {
    console.error(`  ${c.cyan}API:${c.reset} ${c.green}/v3/embeddings${c.reset} (server-side tokenization)`);
  } else {
    console.error(`  ${c.cyan}API:${c.reset} /v2/models/embeddings/infer (client-side tokenization)`);
  }
  console.error("");
  console.error(`  ${c.dim}OVMS будет запущен автоматически при старте MCP${c.reset}`);
  console.error(`  ${c.dim}и остановлен при отключении всех клиентов.${c.reset}`);
  console.error("");
  console.error(`  ${c.dim}Ручной запуск: ${startScript}${c.reset}`);

  // Create multi-device configuration for GPU + CPU load balancing
  const hasGPU = isNvidiaGPU || isIntelArc || isIntelGPU;
  let endpoints: string[] = [modelDirName];

  if (hasGPU && hasTokenizer) {
    const createdEndpoints = createMultiDeviceConfig(modelsDir, hasGPU, modelsDir, modelDirName);
    if (createdEndpoints.length > 1) {
      endpoints = generateEndpointsArray(createdEndpoints);
      printOK(`Multi-device конфигурация: ${createdEndpoints.join(", ")}`);
      const gpuCount = endpoints.filter((e) => e.includes("gpu")).length;
      const cpuCount = endpoints.filter((e) => e.includes("cpu")).length;
      printInfo(`Round-robin распределение: ${endpoints.length} слотов (${gpuCount} GPU, ${cpuCount} CPU)`);
    }
  }

  return { success: true, endpoints, modelName: modelDirName };
}
