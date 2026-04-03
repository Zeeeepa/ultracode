cmake_minimum_required(VERSION 3.18)

project(ultracode_faiss LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Node.js addon configuration (cmake-js sets CMAKE_JS_INC and CMAKE_JS_LIB)
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

# FAISS CPU support is always enabled in this build
add_compile_definitions(ULTRACODE_FAISS_CPU=1)

# Source files
set(CPP_SOURCES
    src/addon.cpp
    src/binding.cpp
    # Reuse cpu_ivf_ops.cpp from cuda/ directory
    ${CMAKE_CURRENT_SOURCE_DIR}/../cuda/src/cpu_ivf_ops.cpp
)

add_library(${PROJECT_NAME} SHARED ${CPP_SOURCES})

set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    OUTPUT_NAME "ultracode_faiss"
)

# === FAISS discovery ===
set(_FAISS_FOUND FALSE)

# Path 1: Homebrew (macOS)
if(APPLE)
    execute_process(
        COMMAND brew --prefix faiss
        OUTPUT_VARIABLE FAISS_BREW_PREFIX
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
        RESULT_VARIABLE BREW_RESULT
    )
    if(BREW_RESULT EQUAL 0 AND EXISTS "${FAISS_BREW_PREFIX}")
        target_include_directories(${PROJECT_NAME} PRIVATE "${FAISS_BREW_PREFIX}/include")
        find_library(FAISS_LIB faiss PATHS "${FAISS_BREW_PREFIX}/lib" NO_DEFAULT_PATH)
        if(FAISS_LIB)
            set(_FAISS_FOUND TRUE)
            message(STATUS "Found FAISS via Homebrew: ${FAISS_LIB}")
        endif()
    endif()
endif()

# Path 2: User-specified FAISS_ROOT
if(NOT _FAISS_FOUND AND DEFINED FAISS_ROOT AND EXISTS "${FAISS_ROOT}")
    target_include_directories(${PROJECT_NAME} PRIVATE "${FAISS_ROOT}/include")
    find_library(FAISS_LIB faiss PATHS "${FAISS_ROOT}/lib" NO_DEFAULT_PATH)
    if(FAISS_LIB)
        set(_FAISS_FOUND TRUE)
        message(STATUS "Found FAISS at FAISS_ROOT: ${FAISS_LIB}")
    endif()
endif()

# Path 3: System FAISS
if(NOT _FAISS_FOUND)
    find_library(FAISS_LIB faiss)
    if(FAISS_LIB)
        find_path(FAISS_INCLUDE_DIR faiss/Index.h)
        if(FAISS_INCLUDE_DIR)
            target_include_directories(${PROJECT_NAME} PRIVATE "${FAISS_INCLUDE_DIR}")
        endif()
        set(_FAISS_FOUND TRUE)
        message(STATUS "Found system FAISS: ${FAISS_LIB}")
    endif()
endif()

if(NOT _FAISS_FOUND)
    message(FATAL_ERROR "FAISS not found. Install via: brew install faiss")
endif()

# Link FAISS
target_link_libraries(${PROJECT_NAME} PRIVATE ${FAISS_LIB})

# Link cmake-js node library
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB})

# OpenMP (FAISS dependency)
find_package(OpenMP)
if(OpenMP_CXX_FOUND)
    target_link_libraries(${PROJECT_NAME} PRIVATE OpenMP::OpenMP_CXX)
    message(STATUS "Linked OpenMP")
else()
    # macOS: libomp from Homebrew
    if(APPLE)
        execute_process(
            COMMAND brew --prefix libomp
            OUTPUT_VARIABLE OMP_PREFIX
            OUTPUT_STRIP_TRAILING_WHITESPACE
            ERROR_QUIET
            RESULT_VARIABLE OMP_RESULT
        )
        if(OMP_RESULT EQUAL 0 AND EXISTS "${OMP_PREFIX}")
            target_include_directories(${PROJECT_NAME} PRIVATE "${OMP_PREFIX}/include")
            find_library(OMP_LIB omp PATHS "${OMP_PREFIX}/lib" NO_DEFAULT_PATH)
            if(OMP_LIB)
                target_link_libraries(${PROJECT_NAME} PRIVATE ${OMP_LIB})
                target_compile_options(${PROJECT_NAME} PRIVATE -Xclang -fopenmp)
                message(STATUS "Linked libomp from Homebrew: ${OMP_LIB}")
            endif()
        endif()
    endif()
endif()

# BLAS (FAISS dependency — Accelerate framework on macOS)
if(APPLE)
    target_link_libraries(${PROJECT_NAME} PRIVATE "-framework Accelerate")
    message(STATUS "Linked Accelerate framework (BLAS/LAPACK)")
else()
    find_package(BLAS)
    if(BLAS_FOUND)
        target_link_libraries(${PROJECT_NAME} PRIVATE ${BLAS_LIBRARIES})
    endif()
    find_package(LAPACK)
    if(LAPACK_FOUND)
        target_link_libraries(${PROJECT_NAME} PRIVATE ${LAPACK_LIBRARIES})
    endif()
endif()

# Optimization flags
target_compile_options(${PROJECT_NAME} PRIVATE -O3)

# Install target
get_filename_component(_PROJECT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../.." ABSOLUTE)
set(_INSTALL_DIR "${_PROJECT_ROOT}/external-libs/faiss-darwin-arm64")
install(TARGETS ${PROJECT_NAME} DESTINATION "${_INSTALL_DIR}")
