cmake_minimum_required(VERSION 3.18)

# Explicitly disable deprecated FindCUDA module
cmake_policy(SET CMP0146 NEW)

# Suppress install() DESTINATION normalization warning
if(POLICY CMP0177)
  cmake_policy(SET CMP0177 NEW)
endif()

# Auto-detect CUDA compiler before project() call
# This fixes "No CUDA toolset found" error with Visual Studio generator
if(NOT DEFINED CMAKE_CUDA_COMPILER)
  # Try to find nvcc in CUDA_PATH or PATH
  if(DEFINED ENV{CUDA_PATH})
    set(CUDA_NVCC_HINT "$ENV{CUDA_PATH}/bin/nvcc")
    if(WIN32)
      set(CUDA_NVCC_HINT "$ENV{CUDA_PATH}/bin/nvcc.exe")
    endif()
    if(EXISTS "${CUDA_NVCC_HINT}")
      set(CMAKE_CUDA_COMPILER "${CUDA_NVCC_HINT}" CACHE FILEPATH "CUDA compiler")
      message(STATUS "Found CUDA compiler: ${CMAKE_CUDA_COMPILER}")
    endif()
  endif()

  # Fallback: search in PATH
  if(NOT DEFINED CMAKE_CUDA_COMPILER)
    find_program(NVCC_EXECUTABLE nvcc)
    if(NVCC_EXECUTABLE)
      set(CMAKE_CUDA_COMPILER "${NVCC_EXECUTABLE}" CACHE FILEPATH "CUDA compiler")
      message(STATUS "Found CUDA compiler in PATH: ${CMAKE_CUDA_COMPILER}")
    endif()
  endif()
endif()

# Find Windows SDK Resource Compiler (rc.exe) - MUST be before project()
# This prevents CMake from finding npm's "rc" package instead of Windows SDK rc.exe
if(WIN32 AND NOT DEFINED CMAKE_RC_COMPILER)
  set(_SDK_VERSIONS "10.0.26100.0" "10.0.22621.0" "10.0.22000.0" "10.0.19041.0" "10.0.18362.0")
  set(_SDK_BASE "C:/Program Files (x86)/Windows Kits/10/bin")

  foreach(_SDK_VER ${_SDK_VERSIONS})
    set(_RC_PATH "${_SDK_BASE}/${_SDK_VER}/x64/rc.exe")
    if(EXISTS "${_RC_PATH}")
      set(CMAKE_RC_COMPILER "${_RC_PATH}" CACHE FILEPATH "Windows Resource Compiler")
      message(STATUS "Found Windows SDK rc.exe: ${CMAKE_RC_COMPILER}")
      break()
    endif()
  endforeach()

  if(NOT DEFINED CMAKE_RC_COMPILER)
    message(WARNING "Windows SDK rc.exe not found - build may fail with npm's rc package conflict")
  endif()
endif()

# Allow unsupported compiler versions (VS 2026 / CUDA 13.0 compatibility)
# CUDA 13.0 officially supports VS 2019-2022, but VS 2026 works with this flag
set(CMAKE_CUDA_FLAGS "${CMAKE_CUDA_FLAGS} -allow-unsupported-compiler" CACHE STRING "CUDA flags" FORCE)

# Set CUDA host compiler to x64 version (fixes VS integration issues)
# NOTE: Only set for Ninja/Makefile generators - Visual Studio generator ignores this
#       and will show a warning if set
get_property(_is_multi_config GLOBAL PROPERTY GENERATOR_IS_MULTI_CONFIG)
if(WIN32 AND NOT _is_multi_config AND NOT DEFINED CMAKE_CUDA_HOST_COMPILER)
  # Find x64 cl.exe explicitly
  # IMPORTANT: Prefer VS 2022 over VS 2026 - CUDA 13.0 officially supports only VS 2019-2022
  set(_VS_PATHS
    # VS 2022 / VS 17 - PREFERRED for CUDA 13.0 compatibility
    "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC"
    "C:/Program Files/Microsoft Visual Studio/2022/Professional/VC/Tools/MSVC"
    "C:/Program Files/Microsoft Visual Studio/2022/Enterprise/VC/Tools/MSVC"
    "C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC"
    # VS 2026 / VS 18 - fallback (requires -allow-unsupported-compiler)
    "C:/Program Files/Microsoft Visual Studio/18/Professional/VC/Tools/MSVC"
    "C:/Program Files/Microsoft Visual Studio/18/Enterprise/VC/Tools/MSVC"
    "C:/Program Files/Microsoft Visual Studio/18/Community/VC/Tools/MSVC"
    "C:/Program Files (x86)/Microsoft Visual Studio/18/BuildTools/VC/Tools/MSVC"
    # Environment variable fallback
    "$ENV{VSINSTALLDIR}/VC/Tools/MSVC"
  )

  foreach(_VS_PATH ${_VS_PATHS})
    if(EXISTS "${_VS_PATH}")
      file(GLOB _MSVC_VERSIONS "${_VS_PATH}/*")
      list(SORT _MSVC_VERSIONS ORDER DESCENDING)
      foreach(_MSVC_VER ${_MSVC_VERSIONS})
        set(_CL_PATH "${_MSVC_VER}/bin/Hostx64/x64/cl.exe")
        if(EXISTS "${_CL_PATH}")
          set(CMAKE_CUDA_HOST_COMPILER "${_CL_PATH}" CACHE FILEPATH "CUDA host compiler (x64)")
          message(STATUS "Found x64 CUDA host compiler: ${CMAKE_CUDA_HOST_COMPILER}")
          break()
        endif()
      endforeach()
      if(DEFINED CMAKE_CUDA_HOST_COMPILER)
        break()
      endif()
    endif()
  endforeach()
endif()

project(ultrascript_cuda_addon LANGUAGES CXX CUDA)

# CUDA configuration
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CUDA_ARCHITECTURES 75 80 86 89 90 100 120)  # Added Blackwell  # GTX 1650 Ti (7.5) to RTX 5060 (9.0)

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
        -allow-unsupported-compiler
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
