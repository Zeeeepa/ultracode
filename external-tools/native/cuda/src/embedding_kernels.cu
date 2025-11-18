#include "embedding_kernels.cuh"
#include <cuda_runtime.h>

// Placeholder for future embedding-specific CUDA kernels
// (e.g., batch normalization, quantization, dimensionality reduction)

/**
 * Normalize vectors in-place on GPU
 * Converts vectors to unit length (L2 norm = 1)
 */
__global__ void normalize_vectors_kernel(
    float* __restrict__ vectors,
    int num_vectors,
    int dim
) {
    int vec_id = blockIdx.x;
    if (vec_id >= num_vectors) return;

    float* vec = vectors + vec_id * dim;

    // Compute squared norm
    __shared__ float norm_sq;
    if (threadIdx.x == 0) {
        norm_sq = 0.0f;
    }
    __syncthreads();

    float local_sum = 0.0f;
    for (int i = threadIdx.x; i < dim; i += blockDim.x) {
        float val = vec[i];
        local_sum += val * val;
    }

    // Warp-level reduction
    for (int offset = 16; offset > 0; offset /= 2) {
        local_sum += __shfl_down_sync(0xffffffff, local_sum, offset);
    }

    if (threadIdx.x == 0) {
        atomicAdd(&norm_sq, local_sum);
    }
    __syncthreads();

    // Normalize
    float norm = sqrtf(norm_sq);
    if (norm > 1e-10f) {
        for (int i = threadIdx.x; i < dim; i += blockDim.x) {
            vec[i] /= norm;
        }
    }
}

extern "C" {

/**
 * Normalize batch of vectors on GPU
 */
void cuda_normalize_vectors(float* vectors, int num_vectors, int dim) {
    float* d_vectors;
    size_t size = num_vectors * dim * sizeof(float);

    cudaMalloc(&d_vectors, size);
    cudaMemcpy(d_vectors, vectors, size, cudaMemcpyHostToDevice);

    int threads_per_block = 256;
    normalize_vectors_kernel<<<num_vectors, threads_per_block>>>(
        d_vectors, num_vectors, dim
    );

    cudaMemcpy(vectors, d_vectors, size, cudaMemcpyDeviceToHost);
    cudaFree(d_vectors);
}

} // extern "C"
