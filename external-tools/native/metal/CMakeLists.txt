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
