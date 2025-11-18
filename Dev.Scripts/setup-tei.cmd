@echo off
REM ==============================================================================
REM TEI (Text Embeddings Inference) Setup Script for Windows - Auto GPU/CPU
REM ==============================================================================
REM This script sets up HuggingFace Text Embeddings Inference Docker container
REM for local embedding inference with 8192-token IBM Granite models.
REM
REM Features:
REM   - Auto-detects NVIDIA GPU (RTX 30xx/40xx series)
REM   - Auto-installs NVIDIA Container Toolkit in WSL2 if needed
REM   - Falls back to CPU mode if GPU unavailable
REM
REM Requirements:
REM   - Docker Desktop installed and running
REM   - ~2GB disk space for model download
REM   - Port 8080 available (or specify custom port)
REM   - NVIDIA GPU (optional, for acceleration)
REM
REM Usage:
REM   setup-tei.cmd                                    REM Default setup
REM   setup-tei.cmd --model <model-id>                 REM Custom model
REM   setup-tei.cmd --port <port>                      REM Custom port
REM   setup-tei.cmd --model <model-id> --port <port>   REM Both custom
REM
REM Models available:
REM   - ibm-granite/granite-embedding-english-r2 (default, 149M params, 8192 tokens)
REM   - ibm-granite/granite-embedding-small-english-r2 (47M params, 8192 tokens, fast)
REM ==============================================================================

setlocal enabledelayedexpansion

REM Default configuration
set "DEFAULT_MODEL=ibm-granite/granite-embedding-english-r2"
set "DEFAULT_PORT=8080"
set "CONTAINER_NAME=tei-server"
set "TEI_IMAGE_GPU=ghcr.io/huggingface/text-embeddings-inference:1.2"
set "TEI_IMAGE_CPU=ghcr.io/huggingface/text-embeddings-inference:cpu-1.2"

REM Parse command line arguments
set "MODEL=%DEFAULT_MODEL%"
set "PORT=%DEFAULT_PORT%"
set "FORCE_CPU=false"
set "CONVERT_TOKENIZER=false"
set "CONVERTED_MODEL_DIR=./converted-model"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--model" (
    set "MODEL=%~2"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--port" (
    set "PORT=%~2"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--force-cpu" (
    set "FORCE_CPU=true"
    shift
    goto parse_args
)
if /i "%~1"=="--convert-tokenizer" (
    set "CONVERT_TOKENIZER=true"
    shift
    goto parse_args
)
if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help

echo Unknown option: %~1
echo Use --help for usage information
exit /b 1

:show_help
echo Usage: %~nx0 [OPTIONS]
echo.
echo Options:
echo   --model ^<model-id^>    HuggingFace model ID (default: %DEFAULT_MODEL%)
echo   --port ^<port^>         Host port to expose (default: %DEFAULT_PORT%)
echo   --force-cpu             Force CPU mode (skip GPU detection)
echo   --convert-tokenizer     Convert slow tokenizer to fast tokenizer
echo   --help, -h              Show this help message
echo.
echo Examples:
echo   %~nx0
echo   %~nx0 --model ibm-granite/granite-embedding-small-english-r2
echo   %~nx0 --port 8081
echo   %~nx0 --force-cpu
echo   %~nx0 --model ibm-granite/granite-embedding-30m-english --convert-tokenizer
echo.
echo Note: If you get "tokenizer.json not found" error, use --convert-tokenizer
exit /b 0

:args_done

REM ==============================================================================
REM Main Installation Steps
REM ==============================================================================

echo.
echo ===================================================================
echo TEI (Text Embeddings Inference) Setup
echo ===================================================================
echo.

REM Step 1: Check Docker availability
echo [*] Checking Docker availability...

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH
    echo.
    echo Please install Docker Desktop first:
    echo   https://www.docker.com/products/docker-desktop
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon is not running
    echo.
    echo Please start Docker Desktop and try again
    exit /b 1
)

echo [OK] Docker is available and running
echo.

REM Step 1.5: Auto-detect GPU and configure
set "USE_GPU=false"
set "TEI_IMAGE=%TEI_IMAGE_CPU%"
set "GPU_FLAGS="

REM Check if force CPU mode is requested
if "%FORCE_CPU%"=="true" (
    echo [*] Force CPU mode requested - skipping GPU detection
    echo.
    echo [INFO] TEI will use CPU mode
    echo     Image: !TEI_IMAGE!
    echo     (GPU detection skipped via --force-cpu flag^)
    echo.
    goto skip_gpu_detection
)

echo [*] Detecting GPU capabilities...

