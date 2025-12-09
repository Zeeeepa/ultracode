/**
 * Comment Extractor - Extract and associate comments with code entities
 *
 * Supports:
 * - Line comments: //
 * - Block comments: /* *\/
 * - HTML comments: <!-- -->
 * - JSDoc/TSDoc: /** *\/
 * - Python docstrings: ''' ''' and """ """
 * - Leading comments (documentation before entity)
 * - Inline comments (inside entity body)
 * - Trailing comments (after code lines)
 */

import type { ParsedEntity } from "../types/parser.js";
import type { Entity, Relationship } from "../types/storage.js";
import { hashText } from "./fast-hash.js";

// =============================================================================
// TYPES
// =============================================================================

export interface SourceLocation {
  start: {
    line: number;
    column: number;
    index: number;
  };
  end: {
    line: number;
    column: number;
    index: number;
  };
}

export interface CommentBlock {
  type: CommentType;
  content: string;
  location: SourceLocation;
  raw: string;
  isLeading?: boolean; // Comment before entity
  isInline?: boolean; // Comment inside entity
  isTrailing?: boolean; // Comment after code line
  associatedEntityId?: string; // ID of entity this comment documents
}

export enum CommentType {
  LINE = "line", // // comment
  BLOCK = "block", // /* comment */
  JSDOC = "jsdoc", // /** comment */
  HTML = "html", // <!-- comment -->
  PYTHON_SINGLE = "python_single", // ''' comment '''
  PYTHON_DOUBLE = "python_double", // """ comment """
}

export interface CommentExtractionResult {
  comments: CommentBlock[];
  leadingComments: Map<number, CommentBlock[]>; // line -> comments before that line
  inlineComments: Map<number, CommentBlock[]>; // line -> comments on that line
}

// =============================================================================
// COMMENT EXTRACTOR CLASS
// =============================================================================

export class CommentExtractor {
  /**
   * Extract all comments from source code
   */
  static extractComments(source: string, filePath: string, language?: string): CommentExtractionResult {
    const comments: CommentBlock[] = [];
    const leadingComments = new Map<number, CommentBlock[]>();
    const inlineComments = new Map<number, CommentBlock[]>();

    const lines = source.split(/\r?\n/);

    // Detect language from file extension if not provided
    if (!language) {
      language = CommentExtractor.detectLanguage(filePath);
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const lineNum = i + 1;

      // Try to extract comment from this line
      const result = CommentExtractor.extractCommentFromLine(line, lineNum, lines, i, language);

      if (result) {
        comments.push(result.comment);

        // Categorize comment
        if (result.comment.isLeading) {
          const nextLine = lineNum + (result.linesConsumed || 0);
          if (!leadingComments.has(nextLine)) {
            leadingComments.set(nextLine, []);
          }
          leadingComments.get(nextLine)!.push(result.comment);
        } else if (result.comment.isInline) {
          if (!inlineComments.has(lineNum)) {
            inlineComments.set(lineNum, []);
          }
          inlineComments.get(lineNum)!.push(result.comment);
        }

        i += result.linesConsumed || 1;
      } else {
        i++;
      }
    }

    return {
      comments,
      leadingComments,
      inlineComments,
    };
  }

  /**
   * Associate comments with entities
   */
  static associateCommentsWithEntities(
    comments: CommentBlock[],
    entities: ParsedEntity[],
    leadingComments: Map<number, CommentBlock[]>,
  ): Map<string, CommentBlock[]> {
    const associations = new Map<string, CommentBlock[]>();

    for (const entity of entities) {
      const entityComments: CommentBlock[] = [];

      // 1. Leading comments (documentation before entity)
      if (entity.location?.start?.line) {
        const leading = leadingComments.get(entity.location.start.line);
        if (leading) {
          entityComments.push(...leading.map((c) => ({ ...c, isLeading: true })));
        }
      }

      // 2. Inline comments (comments inside entity body)
      if (entity.location?.start?.line && entity.location?.end?.line) {
        for (const comment of comments) {
          if (
            comment.location.start.line >= entity.location.start.line &&
            comment.location.end.line <= entity.location.end.line &&
            !comment.isLeading
          ) {
            entityComments.push({ ...comment, isInline: true });
          }
        }
      }

      if (entityComments.length > 0) {
        const entityId = (entity as any).id || CommentExtractor.generateEntityId(entity);
        entityComments.forEach((c) => {
          c.associatedEntityId = entityId;
        });
        associations.set(entityId, entityComments);
      }
    }

    return associations;
  }

