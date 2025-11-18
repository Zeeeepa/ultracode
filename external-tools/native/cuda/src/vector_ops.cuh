#ifndef VECTOR_OPS_CUH
#define VECTOR_OPS_CUH

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Compute cosine similarity between two vectors on GPU
 *
 * @param vec_a First vector (host memory)
 * @param vec_b Second vector (host memory)
 * @param dim Dimension of vectors
 * @return Cosine similarity score (0-1)
 */
float cuda_cosine_similarity(const float* vec_a, const float* vec_b, int dim);

/**
 * Compute batch cosine similarities on GPU
 *
 * @param vecs_a First set of vectors (host memory, flattened)
 * @param vecs_b Second set of vectors (host memory, flattened)
 * @param similarities Output array (host memory)
 * @param num_pairs Number of vector pairs
 * @param dim Dimension of each vector
 */
void cuda_batch_cosine_similarity(
    const float* vecs_a,
    const float* vecs_b,
    float* similarities,
    int num_pairs,
    int dim
);

/**
 * Compute Euclidean distance on GPU
 *
 * @param vec_a First vector (host memory)
 * @param vec_b Second vector (host memory)
 * @param dim Dimension of vectors
 * @return Euclidean distance
 */
float cuda_euclidean_distance(const float* vec_a, const float* vec_b, int dim);

#ifdef __cplusplus
}
#endif

#endif // VECTOR_OPS_CUH
