/**
 * AutoDoc Generator Module
 */

export {
  type BatchResult,
  computeDirectoryHash,
  type DirectorySummaryEntity,
  detectChangeKind,
  generateDirectorySummary,
  mergeNewEntities,
  postProcessLlmOutput,
  readCodeSnippets,
} from "./batch-autodoc.js";
export {
  type GenerateOptions,
  type GenerateResult,
  generateArchitectureDoc,
  generateDocs,
  generateModuleReadme,
  type ModuleInfo,
  scanModules,
} from "./doc-generator.js";
