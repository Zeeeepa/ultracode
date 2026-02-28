@echo off
setlocal enabledelayedexpansion

REM Build Roslyn C# Addon (UltraCode.CSharp)
REM Usage: build-roslyn.cmd [--force]

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.."
set "PROJECT_ROOT=%CD%"
popd

set "ROSLYN_DIR=%PROJECT_ROOT%\roslyn"
set "PUBLISH_DIR=%PROJECT_ROOT%\dist\roslyn-addon"
set "HASH_FILE=%PUBLISH_DIR%\.build-hash"
set "DLL_FILE=%PUBLISH_DIR%\UltraCode.CSharp.dll"
set "FORCE=0"

if "%1"=="--force" set "FORCE=1"

REM Check dotnet is available
where dotnet >nul 2>nul
if errorlevel 1 (
    echo [SKIP] .NET SDK not found in PATH
    echo        Install from: https://dotnet.microsoft.com/download
    exit /b 0
)

REM Compute hash of all source file CONTENTS using PowerShell (fast)
for /f "tokens=*" %%h in ('powershell -NoProfile -Command "$files = Get-ChildItem '%ROSLYN_DIR%' -Recurse -Include *.cs,*.csproj,*.props | Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' } | Sort-Object FullName; $sha = [System.Security.Cryptography.SHA256]::Create(); $ms = [System.IO.MemoryStream]::new(); foreach ($f in $files) { $b = [System.IO.File]::ReadAllBytes($f.FullName); $ms.Write($b, 0, $b.Length) }; $ms.Position = 0; [BitConverter]::ToString($sha.ComputeHash($ms)).Replace('-','').ToLower()"') do (
    set "CURRENT_HASH=%%h"
)

REM Check if rebuild needed
if "!FORCE!"=="1" goto :do_build

if not exist "!DLL_FILE!" (
    echo [INFO] DLL not found, building...
    goto :do_build
)

if exist "!HASH_FILE!" (
    set /p SAVED_HASH=<"!HASH_FILE!"
    if "!SAVED_HASH!"=="!CURRENT_HASH!" (
        echo [OK] Roslyn addon is up to date ^(hash match^)
        exit /b 0
    )
)

echo [INFO] Source changed, rebuilding...

:do_build
echo [BUILD] Publishing UltraCode.CSharp...
dotnet publish "%ROSLYN_DIR%\UltraCode.CSharp\UltraCode.CSharp.csproj" -c Release -o "%PUBLISH_DIR%" --no-self-contained -v quiet
if errorlevel 1 (
    echo [ERROR] Roslyn build failed!
    exit /b 1
)

REM Save hash
if not exist "!PUBLISH_DIR!" mkdir "!PUBLISH_DIR!"
echo !CURRENT_HASH!> "!HASH_FILE!"

echo [OK] Roslyn addon built: %PUBLISH_DIR%\UltraCode.CSharp.dll
exit /b 0
