/**
 * Kotlin ANTLR AST Helper Utilities
 *
 * Re-exports shared JVM helpers + Kotlin-specific helpers.
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
// KOTLIN-SPECIFIC TYPE EXTRACTION
// =============================================================================

/**
 * Extract base type name from a Kotlin type expression (removes generics, nullable, star projection)
 */
export function extractBaseTypeName(typeText: string): string {
  return typeText
    .replace(/<.*>/, "") // Remove generics
    .replace(/\?$/, "") // Remove nullable marker
    .replace(/\.\*$/, "") // Remove star projection
    .trim();
}

/**
 * Check if type is nullable
 */
export function isNullableType(typeText: string): boolean {
  return typeText.endsWith("?");
}

// =============================================================================
// KOTLIN-SPECIFIC KEYWORDS
// =============================================================================

/**
 * Kotlin keywords that should not be treated as method calls
 */
export const KOTLIN_KEYWORDS = new Set([
  // Control flow
  "if",
  "else",
  "when",
  "for",
  "while",
  "do",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "break",
  "continue",

  // Declarations
  "class",
  "interface",
  "object",
  "fun",
  "val",
  "var",
  "typealias",
  "constructor",
  "init",

  // Modifiers
  "public",
  "private",
  "protected",
  "internal",
  "open",
  "final",
  "abstract",
  "sealed",
  "data",
  "enum",
  "annotation",
  "inner",
  "companion",
  "inline",
  "noinline",
  "crossinline",
  "reified",
  "suspend",
  "tailrec",
  "operator",
  "infix",
  "external",
  "const",
  "lateinit",
  "vararg",

  // Special
  "this",
  "super",
  "null",
  "true",
  "false",
  "is",
  "as",
  "in",
  "out",
  "where",
  "by",
  "get",
  "set",
  "field",
  "it",
  "import",
  "package",
]);

/**
 * Kotlin scope functions
 */
export const KOTLIN_SCOPE_FUNCTIONS = new Set(["let", "run", "with", "apply", "also"]);

/**
 * Kotlin coroutine builders
 */
export const KOTLIN_COROUTINE_BUILDERS = new Set([
  "launch",
  "async",
  "runBlocking",
  "withContext",
  "coroutineScope",
  "supervisorScope",
]);

/**
 * Kotlin flow operators
 */
export const KOTLIN_FLOW_OPERATORS = new Set([
  "flow",
  "flowOf",
  "asFlow",
  "collect",
  "map",
  "filter",
  "take",
  "drop",
  "transform",
  "flatMapConcat",
  "flatMapMerge",
  "flatMapLatest",
  "combine",
  "zip",
  "stateIn",
  "shareIn",
]);

/**
 * Check if a name is a Kotlin keyword
 */
export function isKotlinKeyword(name: string): boolean {
  return KOTLIN_KEYWORDS.has(name);
}

/**
 * Check if a name is a scope function
 */
export function isScopeFunction(name: string): boolean {
  return KOTLIN_SCOPE_FUNCTIONS.has(name);
}

/**
 * Check if a name is a coroutine builder
 */
export function isCoroutineBuilder(name: string): boolean {
  return KOTLIN_COROUTINE_BUILDERS.has(name);
}

/**
 * Check if a name is a flow operator
 */
export function isFlowOperator(name: string): boolean {
  return KOTLIN_FLOW_OPERATORS.has(name);
}

// =============================================================================
// CALL TARGET DETECTION
// =============================================================================

/**
 * Determine the call target from an expression
 * Handles Kotlin-specific patterns like safe calls (?.) and scope functions
 */
export function determineCallTarget(expressionText: string): {
  target?: string;
  name: string;
  isSafeCall: boolean;
} {
  // Check for safe call
  const isSafeCall = expressionText.includes("?.");

  // Split by both . and ?.
  const parts = expressionText.split(/\??\./).filter((p) => p);

  if (parts.length === 1) {
    return { name: parts[0] || "", isSafeCall: false };
  }

  const name = parts.pop()!;
  const target = parts.join(".");

  // Normalize 'this' at the start
  if (parts[0] === "this" && parts.length === 1) {
    return { target: "this", name, isSafeCall };
  }

  return { target, name, isSafeCall };
}

/**
 * Check if expression represents a companion object call
 */
export function isCompanionCall(target: string): boolean {
  return target.endsWith(".Companion") || /^[A-Z]/.test(target);
}

/**
 * Check if call is a lambda invocation (implicit invoke)
 */
export function isLambdaInvocation(expressionText: string): boolean {
  // Patterns like: lambda(), block(), callback()
  return /^[a-z_]\w*\s*\(/.test(expressionText) && !KOTLIN_KEYWORDS.has(expressionText.split("(")[0] || "");
}

// =============================================================================
// EXTENSION FUNCTION HELPERS
// =============================================================================

/**
 * Extract receiver type from extension function declaration
 */
export function extractReceiverType(functionText: string): string | undefined {
  // Pattern: fun ReceiverType.functionName(...)
  const match = functionText.match(/fun\s+(\w+(?:<[^>]+>)?(?:\?)?)\.(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Check if a function declaration is an extension function
 */
export function isExtensionFunction(functionText: string): boolean {
  return /fun\s+\w+(?:<[^>]+>)?(?:\?)?\./.test(functionText);
}
