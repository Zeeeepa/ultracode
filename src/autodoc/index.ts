/**
 * AutoDoc Module
 *
 * Automatic documentation layer with semantic search.
 * Provides storage, parsing, and management for code documentation.
 *
 * Architecture References:
 * - RFC: docs/design/documentation-layer-rfc.md
 * - Types: src/autodoc/types.ts
 */

// =============================================================================
// 1. TYPE EXPORTS
// =============================================================================

export * from "./types.js";

// =============================================================================
// 2. STORAGE EXPORTS
// =============================================================================

export {
  AutoDocManager,
  getAutoDocManager,
  resetAutoDocManager,
} from "./storage/autodoc-manager.js";
export { DocStorage } from "./storage/doc-storage.js";
export { RefStorage } from "./storage/ref-storage.js";

// =============================================================================
// 3. PARSER EXPORTS
// =============================================================================

export {
  extractCommentRefs,
  extractReferences,
  generateCodeRef,
  generateDocRef,
  generateEntityRef,
  generateFlowComment,
  generateSeeDocComment,
  generateSeeEntityComment,
  updateLineNumbers,
  validateReference,
} from "./parser/link-extractor.js";
export {
  extractTitle,
  findSectionById,
  findSectionByTitle,
  flattenSections,
  generateMarkdown,
  getSectionPath,
  insertSectionAfter,
  parseMarkdown,
  updateSectionContent,
} from "./parser/md-parser.js";

// =============================================================================
// 4. I18N EXPORTS
// =============================================================================

export {
  aggregateLanguageDetection,
  detectLanguageFromCode,
  detectLanguageFromComments,
  detectLanguageFromText,
  type LanguageDetectionResult,
} from "./i18n/language-detector.js";

export {
  DOC_TYPE_NAMES,
  findSectionKey,
  getAllSectionNames,
  getDocTypeName,
  getPlaceholder,
  getSectionName,
  SECTION_NAMES,
  TEMPLATE_PLACEHOLDERS,
} from "./i18n/section-names.js";

// =============================================================================
// 5. HOOKS EXPORTS
// =============================================================================

export {
  getGitHooksDir,
  getHookStatus,
  type HookInstallResult,
  installPreCommitHook,
  isHookInstalled,
  uninstallHooks,
} from "./hooks/hook-installer.js";
export {
  checkReferenceTarget,
  extractReferences as extractMdReferences,
  formatPreCommitResult,
  getStagedCodeFiles,
  getStagedMdFiles,
  type PreCommitCheckResult,
  runPreCommitCheck,
} from "./hooks/pre-commit-check.js";

// =============================================================================
// 6. SYNC EXPORTS
// =============================================================================

export {
  type FileInfo,
  type FileSyncResult,
  findMarkdownFiles,
  readDocumentFromDisk,
  syncBidirectional,
  syncDbToDisk,
  syncDiskToDb,
  writeDocumentToDisk,
} from "./sync/file-sync.js";

// =============================================================================
// 7. GENERATOR EXPORTS
// =============================================================================

export {
  type GenerateOptions,
  type GenerateResult,
  generateArchitectureDoc,
  generateDocs,
  generateModuleReadme,
  type ModuleInfo,
  scanModules,
} from "./generator/doc-generator.js";

// =============================================================================
// 8. LLM EXPORTS
// =============================================================================

export {
  batchGenerateDocs,
  createLLMProvider,
  detectLLMProviders,
  type GenerateOptions as LLMGenerateOptions,
  generateArchitectureDoc as generateArchitectureDocLLM,
  generateExportDoc,
  generateModuleDoc,
  improveDoc,
  type LLMConfig,
  type LLMProvider,
  type LLMResponse,
  OllamaProvider,
  OpenAIProvider,
  TGIProvider,
} from "./llm/index.js";

// =============================================================================
// 9. WATCHER EXPORTS
// =============================================================================

export {
  AutoDocWatcher,
  type AutoDocWatcherConfig,
  // Updater utils
  diffExports,
  // Module resolver utils
  extractEntitiesFromContent,
  extractExportsFromContent,
  extractExportsFromFile,
  findEntityLine,
  generateExportDescription,
  getAutoDocWatcher,
  getModuleFiles,
  getModuleForFile,
  resetAutoDocWatcher,
  type UpdateOptions,
  updateAutodocContent,
} from "./watcher/index.js";
