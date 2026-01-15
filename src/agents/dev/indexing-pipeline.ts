/**
 * Indexing Pipeline - Modular phases for DevAgent indexing
 *
 * Разбивает огромную функцию performRealIndexing (876 строк, complexity 889)
 * на маленькие понятные фазы для улучшения читаемости и поддержки.
 *
 * @see src/agents/dev-agent.ts - оригинальная функция performRealIndexing
 */

import { statSync } from "node:fs";
import { log } from "../../logging/index.js";
import { getGraphStorage } from "../../storage/graph-storage-factory.js";
import { toError } from "../../utils/error-handling.js";
import { collectFiles } from "./file-collector.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Параметры индексации
 */
export interface IndexingOptions {
  directory: string;
  excludePatterns?: string[];
  incremental?: boolean;
  agentId: string;
}

/**
 * Контекст индексации (передаётся между фазами)
 */
export interface IndexingContext {
  directory: string;
  excludePatterns: string[];
  isIncremental: boolean;
  agentId: string;
  allFiles: string[];
  deletedEntityIds: string[];
}

/**
 * Результат анализа изменений
 */
export interface ChangeAnalysis {
  changedFiles: string[];
  newFiles: string[];
  deletedFiles: string[];
  unchangedFiles: string[];
}

/**
 * Результат индексации
 */
export interface IndexingResult {
  filesProcessed: number;
  entitiesExtracted: number;
  relationshipsCreated: number;
  totalFiles: number;
  deletedEntities?: number;
}

/**
 * Результат сохранения в граф
 */
export interface SaveResult {
  entityCount: number;
  relationshipCount: number;
}

/**
 * Результат генерации embeddings
 */
export interface EmbeddingResult {
  count: number;
  skipped: number;
}

// =============================================================================
// PHASE 1: ИНИЦИАЛИЗАЦИЯ
// =============================================================================

/**
 * Инициализация и валидация параметров индексации
 *
 * @param options - Параметры индексации
 * @returns Контекст индексации
 */
export function initializeIndexing(options: IndexingOptions): IndexingContext {
  const { directory, excludePatterns = [], incremental = false, agentId } = options;

  log.i("DEVAGENT", "Starting indexing", {
    directory,
    excludePatternsCount: excludePatterns.length,
    samplePatterns: excludePatterns.slice(0, 5),
  });

  // Собрать файлы для индексации
  const collectResult = collectFiles(directory, { excludePatterns, agentId });
  const allFiles = collectResult.files;

  log.i("DEVAGENT", "Files collected", { count: allFiles.length });

  return {
    directory,
    excludePatterns,
    isIncremental: incremental,
    agentId,
    allFiles,
    deletedEntityIds: [],
  };
}

// =============================================================================
// PHASE 2: АНАЛИЗ ИЗМЕНЕНИЙ (для инкрементальной индексации)
// =============================================================================

/**
 * Определить изменённые, новые и удалённые файлы
 *
 * @param context - Контекст индексации
 * @returns Анализ изменений или null если не инкрементальная индексация
 */
export async function detectChangedFiles(context: IndexingContext): Promise<ChangeAnalysis | null> {
  if (!context.isIncremental || context.allFiles.length === 0) {
    return null;
  }

  const storage = await getGraphStorage();
  const indexedFiles = await storage.getAllIndexedFiles();

  if (indexedFiles.size === 0) {
    // Нет индексированных файлов - это первая индексация
    return {
      changedFiles: [],
      newFiles: context.allFiles,
      deletedFiles: [],
      unchangedFiles: [],
    };
  }

  const changedFiles: string[] = [];
  const newFiles: string[] = [];
  const unchangedFiles: string[] = [];

  // Найти изменённые и новые файлы
  for (const file of context.allFiles) {
    const normalizedPath = file.replace(/\\/g, "/");
    const lastIndexed = indexedFiles.get(normalizedPath);

    if (lastIndexed === undefined) {
      // Новый файл
      newFiles.push(file);
    } else {
      // Проверить изменение
      try {
        const stats = statSync(file);
        const mtime = stats.mtimeMs;
        if (mtime > lastIndexed) {
          changedFiles.push(file);
        } else {
          unchangedFiles.push(file);
        }
      } catch {
        // Не удалось получить stats, пропустить
        unchangedFiles.push(file);
      }
    }
  }

  // Найти удалённые файлы (есть в индексе, но нет на диске)
  const currentFilesSet = new Set(context.allFiles.map((file) => file.replace(/\\/g, "/")));
  const deletedFiles: string[] = [];

  for (const [indexedPath] of indexedFiles) {
    if (!currentFilesSet.has(indexedPath)) {
      deletedFiles.push(indexedPath);
    }
  }

  log.i("DEVAGENT", "Smart incremental analysis", {
    total: context.allFiles.length,
    changed: changedFiles.length,
    new: newFiles.length,
    deleted: deletedFiles.length,
    unchanged: unchangedFiles.length,
  });

  return {
    changedFiles,
    newFiles,
    deletedFiles,
    unchangedFiles,
  };
}

