/**
 * Incremental Indexer - Модуль для инкрементальной индексации изменённых файлов
 *
 * Упрощает handleIncrementalReindex (224 строки, complexity 31)
 * в понятные модульные функции.
 *
 * @see src/agents/dev-agent.ts - оригинальная функция handleIncrementalReindex
 */

import { extname } from "node:path";
import type { EmbeddingConfigResolved } from "../../config/yaml-config.js";
import { log } from "../../logging/index.js";
import { toError } from "../../utils/error-handling.js";
import type { IndexerAgent } from "../indexer-agent.js";
import type { ParserAgent } from "../parser-agent.js";
import type { ProviderKind } from "../semantic/provider-config.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Результат разделения файлов
 */
export interface FileSeparationResult {
  supportedFiles: string[];
  otherFiles: string[];
}

/**
 * Результат обработки файлов
 */
export interface ProcessingResult {
  successCount: number;
  errorCount: number;
  elapsedMs: number;
}

/**
 * Поддерживаемые расширения для полного парсинга
 */
const SUPPORTED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".swift",
];

// =============================================================================
// FILE SEPARATION
// =============================================================================

/**
 * Разделить файлы на поддерживаемые (полный парсинг) и остальные (heuristic)
 *
 * @param files - Список файлов для обработки
 * @returns Разделённые файлы
 */
export function separateFilesBySupport(files: string[]): FileSeparationResult {
  const supportedFiles: string[] = [];
  const otherFiles: string[] = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      supportedFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  }

  log.i("DEVAGENT", "reindex_breakdown", {
    supported: supportedFiles.length,
    heuristic: otherFiles.length,
    supportedSample: supportedFiles.slice(0, 3).map((f) => {
      const parts = f.split(/[\\/]/);
      return parts[parts.length - 1];
    }),
  });

  return {
    supportedFiles,
    otherFiles,
  };
}

// =============================================================================
// EMBEDDING CONFIGURATION
// =============================================================================

/**
 * Контекст для настройки embeddings
 */
export interface EmbeddingSetupContext {
  parserAgent: ParserAgent;
  currentDir: string;
}

/**
 * Настроить vector provider для инкрементальной индексации
 *
 * @param context - Контекст с parser agent и директорией
 * @returns true если успешно настроено
 */
export async function setupVectorProvider(context: EmbeddingSetupContext): Promise<boolean> {
  try {
    const { ConfigLoader } = await import("../../config/yaml-config.js");
    const { getProjectHash, getCurrentGitBranchOrDefault } = await import("../../shared/storage-paths.js");

    const configLoader = ConfigLoader.getInstance();
    const embConfig = configLoader.getEmbeddingConfig();
    const useLayeredIndex = embConfig.useLayeredIndex;

    const projectHash = getProjectHash(context.currentDir);
    const currentBranch = getCurrentGitBranchOrDefault(context.currentDir);

    if (useLayeredIndex) {
      const { getLayeredFaissProvider } = await import("../../semantic/faiss/layered-faiss-provider.js");
      const provider = getLayeredFaissProvider();

      // Check initialization
      if (!provider.initialized) {
        await provider.initialize(context.currentDir, projectHash, currentBranch);
      }

      context.parserAgent.setVectorProvider(provider);
      log.i("DEVAGENT", "incr_vector_provider", {
        branch: currentBranch,
        layered: true,
      });
    } else {
      const { initializeFaissProvider } = await import("../../semantic/faiss/faiss-provider.js");
      const provider = await initializeFaissProvider();

      if (provider) {
        await provider.setProjectContext(projectHash, currentBranch);
        context.parserAgent.setVectorProvider(provider);
        log.i("DEVAGENT", "incr_vector_provider", {
          branch: currentBranch,
          layered: false,
        });
      }
    }

    return true;
  } catch (error: unknown) {
    const err = toError(error);
    log.w("DEVAGENT", "incr_vector_provider_fail", {
      error: err.message,
      stack: err.stack,
    });
    return false;
  }
}

/**
 * Настроить EmbeddingGenerator для централизованного режима
 *
 * @param parserAgent - Parser agent для настройки
 * @param embeddingConfig - Конфигурация embeddings
 * @returns true если успешно настроено
 */
export async function setupEmbeddingGenerator(
  parserAgent: ParserAgent,
  embeddingConfig: EmbeddingConfigResolved,
): Promise<boolean> {
  if (!embeddingConfig.enabled) {
    return false;
  }

  try {
    const { EmbeddingGenerator } = await import("../../semantic/embedding-generator.js");
    const { buildEmbeddingGeneratorOptions } = await import("../semantic/provider-config.js");
    const { loadSemanticConfig } = await import("../../utils/config-paths.js");
    const { getConfig } = await import("../../config/yaml-config.js");

    const semanticConfig = loadSemanticConfig();
    const yamlConfig = getConfig();

    // Get batch size from provider-specific config or use default
    const batchSize = embeddingConfig.openai?.maxBatchSize || embeddingConfig.cloudru?.maxBatchSize || 32; // Default batch size

    const generatorOptions = buildEmbeddingGeneratorOptions(
      embeddingConfig.provider as ProviderKind,
      embeddingConfig.model,
      batchSize,
      semanticConfig,
      yamlConfig,
    );

    const embeddingGenerator = new EmbeddingGenerator(generatorOptions);
    await embeddingGenerator.initialize();

    await parserAgent.setEmbeddingGenerator(embeddingGenerator);

    log.i("DEVAGENT", "incr_embedding_generator", {
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
    });

    return true;
  } catch (error: unknown) {
    const err = toError(error);
    log.w("DEVAGENT", "incr_embedding_generator_fail", {
      error: err.message,
      stack: err.stack,
    });
    return false;
  }
}

