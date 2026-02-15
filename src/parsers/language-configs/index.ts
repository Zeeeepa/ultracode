/**
 * Language Configuration Module
 *
 * Re-exports all language configurations and utilities.
 * This is the main entry point for language-configs.
 */

export {
  C_CONFIG,
  CPP_CONFIG,
  CSHARP_CONFIG,
  GO_CONFIG,
  JAVA_CONFIG,
  KOTLIN_CONFIG,
  RUST_CONFIG,
  SWIFT_CONFIG,
} from "./compiled-languages/index.js";
// Re-export individual configs for advanced usage
export { JAVASCRIPT_CONFIG, JSX_CONFIG, TSX_CONFIG, TYPESCRIPT_CONFIG } from "./javascript-family/index.js";
export { CSS_CONFIG, HTML_CONFIG, JSON_CONFIG, XML_CONFIG } from "./markup-languages/index.js";
// Re-export Python-specific helpers
export {
  getPythonNodeCategory,
  isAsyncNode,
  isComprehensionNode,
  isContextManagerNode,
  isDecoratorNode,
  isExceptionHandlingNode,
  isGeneratorNode,
  isMagicMethodNode,
  isSpecialClassNode,
} from "./python-helpers.js";
// Re-export registry
export {
  getFileConfig,
  getLanguageConfig,
  isClassNode,
  isExportNode,
  isFunctionNode,
  isImportNode,
  isTypeNode,
  LANGUAGE_CONFIGS,
  validateConfigurations,
} from "./registry.js";
export { BASH_CONFIG, BATCH_CONFIG, POWERSHELL_CONFIG, PYTHON_CONFIG } from "./scripting-languages/index.js";
// Re-export shared utilities
export { FILE_EXTENSIONS, LANGUAGE_KEYWORDS } from "./shared/keywords.js";
// Re-export types
export type { ExtractorConfig, LanguageConfig, NodeTypeConfig } from "./shared/types.js";
export { detectLanguageFromPath, getSupportedExtensions, isFileSupported } from "./shared/utils.js";
