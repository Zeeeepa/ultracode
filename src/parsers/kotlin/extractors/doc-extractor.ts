/**
 * Kotlin KDoc Extractor
 *
 * Extracts and parses KDoc comments. Uses shared doc parsing from
 * jvm/shared-doc-parser. Kotlin-specific tags: @property, @receiver,
 * @sample, @suppress, @constructor.
 */

import type { CommonTokenStream } from "antlr4ng";
import {
  cleanDescriptionBase,
  extractDocFromSourceBase,
  findDocComment,
  parseDocComment,
  parseParamTag,
  parseReturnTag,
  parseSeeTag,
  parseThrowsTag,
} from "../../jvm/shared-doc-parser.js";
import type { DocInfo as KDocInfo } from "../types.js";

// Re-export type for backward compatibility
export type { DocParam as KDocParam } from "../types.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

export function extractKDoc(
  tokenStream: CommonTokenStream | null,
  declarationStartIndex: number,
): KDocInfo | undefined {
  if (!tokenStream) return undefined;

  const commentText = findDocComment(tokenStream, declarationStartIndex);
  if (!commentText) return undefined;

  return parseKDoc(commentText);
}

export function parseKDocText(text: string): KDocInfo | undefined {
  if (!text) return undefined;
  return parseKDoc(text);
}

// =============================================================================
// KDOC TAG DISPATCH (Kotlin-specific: @property, @receiver, @sample, @suppress, @constructor)
// =============================================================================

function parseKDoc(commentText: string): KDocInfo {
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
      case "@property":
        parsePropertyTag(tagContent, result);
        break;
      case "@receiver":
        result.receiver = (tagContent.split("\n")[0] || "").trim();
        break;
      case "@sample":
        parseSampleTag(tagContent, result);
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
      case "@deprecated":
        result.deprecated = tagContent ? (tagContent.split("\n")[0] || "").trim() : true;
        break;
      case "@suppress":
        parseSuppressTag(tagContent, result);
        break;
      case "@constructor":
        if (result.description) {
          result.description += "\n\nConstructor: " + (tagContent.split("\n")[0] || "").trim();
        }
        break;
    }
  });
}

// =============================================================================
// KOTLIN-SPECIFIC TAG PARSERS
// =============================================================================

function parsePropertyTag(content: string, result: KDocInfo): void {
  if (!result.property) {
    result.property = [];
  }

  const match = content.match(/^(\w+)\s*([\s\S]*)/);
  if (match) {
    const name = match[1] || "";
    const description = (match[2]?.split(/(?=@\w+)/)[0] || "").trim();

    result.property.push({
      name,
      ...(description ? { description } : {}),
    });
  }
}

function parseSampleTag(content: string, result: KDocInfo): void {
  if (!result.sample) {
    result.sample = [];
  }

  const reference = (content.split("\n")[0] || "").trim();
  if (reference) {
    result.sample.push(reference);
  }
}

function parseSuppressTag(content: string, result: KDocInfo): void {
  if (!result.suppress) {
    result.suppress = [];
  }

  const warning = (content.split("\n")[0] || "").trim().replace(/^["']|["']$/g, "");
  if (warning) {
    result.suppress.push(warning);
  }
}

// =============================================================================
// KOTLIN-SPECIFIC DESCRIPTION CLEANING (adds [ref] → `ref` conversion)
// =============================================================================

/** Clean description with Kotlin [ref] link handling */
export function cleanKDocDescription(text: string): string {
  return cleanDescriptionBase(text.replace(/\[([^\]]+)\]/g, "`$1`"));
}

// =============================================================================
// SOURCE-BASED EXTRACTION (Kotlin: skip annotations before doc comment)
// =============================================================================

export function extractKDocFromSource(sourceCode: string, declarationLine: number): KDocInfo | undefined {
  return extractDocFromSourceBase(sourceCode, declarationLine, parseKDoc, true);
}