REM Check for NVIDIA GPU
where nvidia-smi >nul 2>&1
if not errorlevel 1 (
    REM Get GPU info
    for /f "tokens=1,2 delims=," %%a in ('nvidia-smi --query-gpu^=name^,compute_cap --format^=csv^,noheader 2^>nul') do (
        set "GPU_NAME=%%a"
        set "COMPUTE_CAP=%%b"
    )

    if defined GPU_NAME (
        echo [OK] GPU detected: !GPU_NAME! (Compute Capability: !COMPUTE_CAP!)

        REM Extract major version from compute capability (e.g., "8.6" -> "8")
        for /f "tokens=1 delims=." %%a in ("!COMPUTE_CAP!") do set "CC_MAJOR=%%a"

        REM Remove leading/trailing spaces
        set "CC_MAJOR=!CC_MAJOR: =!"

        REM Check if GPU is suitable (CC >= 8 for RTX 30xx/40xx)
        if !CC_MAJOR! GEQ 8 (
            echo [OK] GPU is suitable for TEI acceleration (RTX 30xx/40xx series)

            REM Test if Docker supports --gpus flag
            echo [*] Testing GPU support in Docker...
            docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi >nul 2>&1
            if not errorlevel 1 (
                echo [OK] Docker GPU support confirmed
                set "USE_GPU=true"
                set "TEI_IMAGE=!TEI_IMAGE_GPU!"
                set "GPU_FLAGS=--gpus all"
            ) else (
                echo [WARNING] Docker GPU support test failed
                echo.
                echo     This usually means WSL2 needs NVIDIA support enabled.
                echo     Installing NVIDIA Container Toolkit for WSL2...
                echo.

                REM For WSL2 on Windows, try to enable GPU support
                wsl bash -c "command -v nvidia-smi" >nul 2>&1
                if not errorlevel 1 (
                    echo [*] WSL2 detected with NVIDIA driver
                    echo [*] Installing nvidia-container-toolkit in WSL2...

                    REM Install toolkit in WSL2
                    wsl bash -c "curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null && sudo apt-get update >/dev/null 2>&1 && sudo apt-get install -y nvidia-container-toolkit >/dev/null 2>&1 && sudo nvidia-ctk runtime configure --runtime=docker >/dev/null 2>&1 && sudo systemctl restart docker >/dev/null 2>&1"

                    if not errorlevel 1 (
                        echo [OK] NVIDIA Container Toolkit installed in WSL2

                        REM Test again
                        timeout /t 3 /nobreak >nul
                        docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi >nul 2>&1
                        if not errorlevel 1 (
                            echo [OK] GPU support now working!
                            set "USE_GPU=true"
                            set "TEI_IMAGE=!TEI_IMAGE_GPU!"
                            set "GPU_FLAGS=--gpus all"
                        ) else (
                            echo [WARNING] GPU support still not working - falling back to CPU
                        )
                    ) else (
                        echo [WARNING] Installation failed - falling back to CPU mode
                    )
                ) else (
                    echo [WARNING] WSL2 NVIDIA driver not found - falling back to CPU mode
                    echo.
                    echo     To enable GPU in Docker Desktop:
                    echo     1. Install NVIDIA GPU Driver for Windows
                    echo     2. Enable "Use WSL 2 based engine" in Docker Desktop settings
                    echo     3. Enable GPU support in Resources ^> WSL Integration
                    echo.
                )
            )
        ) else (
            echo [WARNING] GPU Compute Capability !COMPUTE_CAP! is too old (need 8.0+ for RTX 30xx/40xx)
            echo [*] Falling back to CPU mode
        )
    ) else (
        echo [WARNING] Could not query GPU information
        echo [*] Falling back to CPU mode
    )
) else (
    echo [*] No NVIDIA GPU detected
    echo [*] Using CPU mode
)

echo.
if "!USE_GPU!"=="true" (
    echo [SUCCESS] TEI will use GPU acceleration
    echo     Image: !TEI_IMAGE!
    echo     GPU: !GPU_NAME!
) else (
    echo [INFO] TEI will use CPU mode
    echo     Image: !TEI_IMAGE!
    echo     (No suitable GPU found or GPU support unavailable^)
)
echo.

:skip_gpu_detection

REM Step 2: Check if port is available
echo [*] Checking if port %PORT% is available...

REM Check if container is already running
docker ps --filter "name=%CONTAINER_NAME%" --format "{{.Names}}" 2>nul | findstr /x "%CONTAINER_NAME%" >nul
if not errorlevel 1 (
    echo [OK] TEI container is already running on port %PORT%

    REM Test health
    curl -sf http://localhost:%PORT%/health >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Container is healthy and responding
        echo.
        echo [SUCCESS] TEI is ready to use!
        echo.
        echo Configuration:
        echo   - Base URL: http://127.0.0.1:%PORT%
        echo   - Model: %MODEL%
        echo   - Container: %CONTAINER_NAME%
        echo.
        echo Test it:
        echo   curl http://localhost:%PORT%/health
        exit /b 0
    ) else (
        echo [WARNING] Container exists but not responding, will restart...
        docker stop %CONTAINER_NAME% >nul 2>&1
        docker rm %CONTAINER_NAME% >nul 2>&1
    )
)

