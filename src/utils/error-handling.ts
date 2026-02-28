/**
 * Error Handling Utilities
 *
 * Typed utilities for safe handling of unknown in catch blocks.
 * Used for compliance with tsconfig.json: useUnknownInCatchVariables: true
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html#useunknownincatchvariables
 */

/**
 * Type guard for checking Error objects
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("test");
 * } catch (e: unknown) {
 *   if (isError(e)) {
 *     console.log(e.message); // TypeScript knows that e is an Error
 *   }
 * }
 * ```
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safe conversion of unknown to Error
 *
 * Used in catch blocks to get an Error object from unknown.
 * Supports conversion from strings, objects with message, and other types.
 *
 * @param value - Value to convert (usually from catch block)
 * @returns Error object
 *
 * @example
 * ```typescript
 * try {
 *   await dangerousOperation();
 * } catch (error: unknown) {
 *   const err = toError(error);
 *   log.e("TAG", "operation_failed", {
 *     error: err.message,
 *     stack: err.stack
 *   });
 * }
 * ```
 */
export function toError(value: unknown): Error {
  // Already an Error - return as is
  if (isError(value)) {
    return value;
  }

  // String - create Error with this message
  if (typeof value === "string") {
    return new Error(value);
  }

  // Object with message - extract message
  if (value && typeof value === "object" && "message" in value) {
    const message = String(value.message);
    const error = new Error(message);

    // If stack exists, preserve it
    if ("stack" in value && typeof value.stack === "string") {
      error.stack = value.stack;
    }

    // If name exists, preserve it
    if ("name" in value && typeof value.name === "string") {
      error.name = value.name;
    }

    return error;
  }

  // Fallback - convert to string
  return new Error(String(value));
}

/**
 * Get error message from unknown
 *
 * A lighter alternative to toError when only the message is needed.
 *
 * @param error - Error to extract message from
 * @returns Error message
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (e: unknown) {
 *   console.error("Failed:", getErrorMessage(e));
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return String(error);
}

/**
 * Get stack trace from unknown
 *
 * @param error - Error to extract stack trace from
 * @returns Stack trace or undefined if not available
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("test");
 * } catch (e: unknown) {
 *   const stack = getErrorStack(e);
 *   if (stack) {
 *     log.d("STACK", "error_trace", { stack });
 *   }
 * }
 * ```
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }

  if (error && typeof error === "object" && "stack" in error && typeof error.stack === "string") {
    return error.stack;
  }

  return undefined;
}

/**
 * Get error name from unknown
 *
 * @param error - Error to extract name from
 * @returns Error name or "Error" by default
 *
 * @example
 * ```typescript
 * try {
 *   throw new TypeError("Invalid type");
 * } catch (e: unknown) {
 *   console.log(getErrorName(e)); // "TypeError"
 * }
 * ```
 */
export function getErrorName(error: unknown): string {
  if (isError(error)) {
    return error.name;
  }

  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }

  return "Error";
}
