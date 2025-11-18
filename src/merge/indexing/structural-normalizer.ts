import { createHash } from "node:crypto";

/**
 * Нормализует AST для structural hash (Fast Path Level 2).
 *
 * Игнорирует: whitespace, comments, formatting, optional semicolons.
 * Сохраняет: structure, identifiers, control flow, logic.
 *
 * Основано на StructuralNormalizer из SharpToolsMCP.
 */
export class StructuralNormalizer {
  /**
   * Нормализовать код для structural comparison.
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
   * Вычислить structural hash.
   *
   * Structural hash игнорирует formatting но сохраняет логику.
   * Идентичные структуры дают одинаковый hash.
   *
   * @param normalizedCode - Normalized code from normalizeCode()
   * @returns Hex-encoded SHA256 hash
   */
  computeStructuralHash(normalizedCode: string): string {
    return createHash("sha256").update(normalizedCode, "utf8").digest("hex");
  }

  /**
   * Удалить комментарии для заданного языка.
   *
   * Простая regex-based реализация для Fast Path.
   * Для полного AST анализа использовать ParserAgent.
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
   * Проверить поддерживает ли язык C-style комментарии.
   */
  private hasCStyleComments(language: string): boolean {
    return ["typescript", "javascript", "c", "cpp", "csharp", "go", "rust", "java"].includes(language);
  }

  /**
   * Нормализовать whitespace.
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
   * Удалить trailing semicolons (опциональны в JS/TS).
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
