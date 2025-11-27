#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Auto-detect GPU architecture for semantic embedding configuration
.DESCRIPTION
    Detects NVIDIA GPU compute capability and recommends TEI architecture tag
#>

$ErrorActionPreference = "Stop"

Write-Host "=== GPU Architecture Detection ===" -ForegroundColor Cyan
Write-Host ""

# Check if nvidia-smi is available
try {
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction Stop
    Write-Host "[OK] nvidia-smi found" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] nvidia-smi not found - No NVIDIA GPU detected" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
    Write-Output "cpu"
    exit 0
}

# Get GPU information
Write-Host "Detecting GPU..." -ForegroundColor Yellow

try {
    # Run nvidia-smi without 2>&1 to avoid ErrorRecord objects
    $gpuInfo = & nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader

    if ($LASTEXITCODE -ne 0) {
        throw "nvidia-smi query failed"
    }

    # Handle output - can be array or string
    if ($gpuInfo -is [string]) {
        # Single string - might have multiple lines separated by newline
        $lines = @($gpuInfo -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
    } elseif ($gpuInfo -is [Array]) {
        # Already an array - filter empty
        $lines = @($gpuInfo | Where-Object { $_ -and $_.ToString().Trim() -ne "" })
    } else {
        # Something else - convert to string array
        $lines = @($gpuInfo.ToString()) | Where-Object { $_.Trim() -ne "" }
    }

    if ($lines.Count -eq 0) {
        Write-Host "[WARNING] No NVIDIA GPUs detected" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
        Write-Output "cpu"
        exit 0
    }

    # Parse first GPU (now $lines[0] is a full line, not a char)
    $firstLine = $lines[0].ToString().Trim()
    if (-not $firstLine) {
        Write-Host "[WARNING] No GPU data returned" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
        Write-Output "cpu"
        exit 0
    }

    $parts = $firstLine -split "," | ForEach-Object { $_.Trim() }
    if ($parts.Count -lt 2) {
        Write-Host "[WARNING] Invalid GPU data format: '$firstLine'" -ForegroundColor Yellow
        Write-Host "  Parts count: $($parts.Count)" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
        Write-Output "cpu"
        exit 0
    }

    $gpuName = $parts[0].Trim()
    $computeCap = if ($parts.Count -ge 2) { $parts[1].Trim() } else { "" }

    if (-not $computeCap) {
        Write-Host "[WARNING] No compute capability data" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
        Write-Output "cpu"
        exit 0
    }

    Write-Host "[OK] Detected: $gpuName" -ForegroundColor Green
    Write-Host "  Compute Capability: $computeCap" -ForegroundColor DarkGray
    Write-Host ""

    # Map compute capability to architecture
    $arch = switch ($computeCap) {
        # Turing (75)
        { $_ -eq "7.5" } { "turing" }

        # Ampere (80, 86, 87)
        { $_ -eq "8.0" } { "ampere-80" }
        { $_ -eq "8.6" } { "ampere-86" }
        { $_ -eq "8.7" } { "ampere-86" }  # Same as 8.6

        # Ada Lovelace (89)
        { $_ -eq "8.9" } { "ada" }

        # Hopper (90)
        { $_ -eq "9.0" } { "hopper" }

        # Blackwell (100, 102, 120) - RTX 5000 series
        { $_ -eq "10.0" } { "blackwell" }
        { $_ -eq "10.2" } { "blackwell" }
        { $_ -eq "12.0" } { "blackwell" }

        default {
            if ([double]$_ -lt 7.5) {
                "cpu"  # Too old, use CPU
            } else {
                "cpu"  # Unknown, use CPU for safety
            }
        }
    }

    # Architecture info
    $archInfo = switch ($arch) {
        "turing" { "Turing (RTX 2000 series, T4)" }
        "ampere-80" { "Ampere A100/A30 (CC 8.0)" }
        "ampere-86" { "Ampere A10/A40 (CC 8.6)" }
        "ada" { "Ada Lovelace (RTX 4000 series)" }
        "hopper" { "Hopper (H100)" }
        "blackwell" { "Blackwell (RTX 5000 series)" }
        "cpu" { "CPU mode (GPU too old or unsupported)" }
    }

    Write-Host "Architecture: $archInfo" -ForegroundColor Cyan
    Write-Host ""

    if ($arch -eq "blackwell") {
        Write-Host "[WARNING] Blackwell GPU detected!" -ForegroundColor Yellow
        Write-Host "   Official TEI does not support Blackwell yet." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Choose mode for TEI:" -ForegroundColor Cyan
        Write-Host "  1) CPU mode (ONNX backend, slower but stable)"
        Write-Host "  2) GPU mode with patched TEI (experimental, community build)"
        Write-Host ""
        $choice = Read-Host "Enter choice [1-2] (default: 1)"
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

        if ($choice -eq "2") {
            Write-Host ""
            Write-Host "Selected: blackwell-patch (experimental GPU mode)" -ForegroundColor Green
            Write-Output "blackwell-patch"
        } else {
            Write-Host ""
            Write-Host "Selected: cpu (stable ONNX mode)" -ForegroundColor Green
            Write-Output "cpu"
        }
    } else {
        Write-Host "Recommendation: architecture: $arch" -ForegroundColor Cyan
        Write-Output $arch
    }

} catch {
    Write-Host "[ERROR] Error detecting GPU: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Recommendation: architecture: cpu" -ForegroundColor Cyan
    Write-Output "cpu"
    exit 0
}
