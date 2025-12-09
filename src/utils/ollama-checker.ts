/**
 * Ollama Service Checker and Auto-Starter
 *
 * Automatically checks if Ollama is running and starts it if needed.
 * Provides seamless experience for embedding providers.
 */

import { spawn } from "node:child_process";
import { logger } from "./logger.js";

const OLLAMA_API_URL = "http://127.0.0.1:11434/api/tags";
const OLLAMA_CHECK_TIMEOUT = 2000; // 2s timeout for health check
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
    const response = await fetch(OLLAMA_API_URL, {
      method: "GET",
      signal: AbortSignal.timeout(OLLAMA_CHECK_TIMEOUT),
    });

    if (response.ok) {
      const data = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
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
    logger.info("OllamaChecker", "Attempting to start Ollama service...");

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
    logger.debug("OllamaChecker", `Waiting ${OLLAMA_STARTUP_WAIT}ms for Ollama to start...`);
    await new Promise((resolve) => setTimeout(resolve, OLLAMA_STARTUP_WAIT));

    // Verify it started successfully
    const status = await checkOllamaStatus();
    if (status.isRunning) {
      logger.info("OllamaChecker", "Ollama service started successfully");
      return true;
    }

    logger.warn("OllamaChecker", "Ollama service did not start within timeout");
    return false;
  } catch (error) {
    logger.warn("OllamaChecker", "Failed to start Ollama service", { error: (error as Error).message });
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
    logger.info("OllamaChecker", "Ollama service is running", {
      models: initialStatus.models.length,
      hasGranite: initialStatus.hasGranite,
    });
    return initialStatus;
  }

  if (!autoStart) {
    logger.debug("OllamaChecker", "Ollama not running, auto-start disabled");
    return initialStatus;
  }

  // Try to start Ollama
  logger.info("OllamaChecker", "Ollama not running, attempting auto-start...");
  const started = await startOllamaService();

  if (started) {
    // Check status again after starting
    return await checkOllamaStatus();
  }

  logger.warn(
    "OllamaChecker",
    "Could not auto-start Ollama. Install: https://ollama.com or run 'ollama serve' manually",
  );
  return initialStatus;
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: OllamaStatus): string {
  if (!status.isRunning) {
    return "❌ Ollama не запущен. Эмбеддинги будут использовать memory provider (без ML)";
  }

  if (!status.hasModels) {
    return "⚠️  Ollama запущен, но модели не установлены. Запустите: ollama pull granite-embedding";
  }

  if (status.hasGranite) {
    return `✅ Ollama запущен с granite-embedding (${status.models.length} моделей)`;
  }

  return `⚠️  Ollama запущен, но granite-embedding не найден. Установлено: ${status.models.join(", ")}`;
}