// =============================================================================
// PHASE 3: ОЧИСТКА УСТАРЕВШИХ ENTITIES
// =============================================================================

/**
 * Удалить entities для изменённых и удалённых файлов
 *
 * @param filesToClean - Список файлов для очистки
 * @returns Массив ID удалённых entities
 */
export async function cleanStaleEntities(filesToClean: string[]): Promise<string[]> {
  if (filesToClean.length === 0) {
    return [];
  }

  log.i("DEVAGENT", "Cleaning stale entities", {
    fileCount: filesToClean.length,
  });

  const storage = await getGraphStorage();
  const deletedEntityIds: string[] = [];

  for (const file of filesToClean) {
    try {
      const ids = await storage.deleteEntitiesByFilePath(file);
      deletedEntityIds.push(...ids);
      await storage.deleteFileInfo(file);
    } catch (error: unknown) {
      const err = toError(error);
      log.w("DEVAGENT", "Failed to clean entities for file", {
        file,
        error: err.message,
        stack: err.stack,
      });
    }
  }

  log.i("DEVAGENT", "Entities cleaned", {
    entityCount: deletedEntityIds.length,
  });

  return deletedEntityIds;
}

// =============================================================================
// PHASE 4: ПРИМЕНИТЬ РЕЗУЛЬТАТЫ АНАЛИЗА
// =============================================================================

/**
 * Применить результаты анализа изменений к контексту
 * Обновляет список файлов для обработки и удаляет устаревшие entities
 *
 * @param context - Контекст индексации
 * @param analysis - Анализ изменений
 * @returns Обновлённый контекст
 */
export async function applyChangeAnalysis(
  context: IndexingContext,
  analysis: ChangeAnalysis,
): Promise<IndexingContext> {
  // Удалить entities для изменённых и удалённых файлов
  const filesToClean = [...analysis.changedFiles, ...analysis.deletedFiles];
  const deletedEntityIds = await cleanStaleEntities(filesToClean);

  // Обновить список файлов для обработки (только изменённые и новые)
  const filesToProcess = [...analysis.changedFiles, ...analysis.newFiles];

  log.i("DEVAGENT", "Files to process after analysis", {
    toProcess: filesToProcess.length,
    entitiesDeleted: deletedEntityIds.length,
  });

  // Если нет файлов для обработки, вернуть пустой контекст
  if (filesToProcess.length === 0) {
    log.i("DEVAGENT", "No files changed, skipping indexing");
  }

  return {
    ...context,
    allFiles: filesToProcess,
    deletedEntityIds,
  };
}

// =============================================================================
// PHASE 5: РАЗДЕЛЕНИЕ ФАЙЛОВ
// =============================================================================

/**
 * Результат разделения файлов
 */
export interface FileSeparationResult {
  codeFiles: string[];
  dataFiles: string[];
}

/**
 * Разделить файлы на code и data по расширению
 *
 * @param files - Список файлов
 * @returns Разделённые файлы
 */
export function separateCodeAndDataFiles(files: string[]): FileSeparationResult {
  const codeFiles: string[] = [];
  const dataFiles: string[] = [];

  // Import from local module
  const { extname } = require("node:path");
  const { isCodeExtension } = require("./file-extensions.js");

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (isCodeExtension(ext)) {
      codeFiles.push(file);
    } else {
      dataFiles.push(file);
    }
  }

  log.i("DEVAGENT", "Files separated", {
    codeFiles: codeFiles.length,
    dataFiles: dataFiles.length,
  });

  return {
    codeFiles,
    dataFiles,
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Проверить, нужна ли инкрементальная индексация
 *
 * @param context - Контекст индексации
 * @returns true если инкрементальная индексация применима
 */
export function shouldUseIncrementalMode(context: IndexingContext): boolean {
  return context.isIncremental && context.allFiles.length > 0;
}

/**
 * Построить результат индексации
 *
 * @param context - Контекст индексации
 * @param filesProcessed - Количество обработанных файлов
 * @param totalEntities - Количество извлечённых entities
 * @param totalRelationships - Количество созданных relationships
 * @returns Результат индексации
 */
export function buildIndexingResult(
  context: IndexingContext,
  filesProcessed: number,
  totalEntities: number,
  totalRelationships: number,
): IndexingResult {
  return {
    filesProcessed,
    entitiesExtracted: totalEntities,
    relationshipsCreated: totalRelationships,
    totalFiles: context.allFiles.length,
    deletedEntities: context.deletedEntityIds.length,
  };
}
