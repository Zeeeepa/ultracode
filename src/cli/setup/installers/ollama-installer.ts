/**
 * Ollama Installation
 */

import { spawn, spawnSync } from "node:child_process";
import type { EmbeddingModel } from "../setup-types.js";
import { printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { checkOllama, sleep } from "../utils/index.js";

export async function installOllama(model: EmbeddingModel): Promise<boolean> {
  printInfo("Ollama setup...");
  console.error("");

  if (!checkOllama()) {
    printWarn("Ollama не установлен");
    console.error("");
    console.error("  Установите Ollama:");
    console.error("  https://ollama.ai/download");
    console.error("");

    const open = await prompt("  Открыть страницу загрузки? [y/N]: ");
    if (open.toLowerCase() === "y") {
      const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(cmd, ["https://ollama.ai/download"], { shell: true, stdio: "pipe", windowsHide: true });
    }
    return false;
  }

  printOK("Ollama установлен");

  // Check if service running
  try {
    const check = spawnSync("curl", ["-sf", "http://127.0.0.1:11434/"], { timeout: 5000, windowsHide: true });
    if (check.status !== 0) {
      printInfo("Starting Ollama service...");
      const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
      proc.unref();
      await sleep(3000);
    }
  } catch {
    /* continue */
  }

  printOK("Ollama service running");
  console.error("");

  // Pull model
  printInfo(`Downloading model: ${model.model_id}`);
  console.error("  This may take several minutes...");
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1200000,
    windowsHide: true,
  });
  if (pullResult.status !== 0) {
    printError("Failed to download model");
    return false;
  }

  printOK("Model downloaded!");
  return true;
}
