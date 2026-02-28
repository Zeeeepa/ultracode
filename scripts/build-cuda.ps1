#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build CUDA native addon for UltraCode
.DESCRIPTION
    Compiles the CUDA vector operations addon using cmake-js.
    Requires: CUDA Toolkit 11.x+, Visual Studio Build Tools, cmake-js
.EXAMPLE
    .\scripts\build-cuda.ps1
    .\scripts\build-cuda.ps1 -Debug
#>

param(
    [switch]$Debug,
    [switch]$Clean,
    [string]$CudaArch = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$CudaDir = Join-Path $ProjectRoot "external-tools/native/cuda"
$DistDir = Join-Path $ProjectRoot "dist/native/cuda"

Write-Host "`n[CUDA Build] Starting CUDA addon build..." -ForegroundColor Cyan

# Check prerequisites
Write-Host "[CUDA Build] Checking prerequisites..." -ForegroundColor Yellow

# 1. Check CUDA Toolkit
$nvccPath = Get-Command nvcc -ErrorAction SilentlyContinue
if (-not $nvccPath) {
    $cudaPath = $env:CUDA_PATH
    if ($cudaPath -and (Test-Path "$cudaPath/bin/nvcc.exe")) {
        $env:PATH = "$cudaPath/bin;$env:PATH"
        Write-Host "[CUDA Build] Found CUDA at: $cudaPath" -ForegroundColor Green
    } else {
        Write-Host "[CUDA Build] ERROR: CUDA Toolkit not found!" -ForegroundColor Red
        Write-Host "  Install from: https://developer.nvidia.com/cuda-downloads" -ForegroundColor Yellow
        exit 1
    }
} else {
    $cudaVersion = & nvcc --version | Select-String "release" | ForEach-Object { $_ -match "release (\d+\.\d+)" | Out-Null; $Matches[1] }
    Write-Host "[CUDA Build] Found CUDA $cudaVersion" -ForegroundColor Green
}

# 2. Check cmake-js
$cmakejs = Get-Command cmake-js -ErrorAction SilentlyContinue
if (-not $cmakejs) {
    Write-Host "[CUDA Build] Installing cmake-js..." -ForegroundColor Yellow
    npm install -g cmake-js
}

# 3. Check node-addon-api
$nodeAddonApi = Join-Path $ProjectRoot "node_modules/node-addon-api"
if (-not (Test-Path $nodeAddonApi)) {
    Write-Host "[CUDA Build] node-addon-api not found, running npm install..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    npm install
    Pop-Location
}

# Clean if requested
if ($Clean) {
    Write-Host "[CUDA Build] Cleaning previous build..." -ForegroundColor Yellow
    $buildDir = Join-Path $CudaDir "build"
    if (Test-Path $buildDir) {
        Remove-Item -Recurse -Force $buildDir
    }
}

# Build
Write-Host "[CUDA Build] Compiling CUDA addon..." -ForegroundColor Yellow
Push-Location $CudaDir

$cmakeArgs = @("compile")
if ($Debug) {
    $cmakeArgs += "--debug"
}
if ($CudaArch) {
    $cmakeArgs += @("--CD", "CMAKE_CUDA_ARCHITECTURES=$CudaArch")
}

try {
    & cmake-js @cmakeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "cmake-js failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# Copy to dist
Write-Host "[CUDA Build] Copying to dist..." -ForegroundColor Yellow

if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

$buildNode = Join-Path $CudaDir "build/Release/ultracode_cuda.node"
if (-not (Test-Path $buildNode)) {
    $buildNode = Join-Path $CudaDir "build/Debug/ultracode_cuda.node"
}

if (Test-Path $buildNode) {
    Copy-Item $buildNode -Destination $DistDir -Force
    Write-Host "[CUDA Build] Copied: $DistDir/ultracode_cuda.node" -ForegroundColor Green
} else {
    Write-Host "[CUDA Build] WARNING: .node file not found at expected location" -ForegroundColor Yellow
    Write-Host "[CUDA Build] Looking for .node files..." -ForegroundColor Yellow
    Get-ChildItem -Path (Join-Path $CudaDir "build") -Recurse -Filter "*.node" | ForEach-Object {
        Write-Host "  Found: $($_.FullName)" -ForegroundColor Cyan
        Copy-Item $_.FullName -Destination $DistDir -Force
    }
}

# Verify
$finalNode = Join-Path $DistDir "ultracode_cuda.node"
if (Test-Path $finalNode) {
    $size = (Get-Item $finalNode).Length / 1KB
    Write-Host "`n[CUDA Build] SUCCESS! Built: $finalNode (${size:N0} KB)" -ForegroundColor Green
} else {
    Write-Host "`n[CUDA Build] FAILED: Output file not created" -ForegroundColor Red
    exit 1
}

Write-Host "[CUDA Build] Done!`n" -ForegroundColor Cyan
