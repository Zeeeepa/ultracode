@echo off
REM ============================================================================
REM UltraCode - Install pre-built Dawn for Blackwell
REM
REM Quick install of pre-built dawn.node for RTX 50xx (Blackwell) GPUs.
REM Copies from external-libs to node_modules/webgpu.
REM ============================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=!SCRIPT_DIR!.."
set "DAWN_SRC=!PROJECT_ROOT!\external-libs\dawn-win32-x64\dawn.node"
set "WEBGPU_DST=!PROJECT_ROOT!\node_modules\webgpu\dist\win32-x64.dawn.node"

echo.
echo Installing pre-built Dawn for Blackwell...
echo.

if not exist "!DAWN_SRC!" (
    echo ERROR: Pre-built dawn.node not found at:
    echo   !DAWN_SRC!
    echo.
    echo Please build Dawn first:
    echo   scripts\build-dawn-x64.bat
    exit /b 1
)

if not exist "!PROJECT_ROOT!\node_modules\webgpu\dist" (
    echo ERROR: webgpu package not found. Run:
    echo   npm install webgpu
    exit /b 1
)

copy /y "!DAWN_SRC!" "!WEBGPU_DST!"

if errorlevel 1 (
    echo ERROR: Copy failed
    exit /b 1
)

echo.
echo SUCCESS: Installed Blackwell-compatible dawn.node
echo.
echo Location: !WEBGPU_DST!
echo.
echo NOTE: Only works with Node.js. Bun has native addon bugs.
echo.

endlocal
