#!/usr/bin/env pwsh
# ==============================================================================
# UltraCode - Semantic Embedding Setup
# ==============================================================================
# Thin launcher — delegates to the TS setup wizard (single source of truth).
# All setup logic lives in src/cli/setup-command.ts (ships as dist/cli/setup-command.js).
#
# Usage:
#   .\setup-semantic-embedding.ps1                # Interactive setup
#   .\setup-semantic-embedding.ps1 --llm-only     # LLM setup only
#   .\setup-semantic-embedding.ps1 --lang ru       # Force Russian UI
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# Prefer compiled JS (npm install), fallback to TS source (dev)
$SetupJS = Join-Path $ProjectRoot "dist" "cli" "setup-command.js"
$SetupTS = Join-Path $ProjectRoot "src" "cli" "setup-command.ts"

if (Test-Path $SetupJS) {
    node $SetupJS @args
    exit $LASTEXITCODE
}

# Dev mode: try TS runtimes
if (Test-Path $SetupTS) {
    # Bun
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        bun run $SetupTS @args
        exit $LASTEXITCODE
    }

    # tsx
    if (Get-Command tsx -ErrorAction SilentlyContinue) {
        tsx $SetupTS @args
        exit $LASTEXITCODE
    }

    # npx tsx
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        npx tsx $SetupTS @args
        exit $LASTEXITCODE
    }
}

Write-Host "ERROR: Setup script not found." -ForegroundColor Red
Write-Host "Run 'npm run build' first, or install bun/tsx for dev mode." -ForegroundColor Yellow
exit 1
