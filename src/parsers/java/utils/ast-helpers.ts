/**
 * Java ANTLR AST Helper Utilities
 *
 * Re-exports shared JVM helpers + Java-specific helpers.
 */

// Re-export all shared JVM helpers
export {
  extractGenericArguments,
  findAllDescendants,
  findAncestor,
  getIdentifierText,
  getLocation,
  getTerminalLocation,
  getText,
  getTextTrimmed,
  isSuperCall,
  isThisCall,
  visitChildren,
} from "../../jvm/shared-ast-helpers.js";

// =============================================================================
// JAVA-SPECIFIC TYPE EXTRACTION
// =============================================================================

/**
 * Extract base type name from a Java type expression (removes generics, arrays, varargs)
 */
export function extractBaseTypeName(typeText: string): string {
  return typeText
    .replace(/<.*>/, "") // Remove generics
    .replace(/\[\]$/, "") // Remove array brackets
    .replace(/\.\.\./, "") // Remove varargs
    .trim();
}

// =============================================================================
// JAVA-SPECIFIC HELPERS
// =============================================================================

/**
 * Java keywords that should not be treated as method calls
 */
export const JAVA_KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "new",
  "instanceof",
  "synchronized",
  "assert",
  "break",
  "continue",
  "default",
  "super",
  "this",
  "class",
  "interface",
  "enum",
  "extends",
  "implements",
  "import",
  "package",
  "public",
  "private",
  "protected",
  "static",
  "final",
  "abstract",
  "native",
  "strictfp",
  "transient",
  "volatile",
  "void",
  "boolean",
  "byte",
  "char",
  "short",
  "int",
  "long",
  "float",
  "double",
]);

/**
 * Common Java primitives
 */
export const JAVA_PRIMITIVES = new Set(["boolean", "byte", "char", "short", "int", "long", "float", "double", "void"]);

/**
 * Check if a name is a Java keyword
 */
export function isJavaKeyword(name: string): boolean {
  return JAVA_KEYWORDS.has(name);
}

/**
 * Check if a type is a Java primitive
 */
export function isJavaPrimitive(type: string): boolean {
  return JAVA_PRIMITIVES.has(type);
}

// =============================================================================
// CALL TARGET DETECTION
// =============================================================================

/**
 * Determine the call target from an expression
 */
export function determineCallTarget(expressionText: string): { target?: string; name: string } {
  // Handle chained calls like a.b.c()
  const parts = expressionText.split(".");
  if (parts.length === 1) {
    return { name: parts[0] || "" };
  }

  const name = parts.pop() || "";
  const target = parts.join(".");

  // Normalize 'this' at the start
  if (parts[0] === "this" && parts.length === 1) {
    return { target: "this", name };
  }

  return { target, name };
}

/**
 * Check if expression represents a static call
 */
export function isStaticCall(target: string): boolean {
  // Static calls typically start with uppercase (ClassName.method())
  return /^[A-Z]/.test(target);
}