// =============================================================================
// PROCESSING
// =============================================================================

/**
 * Обработать поддерживаемые файлы через parser
 *
 * @param files - Список файлов
 * @param parserAgent - Parser agent
 * @param indexerAgent - Indexer agent
 * @returns Количество успехов и ошибок
 */
export async function processSupportedFiles(
  files: string[],
  parserAgent: ParserAgent,
  indexerAgent: IndexerAgent,
): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0;
  let errorCount = 0;

  if (files.length === 0) {
    return { successCount, errorCount };
  }

  try {
    log.i("DEVAGENT", "incr_parseBatch_start", { files: files.length });
    const parseResults = await parserAgent.parseBatch(files, {});
    log.i("DEVAGENT", "incr_parseBatch_done", {
      files: files.length,
      results: parseResults.length,
    });

    for (const parseResult of parseResults) {
      if (parseResult.entities && parseResult.entities.length > 0) {
        try {
          await indexerAgent.indexEntities(parseResult.entities, parseResult.filePath, parseResult.relationships);
          successCount++;
        } catch (error: unknown) {
          const err = toError(error);
          log.e("DEVAGENT", "index_fail", {
            file: parseResult.filePath,
            err: err.message,
            stack: err.stack,
          });
          errorCount++;
        }
      }
    }
  } catch (error: unknown) {
    const err = toError(error);
    log.e("DEVAGENT", "batch_parse_fail", {
      files: files.length,
      err: err.message,
      stack: err.stack,
    });
    errorCount += files.length;
  }

  return { successCount, errorCount };
}

/**
 * Обработать неподдерживаемые файлы через heuristic parser
 *
 * @param files - Список файлов
 * @param indexerAgent - Indexer agent
 * @returns Количество успехов и ошибок
 */
export async function processHeuristicFiles(
  files: string[],
  indexerAgent: IndexerAgent,
): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0;
  let errorCount = 0;

  const { createHeuristicEntities } = await import("./heuristic-parser.js");

  for (const filePath of files) {
    try {
      const heuristicResult = createHeuristicEntities(filePath);
      if (heuristicResult.entities.length > 0) {
        await indexerAgent.indexEntities(heuristicResult.entities, filePath, heuristicResult.relationships);
        successCount++;
      }
    } catch (error: unknown) {
      const err = toError(error);
      log.e("DEVAGENT", "heuristic_fail", {
        file: filePath,
        err: err.message,
        stack: err.stack,
      });
      errorCount++;
    }
  }

  return { successCount, errorCount };
}

// =============================================================================
// FLUSH EMBEDDINGS
// =============================================================================

/**
 * Flush pending embeddings to FAISS index
 *
 * @param parserAgent - Parser agent with accumulator
 * @returns true если успешно
 */
export async function flushPendingEmbeddings(parserAgent: ParserAgent): Promise<boolean> {
  const accumulator = parserAgent.getAccumulator();
  if (!accumulator) {
    return false;
  }

  const pendingCount = accumulator.getPendingCount();
  if (pendingCount === 0) {
    return true;
  }

  log.i("DEVAGENT", "Flushing incremental embeddings to FAISS", {
    pending: pendingCount,
  });

  try {
    const flushed = await accumulator.flush();
    log.i("DEVAGENT", "Incremental embeddings flushed", { flushed });

    // Save index to disk
    await saveIndexToDisk();

    return true;
  } catch (error: unknown) {
    const err = toError(error);
    log.e("DEVAGENT", "Failed to flush incremental embeddings", {
      error: err.message,
      stack: err.stack,
    });
    return false;
  }
}

/**
 * Сохранить FAISS index на диск
 */
async function saveIndexToDisk(): Promise<void> {
  try {
    const { ConfigLoader } = await import("../../config/yaml-config.js");
    const configLoader = ConfigLoader.getInstance();
    const embConfig = configLoader.getEmbeddingConfig();
    const useLayeredIndex = embConfig.useLayeredIndex;

    if (useLayeredIndex) {
      const { getLayeredFaissProvider } = await import("../../semantic/faiss/layered-faiss-provider.js");
      const provider = getLayeredFaissProvider();

      if (provider.initialized) {
        await provider.save();
        log.i("DEVAGENT", "Saved layered FAISS index after incremental");
      }
    }
  } catch (error: unknown) {
    const err = toError(error);
    log.w("DEVAGENT", "Failed to save FAISS index after incremental", {
      error: err.message,
      stack: err.stack,
    });
  }
}
