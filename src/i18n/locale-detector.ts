/**
 * System locale detection for UI language selection
 *
 * Detection priority:
 * 1. CLI override (--lang ru/en)
 * 2. Environment variables (LANG, LC_ALL, LC_MESSAGES) - Linux/macOS/WSL
 * 3. Intl API - Windows native locale
 * 4. Default fallback (en)
 */

import { isValidLanguage, type LocaleConfig, type UILanguage } from "./types.js";

/**
 * Parse locale string to extract language code
 * Handles formats: "ru_RU.UTF-8", "ru-RU", "ru", "Russian_Russia"
 */
function parseLocaleString(locale: string): UILanguage | null {
  if (!locale) return null;

  const lower = locale.toLowerCase();

  // Russian patterns
  if (lower.startsWith("ru") || lower.includes("russian") || lower.includes("russia")) {
    return "ru";
  }

  // English patterns
  if (
    lower.startsWith("en") ||
    lower.includes("english") ||
    lower.includes("united states") ||
    lower.includes("united kingdom")
  ) {
    return "en";
  }

  return null;
}

/**
 * Detect system locale from environment variables
 * Works on Linux, macOS, and WSL
 */
function detectFromEnvironment(): { language: UILanguage; locale: string } | null {
  // Check environment variables in order of specificity
  const envVars = ["LC_ALL", "LC_MESSAGES", "LANG"];

  for (const varName of envVars) {
    const value = process.env[varName];
    if (value) {
      const lang = parseLocaleString(value);
      if (lang) {
        return { language: lang, locale: value };
      }
    }
  }

  return null;
}

/**
 * Detect system locale using Intl API
 * Works on Windows and modern Node.js
 */
function detectFromIntlAPI(): { language: UILanguage; locale: string } | null {
  try {
    // Get system locale from Intl API
    const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (systemLocale) {
      const lang = parseLocaleString(systemLocale);
      if (lang) {
        return { language: lang, locale: systemLocale };
      }
    }
  } catch {
    // Intl API not available or failed
  }

  return null;
}

/**
 * Detect system locale with optional CLI override
 *
 * @param cliOverride - Language specified via CLI flag (--lang ru)
 * @returns Locale configuration with detected language and source
 *
 * @example
 * ```typescript
 * // Auto-detect from system
 * const config = detectSystemLocale();
 *
 * // With CLI override
 * const config = detectSystemLocale("ru");
 * ```
 */
export function detectSystemLocale(cliOverride?: string): LocaleConfig {
  // 1. CLI override has highest priority
  if (cliOverride && isValidLanguage(cliOverride)) {
    return {
      language: cliOverride,
      source: "cli",
    };
  }

  // 2. Try environment variables (Linux/macOS/WSL)
  const envResult = detectFromEnvironment();
  if (envResult) {
    return {
      language: envResult.language,
      source: "system",
      systemLocale: envResult.locale,
    };
  }

  // 3. Try Intl API (Windows)
  const intlResult = detectFromIntlAPI();
  if (intlResult) {
    return {
      language: intlResult.language,
      source: "system",
      systemLocale: intlResult.locale,
    };
  }

  // 4. Default fallback
  return {
    language: "en",
    source: "default",
  };
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(lang: UILanguage): string {
  const names: Record<UILanguage, string> = {
    en: "English",
    ru: "Русский",
  };
  return names[lang] || lang;
}
