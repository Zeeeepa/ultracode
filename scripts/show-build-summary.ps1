# Build Summary Display with Colors
param(
    [string]$ProjectRoot
)

$TS_OK = Test-Path "$ProjectRoot\dist\index.js"
$WASM_DIFF = Test-Path "$ProjectRoot\dist\external-tools\wasm\diff-simd\diff_simd.js"
$WASM_VECTOR = Test-Path "$ProjectRoot\dist\external-tools\wasm\vector-ops-simd\vector_ops_simd.js"
$CUDA_OK = Test-Path "$ProjectRoot\dist\native\cuda\ultracode_cuda.node"

$WASM_COUNT = 0
if ($WASM_DIFF) { $WASM_COUNT++ }
if ($WASM_VECTOR) { $WASM_COUNT++ }

Write-Host ""
Write-Host ("="*70) -ForegroundColor Cyan
Write-Host "  Build Summary" -ForegroundColor Cyan
Write-Host ("="*70) -ForegroundColor Cyan
Write-Host ""

# TypeScript
Write-Host "  TypeScript Build" -NoNewline
Write-Host (" "*10) -NoNewline
if ($TS_OK) {
    Write-Host "[OK] SUCCESS" -ForegroundColor Green
} else {
    Write-Host "[FAIL] FAILED" -ForegroundColor Red
}

# WASM
Write-Host "  WASM SIMD ($WASM_COUNT/2)" -NoNewline
Write-Host (" "*11) -NoNewline
if ($WASM_COUNT -eq 2) {
    Write-Host "[OK] Built successfully      4-8x" -ForegroundColor Green
    Write-Host "    - diff-simd" -ForegroundColor Gray
    Write-Host "    - vector-ops-simd" -ForegroundColor Gray
} elseif ($WASM_COUNT -eq 1) {
    Write-Host "[WARN] Partial build" -ForegroundColor Yellow
    if ($WASM_DIFF) { Write-Host "    - diff-simd: OK" -ForegroundColor Gray }
    if ($WASM_VECTOR) { Write-Host "    - vector-ops-simd: OK" -ForegroundColor Gray }
} else {
    Write-Host "[SKIP] Not built (optional)" -ForegroundColor Yellow
}

# CUDA
Write-Host "  CUDA Native" -NoNewline
Write-Host (" "*15) -NoNewline
if ($CUDA_OK) {
    Write-Host "[OK] Built successfully      100-200x" -ForegroundColor Green
    $size = (Get-Item "$ProjectRoot\dist\native\cuda\ultracode_cuda.node").Length
    Write-Host "    - ultracode_cuda.node ($size bytes)" -ForegroundColor Gray
} else {
    Write-Host "[SKIP] Not built (optional)" -ForegroundColor Yellow
}

# Roslyn C# Addon
$ROSLYN_OK = Test-Path "$ProjectRoot\dist\roslyn-addon\UltraCode.CSharp.dll"
Write-Host "  Roslyn C# Addon" -NoNewline
Write-Host (" "*10) -NoNewline
if ($ROSLYN_OK) {
    Write-Host "[OK] Built successfully      Roslyn analysis" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Not built (optional)" -ForegroundColor Yellow
}

# WebGPU
Write-Host "  WebGPU" -NoNewline
Write-Host (" "*20) -NoNewline
Write-Host "[INFO] Runtime detection     50-100x" -ForegroundColor Cyan

# Pure JS
Write-Host "  Pure JS" -NoNewline
Write-Host (" "*20) -NoNewline
Write-Host "[OK] Always available        1.45x" -ForegroundColor Green

Write-Host ""
Write-Host ("="*70) -ForegroundColor Cyan
Write-Host ""

if ($TS_OK) {
    Write-Host "[OK] Build completed successfully!" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Build failed!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Output: dist\index.js" -ForegroundColor Gray
Write-Host "Run:    bun dist\index.js [directory]" -ForegroundColor Gray
Write-Host ""
