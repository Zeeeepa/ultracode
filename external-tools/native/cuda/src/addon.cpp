// Minimal addon.cpp for cmake-js compatibility
// Main implementation is in binding.cpp

#include <napi.h>

// Declare Init function from binding.cpp
Napi::Object Init(Napi::Env env, Napi::Object exports);

// Entry point (cmake-js will use this)
NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
