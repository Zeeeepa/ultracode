@echo off
REM ==============================================================================
REM UltraCode - Semantic Embedding Setup v2
REM ==============================================================================
REM Flow:
REM   0. Detect CPU (AVX2/VNNI/AMX) + GPU (NVIDIA arch)
REM   1. Ask: Comment language (English / Multilingual)
REM   2. Recommend best provider (OpenVINO/TEI/Ollama)
REM   3. Select model (512 tok + 8K legacy)
REM   4. Install
REM ==============================================================================

cd /d "%~dp0.."

REM Determine which file to run - prefer dist (npm install), fallback to src (dev)
set "SETUP_FILE=dist\cli\setup-command.js"
if not exist "%SETUP_FILE%" (
    set "SETUP_FILE=src\cli\setup-command.ts"
)

REM Check if using compiled JS or TypeScript source
echo "%SETUP_FILE%" | findstr /C:".js" >nul
if %errorlevel% equ 0 (
    REM Running compiled JS - use node directly
    node "%SETUP_FILE%" %*
    goto :done
)

REM Running TypeScript source - need TS runtime
REM Check if bun is available
where bun >nul 2>&1
if %errorlevel% equ 0 (
    bun run "%SETUP_FILE%" %*
    goto :done
)

REM Fallback to tsx if bun not available
where tsx >nul 2>&1
if %errorlevel% equ 0 (
    tsx "%SETUP_FILE%" %*
    goto :done
)

REM Fallback to node with ts-node
where npx >nul 2>&1
if %errorlevel% equ 0 (
    npx tsx "%SETUP_FILE%" %*
    goto :done
)

echo ERROR: No TypeScript runtime found (bun, tsx, or npx)
echo Please install bun: https://bun.sh
pause
exit /b 1

:done
pause
