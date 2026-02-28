#!/bin/bash
#
# UltraCode - macOS Native Library Builder
#
# Interactive script to build native acceleration libraries on macOS.
# Since CUDA is not available on macOS, this script offers:
# - Metal/MPS backend for Apple Silicon (M1/M2/M3/M4)
# - CPU SIMD acceleration for all Macs
# - WASM fallback (already included)
#
# Usage:
#   chmod +x scripts/build-native-libs-macos.sh
#   ./scripts/build-native-libs-macos.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Project paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/external-libs"
METAL_SRC_DIR="$PROJECT_ROOT/external-tools/native/metal"

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  UltraCode - macOS Native Library Builder${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "\n${CYAN}[${BOLD}BUILD${NC}${CYAN}]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

ask_yes_no() {
    local prompt="$1"
    local default="${2:-y}"

    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n]: "
    else
        prompt="$prompt [y/N]: "
    fi

    read -p "$prompt" answer
    answer=${answer:-$default}

    case "$answer" in
        [Yy]* ) return 0;;
        * ) return 1;;
    esac
}

detect_mac_type() {
    print_step "Detecting Mac architecture..."

    ARCH=$(uname -m)

    if [ "$ARCH" = "arm64" ]; then
        MAC_TYPE="apple_silicon"
        print_success "Apple Silicon detected (M1/M2/M3/M4)"

        # Detect specific chip
        CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
        print_info "Chip: $CHIP"

        return 0
    elif [ "$ARCH" = "x86_64" ]; then
        MAC_TYPE="intel"
        print_success "Intel Mac detected"
        return 0
    else
        print_error "Unknown architecture: $ARCH"
        return 1
    fi
}

check_xcode() {
    print_step "Checking Xcode Command Line Tools..."

    if xcode-select -p &>/dev/null; then
        XCODE_PATH=$(xcode-select -p)
        print_success "Xcode CLT found: $XCODE_PATH"
        return 0
    else
        print_warning "Xcode Command Line Tools not installed"
        echo ""
        echo "To install, run:"
        echo -e "  ${CYAN}xcode-select --install${NC}"
        echo ""

        if ask_yes_no "Install now?"; then
            xcode-select --install
            echo ""
            print_info "Please complete the installation in the popup window, then run this script again."
            exit 0
        fi
        return 1
    fi
}

