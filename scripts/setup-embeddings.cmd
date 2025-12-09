@echo off
REM ==============================================================================
REM UltraScript Tools MCP - Semantic Embedding Setup v2
REM ==============================================================================
REM Flow:
REM   0. Detect CPU (AVX2/VNNI/AMX) + GPU (NVIDIA arch)
REM   1. Ask: Comment language (English / Multilingual)
REM   2. Recommend best provider (OpenVINO/TEI/Ollama)
REM   3. Select model (512 tok + 8K legacy)
REM   4. Install
REM ==============================================================================

cd /d "%~dp0.."

REM Check if bun is available
where bun >nul 2>&1
if %errorlevel% equ 0 (
    bun run src/cli/setup-command.ts %*
    goto :done
)

REM Fallback to tsx if bun not available
where tsx >nul 2>&1
if %errorlevel% equ 0 (
    tsx src/cli/setup-command.ts %*
    goto :done
)

REM Fallback to node with ts-node
where npx >nul 2>&1
if %errorlevel% equ 0 (
    npx tsx src/cli/setup-command.ts %*
    goto :done
)

echo ERROR: No TypeScript runtime found (bun, tsx, or npx)
echo Please install bun: https://bun.sh
pause
exit /b 1

:done
pause
