/**
 * Link Extractor for AutoDoc
 *
 * Extracts and parses references from markdown content.
 * Supports code references, entity references, and doc references.
 *
 * Supported syntax:
 * - [→ file.ts:25-50](file.ts#L25-L50)     - Line range ref
 * - [→ entity:Class.method](...)            - Entity ref
 * - [→ OtherDoc](./other.md#section)        - Doc-to-doc ref
 * - Standard markdown links                  - Parsed but not indexed
 *
 * Architecture References:
 * - AutoDoc Types: src/autodoc/types.ts
 * - RFC Section 4.3: Link Syntax
 *
 * @module
 */

import { basename } from "node:path";
import type { ParsedReference } from "../types.js";
import { RefTargetType } from "../types.js";

// =============================================================================
// 1. CONSTANTS AND PATTERNS
// =============================================================================

/**
 * Regex patterns for different reference types
 */
const PATTERNS = {
  /** Standard markdown link: [text](url) */
  MARKDOWN_LINK: /\[([^\]]+)\]\(([^)]+)\)/g,

  /** AutoDoc arrow link: [→ text](url) */
  AUTODOC_LINK: /\[→\s*([^\]]+)\]\(([^)]+)\)/g,

  /** Line range in URL: file.ts#L25-L50 or file.ts#L25 */
  LINE_RANGE: /#L(\d+)(?:-L?(\d+))?$/,

  /** Entity reference in text: entity:Namespace.Class.method */
  ENTITY_REF: /^entity:(.+)$/,

  /** Commit reference: commit:abc123 */
  COMMIT_REF: /^commit:([a-f0-9]+)$/,

  /** Doc reference: ./path/to/file.md#section */
  DOC_REF: /^\.?\.?\/.*\.md(#[^#]+)?$/,

  /** External URL */
  EXTERNAL_URL: /^https?:\/\//,
};

// =============================================================================
// 2. REFERENCE EXTRACTION
// =============================================================================

/**
 * Extract all references from markdown content
 */
export function extractReferences(content: string, _sourceFilePath: string, baseLineNumber = 1): ParsedReference[] {
  const refs: ParsedReference[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = baseLineNumber + i;

    // Find all markdown links in this line
    const linkMatches = findAllLinks(line);

    for (const match of linkMatches) {
      const ref = parseReference(match.text, match.target, lineNumber, match.column);
      if (ref) {
        refs.push({
          ...ref,
          syntax: match.syntax,
        });
      }
    }
  }

  return refs;
}

/**
 * Find all markdown links in a line
 */
function findAllLinks(line: string): Array<{
  syntax: string;
  text: string;
  target: string;
  column: number;
}> {
  const links: Array<{
    syntax: string;
    text: string;
    target: string;
    column: number;
  }> = [];

  // Reset regex lastIndex
  PATTERNS.MARKDOWN_LINK.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PATTERNS.MARKDOWN_LINK.exec(line)) !== null) {
    const text = match[1];
    const target = match[2];
    if (text && target) {
      links.push({
        syntax: match[0],
        text,
        target,
        column: match.index + 1,
      });
    }
  }

  return links;
}

/**
 * Parse a reference from link text and target
 */
function parseReference(
  text: string,
  target: string,
  line: number,
  column: number,
): Omit<ParsedReference, "syntax"> | null {
  // Skip external URLs
  if (PATTERNS.EXTERNAL_URL.test(target)) {
    return null;
  }

  // Remove arrow prefix if present (from [→ text](target) syntax)
  const cleanText = text.replace(/^→\s*/, "");

  // Check for entity reference
  const entityMatch = cleanText.match(PATTERNS.ENTITY_REF);
  if (entityMatch?.[1]) {
    return {
      text,
      target,
      targetType: RefTargetType.ENTITY,
      targetId: entityMatch[1],
      line,
      column,
    };
  }

  // Check for commit reference
  const commitMatch = target.match(PATTERNS.COMMIT_REF);
  if (commitMatch?.[1]) {
    return {
      text,
      target,
      targetType: RefTargetType.COMMIT,
      targetId: commitMatch[1],
      line,
      column,
    };
  }

  // Check for line range reference
  const lineRangeMatch = target.match(PATTERNS.LINE_RANGE);
  if (lineRangeMatch?.[1]) {
    const filePath = target.replace(PATTERNS.LINE_RANGE, "");
    const lineStart = parseInt(lineRangeMatch[1], 10);
    const lineEnd = lineRangeMatch[2] ? parseInt(lineRangeMatch[2], 10) : lineStart;

    return {
      text,
      target,
      targetType: RefTargetType.LINE_RANGE,
      targetId: `${filePath}:L${lineStart}-L${lineEnd}`,
      line,
      column,
    };
  }

  // Check for doc reference (.md file)
  if (PATTERNS.DOC_REF.test(target)) {
    // Extract section anchor if present
    const hashIndex = target.indexOf("#");
    const filePath = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const section = hashIndex >= 0 ? target.slice(hashIndex + 1) : undefined;

    return {
      text,
      target,
      targetType: RefTargetType.DOC,
      targetId: section ? `${filePath}#${section}` : filePath,
      line,
      column,
    };
  }

  // Default: treat as file/entity reference
  // Check if text looks like a code reference (contains file extension or colons)
  if (cleanText.includes(".") || cleanText.includes(":")) {
    // Could be a code file reference
    return {
      text,
      target,
      targetType: RefTargetType.LINE_RANGE,
      targetId: target,
      line,
      column,
    };
  }

  // Default to doc reference
  return {
    text,
    target,
    targetType: RefTargetType.DOC,
    targetId: target,
    line,
    column,
  };
}

