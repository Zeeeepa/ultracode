# Build faiss-node for Linux using Docker
# More reliable than WSL for CI/CD and development

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Building faiss-node for Linux using Docker" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker not found or not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Docker Desktop from:" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Then start Docker Desktop and run this script again." -ForegroundColor Yellow
    exit 1
}

# Get project root
$scriptDir = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host ""

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning build cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $projectRoot ".build-cache\faiss-node")
}

# Build FAISS in Docker
Write-Host "Starting Docker build (this will take 10-20 minutes)..." -ForegroundColor Yellow
Write-Host ""

# Execute Docker command
docker run --rm `
    -v "${projectRoot}:/work" `
    -w /work `
    node:24-slim `
    bash /work/scripts/build-faiss-docker.sh

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed in Docker" -ForegroundColor Red
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
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  git add external-libs/faiss-linux-x64/faiss-node.node" -ForegroundColor Cyan
    Write-Host "  git commit -m 'feat: add FAISS prebuilt binary for Linux x64'" -ForegroundColor Cyan
} else {
    Write-Host "WARNING: Output file not found" -ForegroundColor Yellow
}

Write-Host ""
