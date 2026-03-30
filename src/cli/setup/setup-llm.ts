/**
 * LLM provider selection and installation for setup command
 *
 * New (Zig-compatible) flow: setupLLM() → Claude CLI / Claude API / OpenAI-compat / Skip
 * Legacy flow: selectLLMProvider() + selectLLMModel() + installLLMProvider() (kept for compat)
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import * as fsModule from "node:fs";
import * as osModule from "node:os";
import * as pathModule from "node:path";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Bun runtime interface (defined in runtime-detection.ts)
 */

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof globalThis.Bun?.sleep === "function") {
    await globalThis.Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { t, ta, ti } from "./i18n/index.js";
import { checkDocker, checkOllama } from "./setup-installers.js";
import type { GPUInfo, LLMConfig, ProviderOption, SelectedLLMModel } from "./setup-types.js";
import { c, clearScreen, printError, printInfo, printOK, printWarn, prompt } from "./setup-ui.js";

// ═══════════════════════════════════════════════════════════════
// Docker Model Runner Check
// ═══════════════════════════════════════════════════════════════

// Docker Model Runner models (top 4: 2 quality, 2 fast)
const DMR_MODELS = [
  // Quality models (best reasoning)
  {
    id: "ai/qwen2.5",
    name: "Qwen 2.5",
    badge: "🏆 Quality + Multilingual",
    size_gb: 4.7,
    context_tokens: 32768,
    quality: "high",
    description: "Лучший мультиязычный (RU/EN), отличное reasoning",
  },
  {
    id: "ai/deepseek-r1-distill-llama",
    name: "DeepSeek R1 Distill",
    badge: "🧠 Best Reasoning",
    size_gb: 8,
    context_tokens: 32768,
    quality: "high",
    description: "Лучший reasoning, chain-of-thought",
  },
  // Fast models (smaller, quicker)
  {
    id: "ai/phi4",
    name: "Microsoft Phi-4",
    badge: "⚡ Fast + Compact",
    size_gb: 3,
    context_tokens: 16384,
    quality: "fast",
    description: "Компактный, быстрый, хорошее качество",
  },
  {
    id: "ai/llama3.2",
    name: "Llama 3.2",
    badge: "⚡ Fast + Balanced",
    size_gb: 2,
    context_tokens: 131072,
    quality: "fast",
    description: "Быстрый, большой контекст 128K",
  },
];

function checkDockerModelRunner(): boolean {
  try {
    const result = spawnSync("docker", ["model", "ls"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Find Claude CLI path and return command to run it
 * Searches for installed @anthropic-ai/claude-code package
 */
function getClaudeCommand(): { cmd: string; args: string[] } | null {
  // Use imported modules instead of require for ESM compatibility
  const { existsSync } = fsModule;
  const { join } = pathModule;
  const { homedir } = osModule;

  const isBun = typeof globalThis.Bun !== "undefined";
  const home = homedir();

  // Possible CLI locations (in order of preference)
  const possiblePaths: string[] = [];

  if (process.platform === "win32") {
    // Windows paths
    possiblePaths.push(
      // Bun global install
      join(home, ".bun", "install", "global", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      // npm global install
      join(process.env["APPDATA"] || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      // pnpm global
      join(home, "AppData", "Local", "pnpm", "global", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    );
  } else {
    // Unix paths
    possiblePaths.push(
      // Bun global install
      join(home, ".bun", "install", "global", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      // npm global install
      join("/usr", "local", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      join(home, ".npm-global", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
      // pnpm global
      join(home, ".local", "share", "pnpm", "global", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    );
  }

  // Find first existing path
  for (const cliPath of possiblePaths) {
    if (existsSync(cliPath)) {
      // Use bun or node depending on runtime
      const runtime = isBun ? "bun" : "node";
      return { cmd: runtime, args: [cliPath] };
    }
  }

  // Not found
  return null;
}

function checkClaudeCode(): boolean {
  try {
    const claudeCmd = getClaudeCommand();
    if (!claudeCmd) {
      return false;
    }

    const result = spawnSync(claudeCmd.cmd, [...claudeCmd.args, "--version"], {
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true,
      stdio: "pipe",
      shell: false, // Direct execution, no shell needed
    });

    // Output is like "2.1.3 (Claude Code)" - case-insensitive check
    return result.status === 0 && result.stdout?.toLowerCase().includes("claude");
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// LLM Enable Question
// ═══════════════════════════════════════════════════════════════

export async function askEnableLLM(): Promise<boolean> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("llm.title")}${c.reset}`);
  console.error("");
  console.error("");
  console.error(`  ${c.white}${t("llm.enable_question")}${c.reset}`);
  console.error(`  ${c.dim}${t("llm.enable_hint")}${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}1)${c.reset} ${t("llm.option_yes")}`);
  console.error(`  ${c.bright}2)${c.reset} ${t("llm.option_no")}`);
  console.error("");

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: 2, def: 2 })} `);
  clearScreen();
  return choice === "1";
}

// ═══════════════════════════════════════════════════════════════
// LLM Provider Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLLMProvider(_cpu: CPUInfo, gpu: GPUInfo): Promise<string | null> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("llm.provider_title")}${c.reset}`);
  console.error("");
  console.error("");

  const options: ProviderOption[] = [];

  // Claude Code CLI — best quality, uses existing auth
  const hasClaudeCode = checkClaudeCode();
  if (hasClaudeCode) {
    options.push({
      id: "claude-code",
      name: t("llm.claude.name"),
      recommended: true, // Best quality, no setup needed
      speed: "~3s/req",
      pros: ta("llm.claude.pros"),
      cons: ta("llm.claude.cons"),
      available: true,
    });
  }

  // Docker Model Runner — simplest local option if Docker Desktop 4.40+ available
  const hasDMR = checkDockerModelRunner();
  if (hasDMR) {
    options.push({
      id: "docker-model-runner",
      name: t("llm.dmr.name"),
      recommended: !hasClaudeCode, // Recommend if Claude not available
      speed: gpu.available ? "15-30 tok/s" : "5-10 tok/s",
      pros: ta("llm.dmr.pros"),
      cons: ta("llm.dmr.cons"),
      available: true,
    });
  }

  // TGI — only for non-Blackwell GPUs with Docker
  if (gpu.available && !gpu.isBlackwell && gpu.vramMB >= 4000) {
    options.push({
      id: "tgi",
      name: t("llm.tgi.name"),
      recommended: !hasClaudeCode && !hasDMR && gpu.computeCap >= 8.0 && gpu.vramMB >= 8000,
      speed: "20-30 tok/s",
      pros: ta("llm.tgi.pros"),
      cons: ta("llm.tgi.cons"),
      available: true,
    });
  }

  // Ollama — always available, works on Blackwell
  const ollamaSpeed = gpu.available ? `${Math.round(gpu.vramMB / 400)} tok/s` : "10 tok/s";
  options.push({
    id: "ollama",
    name: gpu.isBlackwell ? t("llm.ollama_blackwell") : t("llm.ollama.name"),
    recommended: !hasClaudeCode && !hasDMR && (gpu.isBlackwell || (gpu.available && gpu.vramMB >= 8000)),
    speed: ollamaSpeed,
    pros: ta("llm.ollama.pros"),
    cons: ta("llm.ollama.cons"),
    available: true,
  });

  // Skip option
  options.push({
    id: "skip",
    name: t("llm.skip.name"),
    recommended: false,
    speed: "-",
    pros: ta("llm.skip.pros"),
    cons: ta("llm.skip.cons"),
    available: true,
  });

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const recBadge = opt.recommended ? ` ${c.green}${t("provider.recommended")}${c.reset}` : "";
    console.error(`  ${c.bright}${i + 1})${c.reset} ${opt.name}${recBadge}`);
    if (opt.speed !== "-") {
      console.error(`     ${c.cyan}⚡ ~${opt.speed}${c.reset}`);
    }
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
    return null;
  }

  const selected = options[idx]!;
  if (selected.id === "skip") {
    clearScreen();
    printInfo(t("llm.skipped"));
    console.error("");
    return null;
  }

  clearScreen();
  printInfo(ti("llm.selected_provider", { name: selected.name }));
  console.error("");

  return selected.id;
}

// ═══════════════════════════════════════════════════════════════
// LLM Model Selection
// ═══════════════════════════════════════════════════════════════

export async function selectLLMModel(
  provider: string,
  config: LLMConfig,
  gpu: GPUInfo,
): Promise<SelectedLLMModel | null> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("llm.model_title")}${c.reset}`);
  console.error("");
  console.error("");

  // Claude Code — fixed model selection (haiku by default)
  if (provider === "claude-code") {
    console.error(`  ${c.dim}Claude Code CLI — ${t("llm.model_title")}${c.reset}`);
    console.error("");
    console.error(
      `  ${c.bright}1)${c.reset} ${t("llmModels.claude_haiku")} ${c.green}${t("model.recommended")}${c.reset}`,
    );
    console.error(`     ${c.dim}${t("llmModels.claude_haiku_hint")}${c.reset}`);
    console.error("");
    console.error(`  ${c.bright}2)${c.reset} ${t("llmModels.claude_sonnet")}`);
    console.error(`     ${c.dim}${t("llmModels.claude_sonnet_hint")}${c.reset}`);
    console.error("");
    console.error(`  ${c.bright}3)${c.reset} ${t("llmModels.claude_opus")}`);
    console.error(`     ${c.dim}${t("llmModels.claude_opus_hint")}${c.reset}`);
    console.error("");

    const choice = await prompt(`  ${ti("common.prompt_choice", { max: 3, def: 1 })} `);
    const modelIdx = parseInt(choice, 10) || 1;

    const models = ["haiku", "sonnet", "opus"];
    const modelNames = ["Haiku", "Sonnet", "Opus"];
    const selectedModel = models[Math.min(Math.max(modelIdx - 1, 0), 2)]!;
    const selectedName = modelNames[Math.min(Math.max(modelIdx - 1, 0), 2)]!;

    clearScreen();
    printInfo(ti("llm.selected_model", { name: `Claude ${selectedName}` }));
    console.error("");

    return {
      id: selectedModel,
      model_id: selectedModel,
      name: `Claude ${selectedName}`,
      context_tokens: 200000,
      size_gb: 0, // Cloud model
      vram_gb: 0,
    };
  }

  // Get available RAM/VRAM based on provider and hardware
  const availableVRAM = gpu.available ? Math.floor(gpu.vramMB / 1024) : 0;

  if (provider === "docker-model-runner") {
    // Docker Model Runner models
    console.error(`  ${c.dim}${t("llmModels.dmr_subtitle")}${c.reset}`);
    console.error("");

    let idx = 0;
    for (const model of DMR_MODELS) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}${t("model.recommended")}${c.reset}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name} ${model.badge}${recBadge}`);
      console.error(`     ${c.dim}${model.size_gb}GB | ${Math.round(model.context_tokens / 1024)}K context${c.reset}`);
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }

    const choice = await prompt(`  ${ti("common.prompt_choice", { max: DMR_MODELS.length, def: 1 })} `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= DMR_MODELS.length) return null;

    const selected = DMR_MODELS[modelIdx]!;
    clearScreen();
    printInfo(ti("llm.selected_model", { name: selected.name }));
    console.error("");

    return {
      id: selected.id,
      model_id: selected.id,
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.size_gb,
    };
  }

  if (provider === "tgi") {
    // TGI models from tgi_models array
    console.error(`  ${c.dim}${ti("llmModels.tgi_vram_available", { vram: availableVRAM })}${c.reset}`);
    console.error("");

    const tgiModels = config.tgi_models.filter((m) => m.vram_gb <= availableVRAM + 1);

    if (tgiModels.length === 0) {
      printWarn(t("llmModels.tgi_no_models"));
      return null;
    }

    // Sort by vram (smaller first for better fit)
    tgiModels.sort((a, b) => b.vram_gb - a.vram_gb);

    const displayModels = tgiModels.slice(0, 5);
    let idx = 0;

    for (const model of displayModels) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}${t("model.recommended")}${c.reset}` : "";
      const badge = model.badge ? ` ${model.badge}` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${badge}${recBadge}`);
      console.error(
        `     ${c.dim}${model.vram_gb}GB VRAM | ${Math.round(model.context_tokens / 1024)}K context${c.reset}`,
      );
      console.error(`     ${c.dim}${model.description}${c.reset}`);
      console.error("");
    }

    const choice = await prompt(`  ${ti("common.prompt_choice", { max: displayModels.length, def: 1 })} `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= displayModels.length) return null;

    const selected = displayModels[modelIdx]!;
    clearScreen();
    printInfo(ti("llm.selected_model", { name: `TGI ${selected.name}` }));
    console.error("");

    return {
      id: selected.id,
      model_id: selected.model_id,
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.vram_gb,
    };
  }

  if (provider === "ollama") {
    // Ollama models from ollama_models array
    const resourceInfo = gpu.available
      ? ti("llmModels.ollama_vram_available", { vram: availableVRAM })
      : t("llmModels.ollama_cpu_only");
    console.error(`  ${c.dim}${resourceInfo}${c.reset}`);
    console.error("");

    let ollamaModels = config.ollama_models;

    // Filter by VRAM if GPU available
    if (gpu.available) {
      ollamaModels = ollamaModels.filter((m) => (m.vram_gb || m.size_gb) <= availableVRAM + 1);
    }

    if (ollamaModels.length === 0) {
      printWarn(t("llmModels.ollama_no_models"));
      return null;
    }

    // Sort by quality
    ollamaModels.sort((a, b) => b.quality_overall - a.quality_overall);

    const displayModels = ollamaModels.slice(0, 5);
    let idx = 0;

    for (const model of displayModels) {
      idx++;
      const recBadge = idx === 1 ? ` ${c.green}${t("model.recommended")}${c.reset}` : "";
      const speedInfo = model.tokens_per_sec_gpu ? ` | ${model.tokens_per_sec_gpu} tok/s` : "";
      console.error(`  ${c.bright}${idx})${c.reset} ${model.name}${recBadge}`);
      console.error(
        `     ${c.dim}${model.vram_gb || model.size_gb}GB | ${Math.round(model.context_tokens / 1024)}K context${speedInfo}${c.reset}`,
      );
      if (model.benchmark_note) {
        console.error(`     ${c.dim}${model.benchmark_note}${c.reset}`);
      }
      console.error("");
    }

    const choice = await prompt(`  ${ti("common.prompt_choice", { max: displayModels.length, def: 1 })} `);
    const modelIdx = (parseInt(choice, 10) || 1) - 1;

    if (modelIdx < 0 || modelIdx >= displayModels.length) return null;

    const selected = displayModels[modelIdx]!;
    clearScreen();
    printInfo(ti("llm.selected_model", { name: `Ollama ${selected.name}` }));
    console.error("");

    return {
      id: selected.id,
      model_id: selected.id, // Ollama uses id as model_id
      name: selected.name,
      context_tokens: selected.context_tokens,
      size_gb: selected.size_gb,
      vram_gb: selected.vram_gb,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// LLM Provider Installation
// ═══════════════════════════════════════════════════════════════

export async function installLLMProvider(provider: string, model: SelectedLLMModel, gpu: GPUInfo): Promise<boolean> {
  if (provider === "claude-code") {
    return await installClaudeCode(model);
  } else if (provider === "docker-model-runner") {
    return await installDMR_LLM(model);
  } else if (provider === "tgi") {
    return await installTGI_LLM(model, gpu);
  } else if (provider === "ollama") {
    return await installOllamaLLM(model);
  }

  return false;
}

async function installClaudeCode(model: SelectedLLMModel): Promise<boolean> {
  printInfo(t("install.claude_setup"));
  console.error("");

  // Verify Claude CLI is available
  if (!checkClaudeCode()) {
    printError(t("install.claude_not_found"));
    console.error("");
    console.error(`  ${t("install.claude_install_hint")}`);
    return false;
  }

  printOK(t("install.claude_available"));
  console.error("");

  // Test generation
  printInfo(ti("install.claude_testing", { name: model.name }));

  const claudeCmd = getClaudeCommand();
  if (!claudeCmd) {
    printError(t("install.claude_not_found"));
    return false;
  }

  // --no-session-persistence: don't save test session to history
  // --mcp-config {"mcpServers":{}} --strict-mcp-config: disable MCP servers (prevents recursive spawning)
  // --allowedTools Commands: only allow built-in Commands, no file/MCP tools
  const testArgs = [
    ...claudeCmd.args,
    "-p",
    "--model",
    model.model_id,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--strict-mcp-config",
    "--allowedTools",
    "Commands",
    "Say hello in Russian",
  ];
  const testResult = spawnSync(claudeCmd.cmd, testArgs, {
    encoding: "utf-8",
    timeout: 60000,
    windowsHide: true,
    stdio: "pipe",
    shell: false, // Direct execution
  });

  if (testResult.status === 0) {
    try {
      const result = JSON.parse(testResult.stdout);
      if (result.result) {
        printOK(t("install.claude_works"));
        console.error("");
        console.error(`  ${c.dim}${ti("install.claude_response", { text: result.result.slice(0, 100) })}${c.reset}`);
        console.error(
          `  ${c.dim}${ti("install.claude_cost", { cost: result.total_cost_usd?.toFixed(4) || "N/A" })}${c.reset}`,
        );
        console.error("");
        return true;
      }
    } catch {
      // JSON parse failed
    }
  }

  printWarn(t("install.claude_test_failed"));
  console.error("");
  console.error(`  ${t("install.claude_check_auth")}`);
  console.error("");
  return true; // Still return true - user may fix auth later
}

async function installDMR_LLM(model: SelectedLLMModel): Promise<boolean> {
  printInfo(t("install.dmr_setup"));
  console.error("");

  // Check Docker Model Runner availability
  if (!checkDockerModelRunner()) {
    printError(t("install.dmr_not_available"));
    console.error("");
    console.error(`  ${t("install.dmr_requires")}`);
    console.error(`  ${t("install.docker_install_url")}`);
    console.error("");
    console.error(`  ${t("install.dmr_enable_hint")}`);
    return false;
  }

  printOK(t("install.dmr_available"));
  console.error("");

  // Pull model
  printInfo(ti("install.model_downloading", { model: model.model_id }));
  console.error(`  ${ti("install.model_size_hint", { size: model.size_gb })}`);
  console.error("");

  const pullResult = spawnSync("docker", ["model", "pull", model.model_id], {
    stdio: "inherit",
    timeout: 1800000,
    windowsHide: true,
  });

  if (pullResult.status !== 0) {
    printError(t("install.model_failed"));
    console.error("");
    console.error(`  docker model pull ${model.model_id}`);
    return false;
  }

  printOK(t("install.model_downloaded"));
  console.error("");

  // Test the model
  printInfo(t("install.dmr_testing"));

  const testResult = spawnSync("docker", ["model", "run", model.model_id, "Hello"], {
    encoding: "utf-8",
    timeout: 60000,
    windowsHide: true,
    stdio: "pipe",
  });

  if (testResult.status === 0) {
    printOK(t("install.dmr_works"));
    console.error("");
    console.error(`  ${c.green}${ti("install.dmr_usage", { model: model.model_id })}${c.reset}`);
    console.error("");
    console.error(`  ${c.yellow}${t("install.dmr_important")}${c.reset}`);
    console.error(`  Docker Desktop → Settings → Features in development`);
    console.error(`  → ${c.bright}${t("install.dmr_enable_gpu")}${c.reset}`);
    console.error(`  → ${c.bright}${t("install.dmr_enable_tcp")}${c.reset}`);
    console.error("");
    console.error(`  ${t("install.dmr_cli_hint")}`);
    console.error("");
    console.error(`  ${c.green}${t("install.dmr_api_endpoint")}${c.reset}`);
  } else {
    printWarn(t("install.dmr_test_failed"));
    console.error("");
    console.error(`  ${c.yellow}${t("install.dmr_important")}${c.reset}`);
    console.error(`  Docker Desktop → Settings → Features in development`);
    console.error(`  → ${c.bright}${t("install.dmr_enable_gpu")}${c.reset}`);
    console.error(`  → ${c.bright}${t("install.dmr_enable_tcp")}${c.reset}`);
  }

  return true;
}

async function installTGI_LLM(model: SelectedLLMModel, _gpu: GPUInfo): Promise<boolean> {
  printInfo("TGI LLM setup...");
  console.error("");

  if (!checkDocker()) {
    printError(t("install.docker_required"));
    console.error("");
    console.error(`  ${t("install.docker_install_hint")}`);
    console.error(`  ${t("install.docker_install_url")}`);
    return false;
  }

  printOK(t("install.docker_available"));

  const imageTag = "ghcr.io/huggingface/text-generation-inference:3.3.4";
  const containerName = "tgi-llm-server";
  const port = 8081;

  // Check existing container
  try {
    const existing = spawnSync("docker", ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], {
      encoding: "utf-8",
      windowsHide: true,
    });

    if (existing.stdout.trim() === containerName) {
      printWarn(ti("install.container_exists", { name: containerName }));
      const action = await prompt(
        `  [1=${t("install.container_action_restart")}, 2=${t("install.container_action_reinstall")}, 3=${t("install.container_action_cancel")}]: `,
      );

      if (action === "1") {
        spawnSync("docker", ["restart", containerName], { stdio: "inherit", windowsHide: true });
        printOK(t("install.container_restarted"));
        return true;
      }
      if (action === "2") {
        spawnSync("docker", ["stop", containerName], { stdio: "pipe", windowsHide: true });
        spawnSync("docker", ["rm", containerName], { stdio: "pipe", windowsHide: true });
        printOK(t("install.container_removed"));
      } else {
        return false;
      }
    }
  } catch {
    /* continue */
  }

  // Pull image
  printInfo(ti("install.pulling_image", { tag: imageTag }));
  console.error(`  ${t("install.pull_progress")}`);

  try {
    execSync(`docker pull ${imageTag}`, {
      stdio: "inherit",
      timeout: 900000,
      windowsHide: true,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[DEBUG] TGI pull failed: ${error.message}`);
    printError(t("install.pull_failed"));
    return false;
  }

  printOK(ti("install.image_exists", { tag: imageTag }));
  console.error("");

  // Create container
  printInfo(`Creating TGI container with model: ${model.model_id}`);

  const tgiCmd = `docker run -d --name ${containerName} -p ${port}:80 --restart unless-stopped --gpus all -e "HUGGING_FACE_HUB_TOKEN=\${HF_TOKEN:-}" -v huggingface-cache:/data ${imageTag} --model-id ${model.model_id} --max-input-tokens 4096 --max-total-tokens 8192`;

  console.error(`[DEBUG] Running: ${tgiCmd}`);

  try {
    execSync(tgiCmd, { stdio: "inherit", windowsHide: true });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[DEBUG] TGI docker run failed: ${error.message}`);
    printError("Failed to create container");
    return false;
  }

  printOK(ti("install.container_created", { name: "TGI" }));

  // Wait for health
  printInfo(ti("install.health_waiting", { name: "TGI" }));

  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      const health = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}/health`], {
        timeout: 5000,
        windowsHide: true,
      });
      if (health.status === 0) {
        console.error("");
        printOK(ti("install.server_ready", { name: "TGI LLM" }));
        printInfo(ti("install.server_endpoint", { url: `http://127.0.0.1:${port}` }));
        return true;
      }
    } catch {
      /* continue */
    }
    process.stderr.write(".");
  }

  console.error("");
  printWarn(ti("install.health_timeout", { container: containerName }));
  return true;
}

