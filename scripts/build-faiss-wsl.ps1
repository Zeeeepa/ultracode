# Build faiss-node for Linux using WSL
# This script runs the WSL build script from Windows

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Building faiss-node for Linux using WSL" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if WSL is installed
try {
    $wslVersion = wsl --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "WSL command failed"
    }
    Write-Host "✓ WSL found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: WSL not found or not working" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install WSL with:" -ForegroundColor Yellow
    Write-Host "  wsl --install" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Then restart your computer and run this script again." -ForegroundColor Yellow
    exit 1
}

# Get project root (parent of scripts directory)
$scriptDir = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptDir

# Convert Windows path to WSL path manually
# D:\path\to\dir -> /mnt/d/path/to/dir
$wslProjectRoot = $projectRoot -replace '^([A-Z]):', '/mnt/$1' -replace '\\', '/' | ForEach-Object { $_.ToLower() }
$wslScriptPath = "$wslProjectRoot/scripts/build-faiss-wsl.sh"

Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host "WSL path: $wslProjectRoot" -ForegroundColor Gray
Write-Host ""

# Make script executable
Write-Host "Making script executable in WSL..." -ForegroundColor Gray
wsl chmod +x "$wslScriptPath"

# Run the build script in WSL
Write-Host "Running build script in WSL..." -ForegroundColor Yellow
Write-Host ""

if ($Clean) {
    wsl bash "$wslScriptPath" --clean
} else {
    wsl bash "$wslScriptPath"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed in WSL" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  Build completed successfully!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""

# Check the output
$outputFile = Join-Path $projectRoot "external-libs\faiss-linux-x64\faiss-node.node"
if (Test-Path $outputFile) {
    $fileSize = (Get-Item $outputFile).Length / 1MB
    Write-Host "Output file: $outputFile" -ForegroundColor Green
    Write-Host "Size: $($fileSize.ToString('F2')) MB" -ForegroundColor Green
} else {
    Write-Host "WARNING: Output file not found at expected location" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Test: node -e `"require('./external-libs/faiss-linux-x64/faiss-node.node')`"" -ForegroundColor Cyan
Write-Host "  2. Commit: git add external-libs/faiss-linux-x64/faiss-node.node" -ForegroundColor Cyan
Write-Host ""
