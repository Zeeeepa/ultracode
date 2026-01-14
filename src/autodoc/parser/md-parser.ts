/**
 * Markdown Parser for AutoDoc
 *
 * Parses markdown files into structured sections with hierarchy.
 * Extracts headings, content, and references.
 *
 * Architecture References:
 * - AutoDoc Types: src/autodoc/types.ts
 * - Link Extractor: src/autodoc/parser/link-extractor.ts
 */

import type { ParsedDocument, ParsedReference, ParsedSection } from "../types.js";
import { extractReferences } from "./link-extractor.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

/** Regex to match markdown headings */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

// =============================================================================
// 2. MARKDOWN PARSER
// =============================================================================

/**
 * Parse a markdown document into structured sections
 */
export function parseMarkdown(content: string, filePath: string): ParsedDocument {
  // Normalize line endings (CRLF -> LF, CR -> LF)
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const lines = normalizedContent.split("\n");
  const sections: ParsedSection[] = [];
  const allRefs: ParsedReference[] = [];
  const errors: string[] = [];

  let title = "";
  let currentSection: ParsedSection | null = null;
  let contentBuffer: string[] = [];
  let lineNumber = 0;

  // Stack to track section hierarchy
  const sectionStack: ParsedSection[] = [];

  const flushContent = () => {
    if (currentSection && contentBuffer.length > 0) {
      currentSection.content = contentBuffer.join("\n").trim();
      currentSection.lineEnd = lineNumber;

      // Extract references from content
      const refs = extractReferences(currentSection.content, filePath, currentSection.lineStart);
      currentSection.refs = refs;
      allRefs.push(...refs);
    }
    contentBuffer = [];
  };

  const addSection = (section: ParsedSection) => {
    // Pop sections from stack until we find a parent with lower level
    while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]!.level >= section.level) {
      sectionStack.pop();
    }

    if (sectionStack.length === 0) {
      // Top-level section
      sections.push(section);
    } else {
      // Child section
      sectionStack[sectionStack.length - 1]!.children.push(section);
    }

    sectionStack.push(section);
  };

  for (const line of lines) {
    lineNumber++;

    const headingMatch = line.match(HEADING_REGEX);

    if (headingMatch?.[1] && headingMatch[2]) {
      // Flush previous section content
      flushContent();

      const level = headingMatch[1].length;
      const headingTitle = headingMatch[2].trim();

      // First H1 is the document title
      if (level === 1 && !title) {
        title = headingTitle;
      }

      // Create new section
      const section: ParsedSection = {
        id: slugify(headingTitle),
        level,
        title: headingTitle,
        content: "",
        lineStart: lineNumber,
        lineEnd: lineNumber,
        refs: [],
        children: [],
      };

      currentSection = section;
      addSection(section);
    } else {
      // Add line to content buffer
      contentBuffer.push(line);
    }
  }

  // Flush final section
  flushContent();

  // If no title found, use filename
  if (!title) {
    title = filePath.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
  }

  return {
    filePath,
    title,
    sections,
    allRefs,
    ...(errors.length > 0 && { errors: errors }),
  };
}

/**
 * Get a flat list of all sections (including nested)
 */
export function flattenSections(sections: ParsedSection[]): ParsedSection[] {
  const result: ParsedSection[] = [];

  const traverse = (sectionList: ParsedSection[]) => {
    for (const section of sectionList) {
      result.push(section);
      if (section.children.length > 0) {
        traverse(section.children);
      }
    }
  };

  traverse(sections);
  return result;
}

/**
 * Find a section by ID (supports nested sections)
 */
