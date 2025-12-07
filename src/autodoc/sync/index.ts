/**
 * AutoDoc Sync Module
 *
 * Provides bidirectional synchronization between .md files and SQLite database.
 */

export {
  type FileInfo,
  type FileSyncResult,
  findMarkdownFiles,
  readDocumentFromDisk,
  syncBidirectional,
  syncDbToDisk,
  syncDiskToDb,
  writeDocumentToDisk,
} from "./file-sync.js";
