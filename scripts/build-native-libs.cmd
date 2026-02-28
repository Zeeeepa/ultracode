@echo off
REM UltraCode - Native Library Builder (Windows wrapper)
REM Without arguments: builds all platforms and creates archives
REM With arguments: passes them to PowerShell script

setlocal enabledelayedexpansion

REM Find PowerShell
where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PS_CMD=pwsh"
) else (
    where powershell >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set "PS_CMD=powershell"
    ) else (
        echo ERROR: PowerShell not found!
        echo Install PowerShell Core from: https://github.com/PowerShell/PowerShell/releases
        exit /b 1
    )
)

REM Get script directory
set "SCRIPT_DIR=%~dp0"

REM If no arguments, default to build all + package
if "%~1"=="" (
    echo Building all platforms and creating archives...
    %PS_CMD% -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-native-libs.ps1" -Package
) else (
    %PS_CMD% -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-native-libs.ps1" %*
)
