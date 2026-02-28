#!/usr/bin/env pwsh
# Build script for UltraCode.Comm
# Creates a single portable binary that runs on Windows/Linux/macOS

param(
    [switch]$Clean,
    [switch]$NoCopy,
    [string]$OutputDir = "..\..\dist"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Status($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Err($msg) { Write-Host "[-] $msg" -ForegroundColor Red }

# Paths
$SourceFile = Join-Path $ScriptDir "comm.c"
$OutputCom = Join-Path $ScriptDir "ultracode.com"
$CosmoDir = "$env:LOCALAPPDATA\cosmocc\bin"

# Git Bash path (needed to run cosmocc shell script on Windows)
$GitBashPaths = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
$GitBash = $GitBashPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host ""
Write-Host "=== UltraCode.Comm Build ===" -ForegroundColor Magenta
Write-Host ""

# Clean if requested
if ($Clean) {
    Write-Status "Cleaning..."
    Remove-Item "$ScriptDir\*.com" -Force -ErrorAction SilentlyContinue
    Remove-Item "$ScriptDir\*.exe" -Force -ErrorAction SilentlyContinue
    Remove-Item "$ScriptDir\*.o" -Force -ErrorAction SilentlyContinue
    Write-Success "Cleaned"
    if (-not (Test-Path $SourceFile)) { exit 0 }
}

# Check cosmocc exists
$CosmoccScript = Join-Path $CosmoDir "cosmocc"
if (-not (Test-Path $CosmoccScript)) {
    Write-Err "cosmocc not found at $CosmoccScript"
    Write-Err "Run .\setup.ps1 first."
    exit 1
}

# Check Git Bash
if (-not $GitBash) {
    Write-Err "Git Bash not found! Install Git for Windows."
    Write-Err "Download: https://git-scm.com/download/win"
    exit 1
}

Write-Status "Using cosmocc: $CosmoccScript"
Write-Status "Using bash: $GitBash"

# Build
Write-Status "Compiling comm.c..."

Push-Location $ScriptDir
try {
    # Convert Windows paths to Unix-style for bash
    $UnixCosmoDir = $CosmoDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'
    $UnixScriptDir = $ScriptDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

    # Run cosmocc via Git Bash
    $bashCmd = "export PATH='$UnixCosmoDir':`$PATH && cd '$UnixScriptDir' && cosmocc -Os -DNDEBUG -Wall -Wextra -o ultracode.com comm.c"

    & $GitBash -c $bashCmd 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Build failed!"
        exit 1
    }

    if (-not (Test-Path $OutputCom)) {
        Write-Err "Output file not created!"
        exit 1
    }

    $size = (Get-Item $OutputCom).Length
    $sizeKB = [math]::Round($size / 1024, 1)
    Write-Success "Built: ultracode.com ($sizeKB KB)"

} finally {
    Pop-Location
}

# Copy to output directory
if (-not $NoCopy) {
    $FullOutputDir = Join-Path $ScriptDir $OutputDir
    $FullOutputDir = [System.IO.Path]::GetFullPath($FullOutputDir)

    # Clean dist directory to prevent old files from interfering
    if (Test-Path $FullOutputDir) {
        Write-Status "Cleaning $FullOutputDir..."

        # Handle potentially locked .com file - rename to .blocked first
        $comFile = Join-Path $FullOutputDir "ultracode.com"
        $blockedFile = Join-Path $FullOutputDir "ultracode.com.blocked"
        if (Test-Path $comFile) {
            Remove-Item $blockedFile -Force -ErrorAction SilentlyContinue
            Rename-Item $comFile $blockedFile -Force -ErrorAction SilentlyContinue
        }

        Remove-Item (Join-Path $FullOutputDir "*.js") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $FullOutputDir "*.map") -Force -ErrorAction SilentlyContinue
        Remove-Item $blockedFile -Force -ErrorAction SilentlyContinue
        Write-Success "Cleaned old files"
    } else {
        New-Item -ItemType Directory -Path $FullOutputDir -Force | Out-Null
    }

    Write-Status "Copying to $FullOutputDir..."
    Copy-Item $OutputCom (Join-Path $FullOutputDir "ultracode.com") -Force
    Write-Success "Copied to: $FullOutputDir\ultracode.com"
}

Write-Host ""
Write-Host "=== Build Summary ===" -ForegroundColor Magenta
Write-Host ""
Write-Host "Output:     ultracode.com" -ForegroundColor White
Write-Host "Size:       $sizeKB KB" -ForegroundColor White
Write-Host "Platforms:  Windows x64, Linux x64, macOS x64/ARM64, FreeBSD, NetBSD, OpenBSD" -ForegroundColor White
Write-Host ""
Write-Host "Usage:" -ForegroundColor Yellow
Write-Host "  Windows:  .\ultracode.com --help"
Write-Host "  Linux:    ./ultracode.com --help"
Write-Host "  macOS:    ./ultracode.com --help"
Write-Host ""
Write-Success "Build complete!"
