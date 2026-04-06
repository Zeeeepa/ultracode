/**
 * Java JavaDoc Extractor
 *
 * Extracts and parses JavaDoc comments. Uses shared doc parsing from
 * jvm/shared-doc-parser for comment finding, parsing, and tag extraction.
 * Only the tag dispatch (handling @version) is Java-specific.
 */

import type { CommonTokenStream } from "antlr4ng";
import {
  extractDocFromSourceBase,
  findDocComment,
  parseDocComment,
  parseParamTag,
  parseReturnTag,
  parseSeeTag,
  parseThrowsTag,
} from "../../jvm/shared-doc-parser.js";
import type { DocInfo as JavaDocInfo } from "../types.js";

// Re-export type for backward compatibility
export type { DocParam as JavaDocParam } from "../types.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

export function extractJavaDoc(
  tokenStream: CommonTokenStream | null,
  declarationStartIndex: number,
): JavaDocInfo | undefined {
  if (!tokenStream) return undefined;

  const commentText = findDocComment(tokenStream, declarationStartIndex);
  if (!commentText) return undefined;

  return parseJavaDoc(commentText);
}

export function parseJavaDocText(text: string): JavaDocInfo | undefined {
  if (!text) return undefined;
  return parseJavaDoc(text);
}

// =============================================================================
// JAVADOC TAG DISPATCH (Java-specific: @version)
// =============================================================================

function parseJavaDoc(commentText: string): JavaDocInfo {
  return parseDocComment(commentText, (tagName, tagContent, result) => {
    switch (tagName) {
      case "@param":
        parseParamTag(tagContent, result);
        break;
      case "@return":
      case "@returns":
        parseReturnTag(tagContent, result);
        break;
      case "@throws":
      case "@exception":
        parseThrowsTag(tagContent, result);
        break;
      case "@see":
        parseSeeTag(tagContent, result);
        break;
      case "@since":
        result.since = (tagContent.split("\n")[0] || "").trim();
        break;
      case "@author":
        result.author = (tagContent.split("\n")[0] || "").trim();
        break;
      case "@version":
        result.version = (tagContent.split("\n")[0] || "").trim();
        break;
      case "@deprecated":
        result.deprecated = tagContent ? (tagContent.split("\n")[0] || "").trim() : true;
        break;
    }
  });
}

// =============================================================================
// SOURCE-BASED EXTRACTION
// =============================================================================

export function extractJavaDocFromSource(sourceCode: string, declarationLine: number): JavaDocInfo | undefined {
  return extractDocFromSourceBase(sourceCode, declarationLine, parseJavaDoc, false);
}
