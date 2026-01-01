@echo off
REM Build faiss-node for Linux using WSL
REM Wrapper for build-faiss-wsl.ps1

setlocal enabledelayedexpansion

echo ======================================================================
echo   Building faiss-node for Linux using WSL
echo ======================================================================
echo.

REM Check if --clean flag is passed
set CLEAN_FLAG=
if /I "%1"=="--clean" set CLEAN_FLAG=-Clean

REM Run PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0build-faiss-wsl.ps1" %CLEAN_FLAG%

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
