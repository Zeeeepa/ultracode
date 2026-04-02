#include <metal_stdlib>
using namespace metal;

// Vector dot product kernel
kernel void dot_product(
    device const float* a [[buffer(0)]],
    device const float* b [[buffer(1)]],
    device float* result [[buffer(2)]],
    constant uint& count [[buffer(3)]],
    uint id [[thread_position_in_grid]]
) {
    if (id == 0) {
        float sum = 0.0;
        for (uint i = 0; i < count; i++) {
            sum += a[i] * b[i];
        }
        result[0] = sum;
    }
}

// Cosine similarity kernel
kernel void cosine_similarity(
    device const float* a [[buffer(0)]],
    device const float* b [[buffer(1)]],
    device float* result [[buffer(2)]],
    constant uint& count [[buffer(3)]],
    uint id [[thread_position_in_grid]]
) {
    if (id == 0) {
        float dot = 0.0;
        float norm_a = 0.0;
        float norm_b = 0.0;

        for (uint i = 0; i < count; i++) {
            dot += a[i] * b[i];
            norm_a += a[i] * a[i];
            norm_b += b[i] * b[i];
        }

        float denom = sqrt(norm_a) * sqrt(norm_b);
        result[0] = denom > 0.0 ? dot / denom : 0.0;
    }
}

// Batch cosine similarity
kernel void batch_cosine_similarity(
    device const float* query [[buffer(0)]],
    device const float* vectors [[buffer(1)]],
    device float* results [[buffer(2)]],
    constant uint& dim [[buffer(3)]],
    constant uint& count [[buffer(4)]],
    uint id [[thread_position_in_grid]]
) {
    if (id < count) {
        uint offset = id * dim;

        float dot = 0.0;
        float norm_q = 0.0;
        float norm_v = 0.0;

        for (uint i = 0; i < dim; i++) {
            float q = query[i];
            float v = vectors[offset + i];
            dot += q * v;
            norm_q += q * q;
            norm_v += v * v;
        }

        float denom = sqrt(norm_q) * sqrt(norm_v);
        results[id] = denom > 0.0 ? dot / denom : 0.0;
    }
}
