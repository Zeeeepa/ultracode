@echo off
REM Development Setup Wrapper
REM Runs dev-setup.ps1 with proper execution policy

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║           UltraScript Tools - Development Setup               ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Get script directory
set "SCRIPT_DIR=%~dp0"

REM Check if PowerShell is available
where powershell >nul 2>nul
if errorlevel 1 (
    echo ERROR: PowerShell not found!
    echo Please install PowerShell or run dev-setup.ps1 manually.
    exit /b 1
)

REM Run PowerShell script with bypass execution policy
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%dev-setup.ps1" %*

exit /b %ERRORLEVEL%
