#ifndef EMBEDDING_KERNELS_CUH
#define EMBEDDING_KERNELS_CUH

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Normalize batch of vectors on GPU (L2 normalization)
 *
 * @param vectors Input/output vectors (host memory, modified in-place)
 * @param num_vectors Number of vectors
 * @param dim Dimension of each vector
 */
void cuda_normalize_vectors(float* vectors, int num_vectors, int dim);

#ifdef __cplusplus
}
#endif

#endif // EMBEDDING_KERNELS_CUH
