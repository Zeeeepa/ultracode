/**
 * AutoDoc Watcher Module
 *
 * Exports for the AutoDoc file watching and incremental update system.
 */

export {
  diffExports,
  generateExportDescription,
  type UpdateOptions,
  updateAutodocContent,
} from "./autodoc-updater.js";
export {
  AutoDocWatcher,
  type AutoDocWatcherConfig,
  getAutoDocWatcher,
  resetAutoDocWatcher,
} from "./autodoc-watcher.js";
export {
  extractEntitiesFromContent,
  extractExportsFromContent,
  extractExportsFromFile,
  findEntityLine,
  getModuleFiles,
  getModuleForFile,
} from "./module-resolver.js";
