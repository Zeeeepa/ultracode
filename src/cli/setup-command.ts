#!/usr/bin/env node
/**
 * UltraScript Tools MCP - Semantic Embedding Setup Command
 *
 * Interactive CLI for configuring local embedding providers.
 * Supports TEI (Docker), Ollama, and Memory providers.
 *
 * Usage:
 *   npx ultrascript-tools-mcp setup
 *   npx ultrascript-tools-mcp setup --provider tei
 *   npx ultrascript-tools-mcp setup --provider ollama
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  ensureConfigDir,
  getConfigDir,
  getDisplayPath,
  type SemanticConfig,
  saveSemanticConfig,
} from "../utils/config-paths.js";

// Get package root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, "..", "..");

// Embedding models config path (shipped with package)
const MODELS_CONFIG_PATH = join(PACKAGE_ROOT, "config", "embedding-models.json");

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function printBanner(): void {
  console.error("");
  console.error(
    `${colors.cyan}${colors.bright}=================================================================${colors.reset}`,
  );
  console.error(`${colors.cyan}${colors.bright}UltraScript Tools MCP - Semantic Embedding Setup${colors.reset}`);
  console.error(
    `${colors.cyan}${colors.bright}=================================================================${colors.reset}`,
  );
  console.error("");
}

function printSuccess(msg: string): void {
  console.error(`${colors.green}[OK]${colors.reset} ${msg}`);
}

function printInfo(msg: string): void {
  console.error(`${colors.cyan}[INFO]${colors.reset} ${msg}`);
}

function printWarn(msg: string): void {
  console.error(`${colors.yellow}[WARNING]${colors.reset} ${msg}`);
}

function printError(msg: string): void {
  console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`);
}

interface EmbeddingModel {
  id: string;
  provider: string;
  name: string;
  badge?: string;
  model_id: string;
  gpu_architectures: string[];
  gpu_support: boolean;
  image_gpu?: string;
  image_cpu?: string;
  language: string;
  context_tokens: number;
  dimensions: number;
  size_mb: number;
  use_case: string;
  description: string;
}

interface ModelsConfig {
  version: string;
  scenarios: Record<string, { name: string; description: string; tei: string; ollama: string }>;
  providers: Record<string, { name: string; description: string; default_port?: number; container_name?: string }>;
  models: EmbeddingModel[];
  default_models: Record<string, string>;
}

function loadModelsConfig(): ModelsConfig | null {
  if (!existsSync(MODELS_CONFIG_PATH)) {
    printError(`Models configuration not found: ${MODELS_CONFIG_PATH}`);
    return null;
  }

  try {
    const content = readFileSync(MODELS_CONFIG_PATH, "utf-8");
    return JSON.parse(content) as ModelsConfig;
  } catch (error) {
    printError(`Failed to parse models config: ${error}`);
    return null;
  }
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function detectGpuArchitecture(): string {
  try {
    // Try nvidia-smi
    const result = spawnSync("nvidia-smi", ["--query-gpu=name,compute_cap", "--format=csv,noheader"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });

    if (result.status !== 0 || !result.stdout) {
      return "cpu";
    }

    const lines = result.stdout.trim().split("\n");
    if (lines.length === 0 || !lines[0]) return "cpu";

    const parts = lines[0].split(",").map((s) => s.trim());
    const gpuName = parts[0] || "Unknown GPU";
    const computeCap = parts[1];

    if (!computeCap) return "cpu";

    console.error(`${colors.green}[OK]${colors.reset} GPU detected: ${gpuName} (CC: ${computeCap})`);

    // Map compute capability to architecture
    switch (computeCap) {
      case "7.5":
        return "turing";
      case "8.0":
        return "ampere-80";
      case "8.6":
      case "8.7":
        return "ampere-86";
      case "8.9":
        return "ada";
      case "9.0":
        return "hopper";
      case "10.0":
      case "10.2":
      case "12.0":
        return "blackwell";
      default:
        return "cpu";
    }
  } catch {
    return "cpu";
  }
}

function checkDocker(): boolean {
  try {
    const result = spawnSync("docker", ["info"], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function checkOllama(): boolean {
  try {
    const result = spawnSync("ollama", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function installTei(model: EmbeddingModel, architecture: string): Promise<boolean> {
  console.error("");
  console.error(`${colors.cyan}Installing TEI server...${colors.reset}`);
  console.error("");

  if (!checkDocker()) {
    printError("Docker is not installed or not running");
    console.error("");
    console.error("Please install Docker Desktop:");
    console.error("  https://www.docker.com/products/docker-desktop");
    return false;
  }

  const useGpu = architecture !== "cpu" && !architecture.includes("blackwell");
  const imageTag = useGpu ? model.image_gpu : model.image_cpu;

  if (!imageTag) {
    printError("No Docker image available for this model");
    return false;
  }

  const containerName = "tei-server";
  const port = 8080;

  // Check if container already exists
  try {
    const existingResult = spawnSync(
      "docker",
      ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Names}}"],
      {
        encoding: "utf-8",
      },
    );

    if (existingResult.stdout.trim() === containerName) {
      printWarn(`Container '${containerName}' already exists`);
      const action = await prompt("What to do? [1=Restart, 2=Remove and reinstall, 3=Cancel]: ");

      if (action === "1") {
        spawnSync("docker", ["restart", containerName], { stdio: "inherit" });
        printSuccess("Container restarted");
        return true;
      }
      if (action === "2") {
        spawnSync("docker", ["stop", containerName], { stdio: "pipe" });
        spawnSync("docker", ["rm", containerName], { stdio: "pipe" });
        printSuccess("Container removed");
      } else {
        printInfo("Installation cancelled");
        return false;
      }
    }
  } catch {
    // Container doesn't exist, continue
  }

  // Pull image
  printInfo(`Pulling Docker image: ${imageTag}`);
  console.error("  This may take a few minutes...");

  const pullResult = spawnSync("docker", ["pull", imageTag], {
    stdio: "inherit",
    timeout: 600000, // 10 minutes
  });

  if (pullResult.status !== 0) {
    printError("Failed to pull Docker image");
    return false;
  }

  printSuccess("Image downloaded");
  console.error("");

  // Create container
  printInfo(`Creating TEI container with model: ${model.model_id}`);

  const dockerArgs = ["run", "-d", "--name", containerName, "-p", `${port}:80`, "--restart", "unless-stopped"];

  if (useGpu) {
    dockerArgs.push("--gpus", "all");
  }

  dockerArgs.push(imageTag, "--model-id", model.model_id, "--max-concurrent-requests", "512");

  const runResult = spawnSync("docker", dockerArgs, {
    stdio: "inherit",
  });

  if (runResult.status !== 0) {
    printError("Failed to create container");
    return false;
  }

  printSuccess("Container created");
  console.error("");

  // Wait for health check
  printInfo("Waiting for TEI to initialize (max 60 seconds)...");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const healthResult = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}/health`], {
        encoding: "utf-8",
        timeout: 2000,
      });
      if (healthResult.status === 0) {
        console.error("");
        printSuccess("TEI server is ready!");
        return true;
      }
    } catch {
      // Continue waiting
    }
    process.stdout.write(".");
  }

  console.error("");
  printWarn("Health check timed out. Container may still be initializing.");
  console.error("  Check logs: docker logs tei-server");
  return true;
}

async function installOllama(model: EmbeddingModel): Promise<boolean> {
  console.error("");
  console.error(`${colors.cyan}Installing Ollama model...${colors.reset}`);
  console.error("");

  if (!checkOllama()) {
    printWarn("Ollama is not installed");
    console.error("");
    console.error("Please install Ollama first:");
    console.error("  https://ollama.ai/download");
    console.error("");

    const install = await prompt("Open download page in browser? [y/N]: ");
    if (install.toLowerCase() === "y") {
      const openCmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(openCmd, ["https://ollama.ai/download"], { shell: true, stdio: "pipe" });
    }

    return false;
  }

  printSuccess("Ollama is installed");

  // Check if Ollama service is running
  try {
    const result = spawnSync("curl", ["-sf", "http://127.0.0.1:11434/"], {
      timeout: 5000,
    });

    if (result.status !== 0) {
      printWarn("Ollama service is not running");
      printInfo("Starting Ollama service...");

      // Start Ollama in background
      const ollamaProcess = spawn("ollama", ["serve"], {
        detached: true,
        stdio: "ignore",
      });
      ollamaProcess.unref();

      // Wait for service to start
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch {
    // Service not running
  }

  printSuccess("Ollama service is running");
  console.error("");

  // Pull model
  printInfo(`Downloading model: ${model.model_id}`);
  console.error("  This may take several minutes...");
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1200000, // 20 minutes
  });

  if (pullResult.status !== 0) {
    printError("Failed to download model");
    return false;
  }

  printSuccess("Model downloaded successfully");
  return true;
}

export async function runSetup(args: string[]): Promise<void> {
  printBanner();

  // Load models configuration
  const modelsConfig = loadModelsConfig();
  if (!modelsConfig) {
    process.exit(1);
  }

  // Parse arguments
  let providerArg: string | undefined;
  let modelArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerArg = args[i + 1];
      i++;
    }
    if (args[i] === "--model" && args[i + 1]) {
      modelArg = args[i + 1];
      i++;
    }
  }

  // Step 1: Detect GPU
  console.error(`${colors.yellow}[1/3] GPU Architecture Detection${colors.reset}`);
  console.error("");

  const architecture = detectGpuArchitecture();

  if (architecture === "cpu") {
    printInfo("No compatible GPU detected - using CPU mode");
  } else if (architecture === "blackwell") {
    printWarn("Blackwell GPU detected - TEI GPU mode not supported yet");
    printInfo("You can use Ollama (supports all GPUs) or TEI in CPU mode");
  } else {
    printSuccess(`Detected architecture: ${architecture}`);
  }

  console.error("");

  // Step 2: Select Provider
  console.error(`${colors.yellow}[2/3] Provider Selection${colors.reset}`);
  console.error("");

  let selectedProvider: string;

  if (providerArg) {
    selectedProvider = providerArg;
    printInfo(`Using provider: ${selectedProvider}`);
  } else {
    const providers = Object.entries(modelsConfig.providers);

    for (let i = 0; i < providers.length; i++) {
      const entry = providers[i];
      if (!entry) continue;
      const [, info] = entry;
      console.error(`${colors.bright}${i + 1}) ${info.name}${colors.reset}`);
      console.error(`   ${info.description.replace(/\\n/g, "\n   ")}`);
      console.error("");
    }

    const choice = await prompt(`Choose provider [1-${providers.length}]: `);
    const choiceIdx = Number.parseInt(choice, 10) - 1;

    const selectedEntry = providers[choiceIdx];
    if (choiceIdx < 0 || choiceIdx >= providers.length || !selectedEntry) {
      printError("Invalid choice");
      process.exit(1);
    }

    selectedProvider = selectedEntry[0];
    console.error("");
    const providerInfo = modelsConfig.providers[selectedProvider];
    printInfo(`Selected: ${providerInfo?.name ?? selectedProvider}`);
  }

  console.error("");

  // Memory provider doesn't need model selection
  if (selectedProvider === "memory") {
    console.error(`${colors.yellow}Memory Provider (No ML)${colors.reset}`);
    console.error("");
    printWarn("Memory provider uses deterministic hashing (no ML embeddings)");
    console.error("");

    const config: SemanticConfig = {
      enabled: true,
      embedding: {
        platform: "memory",
        architecture,
        memory: {
          model_path: "./models/embedding",
          vector_size: 384,
        },
      },
    };

    ensureConfigDir();
    saveSemanticConfig(config);

    console.error("");
    printSuccess(`Configuration saved to: ${getDisplayPath(getConfigDir())}/semantic-config.json`);
    console.error("");
    return;
  }

  // Step 3: Select Model
  console.error(`${colors.yellow}[3/3] Model Selection${colors.reset}`);
  console.error("");

  const providerModels = modelsConfig.models.filter((m) => m.provider === selectedProvider);

  if (providerModels.length === 0) {
    printError(`No models available for provider: ${selectedProvider}`);
    process.exit(1);
  }

  // Filter by GPU architecture compatibility
  const gpuModels = providerModels.filter((m) => m.gpu_architectures.includes(architecture) && architecture !== "cpu");
  const cpuModels = providerModels.filter((m) => m.gpu_architectures.includes("cpu"));
  const availableModels = [...gpuModels, ...cpuModels.filter((m) => !gpuModels.includes(m))];

  let selectedModel: EmbeddingModel;

  if (modelArg) {
    const found = availableModels.find((m) => m.id === modelArg || m.model_id === modelArg);
    if (!found) {
      printError(`Model not found: ${modelArg}`);
      process.exit(1);
    }
    selectedModel = found;
    printInfo(`Using model: ${selectedModel.name}`);
  } else {
    if (gpuModels.length > 0) {
      console.error(`Available models for your GPU (${architecture}):`);
    } else {
      console.error("Available models (CPU mode):");
    }
    console.error("");

    for (let i = 0; i < availableModels.length; i++) {
      const model = availableModels[i];
      if (!model) continue;
      const badge = model.badge ? ` ${model.badge}` : "";
      const gpuIndicator = i < gpuModels.length && gpuModels.length > 0 ? " [GPU]" : "";

      console.error(`${colors.bright}${i + 1}) ${model.name}${badge}${gpuIndicator}${colors.reset}`);

      const langLabel = model.language === "multi" ? "Multilingual" : model.language === "code" ? "Code" : "English";
      console.error(
        `   ${colors.dim}Language: ${langLabel} | Context: ${model.context_tokens} tokens | Dim: ${model.dimensions} | Size: ~${model.size_mb}MB${colors.reset}`,
      );
      console.error(`   ${colors.dim}${model.description}${colors.reset}`);
      console.error("");
    }

    const modelChoice = await prompt(`Choose model [1-${availableModels.length}]: `);
    const modelIdx = Number.parseInt(modelChoice, 10) - 1;

    const chosenModel = availableModels[modelIdx];
    if (modelIdx < 0 || modelIdx >= availableModels.length || !chosenModel) {
      printError("Invalid choice");
      process.exit(1);
    }

    selectedModel = chosenModel;
    console.error("");
    printInfo(`Selected: ${selectedModel.name}`);
  }

  console.error("");

  // Install provider
  let installSuccess = false;

  if (selectedProvider === "tei") {
    installSuccess = await installTei(selectedModel, architecture);
  } else if (selectedProvider === "ollama") {
    installSuccess = await installOllama(selectedModel);
  }

  if (!installSuccess) {
    console.error("");
    printWarn("Installation encountered issues, but configuration will be saved");
  }

  // Save configuration
  const teiEndpoint = "http://127.0.0.1:8080";
  const ollamaEndpoint = "http://127.0.0.1:11434";

  const config: SemanticConfig = {
    enabled: true,
    embedding: {
      platform: selectedProvider as "tei" | "ollama" | "memory",
      architecture,
      tei:
        selectedProvider === "tei"
          ? {
              endpoint: teiEndpoint,
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
      ollama:
        selectedProvider === "ollama"
          ? {
              endpoint: ollamaEndpoint,
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
    },
    auto_detection: {
      gpu_architecture: true,
      codebase_size: true,
      language: true,
    },
  };

  ensureConfigDir();
  saveSemanticConfig(config);

  // Summary
  console.error("");
  console.error(
    `${colors.green}${colors.bright}=================================================================${colors.reset}`,
  );
  console.error(`${colors.green}${colors.bright}Setup Complete!${colors.reset}`);
  console.error(
    `${colors.green}${colors.bright}=================================================================${colors.reset}`,
  );
  console.error("");
  console.error(`${colors.cyan}Summary:${colors.reset}`);
  console.error(`  Platform:     ${selectedProvider}`);
  console.error(`  Model:        ${selectedModel.name}`);
  console.error(`  Architecture: ${architecture}`);
  console.error(`  Config saved: ${getDisplayPath(getConfigDir())}/semantic-config.json`);
  console.error("");

  if (selectedProvider === "tei") {
    console.error(`${colors.cyan}TEI Management:${colors.reset}`);
    console.error("  docker logs tei-server        # View logs");
    console.error("  docker stop tei-server        # Stop");
    console.error("  docker start tei-server       # Start");
    console.error("  docker restart tei-server     # Restart");
  } else if (selectedProvider === "ollama") {
    console.error(`${colors.cyan}Ollama Management:${colors.reset}`);
    console.error("  ollama list                   # List models");
    console.error("  ollama pull <model>           # Download model");
    console.error("  ollama rm <model>             # Remove model");
  }

  console.error("");
  console.error(`${colors.yellow}Next: Restart your MCP client to enable semantic mode${colors.reset}`);
  console.error("");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup(process.argv.slice(2)).catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
}
