/**
 * FAISS-only native addon for macOS (no CUDA)
 *
 * Provides native FAISS CPU operations (HNSW, Flat, IVF, SQ, PQ)
 * for Apple Silicon and Intel Macs. Uses Accelerate framework for BLAS.
 *
 * Exports the same FAISS interface as ultracode_cuda.node but without
 * CUDA vector operations (cosineSimilarity, etc. are stubs returning errors).
 */

#include <napi.h>
#include <string>

// Forward declarations from cpu_ivf_ops.cpp (shared with CUDA build)
#ifdef ULTRACODE_FAISS_CPU
Napi::Value FaissIndexCreate(const Napi::CallbackInfo& info);
Napi::Value FaissIndexTrain(const Napi::CallbackInfo& info);
Napi::Value FaissIndexAdd(const Napi::CallbackInfo& info);
Napi::Value FaissIndexSearch(const Napi::CallbackInfo& info);
Napi::Value FaissIndexBatchSearch(const Napi::CallbackInfo& info);
Napi::Value FaissIndexSave(const Napi::CallbackInfo& info);
Napi::Value FaissIndexLoad(const Napi::CallbackInfo& info);
Napi::Value FaissIndexRemove(const Napi::CallbackInfo& info);
Napi::Value FaissIndexReset(const Napi::CallbackInfo& info);
Napi::Value FaissIndexStats(const Napi::CallbackInfo& info);
#endif

/**
 * getDeviceInfo() — returns no-GPU info (FAISS-only mode)
 */
Napi::Value GetDeviceInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    result.Set("deviceCount", Napi::Number::New(env, 0));
    result.Set("faissOnly", Napi::Boolean::New(env, true));
    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getDeviceInfo", Napi::Function::New(env, GetDeviceInfo));
    exports.Set("hasGpuFaiss", Napi::Boolean::New(env, false));

#ifdef ULTRACODE_FAISS_CPU
    exports.Set("faissIndexCreate", Napi::Function::New(env, FaissIndexCreate));
    exports.Set("faissIndexTrain", Napi::Function::New(env, FaissIndexTrain));
    exports.Set("faissIndexAdd", Napi::Function::New(env, FaissIndexAdd));
    exports.Set("faissIndexSearch", Napi::Function::New(env, FaissIndexSearch));
    exports.Set("faissIndexBatchSearch", Napi::Function::New(env, FaissIndexBatchSearch));
    exports.Set("faissIndexSave", Napi::Function::New(env, FaissIndexSave));
    exports.Set("faissIndexLoad", Napi::Function::New(env, FaissIndexLoad));
    exports.Set("faissIndexRemove", Napi::Function::New(env, FaissIndexRemove));
    exports.Set("faissIndexReset", Napi::Function::New(env, FaissIndexReset));
    exports.Set("faissIndexStats", Napi::Function::New(env, FaissIndexStats));
    exports.Set("hasNativeFaiss", Napi::Boolean::New(env, true));
#else
    exports.Set("hasNativeFaiss", Napi::Boolean::New(env, false));
#endif

    return exports;
}
