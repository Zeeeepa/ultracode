/**
 * OVMS Provider Utilities
 *
 * Common utilities for OVMS provider.
 */

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
export async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * L2 normalize a vector in-place
 */
export function normalizeVector(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    const val = vec[i]!;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = vec[i]! / norm;
    }
  }
}

/**
 * Model name to HuggingFace model ID mapping
 */
export const MODEL_MAP: Record<string, string> = {
  "all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
  "bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
  "gte-small": "Xenova/gte-small",
  "multilingual-e5-base": "Xenova/multilingual-e5-base",
  "distiluse-base-multilingual-cased-v2": "Xenova/distiluse-base-multilingual-cased-v2",
  "paraphrase-multilingual-MiniLM-L12-v2": "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  "granite-embedding-278m-multilingual": "ibm-granite/granite-embedding-278m-multilingual",
  "granite-embedding-30m-english": "ibm-granite/granite-embedding-30m-english",
};

/**
 * Get the HuggingFace model ID for tokenizer
 */
export function getTokenizerModel(modelId: string): string {
  return MODEL_MAP[modelId] || `Xenova/${modelId}`;
}

/**
 * GPU warmup sample texts that resemble real code snippets
 */
export const GPU_WARMUP_TEXTS = [
  "function processData(input: string): Promise<Result>",
  "class UserService implements IUserRepository",
  "async function fetchApiData(url: string, options?: RequestOptions)",
  "interface ConfigOptions { timeout: number; retries: number }",
  "export const validateInput = (data: unknown): data is ValidData =>",
  "const handleError = (error: Error): void => console.error(error)",
  "type AsyncHandler<T> = (request: Request) => Promise<T>",
  "abstract class BaseController extends EventEmitter",
];
