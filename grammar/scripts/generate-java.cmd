@echo off
setlocal enabledelayedexpansion

:: Generate TypeScript parser from Java ANTLR grammar

set "SCRIPT_DIR=%~dp0"
set "GRAMMAR_DIR=%SCRIPT_DIR%..\java\grammar"
set "OUTPUT_DIR=%SCRIPT_DIR%..\..\src\generated\java"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."

echo === Generating Java TypeScript Parser ===

:: Check Java is installed
where java >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is required for ANTLR code generation
    echo Please install JDK 11+ and try again
    exit /b 1
)

echo Java version:
java -version
echo.

:: Check grammar files exist
if not exist "%GRAMMAR_DIR%\Java20Lexer.g4" (
    echo ERROR: Grammar files not found in %GRAMMAR_DIR%
    echo Run download-java.cmd first
    exit /b 1
)

:: Create output directory
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Navigate to project root for npm commands
pushd "%PROJECT_ROOT%"

:: Check/install antlr4ng-cli
echo Checking antlr4ng-cli...
call npx antlr4ng --version >nul 2>&1
if errorlevel 1 (
    echo Installing antlr4ng-cli...
    call npm install --save-dev antlr4ng-cli
)

:: Generate TypeScript code
echo.
echo Generating Lexer...
call npx antlr4ng -Dlanguage=TypeScript ^
    -visitor ^
    -listener ^
    -o "%OUTPUT_DIR%" ^
    "%GRAMMAR_DIR%\Java20Lexer.g4"

if errorlevel 1 (
    echo ERROR: Failed to generate Lexer
    popd
    exit /b 1
)

echo Generating Parser...
call npx antlr4ng -Dlanguage=TypeScript ^
    -visitor ^
    -listener ^
    -lib "%GRAMMAR_DIR%" ^
    -o "%OUTPUT_DIR%" ^
    "%GRAMMAR_DIR%\Java20Parser.g4"

if errorlevel 1 (
    echo ERROR: Failed to generate Parser
    popd
    exit /b 1
)

popd

:: Post-process generated files
echo.
echo Post-processing generated files...

:: Add @ts-nocheck to all TypeScript files
for %%f in ("%OUTPUT_DIR%\*.ts") do (
    powershell -Command "(Get-Content '%%f') -replace '^(// Generated from .*)$', '$1`n// @ts-nocheck - Auto-generated code' | Set-Content '%%f'"
)

:: Create index.ts for convenient imports
(
echo // Auto-generated index file for Java ANTLR parser
echo // DO NOT EDIT - regenerate using scripts/generate-java.cmd
echo // @ts-nocheck
echo.
echo export * from './Java20Lexer.js';
echo export * from './Java20Parser.js';
echo export * from './Java20ParserVisitor.js';
echo export * from './Java20ParserListener.js';
) > "%OUTPUT_DIR%\index.ts"

echo.
echo === Generation Complete ===
echo Output directory: %OUTPUT_DIR%
dir "%OUTPUT_DIR%"
echo.
echo Generated files are ready to use. Commit them to the repository.
echo.
echo Usage in TypeScript:
echo   import { Java20Lexer, Java20Parser } from './generated/java';

endlocal
