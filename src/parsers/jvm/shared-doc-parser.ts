/**
 * JVM Shared Doc Parser
 *
 * Shared JavaDoc/KDoc parsing logic. The comment format is identical
 * between Java and Kotlin (both use /** ... * / with @ tags).
 */

import type { CommonTokenStream } from "antlr4ng";
import type { DocInfo, DocParam } from "./shared-types.js";

// =============================================================================
// COMMENT FINDING (100% identical between Java/Kotlin)
// =============================================================================

export function findDocComment(tokenStream: CommonTokenStream, startIndex: number): string | null {
  const tokens = tokenStream.getTokens?.();
  if (!tokens || tokens.length === 0) return null;

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token) continue;

    if ((token.start || 0) >= startIndex) continue;

    const text = token.text;
    if (text && text.startsWith("/**") && !text.startsWith("/***")) {
      return text;
    }

    if (text === ";" || text === "}" || text === "{") {
      break;
    }
  }

  return null;
}

// =============================================================================
// DOC COMMENT PARSING (100% identical structure)
// =============================================================================

/**
 * Parse doc comment text, dispatching tags to a language-specific handler.
 * @param commentText Raw comment including markers
 * @param tagHandler Called for each (tagName, tagContent) pair
 */
export function parseDocComment(
  commentText: string,
  tagHandler: (tagName: string, tagContent: string, result: DocInfo) => void,
): DocInfo {
  const result: DocInfo = {};

  const content = commentText
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .join("\n")
    .trim();

  const tagStartIndex = content.search(/@\w+/);

  let description: string;
  let tagSection: string;

  if (tagStartIndex === -1) {
    description = content;
    tagSection = "";
  } else if (tagStartIndex === 0) {
    description = "";
    tagSection = content;
  } else {
    description = content.substring(0, tagStartIndex).trim();
    tagSection = content.substring(tagStartIndex);
  }

  if (description) {
    result.description = cleanDescriptionBase(description);
  }

  if (tagSection) {
    const tagPattern = /(@\w+)/g;
    const parts = tagSection.split(tagPattern).filter(Boolean);

    for (let i = 0; i < parts.length; i += 2) {
      const tagName = parts[i];
      const tagContent = parts[i + 1]?.trim() || "";
      if (tagName) {
        tagHandler(tagName, tagContent, result);
      }
    }
  }

  return result;
}

// =============================================================================
// SHARED TAG PARSERS (100% identical)
// =============================================================================

export function parseParamTag(content: string, result: DocInfo): void {
  if (!result.params) {
    result.params = [];
  }

  const match = content.match(/^<?(\w+)>?\s*([\s\S]*)/);
  if (match) {
    const name = match[1] || "";
    const descPart = match[2]?.split(/(?=@\w+)/)[0];
    const description = descPart ? descPart.trim() : undefined;

    const paramEntry: DocParam = { name };
    if (description) paramEntry.description = description;
    result.params.push(paramEntry);
  }
}

export function parseReturnTag(content: string, result: DocInfo): void {
  const descPart = content.split(/(?=@\w+)/)[0];
  const description = descPart ? descPart.trim() : undefined;
  result.returns = {
    ...(description ? { description } : {}),
  };
}

export function parseThrowsTag(content: string, result: DocInfo): void {
  if (!result.throws) {
    result.throws = [];
  }

  const match = content.match(/^(\S+)\s*([\s\S]*)/);
  if (match) {
    const type = match[1] || "";
    const descPart = match[2]?.split(/(?=@\w+)/)[0];
    const description = descPart ? descPart.trim() : undefined;

    result.throws.push({
      type,
      ...(description ? { description } : {}),
    });
  }
}

export function parseSeeTag(content: string, result: DocInfo): void {
  if (!result.see) {
    result.see = [];
  }

  const reference = (content.split("\n")[0] || "").trim();
  if (reference) {
    result.see.push(reference);
  }
}

// =============================================================================
// DESCRIPTION CLEANING (base — Kotlin extends with [ref] handling)
// =============================================================================

export function cleanDescriptionBase(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/<\/?p>/gi, "\n\n")
    .replace(/<\/?code>/gi, "`")
    .replace(/<\/?pre>/gi, "```")
    .replace(/<\/?em>/gi, "*")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

// =============================================================================
// SOURCE-BASED DOC EXTRACTION (shared skeleton)
// =============================================================================

export function extractDocFromSourceBase(
  sourceCode: string,
  declarationLine: number,
  parser: (commentText: string) => DocInfo,
  skipAnnotations = false,
): DocInfo | undefined {
  const lines = sourceCode.split("\n");

  let commentEndLine = declarationLine - 2;

  // Kotlin: skip annotation lines before the doc comment
  if (skipAnnotations) {
    while (commentEndLine >= 0) {
      const line = (lines[commentEndLine] || "").trim();
      if (line.startsWith("@") && !line.startsWith("/**")) {
        commentEndLine--;
        continue;
      }
      break;
    }
  }

  // Find comment end (line with */)
  while (commentEndLine >= 0) {
    const line = (lines[commentEndLine] || "").trim();
    if (line.endsWith("*/")) {
      break;
    }
    if (line && !line.startsWith("@") && !line.startsWith("*") && !line.startsWith("/")) {
      return undefined;
    }
    commentEndLine--;
  }

  if (commentEndLine < 0) return undefined;

  // Find comment start (line with /**)
  let commentStartLine = commentEndLine;
  while (commentStartLine >= 0) {
    const line = (lines[commentStartLine] || "").trim();
    if (line.startsWith("/**")) {
      break;
    }
    commentStartLine--;
  }

  if (commentStartLine < 0) return undefined;

  const commentLines = lines.slice(commentStartLine, commentEndLine + 1);
  const commentText = commentLines.join("\n");

  return parser(commentText);
}
