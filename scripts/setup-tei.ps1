#!/usr/bin/env pwsh
# TEI (Text Embeddings Inference) Setup Script
# Installs and configures HuggingFace TEI with GPU support

param(
    [string]$ModelId = "",
    [string]$Architecture = ""  # cpu, turing, ampere-80, ampere-86, ada, hopper, blackwell
)

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "TEI (Text Embeddings Inference) Setup"
Write-Host "========================================"
Write-Host ""

# Configuration
$containerName = "tei-server"
# Use provided model or default (All-MiniLM - works on CPU and GPU)
$model = if ([string]::IsNullOrWhiteSpace($ModelId)) { "sentence-transformers/all-MiniLM-L6-v2" } else { $ModelId }
$port = 8080
$baseImage = "ghcr.io/huggingface/text-embeddings-inference"
$version = "1.8.3"

# Check if container already exists
$existingContainer = docker ps -a --filter "name=$containerName" --format "{{.Names}}" 2>$null
if ($existingContainer -eq $containerName) {
    Write-Host "[INFO] Container '$containerName' already exists" -ForegroundColor Yellow
    Write-Host ""

    $action = Read-Host "What to do? [1=Restart, 2=Remove and reinstall, 3=Cancel]"

    switch ($action) {
        "1" {
            Write-Host "[INFO] Restarting existing container..." -ForegroundColor Cyan
            docker restart $containerName

            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] Container restarted successfully" -ForegroundColor Green
                Write-Host ""
                Write-Host "TEI is now running on http://127.0.0.1:$port" -ForegroundColor Cyan
                exit 0
            }
            else {
                Write-Host "[ERROR] Failed to restart container" -ForegroundColor Red
                exit 1
            }
        }

        "2" {
            Write-Host "[INFO] Removing existing container..." -ForegroundColor Cyan
            docker stop $containerName 2>$null
            docker rm $containerName 2>$null
            Write-Host "[OK] Container removed" -ForegroundColor Green
        }

        "3" {
            Write-Host "[INFO] Installation cancelled" -ForegroundColor Yellow
            exit 0
        }

        default {
            Write-Host "[ERROR] Invalid choice" -ForegroundColor Red
            exit 1
        }
    }
}

# Architecture selection - use parameter if provided, otherwise ask
$useGpu = $true
$archName = ""
$imageTag = ""

