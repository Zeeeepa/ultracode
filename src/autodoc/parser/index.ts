/**
 * AutoDoc Parser Module
 *
 * Markdown parsing and reference extraction.
 */

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
} from "./link-extractor.js";
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
} from "./md-parser.js";