async function installOllamaLLM(model: SelectedLLMModel): Promise<boolean> {
  printInfo("Ollama LLM setup...");
  console.error("");

  if (!checkOllama()) {
    printWarn(t("install.ollama_not_found"));
    console.error("");
    console.error(`  ${t("install.ollama_install_hint")}`);
    console.error(`  ${t("install.ollama_install_url")}`);
    console.error("");

    const open = await prompt(`  ${t("install.ollama_open_download")} `);
    if (open.toLowerCase() === "y") {
      const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(cmd, ["https://ollama.ai/download"], { shell: true, stdio: "pipe", windowsHide: true });
    }
    return false;
  }

  printOK(t("install.ollama_available"));

  // Check if service running
  try {
    const check = spawnSync("curl", ["-sf", "http://127.0.0.1:11434/"], { timeout: 5000, windowsHide: true });
    if (check.status !== 0) {
      printInfo(t("install.ollama_service_starting"));
      const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
      proc.unref();
      await sleep(3000);
    }
  } catch {
    /* continue */
  }

  printOK(t("install.ollama_service_running"));
  console.error("");

  // Pull model
  printInfo(ti("install.model_downloading", { model: model.model_id }));
  console.error(`  ${ti("install.model_size_hint", { size: model.size_gb })}`);
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1800000,
    windowsHide: true,
  });
  if (pullResult.status !== 0) {
    printError(t("install.model_failed"));
    return false;
  }

  printOK(t("install.model_downloaded"));
  return true;
}

