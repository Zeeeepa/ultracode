cmake_minimum_required(VERSION 3.18)

# Explicitly disable deprecated FindCUDA module
cmake_policy(SET CMP0146 NEW)

# Suppress install() DESTINATION normalization warning
if(POLICY CMP0177)
  cmake_policy(SET CMP0177 NEW)
endif()

project(ultrascript_cuda_addon LANGUAGES CXX CUDA)

# CUDA configuration
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CUDA_ARCHITECTURES 75 80 86 89 90)  # GTX 1650 Ti (7.5) to RTX 5060 (9.0)

# Find packages
find_package(CUDAToolkit REQUIRED)

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
set(CUDA_SOURCES
    src/vector_ops.cu
    src/embedding_kernels.cu
)

set(CPP_SOURCES
    src/addon.cpp
    src/binding.cpp
)

# Build CUDA addon as shared library
add_library(${PROJECT_NAME} SHARED ${CUDA_SOURCES} ${CPP_SOURCES})

# Set library properties
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    OUTPUT_NAME "ultrascript_cuda"
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_LIB}
    CUDA::cudart
    CUDA::cublas
)

# CUDA compilation options
target_compile_options(${PROJECT_NAME} PRIVATE
    $<$<COMPILE_LANGUAGE:CUDA>:
        -O3
        --use_fast_math
        --restrict
    >
)

# Windows-specific settings
if(WIN32)
    set_target_properties(${PROJECT_NAME} PROPERTIES
        SUFFIX ".node"
        LINK_FLAGS "/DELAYLOAD:node.exe"
    )
    # Add delayimp.lib for delay load helper
    target_link_libraries(${PROJECT_NAME} PRIVATE delayimp)
endif()

# Install target
install(TARGETS ${PROJECT_NAME} DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/../../dist/native/cuda)
