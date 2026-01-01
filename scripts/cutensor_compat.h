// cuTENSOR 2.x compatibility layer for code expecting cuTENSOR 1.x API
// WARNING: This is a best-effort compatibility shim, may not work for all cases
#pragma once

#include <cutensor.h>

#ifdef CUTENSOR_VERSION
#if CUTENSOR_VERSION >= 20000

// cuTENSOR 2.x detected - provide compatibility wrappers

// cutensorInit -> cutensorCreate
inline cutensorStatus_t cutensorInit(cutensorHandle_t* handle) {
    return cutensorCreate(handle);
}

// cutensorInitTensorDescriptor wrapper for 2.x
// Old signature: (handle*, desc*, numModes, extent, stride, dataType, unaryOp)
// New signature: (handle, desc*, numModes, extent, stride, cudaDataType, alignmentReq)
inline cutensorStatus_t cutensorInitTensorDescriptor(
    const cutensorHandle_t* handle,
    cutensorTensorDescriptor_t* desc,
    uint32_t numModes,
    const int64_t* extent,
    const int64_t* stride,
    cudaDataType_t dataType,
    cutensorOperator_t unaryOp)
{
    (void)unaryOp; // Ignored in 2.x - operator moved to operation descriptor
    return cutensorCreateTensorDescriptor(*handle, desc, numModes, extent, stride, dataType, 128);
}

// cutensorPermutation wrapper for 2.x
inline cutensorStatus_t cutensorPermutation(
    const cutensorHandle_t* handle,
    const void* alpha,
    const void* A,
    const cutensorTensorDescriptor_t* descA,
    const int32_t* modeA,
    void* B,
    const cutensorTensorDescriptor_t* descB,
    const int32_t* modeB,
    cudaDataType_t typeScalar,
    cudaStream_t stream)
{
    cutensorOperationDescriptor_t opDesc;
    cutensorStatus_t status;

    // Select compute descriptor based on scalar type
    cutensorComputeDescriptor_t descCompute = CUTENSOR_COMPUTE_DESC_32F;
    if (typeScalar == CUDA_R_64F || typeScalar == CUDA_C_64F) {
        descCompute = CUTENSOR_COMPUTE_DESC_64F;
    } else if (typeScalar == CUDA_R_16F) {
        descCompute = CUTENSOR_COMPUTE_DESC_16F;
    }

    // Create permutation operation
    status = cutensorCreatePermutation(*handle, &opDesc, *descA, modeA, CUTENSOR_OP_IDENTITY,
                                       *descB, modeB, descCompute);
    if (status != CUTENSOR_STATUS_SUCCESS) return status;

    // Create plan preference
    cutensorPlanPreference_t planPref;
    status = cutensorCreatePlanPreference(*handle, &planPref, CUTENSOR_ALGO_DEFAULT, CUTENSOR_JIT_MODE_NONE);
    if (status != CUTENSOR_STATUS_SUCCESS) {
        cutensorDestroyOperationDescriptor(opDesc);
        return status;
    }

    // Create plan
    cutensorPlan_t plan;
    status = cutensorCreatePlan(*handle, &plan, opDesc, planPref, 0);
    if (status != CUTENSOR_STATUS_SUCCESS) {
        cutensorDestroyPlanPreference(planPref);
        cutensorDestroyOperationDescriptor(opDesc);
        return status;
    }

    // Execute permutation
    status = cutensorPermute(*handle, plan, alpha, A, B, stream);

    // Cleanup
    cutensorDestroyPlan(plan);
    cutensorDestroyPlanPreference(planPref);
    cutensorDestroyOperationDescriptor(opDesc);

    return status;
}

#endif // CUTENSOR_VERSION >= 20000
#endif // CUTENSOR_VERSION
