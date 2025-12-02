/**
 * Response size limits and pagination utilities for MCP tools
 *
 * Claude has ~200K token context window. Safe response sizes:
 * - 50KB JSON = ~15K tokens (safe)
 * - 100KB JSON = ~30K tokens (caution)
 * - 150KB+ JSON = likely to cause 413 errors
 */

/** Maximum response size in bytes before truncation */
export const MAX_RESPONSE_SIZE_BYTES = 50_000; // 50KB

/** Default pagination limits */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Safe limits for different data types */
export const SAFE_LIMITS = {
  entities: 100,
  relationships: 100,
  clones: 30,
  searchResults: 20,
  hotspots: 20,
  graphNodes: 200,
} as const;

/**
 * Pagination metadata returned with paginated results
 */
export interface PaginationMeta {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Apply pagination to an array
 */
export function paginate<T>(
  items: T[],
  offset: number = 0,
  limit: number = DEFAULT_PAGE_SIZE
): PaginatedResult<T> {
  const safeLimit = Math.min(limit, MAX_PAGE_SIZE);
  const safeOffset = Math.max(0, offset);

  const total = items.length;
  const data = items.slice(safeOffset, safeOffset + safeLimit);
  const hasMore = safeOffset + safeLimit < total;

  return {
    data,
    pagination: {
      offset: safeOffset,
      limit: safeLimit,
      total,
      hasMore,
      ...(hasMore && { nextOffset: safeOffset + safeLimit }),
    },
  };
}

/**
 * Truncation result
 */
export interface TruncationResult {
  text: string;
  wasTruncated: boolean;
  originalSize: number;
  truncatedSize: number;
}

/**
 * Truncate response if it exceeds max size
 * Adds truncation notice with hint on how to get more data
 */
export function truncateResponse(
  data: unknown,
  maxSize: number = MAX_RESPONSE_SIZE_BYTES
): TruncationResult {
  const jsonText = JSON.stringify(data, null, 2);
  const originalSize = Buffer.byteLength(jsonText, 'utf8');

  if (originalSize <= maxSize) {
    return {
      text: jsonText,
      wasTruncated: false,
      originalSize,
      truncatedSize: originalSize,
    };
  }

  // Need to truncate - try to find a safe cut point
  const truncatedData = truncateData(data, maxSize);
  const truncatedJson = JSON.stringify(truncatedData, null, 2);

  return {
    text: truncatedJson,
    wasTruncated: true,
    originalSize,
    truncatedSize: Buffer.byteLength(truncatedJson, 'utf8'),
  };
}

/**
 * Recursively truncate data to fit within size limit
 */
function truncateData(data: unknown, maxSize: number): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return truncateArray(data, maxSize);
  }

  return truncateObject(data as Record<string, unknown>, maxSize);
}

/**
 * Truncate array to fit within size limit
 */
function truncateArray(arr: unknown[], maxSize: number): unknown {
  // Start with full array, reduce until fits
  let items = arr;
  let estimatedSize = JSON.stringify(items).length;

  while (estimatedSize > maxSize * 0.8 && items.length > 1) {
    // Cut array in half each iteration
    const newLength = Math.max(1, Math.floor(items.length / 2));
    items = arr.slice(0, newLength);
    estimatedSize = JSON.stringify(items).length;
  }

  const truncated = items.length < arr.length;

  if (truncated) {
    return {
      _truncated: true,
      _message: `Response truncated. Showing ${items.length} of ${arr.length} items. Use 'offset' parameter to paginate.`,
      _total: arr.length,
      _showing: items.length,
      items,
    };
  }

  return items;
}

/**
 * Truncate object - prioritize certain fields
 */
function truncateObject(
  obj: Record<string, unknown>,
  maxSize: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Priority fields to keep
  const priorityFields = ['id', 'name', 'type', 'count', 'total', 'pagination', 'error', 'success'];
  const arrayFields: string[] = [];

  // First pass: add priority fields and identify arrays
  for (const key of Object.keys(obj)) {
    if (priorityFields.includes(key)) {
      result[key] = obj[key];
    } else if (Array.isArray(obj[key])) {
      arrayFields.push(key);
    }
  }

  // Second pass: add non-array, non-priority fields
  for (const key of Object.keys(obj)) {
    if (!priorityFields.includes(key) && !Array.isArray(obj[key])) {
      result[key] = obj[key];
    }
  }

  // Third pass: truncate and add array fields
  for (const key of arrayFields) {
    const arr = obj[key] as unknown[];
    const remainingSize = maxSize - JSON.stringify(result).length;
    result[key] = truncateArray(arr, remainingSize * 0.8);
  }

  return result;
}

/**
 * Create a safe response that won't exceed limits
 * Automatically adds pagination info if data is truncated
 */
export function createSafeResponse(
  data: Record<string, unknown>,
  options: {
    maxSize?: number;
  } = {}
): string {
  const { maxSize = MAX_RESPONSE_SIZE_BYTES } = options;

  const result = truncateResponse(data, maxSize);

  if (result.wasTruncated) {
    // Parse truncated result and add metadata
    const parsed = JSON.parse(result.text);
    parsed._responseMeta = {
      truncated: true,
      originalSize: result.originalSize,
      truncatedSize: result.truncatedSize,
      hint: "Use 'offset' and 'limit' parameters for pagination",
    };
    return JSON.stringify(parsed, null, 2);
  }

  return result.text;
}

/**
 * Standard pagination schema fields for Zod
 * Add these to tool schemas that return lists
 */
export const paginationSchemaFields = {
  offset: {
    type: 'number',
    default: 0,
    description: 'Number of items to skip (for pagination)',
  },
  limit: {
    type: 'number',
    default: DEFAULT_PAGE_SIZE,
    description: `Maximum items to return (max ${MAX_PAGE_SIZE})`,
  },
} as const;

/**
 * Helper to add pagination info to response
 */
export function withPagination<T extends Record<string, unknown>>(
  response: T,
  pagination: PaginationMeta
): T & { pagination: PaginationMeta } {
  return {
    ...response,
    pagination,
  };
}
