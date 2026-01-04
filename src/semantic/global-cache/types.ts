/**
 * Global Embedding Cache Types
 */

export interface GlobalCacheEntry {
  text: string;
  category: "builtin" | "stdlib" | "framework" | "pattern";
  language: string;
  framework?: string;
}

export interface GlobalCacheMetadata {
  version: string;
  model: string;
  dimension: number;
  lastUpdated: string;
  entryCounts: Record<string, number>;
}
