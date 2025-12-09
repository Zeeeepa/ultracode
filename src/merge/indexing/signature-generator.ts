import { hashText } from "../../utils/fast-hash.js";
import type { CodeUnit } from "../models/code-unit.js";

/**
 * Генерирует signatures для CodeUnit.
 *
 * Signature = FQN + параметры (для функций) или FQN + type parameters (для классов).
 * Используется для Fast Path Level 3 matching.
 *
 * Основано на SignatureGenerator из SharpToolsMCP.
 */
export class SignatureGenerator {
  /**
   * Генерировать signature для CodeUnit.
   *
   * @param unit - Code unit to generate signature for
   * @returns Signature string (or undefined if not applicable)
   */
  generateSignature(unit: CodeUnit): string | undefined {
    switch (unit.type) {
      case "function":
      case "method":
        return this.generateFunctionSignature(unit);

      case "class":
      case "interface":
        return this.generateTypeSignature(unit);

      case "file":
      case "module":
        return this.generateModuleSignature(unit);

      default:
        // Properties, blocks, statements don't have meaningful signatures
        return undefined;
    }
  }

  /**
   * Генерировать signature для функции/метода.
   *
   * Format: FQN(param1Type, param2Type, ...)
   * Example: "MyClass.getUserById(number)"
   */
  private generateFunctionSignature(unit: CodeUnit): string {
    const fqn = unit.fullyQualifiedName;

    // Extract parameters from content if available
    const params = this.extractParameters(unit.content, unit.language);

    if (params.length === 0) {
      return `${fqn}()`;
    }

    // For TypeScript/JavaScript, extract types
    const paramTypes = params.map((p) => this.extractParameterType(p, unit.language));

    return `${fqn}(${paramTypes.join(",")})`;
  }

  /**
   * Генерировать signature для класса/интерфейса.
   *
   * Format: FQN<TypeParam1, TypeParam2, ...>
   * Example: "List<T>"
   */
  private generateTypeSignature(unit: CodeUnit): string {
    const fqn = unit.fullyQualifiedName;

    // Extract type parameters if present
    const typeParams = this.extractTypeParameters(unit.content, unit.language);

    if (typeParams.length === 0) {
      return fqn;
    }

    return `${fqn}<${typeParams.join(",")}>`;
  }

  /**
   * Генерировать signature для модуля/файла.
   *
   * Format: module:FQN:exports
   * Example: "module:utils/array:map,filter,reduce"
   */
  private generateModuleSignature(unit: CodeUnit): string {
    const fqn = unit.fullyQualifiedName;

    // Extract exports from structure if available
    const exports = unit.structure?.exports ? Array.from(unit.structure.exports).sort().join(",") : "";

    return `module:${fqn}:${exports}`;
  }

  /**
   * Извлечь параметры функции из кода.
   */
  private extractParameters(content: string, language: string): string[] {
    // Simple regex-based extraction
    // For production, use ParserAgent for AST-based extraction

    if (language === "typescript" || language === "javascript") {
      // Match function/method parameters: function foo(a, b, c)
      const match = content.match(/\(([^)]*)\)/);
      if (!match || !match[1]) return [];

      return match[1]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }

    if (language === "python") {
      // Match def foo(a, b, c) or def foo(self, a, b)
      const match = content.match(/def\s+\w+\(([^)]*)\)/);
      if (!match || !match[1]) return [];

      return match[1]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && p !== "self" && p !== "cls");
    }

    return [];
  }

  /**
   * Извлечь тип параметра.
   */
  private extractParameterType(param: string, language: string): string {
    if (language === "typescript") {
      // param format: "name: type" or "name?: type"
      const match = param.match(/:\s*([^=]+)/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    if (language === "python") {
      // param format: "name: type" (Python 3.5+ type hints)
      const match = param.match(/:\s*(.+)/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    // Default: use parameter name as type (untyped)
    const parts = param.split(":")[0]?.split("=")[0];
    return parts?.trim() || param.trim();
  }

  /**
   * Извлечь type parameters (generics).
   */
  private extractTypeParameters(content: string, language: string): string[] {
    if (language === "typescript" || language === "javascript") {
      // Match class Foo<T, U> or interface Bar<T>
      const match = content.match(/(?:class|interface)\s+\w+<([^>]+)>/);
      if (!match || !match[1]) return [];

      return match[1]
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    if (language === "java") {
      // Match class Foo<T, U> or interface Bar<T>
      const match = content.match(/(?:class|interface)\s+\w+<([^>]+)>/);
      if (!match || !match[1]) return [];

      return match[1]
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    return [];
  }

  /**
   * Вычислить hash signature (для compact storage).
   *
   * @param signature - Signature string
   * @returns SHA256 hash of signature
   */
  computeSignatureHash(signature: string): string {
    return hashText(signature);
  }

  /**
   * Нормализовать signature для сравнения.
   *
   * Removes whitespace, normalizes casing (for case-insensitive languages).
   */
  normalizeSignature(signature: string, _language: string): string {
    // Remove all whitespace
    const normalized = signature.replace(/\s+/g, "");

    return normalized;
  }
}
