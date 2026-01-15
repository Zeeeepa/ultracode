/**
 * Error Handling Utilities
 *
 * Типизированные утилиты для безопасной обработки unknown в catch блоках.
 * Используется для соответствия tsconfig.json: useUnknownInCatchVariables: true
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html#useunknownincatchvariables
 */

/**
 * Type guard для проверки Error объектов
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("test");
 * } catch (e: unknown) {
 *   if (isError(e)) {
 *     console.log(e.message); // TypeScript знает что e это Error
 *   }
 * }
 * ```
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Безопасная конвертация unknown в Error
 *
 * Используется в catch блоках для получения Error объекта из unknown.
 * Поддерживает конвертацию из строк, объектов с message, и других типов.
 *
 * @param value - Значение для конвертации (обычно из catch блока)
 * @returns Error объект
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
  // Уже Error - вернуть как есть
  if (isError(value)) {
    return value;
  }

  // Строка - создать Error с этим сообщением
  if (typeof value === "string") {
    return new Error(value);
  }

  // Объект с message - извлечь message
  if (value && typeof value === "object" && "message" in value) {
    const message = String(value.message);
    const error = new Error(message);

    // Если есть stack, сохранить его
    if ("stack" in value && typeof value.stack === "string") {
      error.stack = value.stack;
    }

    // Если есть name, сохранить его
    if ("name" in value && typeof value.name === "string") {
      error.name = value.name;
    }

    return error;
  }

  // Fallback - конвертировать в строку
  return new Error(String(value));
}

/**
 * Получить сообщение об ошибке из unknown
 *
 * Более лёгкая альтернатива toError когда нужно только сообщение.
 *
 * @param error - Ошибка для извлечения сообщения
 * @returns Сообщение об ошибке
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
 * Получить stack trace из unknown
 *
 * @param error - Ошибка для извлечения stack trace
 * @returns Stack trace или undefined если не доступен
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
 * Получить имя ошибки из unknown
 *
 * @param error - Ошибка для извлечения имени
 * @returns Имя ошибки или "Error" по умолчанию
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
