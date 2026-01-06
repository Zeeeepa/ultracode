/**
 * Ollama Service Checker and Auto-Starter
 *
 * Automatically checks if Ollama is running and starts it if needed.
 * Provides seamless experience for embedding providers.
 */

import { spawn } from "node:child_process";
import { log } from "../logging/index.js";

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const OLLAMA_API_URL = "http://127.0.0.1:11434/api/tags";
const OLLAMA_STARTUP_WAIT = 5000; // 5s wait after starting Ollama

export interface OllamaStatus {
  isRunning: boolean;
  hasModels: boolean;
  models: string[];
  hasGranite: boolean;
}

/**
 * Check if Ollama service is running and available
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    // CRITICAL: Don't use AbortSignal.timeout() - can crash Bun with native modules
    // Use a simple fetch with no timeout
    const response = await fetch(OLLAMA_API_URL, {
      method: "GET",
    });

    if (response.ok) {
      const data = (await response.json()) as { models?: Array<{ name?: string | undefined; model?: string }> };
      const models = data.models || [];
      const modelNames = models.map((m) => m.name || m.model || "").filter(Boolean);
      const hasGranite = modelNames.some((name) => name.includes("granite-embedding"));

      return {
        isRunning: true,
        hasModels: models.length > 0,
        models: modelNames,
        hasGranite,
      };
    }
  } catch (_error) {
    // Ollama not available
  }

  return {
    isRunning: false,
    hasModels: false,
    models: [],
    hasGranite: false,
  };
}

/**
 * Attempt to start Ollama service in background
 * @returns true if successfully started, false otherwise
 */
export async function startOllamaService(): Promise<boolean> {
  try {
    log.i("OLLAMA", "start_attempt");

    // Start Ollama in background (detached mode)
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      shell: true,
      windowsHide: true, // Hide console window on Windows
    });

    // Unref so parent can exit independently
    child.unref();

    // Wait for Ollama to start
    log.d("OLLAMA", "waiting_startup", { wait_ms: OLLAMA_STARTUP_WAIT });
    await sleep(OLLAMA_STARTUP_WAIT);

    // Verify it started successfully
    const status = await checkOllamaStatus();
    if (status.isRunning) {
      log.i("OLLAMA", "service_started");
      return true;
    }

    log.w("OLLAMA", "start_timeout");
    return false;
  } catch (error) {
    log.w("OLLAMA", "start_failed", { error: (error as Error).message });
    return false;
  }
}

/**
 * Ensure Ollama is running, start if needed
 * @param autoStart - Whether to automatically start Ollama if not running
 * @returns Status of Ollama service
 */
export async function ensureOllamaRunning(autoStart = true): Promise<OllamaStatus> {
  const initialStatus = await checkOllamaStatus();

  if (initialStatus.isRunning) {
    log.i("OLLAMA", "service_running", {
      models: initialStatus.models.length,
      has_granite: initialStatus.hasGranite,
    });
    return initialStatus;
  }

  if (!autoStart) {
    log.d("OLLAMA", "autostart_disabled");
    return initialStatus;
  }

  // Try to start Ollama
  log.i("OLLAMA", "autostart_begin");
  const started = await startOllamaService();

  if (started) {
    // Check status again after starting
    return await checkOllamaStatus();
  }

  log.w("OLLAMA", "autostart_failed", { hint: "install from ollama.com or run 'ollama serve'" });
  return initialStatus;
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: OllamaStatus): string {
  if (!status.isRunning) {
    return "❌ Ollama не запущен. Запустите setup-embedding для настройки провайдера эмбеддингов";
  }

  if (!status.hasModels) {
    return "⚠️  Ollama запущен, но модели не установлены. Запустите: ollama pull granite-embedding";
  }

  if (status.hasGranite) {
    return `✅ Ollama запущен с granite-embedding (${status.models.length} моделей)`;
  }

  return `⚠️  Ollama запущен, но granite-embedding не найден. Установлено: ${status.models.join(", ")}`;
}
