@rem Gradle wrapper script for Windows

@echo off
setlocal enabledelayedexpansion

set GRADLE_VERSION=8.5
set GRADLE_HOME=%USERPROFILE%\.gradle\wrapper\dists\gradle-%GRADLE_VERSION%
set GRADLE_ZIP=%~dp0gradle\wrapper\gradle-%GRADLE_VERSION%-bin.zip
set GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip

@rem Download Gradle if not present
if not exist "%GRADLE_HOME%" (
    echo Downloading Gradle %GRADLE_VERSION%...
    if not exist "%USERPROFILE%\.gradle\wrapper\dists" mkdir "%USERPROFILE%\.gradle\wrapper\dists"
    if not exist "%~dp0gradle\wrapper" mkdir "%~dp0gradle\wrapper"

    @rem Try PowerShell download
    powershell -Command "& {Invoke-WebRequest -Uri '%GRADLE_URL%' -OutFile '%GRADLE_ZIP%'}"
    if errorlevel 1 (
        echo Error: Could not download Gradle
        exit /b 1
    )

    echo Extracting Gradle...
    powershell -Command "& {Expand-Archive -Path '%GRADLE_ZIP%' -DestinationPath '%USERPROFILE%\.gradle\wrapper\dists' -Force}"
    del /f /q "%GRADLE_ZIP%" 2>nul
)

@rem Find Gradle executable
set GRADLE_BIN=%GRADLE_HOME%\bin\gradle.bat
if not exist "%GRADLE_BIN%" (
    set GRADLE_BIN=%USERPROFILE%\.gradle\wrapper\dists\gradle-%GRADLE_VERSION%\bin\gradle.bat
)

if not exist "%GRADLE_BIN%" (
    echo Error: Could not find Gradle executable
    exit /b 1
)

@rem Run Gradle
"%GRADLE_BIN%" %*