// ═══════════════════════════════════════════════════════════════
// NEW: Zig-compatible LLM setup (single entry point)
// Source: ultracode.zig/src/cli/setup.zig:87-227
// ═══════════════════════════════════════════════════════════════

/**
 * LLM configuration result (Zig-compatible format).
 * Maps directly to Zig's LLMSettings + doc_language.
 */
export interface LLMResult {
  /** Zig platform name: "claude_cli" | "claude_api" | "openai_compat" */
  platform: "claude_cli" | "claude_api" | "openai_compat";
  /** API endpoint (empty for claude_cli) */
  endpoint: string;
  /** API key (empty for claude_cli, optional for openai_compat) */
  api_key: string;
  /** Model name: "haiku"/"sonnet"/"opus" for Claude, free-form for openai_compat */
  model: string;
  /** Context window size in tokens */
  context_tokens: number;
  /** Documentation language (ISO 639-1) */
  doc_language: string;
}

/**
 * Detect if `claude` CLI is available on PATH (matches Zig's detectClaudeCli).
 */
function detectClaudeCli(): boolean {
  try {
    const result = spawnSync("claude", ["--version"], {
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true,
      stdio: "pipe",
    });
    if (result.status === 0) return true;
    // Also check output for "claude" string (some versions output to stderr)
    const output = (result.stdout || "") + (result.stderr || "");
    return /claude/i.test(output);
  } catch {
    return false;
  }
}

