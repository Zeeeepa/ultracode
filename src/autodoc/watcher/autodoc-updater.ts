/**
 * AutoDoc Updater
 *
 * Incrementally updates AUTODOC.md content based on code changes.
 * Updates:
 * - Export list (adds new, removes deleted)
 * - File list
 * - Line number references
 * - Timestamps
 */

import path from "node:path";
import { fileExists, readText } from "../../utils/file-ops.js";
import type { ModuleInfo } from "../generator/doc-generator.js";
import { extractEntitiesFromContent, extractExportsFromFile, getModuleFiles } from "./module-resolver.js";

export interface UpdateOptions {
  /** Use LLM for description generation */
  useLlm?: boolean;
  /** LLM config */
  llmConfig?: {
    provider: "ollama" | "openai" | "tgi";
    model?: string;
    endpoint?: string;
  };
}

interface ParsedAutodoc {
  title: string;
  description: string;
  sections: Map<string, string>;
  rawContent: string;
}

/**
 * Update AUTODOC.md content incrementally
 */
export async function updateAutodocContent(
  currentContent: string,
  moduleInfo: ModuleInfo,
  changedFiles: string[],
  _options: UpdateOptions = {},
): Promise<string> {
  // Parse current AUTODOC structure
  const parsed = parseAutodoc(currentContent);

  // Get fresh module data
  const freshExports = await extractExportsFromFile(path.join(moduleInfo.path, "index.ts"));
  const freshFiles = await getModuleFiles(moduleInfo.path);

  // Update sections
  let updatedContent = currentContent;

  // 1. Update exports section
  updatedContent = updateExportsSection(updatedContent, freshExports, parsed);

  // 2. Update files section
  updatedContent = updateFilesSection(updatedContent, freshFiles, parsed);

  // 3. Update line number references in changed files
  for (const changedFile of changedFiles) {
    if (changedFile === "force-update") continue;
    updatedContent = await updateLineReferences(updatedContent, changedFile, moduleInfo.path);
  }

  // 4. Update timestamp if content changed
  if (updatedContent !== currentContent) {
    updatedContent = updateTimestamp(updatedContent);
  }

  return updatedContent;
}

/**
 * Parse AUTODOC.md into sections
 */
function parseAutodoc(content: string): ParsedAutodoc {
  const lines = content.split("\n");
  let title = "";
  let description = "";
  const sections = new Map<string, string>();

  let currentSection = "";
  let currentContent: string[] = [];
  let inDescription = false;

  for (const line of lines) {
    // Title (# heading)
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      inDescription = true;
      continue;
    }

    // New section (## heading)
    if (line.startsWith("## ")) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, currentContent.join("\n").trim());
      } else if (inDescription) {
        description = currentContent.join("\n").trim();
      }

      currentSection = line.slice(3).trim().toLowerCase();
      currentContent = [];
      inDescription = false;
      continue;
    }

    currentContent.push(line);
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join("\n").trim());
  }

  return { title, description, sections, rawContent: content };
}

/**
 * Update exports section with fresh data
 */
function updateExportsSection(content: string, exports: string[], parsed: ParsedAutodoc): string {
  // Find exports section
  const exportsSection = parsed.sections.get("exports") || parsed.sections.get("экспорты");
  if (!exportsSection && exports.length === 0) {
    return content;
  }

  // Build new exports list
  const newExportsList = exports
    .filter((e) => e !== "*") // Skip star export marker
    .map((e) => `- \`${e}\``)
    .join("\n");

  // Find and replace exports section
  const exportsSectionRegex = /## (?:Exports|Экспорты)\s*\n([\s\S]*?)(?=\n## |\n$|$)/i;
  const match = content.match(exportsSectionRegex);

  if (match) {
    const sectionHeader = match[0].split("\n")[0];
    const newSection = `${sectionHeader}\n\n${newExportsList}\n`;
    return content.replace(exportsSectionRegex, newSection);
  }

  // If no exports section exists and we have exports, add one before Files section
  if (exports.length > 0) {
    const filesRegex = /## (?:Files|Файлы)/i;
    const filesMatch = content.match(filesRegex);
    if (filesMatch) {
      const insertPoint = content.indexOf(filesMatch[0]);
      const exportsSectionText = `## Exports\n\n${newExportsList}\n\n`;
      return content.slice(0, insertPoint) + exportsSectionText + content.slice(insertPoint);
    }
  }

  return content;
}

/**
 * Update files section with fresh data
 */
function updateFilesSection(content: string, files: string[], _parsed: ParsedAutodoc): string {
  if (files.length === 0) {
    return content;
  }

  // Build new files list (limit to 15, show count if more)
  const displayFiles = files.slice(0, 15);
  let newFilesList = displayFiles.map((f) => `- \`${f}\``).join("\n");
  if (files.length > 15) {
    newFilesList += `\n- ... and ${files.length - 15} more`;
  }

  // Find and replace files section
  const filesSectionRegex = /## (?:Files|Файлы)\s*\n([\s\S]*?)(?=\n## |\n$|$)/i;
  const match = content.match(filesSectionRegex);

  if (match) {
    const sectionHeader = match[0].split("\n")[0];
    const newSection = `${sectionHeader}\n\n${newFilesList}\n`;
    return content.replace(filesSectionRegex, newSection);
  }

  return content;
}

