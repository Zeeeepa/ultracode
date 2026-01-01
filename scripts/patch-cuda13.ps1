# Patch for CUDA 13.x / cuDNN 9.x / cuTENSOR 2.x compatibility on Windows
# Fixes multiple API changes
param([string]$FilePath)

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

$fileName = Split-Path $FilePath -Leaf
$content = Get-Content $FilePath -Raw
$modified = $false

switch -Wildcard ($fileName) {
    "soft_sign.cu" {
        # Fix: "__device__ variable template cannot have a const qualified type"
        if ($content -match '__device__ constexpr T one') {
            $content = $content -replace '(?m)^template <typename T>\r?\n__device__ constexpr T one = static_cast<T>\(1\);\r?\n\r?\n', ''
            $content = $content -replace 'one<T>', 'static_cast<T>(1)'
            $modified = $true
        }
    }
    "graph.cpp" {
        # Fix: cudaStreamUpdateCaptureDependencies signature changed in CUDA 13.x
        # Old: (stream, nodes, count, flags)
        # New: (stream, nodes, edgeData, count, flags)
        if ($content -match 'cudaStreamUpdateCaptureDependencies\([^,]+,\s*[^,]+,\s*\d+,\s*\d+\)') {
            $content = $content -replace 'cudaStreamUpdateCaptureDependencies\(([^,]+),\s*([^,]+),\s*(\d+),\s*(\d+)\)', 'cudaStreamUpdateCaptureDependencies($1, $2, nullptr, $3, $4)'
            $modified = $true
        }
        # Fix: cudaStreamGetCaptureInfo_v2 removed in CUDA 13.x, use cudaStreamGetCaptureInfo
        if ($content -match 'cudaStreamGetCaptureInfo_v2') {
            $content = $content -replace 'cudaStreamGetCaptureInfo_v2', 'cudaStreamGetCaptureInfo'
            $modified = $true
        }
        # Fix: cudaStreamGetCaptureInfo signature changed in CUDA 13.x - added edgeData parameter
        # Old: (stream, status, id, graph, deps, numDeps)
        # New: (stream, status, id, graph, deps, edgeData, numDeps)
        # Note: Simple pattern match - avoid [^)]+ which breaks on nested parens like capturedStream.get()
        if ($content -match 'cudaStreamGetCaptureInfo' -and $content -match '&deps_,\s*&depCount_\)' -and $content -notmatch '&deps_,\s*nullptr,\s*&depCount_') {
            $content = $content -replace '(&deps_),\s*(&depCount_\))', '$1, nullptr, $2'
            $modified = $true
        }
    }
    "graph.hpp" {
        # Fix: cudaStreamUpdateCaptureDependencies signature changed in CUDA 13.x
        # Old: (stream, nodes, count, flags)
        # New: (stream, nodes, edgeData, count, flags)
        if ($content -match 'cudaStreamUpdateCaptureDependencies\([^,]+,\s*[^,]+,\s*1,\s*1\)' -and $content -notmatch 'cudaStreamUpdateCaptureDependencies\([^,]+,\s*[^,]+,\s*nullptr,\s*1,\s*1\)') {
            $content = $content -replace '(cudaStreamUpdateCaptureDependencies\([^,]+,\s*[^,]+),\s*1,\s*1\)', '$1, nullptr, 1, 1)'
            $modified = $true
        }
    }
    "tensor.hpp" {
        # Fix: cuTENSOR 2.x API compatibility - add compat header after cutensor.h
        if ($content -match '#include <cutensor\.h>' -and $content -notmatch 'cutensor_compat\.h') {
            $content = $content -replace '#include <cutensor\.h>', "#include <cutensor.h>`r`n#include <cutensor_compat.h>"
            $modified = $true
        }
    }
}

if ($modified) {
    Set-Content $FilePath -Value $content -NoNewline
    Write-Host "  Patched: $fileName"
} else {
    Write-Host "  Already patched or no changes needed: $fileName"
}
