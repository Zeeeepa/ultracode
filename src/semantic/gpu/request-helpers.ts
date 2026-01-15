/**
 * GPU Request Helpers
 *
 * Утилиты для работы с GPU Worker requests.
 * Извлечение векторов и преобразование данных для передачи через IPC.
 *
 * Используется в gpu-client.ts для подготовки данных перед отправкой в worker.
 */

import {
  isCudaBatchCosineRequest,
  isCudaCosineRequest,
  isFaissAddRequest,
  isFaissBatchSearchRequest,
  isFaissSearchRequest,
  isFaissTrainRequest,
} from "./type-guards.js";
import type { GpuWorkerRequest } from "./types.js";

/**
 * Результат извлечения векторов из request
 */
export interface ExtractedVectors {
  /**
   * Извлечённые векторы в Float32Array формате
   * Может быть undefined для requests без векторов (например stats, shutdown)
   */
  vectors?: Float32Array;

  /**
   * Данные заголовка запроса без векторов
   * Содержит type, ids, k и другие параметры
   */
  headerData: Record<string, unknown>;
}

/**
 * Типизированное извлечение векторов из GPU request
 *
 * Безопасно извлекает векторные данные из различных типов GPU запросов,
 * конвертируя их в Float32Array для передачи через stdin/stdout.
 * Остальные данные запроса сохраняются в headerData.
 *
 * **Поддерживаемые типы:**
 * - `faiss.add` - извлекает vectors
 * - `faiss.search` - извлекает vector
 * - `faiss.batchSearch` - извлекает vectors
 * - `faiss.train` - извлекает vectors
 * - `cuda.cosine` - объединяет a и b в один массив
 * - `cuda.batchCosine` - объединяет query и database в один массив
 *
 * @param request - GPU Worker request для обработки
 * @returns Объект с vectors (Float32Array) и headerData
 *
 * @example
 * ```typescript
 * const request: FaissSearchRequest = {
 *   type: "faiss.search",
 *   vector: [0.1, 0.2, 0.3],
 *   k: 10
 * };
 *
 * const { vectors, headerData } = extractVectorsFromRequest(request);
 * // vectors: Float32Array([0.1, 0.2, 0.3])
 * // headerData: { type: "faiss.search", k: 10 }
 * ```
 *
 * @example
 * ```typescript
 * // CUDA операция - объединяет 2 вектора
 * const request: CudaCosineRequest = {
 *   type: "cuda.cosine",
 *   a: [1, 2, 3],
 *   b: [4, 5, 6]
 * };
 *
 * const { vectors, headerData } = extractVectorsFromRequest(request);
 * // vectors: Float32Array([1, 2, 3, 4, 5, 6])
 * // headerData: { type: "cuda.cosine", dimensions: 3 }
 * ```
 */
export function extractVectorsFromRequest(request: GpuWorkerRequest): ExtractedVectors {
  // Faiss.add: извлечь vectors array
  if (isFaissAddRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.search: извлечь single vector
  if (isFaissSearchRequest(request)) {
    const { vector: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.batchSearch: извлечь vectors array
  if (isFaissBatchSearchRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.train: извлечь vectors array
  if (isFaissTrainRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // CUDA cosine: объединить a и b в один массив
  if (isCudaCosineRequest(request)) {
    const { a, b, ...rest } = request;
    const aArr = a instanceof Float32Array ? a : new Float32Array(a);
    const bArr = b instanceof Float32Array ? b : new Float32Array(b);

    // Создать объединённый массив: [a..., b...]
    const totalLen = aArr.length + bArr.length;
    const vectors = new Float32Array(totalLen);
    vectors.set(aArr, 0);
    vectors.set(bArr, aArr.length);

    // Добавить dimensions для worker'a
    const headerData = {
      ...rest,
      dimensions: aArr.length,
    };

    return { vectors, headerData };
  }

  // CUDA batchCosine: объединить query и database arrays
  if (isCudaBatchCosineRequest(request)) {
    const { query, database, ...rest } = request;
    const queryArr = query instanceof Float32Array ? query : new Float32Array(query);

    // Конвертировать database arrays в Float32Array
    const dbArrs = database.map((d) => (d instanceof Float32Array ? d : new Float32Array(d)));

    // Вычислить общую длину: query + sum(database lengths)
    const totalLen = queryArr.length + dbArrs.reduce((sum, arr) => sum + arr.length, 0);

    // Создать объединённый массив: [query..., db1..., db2..., ...]
    const vectors = new Float32Array(totalLen);
    vectors.set(queryArr, 0);

    let offset = queryArr.length;
    for (const arr of dbArrs) {
      vectors.set(arr, offset);
      offset += arr.length;
    }

    // Добавить метаданные для worker'a
    const headerData = {
      ...rest,
      dimensions: queryArr.length,
      queryCount: 1,
      databaseCount: dbArrs.length,
    };

    return { vectors, headerData };
  }

  // Для остальных типов (stats, shutdown, etc.) - только headerData
  const headerData: Record<string, unknown> = { ...request };
  return { headerData };
}