/**
 * Select Claude model (haiku/sonnet/opus).
 * Matches Zig's selectClaudeModel().
 */
async function selectClaudeModel(): Promise<string> {
  console.error("");
  console.error(`  ${c.bright}${t("llmModels.claude_model_title")}${c.reset}`);
  console.error(`  ${c.bright}1)${c.reset} ${t("llmModels.claude_haiku")} ${c.green}[default]${c.reset}`);
  console.error(`     ${c.dim}${t("llmModels.claude_haiku_hint")}${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}2)${c.reset} ${t("llmModels.claude_sonnet")}`);
  console.error(`     ${c.dim}${t("llmModels.claude_sonnet_hint")}${c.reset}`);
  console.error("");
  console.error(`  ${c.bright}3)${c.reset} ${t("llmModels.claude_opus")}`);
  console.error(`     ${c.dim}${t("llmModels.claude_opus_hint")}${c.reset}`);
  console.error("");

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: 3, def: 1 })} `);
  const idx = parseInt(choice, 10) || 1;
  switch (idx) {
    case 2:
      return "sonnet";
    case 3:
      return "opus";
    default:
      return "haiku";
  }
}

/**
 * Select documentation language.
 * Matches Zig's setup.zig:206-227.
 */
export async function selectDocLanguage(): Promise<string> {
  console.error("");
  console.error(`  ${c.bright}${t("llm.doc_lang_title")}${c.reset}`);
  console.error(`  ${c.bright}1)${c.reset} English  ${c.green}[DEFAULT]${c.reset}`);
  console.error(`  ${c.bright}2)${c.reset} Russian`);
  console.error(`  ${c.bright}3)${c.reset} German`);
  console.error(`  ${c.bright}4)${c.reset} French`);
  console.error(`  ${c.bright}5)${c.reset} Spanish`);
  console.error(`  ${c.bright}6)${c.reset} Chinese`);
  console.error(`  ${c.bright}7)${c.reset} Japanese`);
  console.error("");

  const choice = await prompt(`  ${ti("common.prompt_choice", { max: 7, def: 1 })} `);
  const idx = parseInt(choice, 10) || 1;
  const langs = ["en", "ru", "de", "fr", "es", "zh", "ja"];
  return langs[Math.min(Math.max(idx - 1, 0), 6)] ?? "en";
}

/**
 * Unified LLM setup following the Zig reference flow.
 * Returns LLMResult or null (Skip).
 *
 * Flow:
 * 1. Detect Claude CLI
 * 2. Show 4 options: Claude CLI / Claude API / OpenAI-compat / Skip
 * 3. Per choice: select model, prompt for keys/endpoints
 * 4. Select documentation language
 * 5. Return result
 */
export async function setupLLM(): Promise<LLMResult | null> {
  clearScreen();
  console.error("");
  console.error(`  ${c.bright}${t("llm.title")}${c.reset}`);
  console.error("");

  // Detect Claude CLI availability
  const claudeCliAvailable = detectClaudeCli();
  const cliTag = claudeCliAvailable ? `  ${c.green}[DETECTED]${c.reset}` : "";

  console.error(`  ${c.bright}1)${c.reset} ${t("llm.zig.claude_cli")}${cliTag}`);
  console.error(`  ${c.bright}2)${c.reset} ${t("llm.zig.claude_api")}`);
  console.error(`  ${c.bright}3)${c.reset} ${t("llm.zig.openai_compat")}`);
  console.error(`  ${c.bright}4)${c.reset} ${t("llm.zig.skip")}`);
  console.error("");

  const defaultChoice = claudeCliAvailable ? 1 : 2;
  const choice = await prompt(`  ${ti("common.prompt_choice", { max: 4, def: defaultChoice })} `);
  const idx = parseInt(choice, 10) || defaultChoice;

  let result: LLMResult | null = null;

  switch (idx) {
    case 1: {
      // Claude CLI (local)
      console.error("");
      if (claudeCliAvailable) {
        printOK(t("llm.zig.claude_cli_detected"));
      } else {
        printWarn(t("llm.zig.claude_cli_not_found"));
      }
      const model = await selectClaudeModel();
      result = {
        platform: "claude_cli",
        endpoint: "",
        api_key: "",
        model,
        context_tokens: 200000,
        doc_language: "en",
      };
      break;
    }
    case 2: {
      // Claude API
      console.error("");
      console.error(`  ${c.bright}${t("llm.zig.claude_api_title")}${c.reset}`);

      // Check env for API key
      const envKey = process.env["ANTHROPIC_API_KEY"] || "";
      let apiKey = "";

      if (envKey.length > 0) {
        const prefix = envKey.slice(0, 7);
        const suffix = envKey.length > 10 ? envKey.slice(-4) : "";
        console.error(`  ${t("llm.zig.api_key_from_env")}: ${prefix}...${suffix}`);
        apiKey = envKey;
      } else {
        apiKey = await prompt(`  ${t("llm.zig.api_key_prompt")}: `);
      }

      const model = await selectClaudeModel();
      result = {
        platform: "claude_api",
        endpoint: "https://api.anthropic.com/v1",
        api_key: apiKey,
        model,
        context_tokens: 200000,
        doc_language: "en",
      };
      break;
    }
    case 3: {
      // OpenAI-compatible
      console.error("");
      console.error(`  ${c.bright}${t("llm.zig.openai_title")}${c.reset}`);
      console.error(`  ${c.dim}Ollama:    http://localhost:11434/v1${c.reset}`);
      console.error(`  ${c.dim}vLLM:     http://localhost:8000/v1${c.reset}`);
      console.error(`  ${c.dim}LMStudio: http://localhost:1234/v1${c.reset}`);
      console.error("");

      const endpoint =
        (await prompt(`  ${t("llm.zig.endpoint_prompt")} [http://localhost:11434/v1]: `)) ||
        "http://localhost:11434/v1";
      const apiKey = (await prompt(`  ${t("llm.zig.api_key_optional")}: `)) || "";
      const model = (await prompt(`  ${t("llm.zig.model_prompt")} [qwen2.5-coder:7b]: `)) || "qwen2.5-coder:7b";
      const ctxStr = (await prompt(`  ${t("llm.zig.context_prompt")} [32768]: `)) || "32768";
      const contextTokens = parseInt(ctxStr, 10) || 32768;

      result = {
        platform: "openai_compat",
        endpoint,
        api_key: apiKey,
        model,
        context_tokens: contextTokens,
        doc_language: "en",
      };
      break;
    }
    default: {
      // Skip
      clearScreen();
      return null;
    }
  }

  // Documentation language selection (only if LLM was selected)
  if (result) {
    result.doc_language = await selectDocLanguage();
  }

  clearScreen();
  return result;
}
