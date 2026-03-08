/**
 * Language Configuration Registry
 *
 * Central registry for all language configurations with lookup functions.
 */

import { log } from "../../logging/index.js";
import type { SupportedLanguage } from "../../types/parser.js";
import {
  C_CONFIG,
  CPP_CONFIG,
  CSHARP_CONFIG,
  GO_CONFIG,
  JAVA_CONFIG,
  KOTLIN_CONFIG,
  RUST_CONFIG,
  SWIFT_CONFIG,
  ZIG_CONFIG,
} from "./compiled-languages/index.js";
import { GRAPHQL_CONFIG, HELM_CONFIG, PROTOBUF_CONFIG } from "./infrastructure/index.js";
// Import all language configurations
import { JAVASCRIPT_CONFIG, JSX_CONFIG, TSX_CONFIG, TYPESCRIPT_CONFIG } from "./javascript-family/index.js";
import { CSS_CONFIG, HTML_CONFIG, JSON_CONFIG, XML_CONFIG } from "./markup-languages/index.js";
import { BASH_CONFIG, BATCH_CONFIG, POWERSHELL_CONFIG, PYTHON_CONFIG } from "./scripting-languages/index.js";
import type { LanguageConfig } from "./shared/types.js";
import { detectLanguageFromPath } from "./shared/utils.js";

/**
 * Language configuration registry
 */
export const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  javascript: JAVASCRIPT_CONFIG,
  typescript: TYPESCRIPT_CONFIG,
  jsx: JSX_CONFIG,
  tsx: TSX_CONFIG,
  python: PYTHON_CONFIG,
  c: C_CONFIG,
  cpp: CPP_CONFIG,
  csharp: CSHARP_CONFIG,
  rust: RUST_CONFIG,
  go: GO_CONFIG,
  java: JAVA_CONFIG,
  kotlin: KOTLIN_CONFIG,
  swift: SWIFT_CONFIG,
  css: CSS_CONFIG,
  html: HTML_CONFIG,
  xml: XML_CONFIG,
  bash: BASH_CONFIG,
  powershell: POWERSHELL_CONFIG,
  batch: BATCH_CONFIG,
  json: JSON_CONFIG,
  zig: ZIG_CONFIG,
  helm: HELM_CONFIG,
  protobuf: PROTOBUF_CONFIG,
  graphql: GRAPHQL_CONFIG,
};

/**
 * Get configuration for a language
 */
export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  return LANGUAGE_CONFIGS[language];
}

/**
 * Get configuration for a file
 */
export function getFileConfig(filePath: string): LanguageConfig {
  const language = detectLanguageFromPath(filePath);
  return getLanguageConfig(language);
}

/**
 * Check if a node type represents a function
 */
export function isFunctionNode(nodeType: string, language: SupportedLanguage): boolean {
  const config = getLanguageConfig(language);
  return config.nodeTypes.functions.includes(nodeType);
}

/**
 * Check if a node type represents a class
 */
export function isClassNode(nodeType: string, language: SupportedLanguage): boolean {
  const config = getLanguageConfig(language);
  return config.nodeTypes.classes.includes(nodeType);
}

/**
 * Check if a node type represents an import
 */
export function isImportNode(nodeType: string, language: SupportedLanguage): boolean {
  const config = getLanguageConfig(language);
  return config.nodeTypes.imports.includes(nodeType);
}

/**
 * Check if a node type represents an export
 */
export function isExportNode(nodeType: string, language: SupportedLanguage): boolean {
  const config = getLanguageConfig(language);
  return config.nodeTypes.exports.includes(nodeType);
}

/**
 * Check if a node type represents a type definition
 */
export function isTypeNode(nodeType: string, language: SupportedLanguage): boolean {
  const config = getLanguageConfig(language);
  return config.nodeTypes.types.includes(nodeType) || config.nodeTypes.interfaces.includes(nodeType);
}

/**
 * Validate language configurations on startup
 */
export function validateConfigurations(): boolean {
  log.d("LANGCONFIG", "validate_start");

  for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
    if (!config.language || !config.extensions.length) {
      log.e("LANGCONFIG", "invalid_config", { lang });
      return false;
    }
  }

  log.i("LANGCONFIG", "validate_done");
  return true;
}