/**
 * Update line number references for a changed file
 */
async function updateLineReferences(content: string, changedFilePath: string, _modulePath: string): Promise<string> {
  const fileName = path.basename(changedFilePath);

  // Read the changed file to get current line numbers
  if (!(await fileExists(changedFilePath))) {
    return content;
  }

  let fileContent: string;
  try {
    fileContent = await readText(changedFilePath);
  } catch {
    return content;
  }

  // Extract entities with their current line numbers
  const entities = extractEntitiesFromContent(fileContent, fileName);
  const entityLineMap = new Map<string, number>();
  for (const entity of entities) {
    entityLineMap.set(entity.name, entity.line);
  }

  // Find and update line references in AUTODOC
  // Pattern: [→ filename:LINE] or [→ path/filename:LINE] or (filename:LINE)
  const fileRefPattern = new RegExp(`(\\[→\\s*(?:[^\\]]*[\\/\\\\])?${escapeRegex(fileName)}:)(\\d+)(\\])`, "g");

  let updatedContent = content;

  // Update each reference
  updatedContent = updatedContent.replace(fileRefPattern, (match, prefix, lineNum, suffix) => {
    // Try to find what entity is at that line
    const oldLine = parseInt(lineNum, 10);

    // Find the entity closest to the old line number
    let closestEntity: string | null = null;
    let minDiff = Infinity;

    for (const [name, line] of entityLineMap) {
      const diff = Math.abs(line - oldLine);
      if (diff < minDiff) {
        minDiff = diff;
        closestEntity = name;
      }
    }

    // If we found an entity within 10 lines, update to its new position
    if (closestEntity && minDiff <= 10) {
      const newLine = entityLineMap.get(closestEntity);
      if (newLine && newLine !== oldLine) {
        return `${prefix}${newLine}${suffix}`;
      }
    }

    return match; // Keep original if no match
  });

  // Also update markdown link pattern: [text](filename:LINE)
  const linkPattern = new RegExp(`(\\]\\((?:[^)]*[\\/\\\\])?${escapeRegex(fileName)}:)(\\d+)(\\))`, "g");

  updatedContent = updatedContent.replace(linkPattern, (match, prefix, lineNum, suffix) => {
    const oldLine = parseInt(lineNum, 10);

    for (const [_name, line] of entityLineMap) {
      if (Math.abs(line - oldLine) <= 10) {
        if (line !== oldLine) {
          return `${prefix}${line}${suffix}`;
        }
        break;
      }
    }

    return match;
  });

  return updatedContent;
}

/**
 * Update the last-modified timestamp
 */
function updateTimestamp(content: string): string {
  const now = new Date().toISOString().split("T")[0]!; // YYYY-MM-DD

  // Look for existing timestamp patterns
  const patterns = [/(?:Last updated|Updated|Обновлено):\s*\d{4}-\d{2}-\d{2}/i, /<!-- updated: \d{4}-\d{2}-\d{2} -->/i];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return content.replace(pattern, (match) => {
        return match.replace(/\d{4}-\d{2}-\d{2}/, now);
      });
    }
  }

  // If no timestamp found, don't add one (keep clean)
  return content;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Diff exports to find added and removed
 */
export function diffExports(oldExports: string[], newExports: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldExports);
  const newSet = new Set(newExports);

  const added = newExports.filter((e) => !oldSet.has(e));
  const removed = oldExports.filter((e) => !newSet.has(e));

  return { added, removed };
}

/**
 * Generate a brief description for a new export using simple heuristics
 * (without LLM)
 */
export function generateExportDescription(exportName: string, entityType: string | null): string {
  // Convert camelCase/PascalCase to words
  const words = exportName
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();

  if (entityType === "class") {
    return `Class for ${words}`;
  }
  if (entityType === "interface") {
    return `Interface defining ${words}`;
  }
  if (entityType === "type") {
    return `Type definition for ${words}`;
  }
  if (entityType === "function") {
    // Check for common prefixes
    if (exportName.startsWith("get")) {
      return `Gets ${words.replace("get ", "")}`;
    }
    if (exportName.startsWith("set")) {
      return `Sets ${words.replace("set ", "")}`;
    }
    if (exportName.startsWith("create")) {
      return `Creates ${words.replace("create ", "")}`;
    }
    if (exportName.startsWith("is") || exportName.startsWith("has")) {
      return `Checks ${words}`;
    }
    return `Function for ${words}`;
  }
  if (entityType === "const") {
    if (exportName.toUpperCase() === exportName) {
      return `Constant ${exportName}`;
    }
    return `${words}`;
  }

  return words;
}
