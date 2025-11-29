@echo off
REM ============================================================================
REM UltraScript Tools - CUDA Build Script (x64 Environment)
REM
REM This script sets up the correct x64 VS environment and builds CUDA addon.
REM Run from any terminal - it will configure everything automatically.
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================================
echo   UltraScript Tools - CUDA Native Library Builder
echo ============================================================================
echo.

REM Find Visual Studio installation
REM IMPORTANT: Prefer VS 2022 over VS 2026 for CUDA 13.0 compatibility
set "VSWHERE=!ProgramFiles(x86)!\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "!VSWHERE!" (
    echo ERROR: vswhere.exe not found. Visual Studio not installed?
    exit /b 1
)

REM First try direct path to VS 2022 BuildTools (best CUDA 13.0 compatibility)
set "VS_PATH="

REM Check common VS 2022 BuildTools locations directly
if not defined VS_PATH if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
    echo Found VS 2022 BuildTools at direct path
)

REM Try vswhere for VS 2022 BuildTools
if not defined VS_PATH (
    for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -version "[17.0,18.0)" -products Microsoft.VisualStudio.Product.BuildTools -property installationPath 2^>nul`) do set "VS_PATH=%%i"
)

REM Then try VS 2022 any edition via vswhere
if not defined VS_PATH (
    for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -version "[17.0,18.0)" -property installationPath 2^>nul`) do set "VS_PATH=%%i"
)

REM Fallback to latest VS (may be VS 2026 - will need -allow-unsupported-compiler)
if not defined VS_PATH (
    echo WARNING: VS 2022 not found, trying latest VS ^(may have CUDA compatibility issues^)
    for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -latest -property installationPath`) do set "VS_PATH=%%i"
)

if not defined VS_PATH (
    echo ERROR: Visual Studio installation not found
    exit /b 1
)

echo Found Visual Studio at: !VS_PATH!

REM Find vcvars64.bat
set "VCVARS=!VS_PATH!\VC\Auxiliary\Build\vcvars64.bat"

if not exist "!VCVARS!" (
    echo ERROR: vcvars64.bat not found at !VCVARS!
    exit /b 1
)

echo Initializing x64 environment...
call "!VCVARS!" x64 >nul 2>&1

REM Verify cl.exe is x64
where cl.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: cl.exe not found after vcvars64
    exit /b 1
)

REM Check that it's x64 (Hostx64)
cl.exe 2>&1 | findstr /C:"x64" >nul
if errorlevel 1 (
    echo WARNING: cl.exe might not be x64 version
)

echo.
echo Compiler:
cl.exe 2>&1 | findstr /C:"Version"
echo.

REM Check CUDA
where nvcc.exe >nul 2>&1
if errorlevel 1 (
    if defined CUDA_PATH (
        set "PATH=!CUDA_PATH!\bin;!PATH!"
    ) else (
        echo ERROR: CUDA Toolkit not found
        exit /b 1
    )
)

echo CUDA Compiler:
nvcc --version | findstr /C:"release"
echo.

REM Navigate to CUDA source directory
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

REM Force Visual Studio generator to avoid CVTRES issues with Ninja + VS 2026
REM Ninja has known issues with VS 2026 preview CVTRES tool
set "GENERATOR=Visual Studio 17 2022"
set "GENERATOR_ARGS=-A x64"
echo Using Visual Studio generator ^(safer for CUDA builds^)

REM Install node-addon-api if needed
cd /d "!PROJECT_ROOT!"
if not exist "node_modules\node-addon-api" (
    echo Installing node-addon-api...
    call npm install node-addon-api
)
cd /d "!CUDA_SRC!"

REM Find Windows SDK rc.exe (not the npm rc package!)
REM Standard SDK locations - use delayed expansion for paths with parentheses
set "SDK_BIN_X64=C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64"
if not exist "!SDK_BIN_X64!\rc.exe" (
    set "SDK_BIN_X64=C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64"
)
if not exist "!SDK_BIN_X64!\rc.exe" (
    set "SDK_BIN_X64=C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64"
)

if exist "!SDK_BIN_X64!\rc.exe" (
    echo Found Windows SDK: !SDK_BIN_X64!
    set "PATH=!SDK_BIN_X64!;!PATH!"
) else (
    echo WARNING: Windows SDK rc.exe not found - build may fail
)

REM Temporarily rename npm's rc shims to avoid conflict with Windows SDK rc.exe
REM npm's "rc" package outputs JSON instead of compiling resources!
set "NPM_BIN=!PROJECT_ROOT!\node_modules\.bin"
echo Temporarily disabling npm rc package to avoid conflict...
if exist "!NPM_BIN!\rc.cmd" move /y "!NPM_BIN!\rc.cmd" "!NPM_BIN!\rc.cmd.bak" >nul 2>&1
if exist "!NPM_BIN!\rc.ps1" move /y "!NPM_BIN!\rc.ps1" "!NPM_BIN!\rc.ps1.bak" >nul 2>&1
if exist "!NPM_BIN!\rc" move /y "!NPM_BIN!\rc" "!NPM_BIN!\rc.bak" >nul 2>&1

REM Run cmake-js with explicit settings
echo.
echo Building CUDA addon...
echo.

REM Note: Visual Studio generator ignores CMAKE_CUDA_HOST_COMPILER - it uses VS's own compiler
call npx cmake-js compile -G "!GENERATOR!" !GENERATOR_ARGS!

REM Restore npm's rc shims
if exist "!NPM_BIN!\rc.cmd.bak" move /y "!NPM_BIN!\rc.cmd.bak" "!NPM_BIN!\rc.cmd" >nul 2>&1
if exist "!NPM_BIN!\rc.ps1.bak" move /y "!NPM_BIN!\rc.ps1.bak" "!NPM_BIN!\rc.ps1" >nul 2>&1
if exist "!NPM_BIN!\rc.bak" move /y "!NPM_BIN!\rc.bak" "!NPM_BIN!\rc" >nul 2>&1

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    echo.
    echo Try running from "x64 Native Tools Command Prompt for VS"
    exit /b 1
)

REM Copy output
echo.
echo Copying output...

if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"

if exist "build\Release\ultrascript_cuda.node" (
    copy /y "build\Release\ultrascript_cuda.node" "!OUTPUT_DIR!\"
    echo.
    echo SUCCESS: Built !OUTPUT_DIR!\ultrascript_cuda.node
) else if exist "build\ultrascript_cuda.node" (
    copy /y "build\ultrascript_cuda.node" "!OUTPUT_DIR!\"
    echo.
    echo SUCCESS: Built !OUTPUT_DIR!\ultrascript_cuda.node
) else (
    echo.
    echo WARNING: Output file not found at expected location
    echo Looking for .node files...
    dir /s /b "build\*.node" 2>nul
)

echo.
echo ============================================================================
echo   Build Complete
echo ============================================================================
echo.

endlocal
