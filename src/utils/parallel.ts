/**
 * Parallel Processing Utilities
 *
 * Provides utilities for running operations in parallel with configurable concurrency.
 * Uses p-limit for controlled concurrency to prevent overwhelming I/O or APIs.
 *
 * Default concurrency: 8 (optimal for most file I/O operations)
 */

import pLimit from "p-limit";

/** Default concurrency for parallel operations */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Map items in parallel with controlled concurrency
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Max concurrent operations (default: 8)
 * @returns Array of results in same order as input
 *
 * @example
 * const files = ["a.ts", "b.ts", "c.ts"];
 * const contents = await mapParallel(files, readText, 4);
 */
export async function mapParallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];
  if (items.length === 1) return [await fn(items[0]!, 0)];

  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}

/**
 * Run async functions in parallel with controlled concurrency
 *
 * @param fns - Array of async functions to execute
 * @param concurrency - Max concurrent operations (default: 8)
 * @returns Array of results in same order as input
 */
export async function runParallel<R>(fns: Array<() => Promise<R>>, concurrency = DEFAULT_CONCURRENCY): Promise<R[]> {
  if (fns.length === 0) return [];
  if (fns.length === 1) return [await fns[0]!()];

  const limit = pLimit(concurrency);
  return Promise.all(fns.map((fn) => limit(fn)));
}

/**
 * Filter items in parallel with controlled concurrency
 *
 * @param items - Array of items to filter
 * @param predicate - Async predicate function
 * @param concurrency - Max concurrent operations (default: 8)
 * @returns Array of items that passed the predicate
 */
export async function filterParallel<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<T[]> {
  if (items.length === 0) return [];

  const limit = pLimit(concurrency);
  const results = await Promise.all(
    items.map((item, index) => limit(async () => ({ item, pass: await predicate(item, index) }))),
  );

  return results.filter((r) => r.pass).map((r) => r.item);
}

/**
 * Execute async function for each item with controlled concurrency (no return)
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Max concurrent operations (default: 8)
 */
export async function forEachParallel<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<void> {
  if (items.length === 0) return;
  if (items.length === 1) {
    await fn(items[0]!, 0);
    return;
  }

  const limit = pLimit(concurrency);
  await Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}

/**
 * Partition items into chunks for batch processing
 *
 * @param items - Array of items to partition
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
export function partition<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Process items in parallel batches
 * Useful when you want to process groups of items together
 *
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param fn - Async function to process each batch
 * @param concurrency - Max concurrent batches (default: 8)
 * @returns Flattened array of results
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[], batchIndex: number) => Promise<R[]>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  const batches = partition(items, batchSize);
  const results = await mapParallel(batches, fn, concurrency);
  return results.flat();
}

/**
 * Collect results from parallel operations with error handling
 * Returns successful results and errors separately
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Max concurrent operations (default: 8)
 * @returns Object with results and errors
 */
export async function collectParallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<{
  results: Array<{ item: T; value: R }>;
  errors: Array<{ item: T; error: Error }>;
}> {
  const limit = pLimit(concurrency);

  const settled = await Promise.all(
    items.map((item, index) =>
      limit(async () => {
        try {
          const value = await fn(item, index);
          return { item, value, success: true as const };
        } catch (err) {
          return { item, error: err as Error, success: false as const };
        }
      }),
    ),
  );

  const results: Array<{ item: T; value: R }> = [];
  const errors: Array<{ item: T; error: Error }> = [];

  for (const r of settled) {
    if (r.success) {
      results.push({ item: r.item, value: r.value });
    } else {
      errors.push({ item: r.item, error: r.error });
    }
  }

  return { results, errors };
}
