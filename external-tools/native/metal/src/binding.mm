#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <napi.h>

// Metal device and command queue (singleton)
static id<MTLDevice> device = nil;
static id<MTLCommandQueue> commandQueue = nil;
static id<MTLLibrary> library = nil;

// Initialize Metal
bool InitMetal() {
    if (device) return true;

    device = MTLCreateSystemDefaultDevice();
    if (!device) {
        NSLog(@"Metal not supported on this device");
        return false;
    }

    commandQueue = [device newCommandQueue];

    // Load shader library
    NSError* error = nil;
    NSString* shaderPath = [[NSBundle mainBundle] pathForResource:@"vector_ops" ofType:@"metallib"];
    if (shaderPath) {
        NSURL* shaderURL = [NSURL fileURLWithPath:shaderPath];
        library = [device newLibraryWithURL:shaderURL error:&error];
    }

    if (!library) {
        // Compile from source
        NSString* srcPath = @"vector_ops.metal";
        NSString* source = [NSString stringWithContentsOfFile:srcPath encoding:NSUTF8StringEncoding error:&error];
        if (source) {
            library = [device newLibraryWithSource:source options:nil error:&error];
        }
    }

    return library != nil;
}

// Check Metal availability
Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), InitMetal());
}

// Get device info
Napi::Value GetDeviceInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!InitMetal()) {
        return env.Null();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("name", Napi::String::New(env, [device.name UTF8String]));
    result.Set("registryID", Napi::Number::New(env, device.registryID));
    result.Set("maxThreadsPerThreadgroup", Napi::Number::New(env, device.maxThreadsPerThreadgroup.width));

    return result;
}

// Batch cosine similarity
Napi::Value BatchCosineSimilarity(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!InitMetal()) {
        Napi::Error::New(env, "Metal not available").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: query, vectors, dimensions").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Float32Array query = info[0].As<Napi::Float32Array>();
    Napi::Float32Array vectors = info[1].As<Napi::Float32Array>();
    uint32_t dim = info[2].As<Napi::Number>().Uint32Value();

    size_t queryLen = query.ElementLength();
    size_t vectorsLen = vectors.ElementLength();
    uint32_t count = vectorsLen / dim;

    // Create buffers
    id<MTLBuffer> queryBuffer = [device newBufferWithBytes:query.Data()
                                                    length:queryLen * sizeof(float)
                                                   options:MTLResourceStorageModeShared];
    id<MTLBuffer> vectorsBuffer = [device newBufferWithBytes:vectors.Data()
                                                      length:vectorsLen * sizeof(float)
                                                     options:MTLResourceStorageModeShared];
    id<MTLBuffer> resultsBuffer = [device newBufferWithLength:count * sizeof(float)
                                                      options:MTLResourceStorageModeShared];

    // Get kernel
    NSError* error = nil;
    id<MTLFunction> function = [library newFunctionWithName:@"batch_cosine_similarity"];
    id<MTLComputePipelineState> pipelineState = [device newComputePipelineStateWithFunction:function error:&error];

    // Execute
    id<MTLCommandBuffer> commandBuffer = [commandQueue commandBuffer];
    id<MTLComputeCommandEncoder> encoder = [commandBuffer computeCommandEncoder];

    [encoder setComputePipelineState:pipelineState];
    [encoder setBuffer:queryBuffer offset:0 atIndex:0];
    [encoder setBuffer:vectorsBuffer offset:0 atIndex:1];
    [encoder setBuffer:resultsBuffer offset:0 atIndex:2];
    [encoder setBytes:&dim length:sizeof(dim) atIndex:3];
    [encoder setBytes:&count length:sizeof(count) atIndex:4];

    MTLSize gridSize = MTLSizeMake(count, 1, 1);
    MTLSize threadGroupSize = MTLSizeMake(MIN(count, pipelineState.maxTotalThreadsPerThreadgroup), 1, 1);

    [encoder dispatchThreads:gridSize threadsPerThreadgroup:threadGroupSize];
    [encoder endEncoding];

    [commandBuffer commit];
    [commandBuffer waitUntilCompleted];

    // Return results
    float* resultData = (float*)[resultsBuffer contents];
    Napi::Float32Array result = Napi::Float32Array::New(env, count);
    memcpy(result.Data(), resultData, count * sizeof(float));

    return result;
}

// Module init
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
    exports.Set("getDeviceInfo", Napi::Function::New(env, GetDeviceInfo));
    exports.Set("batchCosineSimilarity", Napi::Function::New(env, BatchCosineSimilarity));
    return exports;
}

NODE_API_MODULE(ultracode_metal, Init)