check_homebrew() {
    print_step "Checking Homebrew..."

    if command -v brew &>/dev/null; then
        print_success "Homebrew found"
        return 0
    else
        print_warning "Homebrew not installed"
        print_info "Installing Homebrew automatically..."
        echo ""

        # Non-interactive install
        NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Add to PATH for current session
        if [ "$ARCH" = "arm64" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
            # Also add to shell profile for future sessions
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile 2>/dev/null || true
        else
            eval "$(/usr/local/bin/brew shellenv)"
            echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile 2>/dev/null || true
        fi

        if command -v brew &>/dev/null; then
            print_success "Homebrew installed successfully"
            return 0
        else
            print_error "Homebrew installation failed"
            return 1
        fi
    fi
}

check_cmake() {
    print_step "Checking CMake..."

    if command -v cmake &>/dev/null; then
        CMAKE_VERSION=$(cmake --version | head -n1)
        print_success "$CMAKE_VERSION"
        return 0
    else
        print_warning "CMake not installed"

        if command -v brew &>/dev/null; then
            print_info "Installing CMake via Homebrew..."
            brew install cmake

            if command -v cmake &>/dev/null; then
                CMAKE_VERSION=$(cmake --version | head -n1)
                print_success "CMake installed: $CMAKE_VERSION"
                return 0
            else
                print_error "CMake installation failed"
                return 1
            fi
        else
            print_error "Homebrew not available - cannot install CMake"
            echo "Please install CMake manually: https://cmake.org/download/"
            return 1
        fi
    fi
}

check_node() {
    print_step "Checking Node.js..."

    if command -v node &>/dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION"
        return 0
    else
        print_warning "Node.js not installed"

        if command -v brew &>/dev/null; then
            print_info "Installing Node.js via Homebrew..."
            brew install node

            if command -v node &>/dev/null; then
                NODE_VERSION=$(node --version)
                print_success "Node.js installed: $NODE_VERSION"
                return 0
            else
                print_error "Node.js installation failed"
                return 1
            fi
        else
            print_error "Homebrew not available - cannot install Node.js"
            echo "Please install Node.js manually: https://nodejs.org"
            return 1
        fi
    fi
}

check_npm_deps() {
    print_step "Checking npm build dependencies..."

    cd "$PROJECT_ROOT"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_info "Installing npm dependencies..."
        npm install
    fi

    # Check cmake-js
    if ! npx cmake-js --version &>/dev/null; then
        print_info "Installing cmake-js..."
        npm install cmake-js --save-dev
    fi

    # Check node-addon-api
    if ! node -e "require('node-addon-api')" &>/dev/null; then
        print_info "Installing node-addon-api..."
        npm install node-addon-api --save-dev
    fi

    print_success "npm dependencies ready"
    return 0
}

# =============================================================================
# BUILD: Metal Backend (Apple Silicon)
# =============================================================================

build_metal_backend() {
    print_step "Building Metal backend for Apple Silicon..."

    local OUTPUT_PATH="$OUTPUT_DIR/metal-darwin-arm64"
    mkdir -p "$OUTPUT_PATH"

    # Check if Metal source exists
    if [ ! -d "$METAL_SRC_DIR" ]; then
        print_info "Creating Metal backend source directory..."
        mkdir -p "$METAL_SRC_DIR/src"

        # Create minimal Metal shader and binding
        cat > "$METAL_SRC_DIR/src/vector_ops.metal" << 'METAL_SHADER'
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
METAL_SHADER

        cat > "$METAL_SRC_DIR/src/binding.mm" << 'METAL_BINDING'
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
        library = [device newLibraryWithFile:shaderPath error:&error];
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
METAL_BINDING

        cat > "$METAL_SRC_DIR/CMakeLists.txt" << 'CMAKE_FILE'
cmake_minimum_required(VERSION 3.18)
project(ultracode_metal_addon LANGUAGES CXX OBJCXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_OBJCXX_STANDARD 17)

# Find packages
find_library(METAL_FRAMEWORK Metal REQUIRED)
find_library(FOUNDATION_FRAMEWORK Foundation REQUIRED)

# Node.js addon configuration
include_directories(${CMAKE_JS_INC})

# Add node-addon-api include path
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
include_directories(${NODE_ADDON_API_DIR})

# Source files
set(SOURCES
    src/binding.mm
)

# Metal shaders
set(METAL_SHADERS
    src/vector_ops.metal
)

# Build addon
add_library(${PROJECT_NAME} SHARED ${SOURCES})

# Compile Metal shaders to metallib
foreach(shader ${METAL_SHADERS})
    get_filename_component(shader_name ${shader} NAME_WE)
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/${shader_name}.metallib
        COMMAND xcrun -sdk macosx metal -c ${CMAKE_CURRENT_SOURCE_DIR}/${shader} -o ${CMAKE_BINARY_DIR}/${shader_name}.air
        COMMAND xcrun -sdk macosx metallib ${CMAKE_BINARY_DIR}/${shader_name}.air -o ${CMAKE_BINARY_DIR}/${shader_name}.metallib
        DEPENDS ${shader}
    )
    list(APPEND METALLIB_FILES ${CMAKE_BINARY_DIR}/${shader_name}.metallib)
endforeach()

add_custom_target(metal_shaders ALL DEPENDS ${METALLIB_FILES})
add_dependencies(${PROJECT_NAME} metal_shaders)

# Set library properties
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    OUTPUT_NAME "ultracode_metal"
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_LIB}
    ${METAL_FRAMEWORK}
    ${FOUNDATION_FRAMEWORK}
)

