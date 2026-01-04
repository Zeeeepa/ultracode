/**
 * TypeScript Documentation Extractor
 *
 * Extracts JSDoc documentation from TypeScript AST nodes.
 * Used by typescript-parser.ts.
 */

import ts from "typescript";
import type { ParsedEntity } from "../types/parser.js";

export type Documentation = NonNullable<ParsedEntity["documentation"]>;

/**
 * Extract JSDoc documentation from a node
 */
export function extractDocumentation(node: ts.Node, sourceFile: ts.SourceFile): Documentation | undefined {
  // Get JSDoc comments attached to the node
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return undefined;

  let description: string | undefined;
  const params: NonNullable<Documentation["params"]> = [];
  let returns: Documentation["returns"];
  const throws: NonNullable<Documentation["throws"]> = [];
  const examples: string[] = [];
  let deprecated: string | boolean | undefined;
  const see: string[] = [];
  let since: string | undefined;
  let author: string | undefined;

  for (const jsDoc of jsDocs) {
    if (ts.isJSDoc(jsDoc)) {
      // Main description
      if (jsDoc.comment) {
        const commentText =
          typeof jsDoc.comment === "string" ? jsDoc.comment : jsDoc.comment.map((c) => c.text).join("");
        if (commentText && !description) {
          description = commentText.trim();
        }
      }

      // Process tags
      if (jsDoc.tags) {
        for (const tag of jsDoc.tags) {
          const tagName = tag.tagName.text.toLowerCase();
          const tagComment = tag.comment
            ? typeof tag.comment === "string"
              ? tag.comment
              : tag.comment.map((c) => c.text).join("")
            : undefined;

          switch (tagName) {
            case "param":
            case "arg":
            case "argument":
              if (ts.isJSDocParameterTag(tag)) {
                const paramName = tag.name.getText(sourceFile);
                const paramType = tag.typeExpression?.type.getText(sourceFile);
                const paramDesc = tagComment?.trim();
                const isOptional = tag.isBracketed || paramName.startsWith("[");
                params.push({
                  name: paramName.replace(/^\[|\]$/g, "").split("=")[0] ?? paramName,
                  type: paramType,
                  description: paramDesc,
                  ...(isOptional && { optional: isOptional }),
                });
              }
              break;

            case "returns":
            case "return":
              if (ts.isJSDocReturnTag(tag)) {
                returns = {
                  type: tag.typeExpression?.type.getText(sourceFile),
                  description: tagComment?.trim(),
                };
              }
              break;

            case "throws":
            case "exception":
              throws.push({
                type: ts.isJSDocThrowsTag(tag) ? tag.typeExpression?.type.getText(sourceFile) : undefined,
                description: tagComment?.trim(),
              });
              break;

            case "example":
              if (tagComment) {
                examples.push(tagComment.trim());
              }
              break;

            case "deprecated":
              deprecated = tagComment?.trim() || true;
              break;

            case "see":
              if (tagComment) {
                see.push(tagComment.trim());
              }
              break;

            case "since":
            case "version":
              since = tagComment?.trim();
              break;

            case "author":
              author = tagComment?.trim();
              break;

            case "description":
            case "desc":
              if (tagComment && !description) {
                description = tagComment.trim();
              }
              break;
          }
        }
      }
    }
  }

  // Only return if there's meaningful documentation
  if (
    !description &&
    params.length === 0 &&
    !returns &&
    throws.length === 0 &&
    examples.length === 0 &&
    deprecated === undefined &&
    see.length === 0 &&
    !since &&
    !author
  ) {
    return undefined;
  }

  return {
    description,
    ...(params.length > 0 && { params: params }),
    returns,
    ...(throws.length > 0 && { throws: throws }),
    ...(examples.length > 0 && { examples: examples }),
    deprecated,
    ...(see.length > 0 && { see: see }),
    since,
    author,
  };
}
