@echo off
setlocal enabledelayedexpansion

:: Download Kotlin ANTLR grammar from official kotlin-spec repository

set "SCRIPT_DIR=%~dp0"
set "GRAMMAR_DIR=%SCRIPT_DIR%..\kotlin\grammar"
set "KOTLIN_SPEC_BASE=https://raw.githubusercontent.com/Kotlin/kotlin-spec/master/grammar/src/main/antlr"

echo === Downloading Kotlin ANTLR Grammar ===
echo Target directory: %GRAMMAR_DIR%

:: Create directory
if not exist "%GRAMMAR_DIR%" mkdir "%GRAMMAR_DIR%"

:: Download grammar files using curl (available in Windows 10+)
echo Downloading KotlinLexer.g4...
curl -fsSL "%KOTLIN_SPEC_BASE%/KotlinLexer.g4" -o "%GRAMMAR_DIR%\KotlinLexer.g4"
if errorlevel 1 (
    echo ERROR: Failed to download KotlinLexer.g4
    exit /b 1
)

echo Downloading KotlinParser.g4...
curl -fsSL "%KOTLIN_SPEC_BASE%/KotlinParser.g4" -o "%GRAMMAR_DIR%\KotlinParser.g4"
if errorlevel 1 (
    echo ERROR: Failed to download KotlinParser.g4
    exit /b 1
)

echo Downloading UnicodeClasses.g4...
curl -fsSL "%KOTLIN_SPEC_BASE%/UnicodeClasses.g4" -o "%GRAMMAR_DIR%\UnicodeClasses.g4"
if errorlevel 1 (
    echo ERROR: Failed to download UnicodeClasses.g4
    exit /b 1
)

echo.
echo === Download Complete ===
echo Files downloaded to: %GRAMMAR_DIR%
dir "%GRAMMAR_DIR%"
echo.
echo Next step: Run generate-kotlin.cmd to generate TypeScript parser

endlocal
