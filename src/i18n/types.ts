/**
 * Common i18n types for UI localization
 */

/**
 * Supported UI languages
 */
export type UILanguage = "en" | "ru";

/**
 * All supported languages (for validation)
 */
export const SUPPORTED_LANGUAGES: UILanguage[] = ["en", "ru"];

/**
 * Locale detection result
 */
export interface LocaleConfig {
  /** Detected/selected language */
  language: UILanguage;
  /** How the language was determined */
  source: "system" | "cli" | "config" | "default";
  /** Raw system locale string (e.g., "ru_RU.UTF-8") */
  systemLocale?: string;
}

/**
 * Check if a string is a valid UILanguage
 */
export function isValidLanguage(lang: string): lang is UILanguage {
  return SUPPORTED_LANGUAGES.includes(lang as UILanguage);
}