export function findSectionById(sections: ParsedSection[], id: string): ParsedSection | null {
  for (const section of sections) {
    if (section.id === id) {
      return section;
    }
    if (section.children.length > 0) {
      const found = findSectionById(section.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find a section by title (case-insensitive)
 */
export function findSectionByTitle(sections: ParsedSection[], title: string): ParsedSection | null {
  const normalizedTitle = title.toLowerCase().trim();

  for (const section of sections) {
    if (section.title.toLowerCase().trim() === normalizedTitle) {
      return section;
    }
    if (section.children.length > 0) {
      const found = findSectionByTitle(section.children, title);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Update a section's content in the original markdown
 */
export function updateSectionContent(originalContent: string, sectionTitle: string, newContent: string): string {
  const normalizedContent = originalContent.replace(/\r\n?/g, "\n");
  const lines = normalizedContent.split("\n");
  const result: string[] = [];

  let inTargetSection = false;
  let targetLevel = 0;
  let skipUntilNextHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(HEADING_REGEX);

    if (headingMatch?.[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      const headingTitle = headingMatch[2].trim();

      if (inTargetSection) {
        // Check if this heading ends our section (same or higher level)
        if (level <= targetLevel) {
          inTargetSection = false;
          skipUntilNextHeading = false;
          result.push(line);
          continue;
        }
      }

      if (headingTitle.toLowerCase() === sectionTitle.toLowerCase()) {
        inTargetSection = true;
        targetLevel = level;
        skipUntilNextHeading = true;

        // Add the heading and new content
        result.push(line);
        result.push("");
        result.push(newContent.trim());
        result.push("");
        continue;
      }
    }

    if (!skipUntilNextHeading) {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Insert a new section after a specific section
 */
export function insertSectionAfter(
  originalContent: string,
  afterSectionTitle: string,
  newHeading: string,
  newContent: string,
  level = 2,
): string {
  const normalizedContent = originalContent.replace(/\r\n?/g, "\n");
  const lines = normalizedContent.split("\n");
  const result: string[] = [];

  let foundSection = false;
  let sectionLevel = 0;
  let inserted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(HEADING_REGEX);

    result.push(line);

    if (headingMatch?.[1] && headingMatch[2]) {
      const headingLevel = headingMatch[1].length;
      const headingTitle = headingMatch[2].trim();

      if (foundSection && !inserted && headingLevel <= sectionLevel) {
        // Insert before this heading
        result.pop(); // Remove the line we just added
        result.push("");
        result.push(`${"#".repeat(level)} ${newHeading}`);
        result.push("");
        result.push(newContent.trim());
        result.push("");
        result.push(line); // Re-add the heading
        inserted = true;
        foundSection = false;
      }

      if (headingTitle.toLowerCase() === afterSectionTitle.toLowerCase()) {
        foundSection = true;
        sectionLevel = headingLevel;
      }
    }
  }

  // If section was at the end, append new section
  if (foundSection && !inserted) {
    result.push("");
    result.push(`${"#".repeat(level)} ${newHeading}`);
    result.push("");
    result.push(newContent.trim());
  }

  return result.join("\n");
}

/**
 * Generate markdown from a parsed document
 */
export function generateMarkdown(doc: ParsedDocument): string {
  const lines: string[] = [];

  const renderSection = (section: ParsedSection, depth = 0) => {
    // Add heading
    lines.push(`${"#".repeat(section.level)} ${section.title}`);
    lines.push("");

    // Add content
    if (section.content) {
      lines.push(section.content);
      lines.push("");
    }

    // Render children
    for (const child of section.children) {
      renderSection(child, depth + 1);
    }
  };

  // Render title if it's not already in sections
  const hasTitle = doc.sections.some((s) => s.level === 1 && s.title === doc.title);
  if (!hasTitle && doc.title) {
    lines.push(`# ${doc.title}`);
    lines.push("");
  }

  for (const section of doc.sections) {
    renderSection(section);
  }

  return lines.join("\n").trim() + "\n";
}

// =============================================================================
// 3. HELPERS
// =============================================================================

/**
 * Convert title to URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-а-яё]/gi, "") // Keep Cyrillic characters
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract document title from markdown
 */
export function extractTitle(content: string): string | null {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const lines = normalizedContent.split("\n");

  for (const line of lines) {
    const match = line.match(HEADING_REGEX);
    if (match?.[1] && match[2] && match[1].length === 1) {
      return match[2].trim();
    }
  }

  return null;
}

/**
 * Get the section path (breadcrumb) for a section ID
 */
export function getSectionPath(sections: ParsedSection[], targetId: string): string[] {
  const path: string[] = [];

  const traverse = (sectionList: ParsedSection[], currentPath: string[]): boolean => {
    for (const section of sectionList) {
      const newPath = [...currentPath, section.title];

      if (section.id === targetId) {
        path.push(...newPath);
        return true;
      }

      if (section.children.length > 0) {
        if (traverse(section.children, newPath)) {
          return true;
        }
      }
    }
    return false;
  };

  traverse(sections, []);
  return path;
}