  /**
   * Create COMMENT entities from extracted comments
   */
  static createCommentEntities(
    comments: CommentBlock[],
    filePath: string,
    _associations: Map<string, CommentBlock[]>,
  ): Entity[] {
    const _commentEntities: Entity[] = [];
    const now = Date.now();

    for (const comment of comments) {
      // Skip if comment is already associated with an entity (will be included in entity embedding)
      if (comment.associatedEntityId) {
        continue;
      }

      const id = CommentExtractor.generateCommentId(comment, filePath);
      const content = comment.content.trim();

      // Skip empty comments
      if (!content) {
        continue;
      }

      const entity: Entity = {
        id,
        name: `Comment at line ${comment.location.start.line}`,
        type: "comment" as any,
        filePath,
        location: comment.location,
        metadata: {
          commentType: comment.type,
          raw: comment.raw,
          isLeading: comment.isLeading,
          isInline: comment.isInline,
          isTrailing: comment.isTrailing,
          content,
        },
        hash: hashText(content).slice(0, 16),
        createdAt: now,
        updatedAt: now,
      };

      _commentEntities.push(entity);
    }

    return _commentEntities;
  }

  /**
   * Create DOCUMENTS relationships between comments and entities
   */
  static createDocumentationRelationships(
    _commentEntities: Entity[],
    codeEntities: Entity[],
    associations: Map<string, CommentBlock[]>,
  ): Relationship[] {
    const relationships: Relationship[] = [];
    const now = Date.now();

    // Create relationships for associated comments
    for (const [entityId, comments] of associations.entries()) {
      const entity = codeEntities.find((e) => e.id === entityId);
      if (!entity) continue;

      for (const comment of comments) {
        const commentId = CommentExtractor.generateCommentId(comment, entity.filePath);

        const relationship: Relationship = {
          id: `${commentId}->${entity.id}`,
          fromId: commentId,
          toId: entity.id,
          type: "documents" as any,
          metadata: {
            isLeading: comment.isLeading,
            isInline: comment.isInline,
            commentType: comment.type,
          },
          createdAt: now,
        };

        relationships.push(relationship);
      }
    }

    return relationships;
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private static extractCommentFromLine(
    line: string,
    lineNum: number,
    allLines: string[],
    startIndex: number,
    language: string,
  ): { comment: CommentBlock; linesConsumed: number } | null {
    const trimmed = line.trim();

    // Line comment: //
    if (trimmed.startsWith("//")) {
      const content = trimmed.slice(2).trim();
      return {
        comment: {
          type: CommentType.LINE,
          content,
          raw: trimmed,
          location: {
            start: { line: lineNum, column: line.indexOf("//"), index: 0 },
            end: { line: lineNum, column: line.length, index: 0 },
          },
          isInline: !CommentExtractor.isStandalone(line),
        },
        linesConsumed: 1,
      };
    }

    // JSDoc comment: /**
    if (trimmed.startsWith("/**")) {
      return CommentExtractor.extractMultiLineComment(allLines, startIndex, lineNum, "/**", "*/", CommentType.JSDOC);
    }

    // Block comment: /*
    if (trimmed.startsWith("/*")) {
      return CommentExtractor.extractMultiLineComment(allLines, startIndex, lineNum, "/*", "*/", CommentType.BLOCK);
    }

    // HTML comment: <!--
    if (trimmed.startsWith("<!--") && (language === "html" || language === "xml" || language === "vue")) {
      return CommentExtractor.extractMultiLineComment(allLines, startIndex, lineNum, "<!--", "-->", CommentType.HTML);
    }

    // Python docstring: """
    if (trimmed.startsWith('"""') && language === "python") {
      return CommentExtractor.extractMultiLineComment(
        allLines,
        startIndex,
        lineNum,
        '"""',
        '"""',
        CommentType.PYTHON_DOUBLE,
      );
    }

    // Python docstring: '''
    if (trimmed.startsWith("'''") && language === "python") {
      return CommentExtractor.extractMultiLineComment(
        allLines,
        startIndex,
        lineNum,
        "'''",
        "'''",
        CommentType.PYTHON_SINGLE,
      );
    }

    // Python line comment: #
    if (trimmed.startsWith("#") && language === "python") {
      const content = trimmed.slice(1).trim();
      return {
        comment: {
          type: CommentType.LINE,
          content,
          raw: trimmed,
          location: {
            start: { line: lineNum, column: line.indexOf("#"), index: 0 },
            end: { line: lineNum, column: line.length, index: 0 },
          },
          isInline: !CommentExtractor.isStandalone(line),
        },
        linesConsumed: 1,
      };
    }

    return null;
  }

  private static extractMultiLineComment(
    lines: string[],
    startIndex: number,
    startLine: number,
    startToken: string,
    endToken: string,
    type: CommentType,
  ): { comment: CommentBlock; linesConsumed: number } | null {
    const contentLines: string[] = [];
    let currentIndex = startIndex;
    let found = false;

    while (currentIndex < lines.length) {
      const line = lines[currentIndex] ?? "";
      const trimmed = line.trim();

      // Check if this line ends the comment
      if (trimmed.includes(endToken)) {
        // Extract content before end token
        const endIndex = trimmed.indexOf(endToken);
        const lastPart = trimmed.slice(0, endIndex);

        if (currentIndex === startIndex) {
          // Single-line comment
          const startIndex = trimmed.indexOf(startToken) + startToken.length;
          contentLines.push(trimmed.slice(startIndex, endIndex).trim());
        } else {
          contentLines.push(lastPart.trim());
        }

        found = true;
        break;
      }

      // Extract content from this line
      if (currentIndex === startIndex) {
        // First line - remove start token
        const startIdx = trimmed.indexOf(startToken) + startToken.length;
        contentLines.push(trimmed.slice(startIdx).trim());
      } else {
        // Middle lines - remove leading * for JSDoc
        const cleaned = trimmed.startsWith("*") && type === CommentType.JSDOC ? trimmed.slice(1).trim() : trimmed;
        contentLines.push(cleaned);
      }

      currentIndex++;
    }

    if (!found) {
      return null;
    }

    const content = contentLines.join("\n").trim();
    const endLine = startLine + (currentIndex - startIndex);
    const linesConsumed = currentIndex - startIndex + 1;

    return {
      comment: {
        type,
        content,
        raw: lines.slice(startIndex, currentIndex + 1).join("\n"),
        location: {
          start: { line: startLine, column: 0, index: 0 },
          end: { line: endLine, column: (lines[currentIndex] ?? "").length, index: 0 },
        },
        isLeading: CommentExtractor.isLeading(startIndex, lines),
      },
      linesConsumed,
    };
  }

  private static isStandalone(line: string): boolean {
    // Comment is standalone if there's no code before it on the same line
    const beforeComment = line.slice(0, line.indexOf("//")).trim();
    return beforeComment.length === 0;
  }

  private static isLeading(lineIndex: number, lines: string[]): boolean {
    // Check if next non-empty line has code
    for (let i = lineIndex + 1; i < Math.min(lineIndex + 3, lines.length); i++) {
      const nextLine = (lines[i] ?? "").trim();
      if (nextLine.length === 0) continue;
      // Next line is code if it doesn't start with comment
      return !nextLine.startsWith("//") && !nextLine.startsWith("/*") && !nextLine.startsWith("*");
    }
    return false;
  }

  private static detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      html: "html",
      htm: "html",
      xml: "xml",
      vue: "vue",
      cpp: "cpp",
      cc: "cpp",
      cxx: "cpp",
      c: "c",
      h: "c",
      hpp: "cpp",
      java: "java",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      kt: "kotlin",
      swift: "swift",
    };
    return languageMap[ext] || "unknown";
  }

  private static generateCommentId(comment: CommentBlock, filePath: string): string {
    const content = `${filePath}:comment:${comment.location.start.line}:${comment.location.start.column}`;
    return hashText(content).slice(0, 16);
  }

  private static generateEntityId(entity: ParsedEntity): string {
    const content = `${entity.filePath}:${entity.type}:${entity.name}:${entity.location.start.line}`;
    return hashText(content).slice(0, 16);
  }

  /**
   * Enhance entity content with associated comments for better embeddings
   */
  static enhanceEntityContentWithComments(entityCode: string, entityHeader: string, comments: CommentBlock[]): string {
    if (comments.length === 0) {
      return `${entityHeader}\n${entityCode}`.trim();
    }

    // Separate leading comments (inline comments are preserved in entityCode)
    const leadingComments = comments.filter((c) => c.isLeading);

    // Build enhanced content
    let enhanced = "";

    // Add leading comments first (documentation)
    if (leadingComments.length > 0) {
      enhanced += leadingComments.map((c) => c.content).join("\n") + "\n\n";
    }

    // Add entity header
    enhanced += entityHeader + "\n";

    // Add code (which already contains inline comments)
    enhanced += entityCode;

    return enhanced.trim();
  }
}
