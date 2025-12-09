@echo off
setlocal enabledelayedexpansion

:: Download Java ANTLR grammar from antlr/grammars-v4 repository

set "SCRIPT_DIR=%~dp0"
set "GRAMMAR_DIR=%SCRIPT_DIR%..\java\grammar"
set "JAVA_GRAMMAR_BASE=https://raw.githubusercontent.com/antlr/grammars-v4/master/java/java20"

echo === Downloading Java ANTLR Grammar ===
echo Target directory: %GRAMMAR_DIR%

:: Create directory
if not exist "%GRAMMAR_DIR%" mkdir "%GRAMMAR_DIR%"

:: Download grammar files using curl (available in Windows 10+)
echo Downloading Java20Lexer.g4...
curl -fsSL "%JAVA_GRAMMAR_BASE%/Java20Lexer.g4" -o "%GRAMMAR_DIR%\Java20Lexer.g4"
if errorlevel 1 (
    echo ERROR: Failed to download Java20Lexer.g4
    exit /b 1
)

echo Downloading Java20Parser.g4...
curl -fsSL "%JAVA_GRAMMAR_BASE%/Java20Parser.g4" -o "%GRAMMAR_DIR%\Java20Parser.g4"
if errorlevel 1 (
    echo ERROR: Failed to download Java20Parser.g4
    exit /b 1
)

echo.
echo === Download Complete ===
echo Files downloaded to: %GRAMMAR_DIR%
dir "%GRAMMAR_DIR%"
echo.
echo Next step: Run generate-java.cmd to generate TypeScript parser

endlocal