# Install
install(TARGETS ${PROJECT_NAME} DESTINATION ${CMAKE_INSTALL_PREFIX})
install(FILES ${METALLIB_FILES} DESTINATION ${CMAKE_INSTALL_PREFIX})
CMAKE_FILE

        print_success "Metal backend source created"
    fi

    # Build
    print_info "Compiling Metal backend..."
    cd "$METAL_SRC_DIR"

    # Build with cmake-js (dependencies already installed via check_npm_deps)
    npx cmake-js compile

    # Copy output
    if [ -f "build/Release/ultracode_metal.node" ]; then
        cp build/Release/ultracode_metal.node "$OUTPUT_PATH/"
        cp build/*.metallib "$OUTPUT_PATH/" 2>/dev/null || true
        print_success "Built: $OUTPUT_PATH/ultracode_metal.node"
        return 0
    else
        print_error "Build failed - output not found"
        return 1
    fi
}

# =============================================================================
# BUILD: CPU SIMD (Universal)
# =============================================================================

build_cpu_simd() {
    print_step "Building CPU SIMD acceleration..."

    print_info "CPU SIMD is provided via WASM modules (already included)"
    print_info "No additional build required"

    # Check WASM files
    local WASM_DIR="$PROJECT_ROOT/dist"
    if [ -f "$WASM_DIR/diff_simd_bg.wasm" ] || [ -f "$WASM_DIR/diff_simd_bg-"*".wasm" ]; then
        print_success "WASM SIMD modules found"
    else
        print_warning "WASM modules not found - run 'npm run build' first"
    fi

    return 0
}

# =============================================================================
# MAIN
# =============================================================================

print_header

# Detect Mac type
detect_mac_type

echo ""

# Check prerequisites (auto-install where possible)
PREREQS_OK=true

check_xcode || PREREQS_OK=false
check_homebrew || PREREQS_OK=false  # Required for cmake/node install
check_cmake || PREREQS_OK=false
check_node || PREREQS_OK=false
check_npm_deps || PREREQS_OK=false

if [ "$PREREQS_OK" = false ]; then
    echo ""
    print_error "Some prerequisites are missing. Please install them and run again."
    exit 1
fi

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  Available Build Options${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$MAC_TYPE" = "apple_silicon" ]; then
    echo "1) Metal Backend (recommended for Apple Silicon)"
    echo "   - GPU-accelerated vector operations via Metal"
    echo "   - Best performance on M1/M2/M3/M4 chips"
    echo ""
fi

echo "2) CPU SIMD (universal, included)"
echo "   - WASM-based SIMD acceleration"
echo "   - Works on all Macs"
echo ""

echo "3) Skip native build"
echo "   - Use JavaScript fallback"
echo "   - Slower but always works"
echo ""

# Ask user what to build
if [ "$MAC_TYPE" = "apple_silicon" ]; then
    read -p "Select option [1-3, default=1]: " choice
    choice=${choice:-1}
else
    read -p "Select option [2-3, default=2]: " choice
    choice=${choice:-2}
fi

echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Execute build
case "$choice" in
    1)
        if [ "$MAC_TYPE" = "apple_silicon" ]; then
            build_metal_backend
        else
            print_error "Metal backend requires Apple Silicon"
            exit 1
        fi
        ;;
    2)
        build_cpu_simd
        ;;
    3)
        print_info "Skipping native build"
        ;;
    *)
        print_error "Invalid option"
        exit 1
        ;;
esac

# Summary
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  Summary${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -d "$OUTPUT_DIR" ] && [ "$(ls -A $OUTPUT_DIR 2>/dev/null)" ]; then
    print_success "Native libraries built successfully:"
    find "$OUTPUT_DIR" -name "*.node" -o -name "*.metallib" 2>/dev/null | while read f; do
        size=$(du -h "$f" | cut -f1)
        echo "  $(basename $f) ($size)"
    done
else
    print_info "Using WASM SIMD fallback (no native libraries built)"
fi

echo ""
print_info "UltraCode will automatically detect and use available acceleration."
echo ""
