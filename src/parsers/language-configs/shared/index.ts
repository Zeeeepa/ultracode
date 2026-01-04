/**
 * Shared Language Configuration Exports
 */

export { FILE_EXTENSIONS, LANGUAGE_KEYWORDS } from "./keywords.js";
export type { ExtractorConfig, LanguageConfig, NodeTypeConfig } from "./types.js";
export { detectLanguageFromPath, getSupportedExtensions, isFileSupported } from "./utils.js";
