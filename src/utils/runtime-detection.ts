/**
 * Runtime Detection Utilities
 *
 * Типизированные утилиты для определения runtime окружения (Bun vs Node.js)
 * и безопасного доступа к runtime-specific функциям.
 *
 * Используется вместо небезопасных `(globalThis as any).Bun` конструкций.
 */

/**
 * Типизированный интерфейс для Bun runtime
 */
interface BunRuntime {
  /**
   * Асинхронная sleep функция из Bun
   * @see https://bun.sh/docs/api/utils#bun-sleep
   */
  sleep(ms: number): Promise<void>;

  /**
   * Версия Bun runtime
   */
  version?: string;
}

/**
 * Расширение globalThis с Bun runtime
 */
type GlobalWithBun = typeof globalThis & {
  Bun?: BunRuntime;
};

/**
 * Безопасная проверка наличия Bun runtime
 *
 * Проверяет process.versions.bun для определения Bun окружения.
 * Работает как в Bun, так и в Node.js.
 *
 * @returns true если код выполняется в Bun, false в Node.js
 *
 * @example
 * ```typescript
 * if (isBunRuntime()) {
 *   console.log("Running in Bun");
 * } else {
 *   console.log("Running in Node.js");
 * }
 * ```
 */
export function isBunRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    process.versions !== null &&
    "bun" in process.versions
  );
}

/**
 * Типизированный доступ к Bun.sleep
 *
 * Безопасно вызывает Bun.sleep с проверкой доступности.
 * Бросает ошибку если Bun.sleep недоступен.
 *
 * @param ms - Количество миллисекунд для sleep
 * @throws {Error} Если Bun.sleep недоступен
 *
 * @example
 * ```typescript
 * try {
 *   await bunSleep(1000);
 * } catch (error) {
 *   console.log("Bun.sleep not available, falling back to setTimeout");
 * }
 * ```
 */
export async function bunSleep(ms: number): Promise<void> {
  const global = globalThis as GlobalWithBun;

  if (isBunRuntime() && global.Bun && typeof global.Bun.sleep === "function") {
    await global.Bun.sleep(ms);
    return;
  }

  throw new Error("Bun.sleep not available");
}

/**
 * Универсальная sleep функция (Bun или Node.js)
 *
 * Автоматически выбирает Bun.sleep или setTimeout в зависимости от окружения.
 * Это основная функция для использования в кроссплатформенном коде.
 *
 * - В Bun: использует нативный Bun.sleep (более эффективный)
 * - В Node.js: использует setTimeout с промисификацией
 *
 * @param ms - Количество миллисекунд для ожидания
 *
 * @example
 * ```typescript
 * // Работает и в Bun, и в Node.js
 * await sleep(1000); // Ждать 1 секунду
 *
 * // В цикле с задержкой
 * for (const item of items) {
 *   await processItem(item);
 *   await sleep(100); // Задержка между обработкой
 * }
 * ```
 */
export async function sleep(ms: number): Promise<void> {
  try {
    // Попробовать использовать Bun.sleep
    await bunSleep(ms);
  } catch {
    // Fallback на setTimeout для Node.js
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Получить версию Bun runtime
 *
 * @returns Версия Bun или undefined если запущено в Node.js
 *
 * @example
 * ```typescript
 * const bunVersion = getBunVersion();
 * if (bunVersion) {
 *   console.log(`Running on Bun ${bunVersion}`);
 * }
 * ```
 */
export function getBunVersion(): string | undefined {
  if (!isBunRuntime()) {
    return undefined;
  }

  const global = globalThis as GlobalWithBun;
  return global.Bun?.version;
}

/**
 * Получить имя текущего runtime
 *
 * @returns "bun" или "node"
 *
 * @example
 * ```typescript
 * const runtime = getRuntimeName();
 * log.i("RUNTIME", "detected", { runtime });
 * ```
 */
export function getRuntimeName(): "bun" | "node" {
  return isBunRuntime() ? "bun" : "node";
}
