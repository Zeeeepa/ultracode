@echo off
REM Build faiss-node from source for Node 24
REM Requirements: CMake, VS Build Tools 2022, Python, Git
REM All dependencies will be auto-installed if missing

setlocal enabledelayedexpansion

echo ======================================================================
echo   Building faiss-node for Node 24 (ABI v137)
echo ======================================================================
echo.

node scripts/build-faiss-node.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed. Check the errors above.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   Build completed successfully!
echo ======================================================================
pause
