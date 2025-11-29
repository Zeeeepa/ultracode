/**
 * CUDA Vector Operations - N-API Binding Header
 */

#ifndef CUDA_BINDING_H
#define CUDA_BINDING_H

#include <napi.h>

class CUDAVectorOps : public Napi::ObjectWrap<CUDAVectorOps> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CUDAVectorOps(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;

  // Vector operations
  Napi::Value CosineSimilarity(const Napi::CallbackInfo& info);
  Napi::Value BatchCosineSimilarity(const Napi::CallbackInfo& info);
  Napi::Value EuclideanDistance(const Napi::CallbackInfo& info);

  // Device info
  Napi::Value GetDeviceInfo(const Napi::CallbackInfo& info);

  // Internal state
  int deviceId_;
  bool initialized_;
};

#endif // CUDA_BINDING_H
