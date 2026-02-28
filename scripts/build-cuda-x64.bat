@echo off
REM ============================================================================
REM UltraCode - CUDA Build Script (x64 Environment)
REM
REM Builds CUDA addon with Blackwell (sm_120) support.
REM Run from any terminal - it will configure everything automatically.
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   UltraCode - CUDA Native Library Builder
echo   Supports: GTX 1650 Ti (7.5) to RTX 5090 Blackwell (12.0)
echo ============================================================================
echo.

REM ============================================================================
REM Find Visual Studio installation
REM ============================================================================

set "VS_PATH="

REM Check direct path to VS 2022 BuildTools first (most reliable)
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
    echo Found VS 2022 BuildTools
)

REM Try vswhere if direct path didn't work
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
REM Find CUDA Toolkit
REM ============================================================================

set "CUDA_VERSION="

REM Prefer CUDA 13.1 for Blackwell support
if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1\bin\nvcc.exe" (
    set "CUDA_VERSION=13.1"
    set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1"
) else if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin\nvcc.exe" (
    set "CUDA_VERSION=13.0"
    set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
) else if defined CUDA_PATH (
    echo Using existing CUDA_PATH: !CUDA_PATH!
) else (
    echo ERROR: CUDA Toolkit not found
    exit /b 1
)

echo CUDA Toolkit: !CUDA_PATH! (v!CUDA_VERSION!)

REM Set versioned CUDA path for MSBuild integration
if "!CUDA_VERSION!"=="13.1" (
    set "CUDA_PATH_V13_1=!CUDA_PATH!"
    set "CudaToolkitDir=!CUDA_PATH!\"
)
if "!CUDA_VERSION!"=="13.0" (
    set "CUDA_PATH_V13_0=!CUDA_PATH!"
    set "CudaToolkitDir=!CUDA_PATH!\"
)

REM ============================================================================
REM Initialize VS environment
REM ============================================================================

echo Initializing x64 build environment...
call "!VS_PATH!\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1

REM Verify compilers
where cl.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: cl.exe not found after vcvars64
    exit /b 1
)

echo.
echo Compiler:
cl.exe 2>&1 | findstr /C:"Version"

echo.
echo CUDA Compiler:
"!CUDA_PATH!\bin\nvcc.exe" --version | findstr /C:"release"
echo.

REM ============================================================================
REM Setup paths
REM ============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=!SCRIPT_DIR!.."
set "CUDA_SRC=!PROJECT_ROOT!\external-tools\native\cuda"
set "OUTPUT_DIR=!PROJECT_ROOT!\external-libs\cuda-win32-x64"

cd /d "!CUDA_SRC!"

REM Clean previous build
if exist build (
    echo Cleaning previous build...
    rmdir /s /q build
)

REM ============================================================================
REM Install dependencies
REM ============================================================================

if not exist "node_modules\node-addon-api" (
    echo Installing node-addon-api...
    call npm install
)

REM ============================================================================
REM Build with cmake-js
REM ============================================================================

echo.
echo Building CUDA addon with Blackwell support (sm_120)...
echo.

call npx cmake-js rebuild ^
    --CD CMAKE_BUILD_TYPE=Release ^
    --CD CMAKE_CUDA_COMPILER="!CUDA_PATH!/bin/nvcc.exe" ^
    --CD CUDAToolkit_ROOT="!CUDA_PATH!"

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

if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"

if exist "build\Release\ultracode_cuda.node" (
    copy /y "build\Release\ultracode_cuda.node" "!OUTPUT_DIR!\"
    echo.
    echo SUCCESS: Built !OUTPUT_DIR!\ultracode_cuda.node
) else if exist "build\ultracode_cuda.node" (
    copy /y "build\ultracode_cuda.node" "!OUTPUT_DIR!\"
    echo.
    echo SUCCESS: Built !OUTPUT_DIR!\ultracode_cuda.node
) else (
    echo.
    echo WARNING: Output file not found
    dir /s /b "build\*.node" 2>nul
)

echo.
echo ============================================================================
echo   Build Complete - Supported architectures: sm_75-90, sm_100, sm_120
echo ============================================================================
echo.

endlocal
