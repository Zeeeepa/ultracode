import { hashText } from "../../utils/fast-hash.js";

/**
 * Normalizes AST for structural hash (Fast Path Level 2).
 *
 * Ignores: whitespace, comments, formatting, optional semicolons.
 * Preserves: structure, identifiers, control flow, logic.
 *
 * Based on StructuralNormalizer from SharpToolsMCP.
 */
export class StructuralNormalizer {
  /**
   * Normalize code for structural comparison.
   *
   * @param code - Source code to normalize
   * @param language - Programming language
   * @returns Normalized code (whitespace/comments removed)
   */
  normalizeCode(code: string, language: string): string {
    // 1. Remove comments
    let normalized = this.removeComments(code, language);

    // 2. Normalize whitespace
    normalized = this.normalizeWhitespace(normalized);

    // 3. Remove trailing semicolons (optional in TS/JS)
    if (language === "typescript" || language === "javascript") {
      normalized = this.removeTrailingSemicolons(normalized);
    }

    // 4. Final cleanup - remove any remaining trailing spaces
    normalized = normalized
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    // 5. Remove spaces before closing brackets (can be left after semicolon removal)
    normalized = normalized.replace(/\s+\}/g, "}");
    normalized = normalized.replace(/\s+\)/g, ")");
    normalized = normalized.replace(/\s+\]/g, "]");

    return normalized.trim();
  }

  /**
   * Compute structural hash.
   *
   * Structural hash ignores formatting but preserves logic.
   * Identical structures produce the same hash.
   *
   * @param normalizedCode - Normalized code from normalizeCode()
   * @returns Hex-encoded SHA256 hash
   */
  computeStructuralHash(normalizedCode: string): string {
    return hashText(normalizedCode);
  }

  /**
   * Remove comments for a given language.
   *
   * Simple regex-based implementation for Fast Path.
   * For full AST analysis use ParserAgent.
   *
   * @param code - Source code
   * @param language - Programming language
   * @returns Code without comments
   */
  private removeComments(code: string, language: string): string {
    // C-style comments (// and /* */)
    if (this.hasCStyleComments(language)) {
      // Remove single-line comments
      code = code.replace(/\/\/.*$/gm, "");
      // Remove multi-line comments
      code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    }

    // Python/Shell comments (#)
    if (language === "python" || language === "bash" || language === "shell") {
      code = code.replace(/#.*$/gm, "");
    }

    return code;
  }

  /**
   * Check whether a language supports C-style comments.
   */
  private hasCStyleComments(language: string): boolean {
    return ["typescript", "javascript", "c", "cpp", "go", "rust", "java"].includes(language);
  }

  /**
   * Normalize whitespace.
   *
   * - Multiple spaces → single space
   * - Spaces inside brackets/parens removed
   * - Empty lines removed
   * - Each line trimmed
   *
   * @param code - Code to normalize
   * @returns Code with normalized whitespace
   */
  private normalizeWhitespace(code: string): string {
    // Replace multiple spaces/tabs with single space
    code = code.replace(/[ \t]+/g, " ");

    // Remove spaces before opening brackets/parens
    code = code.replace(/\s+\(/g, "("); // "foo (" → "foo("
    code = code.replace(/\s+\{/g, "{"); // "User {" → "User{"
    code = code.replace(/\s+\[/g, "["); // "arr [" → "arr["

    // Remove spaces inside parentheses and brackets
    code = code.replace(/\(\s+/g, "("); // "( x" → "(x"
    code = code.replace(/\s+\)/g, ")"); // "x )" → "x)"
    code = code.replace(/\[\s+/g, "["); // "[ x" → "[x"
    code = code.replace(/\s+\]/g, "]"); // "x ]" → "x]"
    code = code.replace(/\{\s+/g, "{"); // "{ x" → "{x"
    code = code.replace(/\s+\}/g, "}"); // "x }" → "x}"

    // Remove spaces around colons (TypeScript types)
    code = code.replace(/\s*:\s*/g, ":"); // " : number " → ":number"

    // Remove empty lines (multiple newlines → single newline)
    code = code.replace(/\n\s*\n/g, "\n");

    // Trim each line
    code = code
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    return code;
  }

  /**
   * Remove trailing semicolons (optional in JS/TS).
   *
   * @param code - Code to process
   * @returns Code without trailing semicolons
   */
  private removeTrailingSemicolons(code: string): string {
    // Remove semicolons before newlines
    code = code.replace(/;(\s*\n)/g, "$1");
    // Remove semicolons before closing braces
    code = code.replace(/;\s*\}/g, "}");
    return code;
  }
}
