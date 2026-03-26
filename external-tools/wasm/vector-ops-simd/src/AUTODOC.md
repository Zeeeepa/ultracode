# vector-ops-simd

## Overview

This module provides WebAssembly-based SIMD-optimized implementations of fundamental vector operations for use from JavaScript. It exposes core linear algebra primitives—dot product, L2 norm, normalization, and cosine similarity—that process 4 float32 elements per SIMD instruction, delivering significant speedup over pure JavaScript computation. The module bridges high-performance Rust code with JavaScript via `wasm_bindgen`, enabling CPU-efficient vector math for ML embeddings, similarity search, and geometric computations in browsers.

## Flow

```
JavaScript Vectors (Float32Array)
           ↓
    [wasm_bindgen boundary]
           ↓
    SIMD Computation (4-element chunks)
           ├─ Load 4 floats from vector A & B
           ├─ Multiply/Add with SIMD instructions (f32x4_*)
           └─ Accumulate results across chunks
           ↓
    Scalar Reduction (remaining < 4 elements)
           ↓
    Float32 Result
           ↓
    [wasm_bindgen boundary]
           ↓
    JavaScript (f32 score/values)
```

## Entity Listing

### Public API

- **cosine_similarity_simd** — `lib.rs:15-96` — Computes cosine similarity between two equal-length vectors using SIMD, returning a normalized score from 0.0 to 1.0.
- **dot_product_simd** — `lib.rs:100-143` — Calculates the dot product of two vectors using SIMD multiplication and accumulation across 4-element chunks.
- **l2_norm_simd** — `lib.rs:147-185` — Computes the Euclidean (L2) norm of a vector using SIMD to accelerate squared-value accumulation and final square root.
- **normalize_simd** — `lib.rs:189-226` — Returns a normalized unit vector by dividing each element by the vector's L2 norm, computed with SIMD optimization.

### Tests

- **tests** — `lib.rs:229-274` — Module housing unit tests for vector operation correctness.
  - **test_cosine_similarity** — `lib.rs:233-239` — Verifies cosine similarity calculation between known vectors.
  - **test_orthogonal_vectors** — `lib.rs:242-248` — Ensures orthogonal vectors produce zero dot product.
  - **test_dot_product** — `lib.rs:251-257` — Tests dot product computation accuracy.
  - **test_l2_norm** — `lib.rs:260-264` — Validates L2 norm calculation.
  - **test_normalize** — `lib.rs:267-273` — Confirms normalized output has unit length.

## Dependencies

**External:**
- `wasm_bindgen` — FFI bridge exposing Rust functions as JavaScript-callable WASM exports.
- `std::arch::wasm32` — WebAssembly SIMD intrinsics (`f32x4_*` operations) available under `target_feature = "simd128"`.

**Design Pattern:**
SIMD chunking pipeline—functions decompose vectors into 4-element chunks for parallel computation, then reduce remaining scalar elements, minimizing control flow overhead and maximizing instruction-level parallelism.