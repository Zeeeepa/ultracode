/**
 * i18n module for setup command
 *
 * Provides translation functions:
 * - t("key.path") - get string by key path
 * - ti("key.path", { param: value }) - get string with interpolation
 * - ta("key.path") - get array by key path
 */

import type { UILanguage } from "../../../i18n/types.js";
import { en } from "./en.js";
import { ru } from "./ru.js";
import type { SetupStrings } from "./types.js";

// All translations
const translations: Record<UILanguage, SetupStrings> = { en, ru };

// Current language (default: en)
let currentLanguage: UILanguage = "en";

/**
 * Set the current language for setup UI
 */
export function setSetupLanguage(lang: UILanguage): void {
  currentLanguage = lang;
}

/**
 * Get the current language
 */
export function getSetupLanguage(): UILanguage {
  return currentLanguage;
}

/**
 * Get translated string by key path
 *
 * @example
 * t("provider.title") // "Выбор провайдера embeddings"
 * t("model.recommended") // "[РЕКОМЕНДУЕТСЯ]"
 */
export function t(keyPath: string): string {
  const keys = keyPath.split(".");
  let value: unknown = translations[currentLanguage];

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      value = undefined;
      break;
    }
  }

  // Fallback to English if not found
  if (value === undefined) {
    value = translations.en;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        value = undefined;
        break;
      }
    }
  }

  // Return key if still not found (helps debugging)
  if (typeof value !== "string") {
    return keyPath;
  }

  return value;
}

/**
 * Get translated string with interpolation
 *
 * @example
 * ti("provider.selected", { name: "vLLM" }) // "Выбран провайдер: vLLM"
 * ti("model.no_models", { provider: "tei", language: "en" })
 */
export function ti(keyPath: string, params: Record<string, string | number>): string {
  let text = t(keyPath);

  for (const [key, val] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
  }

  return text;
}

/**
 * Get translated array by key path
 *
 * @example
 * ta("provider.vllm.pros") // ["Самый быстрый", "NVIDIA GPU ускорение", ...]
 * ta("llm.claude.cons") // ["Платный (Haiku ~$0.04/100 модулей)"]
 */
export function ta(keyPath: string): string[] {
  const keys = keyPath.split(".");
  let value: unknown = translations[currentLanguage];

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      value = undefined;
      break;
    }
  }

  // Fallback to English if not found
  if (!Array.isArray(value)) {
    value = translations.en;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        value = undefined;
        break;
      }
    }
  }

  // Return empty array if not found
  return Array.isArray(value) ? value : [];
}

/**
 * Get all strings for current language (for direct access)
 */
export function getStrings(): SetupStrings {
  return translations[currentLanguage];
}

// Re-export types
export type { SetupStrings } from "./types.js";