// =============================================================================
// 3. REFERENCE GENERATION
// =============================================================================

/**
 * Generate markdown link for a code reference
 */
export function generateCodeRef(filePath: string, lineStart: number, lineEnd?: number, displayText?: string): string {
  const lineSpec = lineEnd && lineEnd !== lineStart ? `${lineStart}-${lineEnd}` : `${lineStart}`;

  const text = displayText || `${filePath}:${lineSpec}`;
  const target =
    lineEnd && lineEnd !== lineStart ? `${filePath}#L${lineStart}-L${lineEnd}` : `${filePath}#L${lineStart}`;

  return `[→ ${text}](${target})`;
}

/**
 * Generate markdown link for an entity reference
 */
export function generateEntityRef(entityId: string, displayText?: string): string {
  const text = displayText || `entity:${entityId}`;
  return `[→ ${text}](ultracode://entity/${entityId})`;
}

/**
 * Generate markdown link for a doc reference
 */
export function generateDocRef(docPath: string, section?: string | undefined, displayText?: string): string {
  const text = displayText || basename(docPath, ".md") || docPath;
  const target = section ? `${docPath}#${section}` : docPath;
  return `[→ ${text}](${target})`;
}

// =============================================================================
// 4. REFERENCE VALIDATION
// =============================================================================

/**
 * Validate a parsed reference
 */
export function validateReference(
  ref: ParsedReference,
  resolveTarget: (targetType: RefTargetType, targetId: string) => boolean,
): { valid: boolean; error?: string } {
  // Check if target can be resolved
  const exists = resolveTarget(ref.targetType, ref.targetId);

  if (!exists) {
    return {
      valid: false,
      error: `Target not found: ${ref.targetId}`,
    };
  }

  return { valid: true };
}

/**
 * Update line numbers in a reference target
 */
export function updateLineNumbers(refSyntax: string, lineDelta: number): string {
  return refSyntax.replace(/#L(\d+)(?:-L?(\d+))?/g, (_match, start, end) => {
    const newStart = parseInt(start as string, 10) + lineDelta;
    if (end) {
      const newEnd = parseInt(end as string, 10) + lineDelta;
      return `#L${newStart}-L${newEnd}`;
    }
    return `#L${newStart}`;
  });
}

// =============================================================================
// 5. COMMENT REFERENCE EXTRACTION
// =============================================================================

/**
 * Patterns for references in code comments
 */
const COMMENT_PATTERNS = {
  /** @see docs://path */
  SEE_DOC: /@see\s+docs:\/\/([^\s]+)/g,

  /** @see entity:FQN */
  SEE_ENTITY: /@see\s+entity:([^\s]+)/g,

  /** @flow tag1, tag2 */
  FLOW: /@flow\s+([^\n]+)/g,

  /** Part of: flow-name */
  PART_OF: /Part of:\s*([^\n]+)/gi,
};

/**
 * Extract references from a code comment
 */
export function extractCommentRefs(commentContent: string): {
  docRefs: string[];
  entityRefs: string[];
  flowTags: string[];
} {
  const docRefs: string[] = [];
  const entityRefs: string[] = [];
  const flowTags: string[] = [];

  // Extract @see docs:// references
  let match: RegExpExecArray | null;

  COMMENT_PATTERNS.SEE_DOC.lastIndex = 0;
  while ((match = COMMENT_PATTERNS.SEE_DOC.exec(commentContent)) !== null) {
    if (match[1]) docRefs.push(match[1]);
  }

  // Extract @see entity: references
  COMMENT_PATTERNS.SEE_ENTITY.lastIndex = 0;
  while ((match = COMMENT_PATTERNS.SEE_ENTITY.exec(commentContent)) !== null) {
    if (match[1]) entityRefs.push(match[1]);
  }

  // Extract @flow tags
  COMMENT_PATTERNS.FLOW.lastIndex = 0;
  while ((match = COMMENT_PATTERNS.FLOW.exec(commentContent)) !== null) {
    if (match[1]) {
      const tags = match[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      flowTags.push(...tags);
    }
  }

  // Extract "Part of:" tags
  COMMENT_PATTERNS.PART_OF.lastIndex = 0;
  while ((match = COMMENT_PATTERNS.PART_OF.exec(commentContent)) !== null) {
    if (match[1]) {
      const tags = match[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      flowTags.push(...tags);
    }
  }

  return {
    docRefs: [...new Set(docRefs)],
    entityRefs: [...new Set(entityRefs)],
    flowTags: [...new Set(flowTags)],
  };
}

/**
 * Generate @see docs:// comment syntax
 */
export function generateSeeDocComment(docPath: string): string {
  return `@see docs://${docPath}`;
}

/**
 * Generate @see entity: comment syntax
 */
export function generateSeeEntityComment(entityId: string): string {
  return `@see entity:${entityId}`;
}

/**
 * Generate @flow comment syntax
 */
export function generateFlowComment(flowTags: string[]): string {
  return `@flow ${flowTags.join(", ")}`;
}
