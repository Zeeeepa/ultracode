/**
 * AutoDoc LLM Module
 *
 * Provides LLM integration for documentation generation.
 */

export {
  batchGenerateDocs,
  generateArchitectureDoc,
  generateExportDoc,
  generateModuleDoc,
  improveDoc,
} from "./doc-writer.js";
export {
  createLLMProvider,
  detectLLMProviders,
  type GenerateOptions,
  type LLMConfig,
  type LLMProvider,
  type LLMResponse,
  OllamaProvider,
  OpenAIProvider,
  TGIProvider,
} from "./llm-provider.js";