REM Step 3: Check for existing container
echo [*] Checking for existing TEI container...

docker ps -a --filter "name=%CONTAINER_NAME%" --format "{{.Names}}" 2>nul | findstr /x "%CONTAINER_NAME%" >nul
if not errorlevel 1 (
    echo [WARNING] Existing container found: %CONTAINER_NAME%
    echo [*] Removing old container...
    docker stop %CONTAINER_NAME% >nul 2>&1
    docker rm %CONTAINER_NAME% >nul 2>&1
    echo [OK] Old container removed
)

REM Step 4: Pull TEI Docker image
echo [*] Pulling TEI Docker image (this may take a few minutes)...

docker pull %TEI_IMAGE%
if errorlevel 1 (
    echo [ERROR] Failed to pull TEI image
    exit /b 1
)

echo [OK] TEI image pulled successfully

REM Step 5: Create and start TEI container
echo [*] Creating TEI container with model: %MODEL%
echo.
echo This will download the model (~200-400MB depending on model size)
echo Container will restart automatically on system reboot (--restart=always)
echo.

docker run -d ^
  --name %CONTAINER_NAME% ^
  -p %PORT%:80 ^
  --restart=always ^
  %GPU_FLAGS% ^
  -e MAX_BATCH_TOKENS=16384 ^
  -e MAX_CLIENT_BATCH_SIZE=128 ^
  !TEI_IMAGE! ^
  --model-id %MODEL% ^
  --max-batch-tokens 16384

if errorlevel 1 (
    echo [ERROR] Failed to create container
    exit /b 1
)

echo [OK] Container created successfully

REM Step 6: Wait for container to become healthy
echo [*] Waiting for TEI server to become ready (max 60 seconds)...

set WAIT_TIME=0
set MAX_WAIT=60

:wait_loop
if %WAIT_TIME% geq %MAX_WAIT% goto wait_timeout

curl -sf http://localhost:%PORT%/health >nul 2>&1
if not errorlevel 1 goto wait_success

REM Check if container is still running
docker ps --filter "name=%CONTAINER_NAME%" --format "{{.Names}}" 2>nul | findstr /x "%CONTAINER_NAME%" >nul
if errorlevel 1 (
    echo [ERROR] Container stopped unexpectedly
    echo.
    echo Logs:
    docker logs %CONTAINER_NAME%
    exit /b 1
)

echo|set /p="."
timeout /t 2 /nobreak >nul
set /a WAIT_TIME+=2
goto wait_loop

:wait_timeout
echo.
echo [ERROR] Timeout waiting for server to start
echo.
echo Container logs:
docker logs %CONTAINER_NAME%
exit /b 1

:wait_success
echo.
echo [OK] TEI server is ready!

REM Step 7: Verify setup
echo [*] Verifying setup...

REM Test health endpoint
curl -sf http://localhost:%PORT%/health 2>nul | findstr "ok" >nul
if not errorlevel 1 (
    echo [OK] Health check passed
) else (
    echo [WARNING] Health check returned unexpected response
)

REM ==============================================================================
REM Success Summary
REM ==============================================================================

echo.
echo ===================================================================
echo [SUCCESS] TEI Setup Complete!
echo ===================================================================
echo.
echo Configuration:
echo   - Model: %MODEL%
echo   - Base URL: http://127.0.0.1:%PORT%
echo   - Container: %CONTAINER_NAME% (auto-restart enabled)
echo.
echo Next Steps:
echo   1. Update config/default.yaml or config/development.yaml:
echo      mcp:
echo        embedding:
echo          provider: "tei"
echo          model: "%MODEL%"
echo          enabled: true
echo          tei:
echo            baseUrl: "http://127.0.0.1:%PORT%"
echo.
echo   2. Test embedding generation:
echo      curl -X POST http://localhost:%PORT%/embed ^
echo        -H "Content-Type: application/json" ^
echo        -d "{\"inputs\": \"Hello world\"}"
echo.
echo Container Management:
echo   - View logs:    docker logs %CONTAINER_NAME%
echo   - Stop server:  docker stop %CONTAINER_NAME%
echo   - Start server: docker start %CONTAINER_NAME%
echo   - Remove:       docker rm -f %CONTAINER_NAME%
echo.
echo The container will auto-restart on system reboot
echo.

endlocal
exit /b 0
