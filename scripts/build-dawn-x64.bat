@echo off
REM ============================================================================
REM UltraCode - Dawn/WebGPU Build Script (x64 Environment)
REM
REM Builds Dawn with Node.js bindings for Blackwell (RTX 50xx) support.
REM The official npm webgpu package crashes on Blackwell - this builds from source.
REM
REM Requirements:
REM - Visual Studio 2022 with C++ workload
REM - Python 3.x (for Dawn's build system)
REM - Git (Dawn repo should be cloned separately)
REM - Node.js 18+ (for node bindings)
REM
REM Usage:
REM   build-dawn-x64.bat [dawn_repo_path]
REM
REM Example:
REM   build-dawn-x64.bat D:\repos\dawn
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   UltraCode - Dawn/WebGPU Builder for Blackwell
echo   Builds dawn.node with RTX 50xx (Blackwell CC 12.0) support
echo ============================================================================
echo.

REM ============================================================================
REM Parse arguments
REM ============================================================================

set "DAWN_REPO=%~1"
if "%DAWN_REPO%"=="" (
    set "DAWN_REPO=D:\github\repos-for-test\dawn"
)

if not exist "!DAWN_REPO!\CMakeLists.txt" (
    echo ERROR: Dawn repository not found at: !DAWN_REPO!
    echo.
    echo Please clone Dawn first:
    echo   git clone https://dawn.googlesource.com/dawn
    echo.
    echo Then run:
    echo   %~nx0 path\to\dawn
    exit /b 1
)

echo Dawn repo: !DAWN_REPO!

REM ============================================================================
REM Find Visual Studio installation
REM ============================================================================

set "VS_PATH="

if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
    echo Found VS 2022 BuildTools
)

if not defined VS_PATH (
    set "VSWHERE=!ProgramFiles(x86)!\Microsoft Visual Studio\Installer\vswhere.exe"
    if exist "!VSWHERE!" (
        for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -version "[17.0,18.0)" -property installationPath 2^>nul`) do set "VS_PATH=%%i"
    )
)

if not defined VS_PATH (
    echo ERROR: Visual Studio 2022 not found
    exit /b 1
)

echo Visual Studio: !VS_PATH!

REM ============================================================================
REM Initialize VS environment
REM ============================================================================

echo Initializing x64 build environment...
call "!VS_PATH!\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1

where cl.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: cl.exe not found after vcvars64
    exit /b 1
)

echo.
echo Compiler:
cl.exe 2>&1 | findstr /C:"Version"
echo.

REM ============================================================================
REM Setup paths
REM ============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=!SCRIPT_DIR!.."
set "OUTPUT_DIR=!PROJECT_ROOT!\external-libs\dawn-win32-x64"
set "WEBGPU_DIR=!PROJECT_ROOT!\node_modules\webgpu\dist"
set "BUILD_DIR=!DAWN_REPO!\out\Release"

REM ============================================================================
REM Fetch Dawn dependencies (first time only)
REM ============================================================================

if not exist "!DAWN_REPO!\third_party\abseil-cpp\CMakeLists.txt" (
    echo Fetching Dawn dependencies ^(first time, may take a while^)...
    cd /d "!DAWN_REPO!"
    call python tools\fetch_dawn_dependencies.py
    if errorlevel 1 (
        echo ERROR: Failed to fetch dependencies
        exit /b 1
    )
)

REM ============================================================================
REM Configure CMake (if needed)
REM ============================================================================

if not exist "!BUILD_DIR!\CMakeCache.txt" (
    echo.
    echo Configuring Dawn build...

    if not exist "!BUILD_DIR!" mkdir "!BUILD_DIR!"

    cmake -S "!DAWN_REPO!" -B "!BUILD_DIR!" ^
        -DDAWN_BUILD_NODE_BINDINGS=1 ^
        -DDAWN_ENABLE_D3D12=1 ^
        -DDAWN_ENABLE_VULKAN=1 ^
        -DDAWN_ENABLE_NULL=0 ^
        -DDAWN_BUILD_SAMPLES=0 ^
        -DTINT_BUILD_TESTS=0 ^
        -DCMAKE_BUILD_TYPE=Release

    if errorlevel 1 (
        echo ERROR: CMake configuration failed
        exit /b 1
    )
)

REM ============================================================================
REM Build Dawn
REM ============================================================================

echo.
echo Building Dawn with Node.js bindings...
echo This may take 10-30 minutes on first build...
echo.

cd /d "!BUILD_DIR!"
cmake --build . --target dawn_node --config Release -- /m

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    exit /b 1
)

REM ============================================================================
REM Copy output
REM ============================================================================

echo.
echo Copying output...

REM Find dawn.node
set "DAWN_NODE="
if exist "!BUILD_DIR!\Release\dawn.node" set "DAWN_NODE=!BUILD_DIR!\Release\dawn.node"
if exist "!BUILD_DIR!\dawn.node" set "DAWN_NODE=!BUILD_DIR!\dawn.node"
if exist "!BUILD_DIR!\src\dawn\node\Release\dawn.node" set "DAWN_NODE=!BUILD_DIR!\src\dawn\node\Release\dawn.node"

if not defined DAWN_NODE (
    echo ERROR: dawn.node not found after build
    dir /s /b "!BUILD_DIR!\*.node" 2>nul
    exit /b 1
)

echo Found: !DAWN_NODE!

REM Copy to external-libs
if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"
copy /y "!DAWN_NODE!" "!OUTPUT_DIR!\"
echo Copied to: !OUTPUT_DIR!\dawn.node

REM Copy to node_modules/webgpu if exists
if exist "!WEBGPU_DIR!" (
    copy /y "!DAWN_NODE!" "!WEBGPU_DIR!\win32-x64.dawn.node"
    echo Copied to: !WEBGPU_DIR!\win32-x64.dawn.node
)

REM ============================================================================
REM Show results
REM ============================================================================

echo.
echo ============================================================================
echo   Build Complete!
echo ============================================================================
echo.
echo   dawn.node location: !OUTPUT_DIR!\dawn.node
echo.
echo   To use with webgpu npm package, copy to:
echo     node_modules\webgpu\dist\win32-x64.dawn.node
echo.
echo   NOTE: Only works with Node.js. Bun has native addon bugs.
echo ============================================================================
echo.

endlocal
