# WASM Build Script for Windows (PowerShell)
# Builds WASM modules with SIMD optimization using wasm-pack

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Building WASM modules with SIMD support" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Change to project root
Push-Location $ProjectRoot
Write-Host "Working directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

# Check if Rust/Cargo is installed
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Rust/Cargo not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Rust from: https://rustup.rs/" -ForegroundColor Yellow
    Write-Host "  Windows: Download and run rustup-init.exe" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✅ Using cargo: $(Get-Command cargo | Select-Object -ExpandProperty Source)" -ForegroundColor Green

# Check if wasm-pack is installed
if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
    Write-Host "❌ wasm-pack not found. Installing..." -ForegroundColor Yellow
    cargo install wasm-pack
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install wasm-pack" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✅ Prerequisites installed" -ForegroundColor Green
Write-Host ""

# Build diff-simd module
Write-Host "📦 Building external-tools/wasm/diff-simd..." -ForegroundColor Cyan
Push-Location external-tools/wasm/diff-simd

wasm-pack build --target bundler --out-dir ../../../dist/wasm/diff-simd --release
$diffResult = $LASTEXITCODE

Pop-Location

if ($diffResult -eq 0) {
    Write-Host "✅ diff-simd built successfully" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "❌ diff-simd build failed" -ForegroundColor Red
    exit 1
}

# Build vector-ops-simd module
Write-Host "📦 Building external-tools/wasm/vector-ops-simd..." -ForegroundColor Cyan
Push-Location external-tools/wasm/vector-ops-simd

wasm-pack build --target bundler --out-dir ../../../dist/wasm/vector-ops-simd --release
$vectorResult = $LASTEXITCODE

Pop-Location

if ($vectorResult -eq 0) {
    Write-Host "✅ vector-ops-simd built successfully" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "❌ vector-ops-simd build failed" -ForegroundColor Red
    exit 1
}

# Success message
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ All WASM modules built successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output directories:" -ForegroundColor Cyan
Write-Host "  - dist/external-tools/wasm/diff-simd/"
Write-Host "  - dist/external-tools/wasm/vector-ops-simd/"
Write-Host ""
Write-Host "To use in Node.js:" -ForegroundColor Cyan
Write-Host "  import { compute_diff_simd } from './dist/external-tools/wasm/diff-simd/diff_simd.js';"
Write-Host "  import { cosine_similarity_simd } from './dist/external-tools/wasm/vector-ops-simd/vector_ops_simd.js';"
Write-Host ""

# Return to original directory
Pop-Location

exit 0
