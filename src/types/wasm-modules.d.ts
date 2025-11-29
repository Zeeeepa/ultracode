/**
 * Type declarations for WASM modules
 * These modules are built separately by wasm-pack and may not exist during TypeScript compilation.
 *
 * The modules are loaded dynamically with try/catch, so TypeScript just needs to know the shape.
 */

// Diff SIMD module interface
export interface DiffSimdModule {
  compute_diff_simd(old_text: string, new_text: string): string;
}

// Vector Ops SIMD module interface
export interface VectorOpsSimdModule {
  cosine_similarity_simd(a: Float32Array, b: Float32Array): number;
  dot_product_simd(a: Float32Array, b: Float32Array): number;
  normalize_simd(v: Float32Array): void;
  find_top_k_simd(query: Float32Array, vectors: Float32Array[], k: number): Array<{ index: number; score: number }>;
}
