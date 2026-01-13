/**
 * Ollama Installation
 */

import { spawn, spawnSync } from "node:child_process";
import { t, ti } from "../i18n/index.js";
import type { EmbeddingModel } from "../setup-types.js";
import { printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { checkOllama, sleep } from "../utils/index.js";

export async function installOllama(model: EmbeddingModel): Promise<boolean> {
  printInfo(t("ollama.setup"));
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
  console.error(`  ${t("install.pull_progress")}`);
  console.error("");

  const pullResult = spawnSync("ollama", ["pull", model.model_id], {
    stdio: "inherit",
    timeout: 1200000,
    windowsHide: true,
  });
  if (pullResult.status !== 0) {
    printError(t("install.model_failed"));
    return false;
  }

  printOK(t("install.model_downloaded"));
  return true;
}
