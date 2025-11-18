use wasm_bindgen::prelude::*;

/// Compute cosine similarity between two vectors using SIMD
///
/// This function is optimized for WebAssembly SIMD instructions,
/// providing significant speedup over pure JavaScript implementation.
///
/// # Arguments
/// * `a` - First vector (Float32Array)
/// * `b` - Second vector (Float32Array)
///
/// # Returns
/// Cosine similarity score (0.0 to 1.0)
#[wasm_bindgen]
pub fn cosine_similarity_simd(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let len = a.len();

    // Use SIMD for 4-element chunks
    let chunks = len / 4;

    let mut dot_product = 0.0_f32;
    let mut norm_a = 0.0_f32;
    let mut norm_b = 0.0_f32;

    // Process 4 elements at a time using SIMD
    #[cfg(target_feature = "simd128")]
    {
        use std::arch::wasm32::*;

        unsafe {
            let mut dot_vec = f32x4_splat(0.0);
            let mut norm_a_vec = f32x4_splat(0.0);
            let mut norm_b_vec = f32x4_splat(0.0);

            for i in 0..chunks {
                let idx = i * 4;

                // Load 4 elements from each vector
                let va = v128_load(&a[idx] as *const f32 as *const v128);
                let vb = v128_load(&b[idx] as *const f32 as *const v128);

                // Compute dot product: a · b
                dot_vec = f32x4_add(dot_vec, f32x4_mul(va, vb));

                // Compute norms: ||a||² and ||b||²
                norm_a_vec = f32x4_add(norm_a_vec, f32x4_mul(va, va));
                norm_b_vec = f32x4_add(norm_b_vec, f32x4_mul(vb, vb));
            }

            // Horizontal sum (reduce SIMD vector to scalar)
            dot_product = f32x4_extract_lane::<0>(dot_vec)
                + f32x4_extract_lane::<1>(dot_vec)
                + f32x4_extract_lane::<2>(dot_vec)
                + f32x4_extract_lane::<3>(dot_vec);

            norm_a = f32x4_extract_lane::<0>(norm_a_vec)
                + f32x4_extract_lane::<1>(norm_a_vec)
                + f32x4_extract_lane::<2>(norm_a_vec)
                + f32x4_extract_lane::<3>(norm_a_vec);

            norm_b = f32x4_extract_lane::<0>(norm_b_vec)
                + f32x4_extract_lane::<1>(norm_b_vec)
                + f32x4_extract_lane::<2>(norm_b_vec)
                + f32x4_extract_lane::<3>(norm_b_vec);
        }
    }

    // Handle remainder (non-SIMD)
    #[cfg(not(target_feature = "simd128"))]
    {
        // Fallback: pure scalar implementation
        for i in 0..(chunks * 4) {
            dot_product += a[i] * b[i];
            norm_a += a[i] * a[i];
            norm_b += b[i] * b[i];
        }
    }

    // Process remaining elements
    for i in (chunks * 4)..len {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    // Compute cosine similarity
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

/// Compute dot product of two vectors using SIMD
#[wasm_bindgen]
pub fn dot_product_simd(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let len = a.len();
    let chunks = len / 4;
    let mut result = 0.0_f32;

    #[cfg(target_feature = "simd128")]
    {
        use std::arch::wasm32::*;

        unsafe {
            let mut sum_vec = f32x4_splat(0.0);

            for i in 0..chunks {
                let idx = i * 4;
                let va = v128_load(&a[idx] as *const f32 as *const v128);
                let vb = v128_load(&b[idx] as *const f32 as *const v128);
                sum_vec = f32x4_add(sum_vec, f32x4_mul(va, vb));
            }

            result = f32x4_extract_lane::<0>(sum_vec)
                + f32x4_extract_lane::<1>(sum_vec)
                + f32x4_extract_lane::<2>(sum_vec)
                + f32x4_extract_lane::<3>(sum_vec);
        }
    }

    #[cfg(not(target_feature = "simd128"))]
    {
        for i in 0..(chunks * 4) {
            result += a[i] * b[i];
        }
    }

    // Handle remainder
    for i in (chunks * 4)..len {
        result += a[i] * b[i];
    }

    result
}

/// Compute L2 norm (Euclidean norm) of a vector using SIMD
#[wasm_bindgen]
pub fn l2_norm_simd(vec: &[f32]) -> f32 {
    let len = vec.len();
    let chunks = len / 4;
    let mut sum = 0.0_f32;

    #[cfg(target_feature = "simd128")]
    {
        use std::arch::wasm32::*;

        unsafe {
            let mut sum_vec = f32x4_splat(0.0);

            for i in 0..chunks {
                let idx = i * 4;
                let v = v128_load(&vec[idx] as *const f32 as *const v128);
                sum_vec = f32x4_add(sum_vec, f32x4_mul(v, v));
            }

            sum = f32x4_extract_lane::<0>(sum_vec)
                + f32x4_extract_lane::<1>(sum_vec)
                + f32x4_extract_lane::<2>(sum_vec)
                + f32x4_extract_lane::<3>(sum_vec);
        }
    }

    #[cfg(not(target_feature = "simd128"))]
    {
        for i in 0..(chunks * 4) {
            sum += vec[i] * vec[i];
        }
    }

    // Handle remainder
    for i in (chunks * 4)..len {
        sum += vec[i] * vec[i];
    }

    sum.sqrt()
}

/// Normalize vector in-place using SIMD
#[wasm_bindgen]
pub fn normalize_simd(vec: &mut [f32]) {
    let norm = l2_norm_simd(vec);

    if norm == 0.0 {
        return;
    }

    let len = vec.len();
    let chunks = len / 4;

    #[cfg(target_feature = "simd128")]
    {
        use std::arch::wasm32::*;

        unsafe {
            let norm_vec = f32x4_splat(norm);

            for i in 0..chunks {
                let idx = i * 4;
                let v = v128_load(&vec[idx] as *const f32 as *const v128);
                let normalized = f32x4_div(v, norm_vec);
                v128_store(&mut vec[idx] as *mut f32 as *mut v128, normalized);
            }
        }
    }

    #[cfg(not(target_feature = "simd128"))]
    {
        for i in 0..(chunks * 4) {
            vec[i] /= norm;
        }
    }

    // Handle remainder
    for i in (chunks * 4)..len {
        vec[i] /= norm;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];

        let similarity = cosine_similarity_simd(&a, &b);
        assert!((similarity - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_orthogonal_vectors() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];

        let similarity = cosine_similarity_simd(&a, &b);
        assert!(similarity.abs() < 1e-6);
    }

    #[test]
    fn test_dot_product() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![4.0, 5.0, 6.0];

        let result = dot_product_simd(&a, &b);
        assert!((result - 32.0).abs() < 1e-6); // 1*4 + 2*5 + 3*6 = 32
    }

    #[test]
    fn test_l2_norm() {
        let vec = vec![3.0, 4.0];
        let norm = l2_norm_simd(&vec);
        assert!((norm - 5.0).abs() < 1e-6); // sqrt(3² + 4²) = 5
    }

    #[test]
    fn test_normalize() {
        let mut vec = vec![3.0, 4.0];
        normalize_simd(&mut vec);

        let norm = l2_norm_simd(&vec);
        assert!((norm - 1.0).abs() < 1e-6);
    }
}