if (![string]::IsNullOrWhiteSpace($Architecture)) {
    # Use provided architecture
    Write-Host "[INFO] Using architecture: $Architecture" -ForegroundColor Cyan

    switch ($Architecture.ToLower()) {
        "cpu" {
            $imageTag = "${baseImage}:cpu-${version}"
            $archName = "CPU"
            $useGpu = $false
        }
        "turing" {
            $imageTag = "${baseImage}:turing-${version}"
            $archName = "Turing (RTX 2000/T4)"
        }
        "ampere-80" {
            $imageTag = "${baseImage}:${version}"
            $archName = "Ampere A100/A30"
        }
        "ampere-86" {
            $imageTag = "${baseImage}:86-${version}"
            $archName = "Ampere A10/A40"
        }
        "ada" {
            $imageTag = "${baseImage}:89-${version}"
            $archName = "Ada Lovelace (RTX 4000)"
        }
        "hopper" {
            $imageTag = "${baseImage}:hopper-${version}"
            $archName = "Hopper (H100)"
        }
        "blackwell" {
            # Blackwell not supported by official TEI - fallback to CPU
            $imageTag = "${baseImage}:cpu-${version}"
            $archName = "CPU (Blackwell not supported)"
            $useGpu = $false
            Write-Host ""
            Write-Host "[WARNING] Blackwell GPU not supported by official TEI. Using CPU mode." -ForegroundColor Yellow
            Write-Host "          Consider using 'blackwell-patch' architecture or Ollama for RTX 50xx GPUs." -ForegroundColor Yellow
        }
        "blackwell-patch" {
            # Alternative TEI with Blackwell patch from hotchpotch
            $imageTag = "hotchpotch/tei-blackwell-testing:latest"
            $archName = "Blackwell (RTX 5000) - patched TEI"
            $useGpu = $true
            Write-Host ""
            Write-Host "[INFO] Using alternative TEI with Blackwell patch (hotchpotch/tei-blackwell-testing)" -ForegroundColor Cyan
            Write-Host "       This is a community build, not official HuggingFace release." -ForegroundColor DarkGray
        }
        default {
            Write-Host "[WARNING] Unknown architecture '$Architecture', using default (Ampere)" -ForegroundColor Yellow
            $imageTag = "${baseImage}:${version}"
            $archName = "Ampere A100/A30 (default)"
        }
    }
} else {
    # Interactive architecture selection
    Write-Host "========================================"
    Write-Host "GPU Architecture Selection"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Select your GPU architecture:"
    Write-Host "  1) CPU only (slowest, but works everywhere)"
    Write-Host "  2) NVIDIA Turing (RTX 2000 series, T4)"
    Write-Host "  3) NVIDIA Ampere A100/A30 (default, best compatibility)"
    Write-Host "  4) NVIDIA Ampere A10/A40"
    Write-Host "  5) NVIDIA Ada Lovelace (RTX 4000 series)"
    Write-Host "  6) NVIDIA Hopper (H100)"
    Write-Host "  7) NVIDIA Blackwell (RTX 5000 series) - NOT SUPPORTED, uses CPU"
    Write-Host "  8) NVIDIA Blackwell with TEI patch (RTX 5000 series) - EXPERIMENTAL"
    Write-Host ""

    $archChoice = Read-Host "Enter choice [1-8] (default: 3)"
    if ([string]::IsNullOrWhiteSpace($archChoice)) { $archChoice = "3" }

    switch ($archChoice) {
        "1" {
            $imageTag = "${baseImage}:cpu-${version}"
            $archName = "CPU"
            $useGpu = $false
        }
        "2" {
            $imageTag = "${baseImage}:turing-${version}"
            $archName = "Turing (RTX 2000/T4)"
        }
        "3" {
            $imageTag = "${baseImage}:${version}"
            $archName = "Ampere A100/A30"
        }
        "4" {
            $imageTag = "${baseImage}:86-${version}"
            $archName = "Ampere A10/A40"
        }
        "5" {
            $imageTag = "${baseImage}:89-${version}"
            $archName = "Ada Lovelace (RTX 4000)"
        }
        "6" {
            $imageTag = "${baseImage}:hopper-${version}"
            $archName = "Hopper (H100)"
        }
        "7" {
            $imageTag = "${baseImage}:cpu-${version}"
            $archName = "CPU (Blackwell not supported)"
            $useGpu = $false
            Write-Host ""
            Write-Host "[WARNING] Blackwell not supported by official TEI. Using CPU mode." -ForegroundColor Yellow
            Write-Host "          Consider option 8 (TEI with Blackwell patch) or Ollama for RTX 50xx GPUs." -ForegroundColor Yellow
        }
        "8" {
            $imageTag = "hotchpotch/tei-blackwell-testing:latest"
            $archName = "Blackwell (RTX 5000) - patched TEI"
            $useGpu = $true
            Write-Host ""
            Write-Host "[INFO] Using alternative TEI with Blackwell patch (hotchpotch/tei-blackwell-testing)" -ForegroundColor Cyan
            Write-Host "       This is a community build, not official HuggingFace release." -ForegroundColor DarkGray
        }
        default {
            Write-Host "[ERROR] Invalid choice" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ""
Write-Host "[INFO] Selected: $archName" -ForegroundColor Cyan
Write-Host ""

# Pull TEI image
Write-Host "[INFO] Pulling TEI Docker image..." -ForegroundColor Cyan
Write-Host "       Image: $imageTag" -ForegroundColor DarkGray
Write-Host "       This may take a few minutes (first time only)..." -ForegroundColor DarkGray
Write-Host ""

docker pull $imageTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to pull TEI image" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Image downloaded" -ForegroundColor Green
Write-Host ""

# Create and run container
Write-Host "[INFO] Creating TEI container..." -ForegroundColor Cyan
Write-Host "       Container name: $containerName" -ForegroundColor DarkGray
Write-Host "       Model: $model" -ForegroundColor DarkGray
Write-Host "       Port: $port" -ForegroundColor DarkGray
Write-Host "       Architecture: $archName" -ForegroundColor DarkGray
Write-Host ""

# Prepare docker arguments
$dockerArgs = @(
    "run",
    "-d",
    "--name", $containerName,
    "-p", "${port}:80",
    "-v", "$HOME/.cache/huggingface:/data",
    "--restart", "unless-stopped"
)

# Add GPU support if selected
if ($useGpu) {
    Write-Host "[INFO] Starting with GPU support..." -ForegroundColor Cyan
    $dockerArgs += "--gpus"
    $dockerArgs += "all"
}
else {
    Write-Host "[INFO] Starting in CPU mode..." -ForegroundColor Cyan
}

$dockerArgs += $imageTag
$dockerArgs += "--model-id"
$dockerArgs += $model
$dockerArgs += "--dtype"
$dockerArgs += "float16"
$dockerArgs += "--max-concurrent-requests"
$dockerArgs += "256"
$dockerArgs += "--max-batch-tokens"
$dockerArgs += "16384"
$dockerArgs += "--max-batch-requests"
$dockerArgs += "64"
$dockerArgs += "--max-client-batch-size"
$dockerArgs += "256"
$dockerArgs += "--tokenization-workers"
$dockerArgs += "4"
$dockerArgs += "--auto-truncate"

docker @dockerArgs

if ($LASTEXITCODE -eq 0) {
    if ($useGpu) {
        Write-Host "[OK] TEI started with GPU acceleration" -ForegroundColor Green
    }
    else {
        Write-Host "[OK] TEI started in CPU mode" -ForegroundColor Green
    }
}
else {
    Write-Host "[ERROR] Failed to start TEI container" -ForegroundColor Red
    if ($useGpu) {
        Write-Host ""
        Write-Host "[HINT] If GPU failed, try running the script again and select option 1 (CPU)" -ForegroundColor Yellow
    }
    exit 1
}

Write-Host ""

# Wait for container to be ready
Write-Host "[INFO] Waiting for TEI to initialize..." -ForegroundColor Cyan
$maxWaitSeconds = 120
$waitedSeconds = 0

while ($waitedSeconds -lt $maxWaitSeconds) {
    Start-Sleep -Seconds 2
    $waitedSeconds += 2

    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:${port}/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "[OK] TEI is ready!" -ForegroundColor Green
            break
        }
    }
    catch {
        Write-Host "." -NoNewline
    }
}

if ($waitedSeconds -ge $maxWaitSeconds) {
    Write-Host ""
    Write-Host "[WARNING] TEI health check timed out after $maxWaitSeconds seconds" -ForegroundColor Yellow
    Write-Host "          Container might still be initializing. Check logs:" -ForegroundColor Yellow
    Write-Host "          docker logs $containerName" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================"
Write-Host "TEI Setup Complete"
Write-Host "========================================"
Write-Host ""
Write-Host "Container: $containerName" -ForegroundColor Cyan
Write-Host "Endpoint:  http://127.0.0.1:$port" -ForegroundColor Cyan
Write-Host "Model:     $model" -ForegroundColor Cyan
Write-Host ""
Write-Host "Management commands:"
Write-Host "  docker logs $containerName        # View logs"
Write-Host "  docker stop $containerName        # Stop container"
Write-Host "  docker start $containerName       # Start container"
Write-Host "  docker restart $containerName     # Restart container"
Write-Host ""
