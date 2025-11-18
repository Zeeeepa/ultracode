@echo off
REM ==============================================================================
REM UltraScript Tools MCP - Unified Embeddings Setup Script (Windows)
REM ==============================================================================
REM This script provides interactive setup for local embedding providers:
REM   - TEI (Text Embeddings Inference) with Docker
REM   - Ollama (native installation)
REM   - Memory provider (no ML, hash-based)
REM
REM Features:
REM   - Loads models from config/embedding-models.json
REM   - Auto-detects GPU capabilities
REM   - Auto-installs dependencies (Docker, NVIDIA toolkit, Ollama)
REM   - Interactive model selection
REM
REM Usage:
REM   setup-embeddings.cmd                    REM Interactive mode
REM   setup-embeddings.cmd --provider tei     REM Non-interactive TEI
REM   setup-embeddings.cmd --provider ollama  REM Non-interactive Ollama
REM   setup-embeddings.cmd --help             REM Show help
REM ==============================================================================

setlocal enabledelayedexpansion

REM Configuration
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "CONFIG_FILE=%PROJECT_ROOT%\config\embedding-models.json"

REM Command-line arguments
set "PROVIDER="
set "MODEL_ID="
set "PORT="
set "FORCE_CPU=false"
set "NON_INTERACTIVE=false"

REM ==============================================================================
REM Parse Command-Line Arguments
REM ==============================================================================

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--provider" (
    set "PROVIDER=%~2"
    set "NON_INTERACTIVE=true"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--model" (
    set "MODEL_ID=%~2"
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
if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help

echo [ERROR] Unknown option: %~1
echo Use --help for usage information
exit /b 1

:show_help
echo Usage: %~nx0 [OPTIONS]
echo.
echo Options:
echo   --provider ^<tei^|ollama^|memory^>  Choose provider (interactive if not specified)
echo   --model ^<model-id^>              Choose specific model ID
echo   --port ^<port^>                   Host port for TEI (default: 8080)
echo   --force-cpu                     Force CPU mode for TEI
echo   --help, -h                      Show this help message
echo.
echo Examples:
echo   %~nx0                                    REM Interactive mode
echo   %~nx0 --provider tei                     REM Interactive TEI setup
echo   %~nx0 --provider ollama                  REM Interactive Ollama setup
echo   %~nx0 --provider tei --model granite-embedding-125m
echo   %~nx0 --provider tei --force-cpu
exit /b 0

:args_done

REM ==============================================================================
REM Check Dependencies
REM ==============================================================================

REM Check if PowerShell is available (required for JSON parsing)
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell is not available
    echo PowerShell is required for JSON parsing
    exit /b 1
)

REM Check if config file exists
if not exist "%CONFIG_FILE%" (
    echo [ERROR] Configuration file not found: %CONFIG_FILE%
    exit /b 1
)

REM ==============================================================================
REM Main Logic
REM ==============================================================================

echo.
echo =================================================================
echo UltraScript Tools MCP - Embeddings Setup
echo =================================================================
echo.

if "%NON_INTERACTIVE%"=="true" (
    goto non_interactive_mode
) else (
    goto interactive_mode
)

REM ==============================================================================
REM Interactive Mode
REM ==============================================================================

:interactive_mode

REM Step 1: Display providers
echo [*] Loading available providers...
echo.

REM Use PowerShell to parse providers
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.providers.PSObject.Properties.Name}"`) do (
    set "PROVIDERS=!PROVIDERS!%%p "
)

REM Count providers
set /a provider_count=0
for %%p in (%PROVIDERS%) do set /a provider_count+=1

REM Display providers
set /a index=1
for %%p in (%PROVIDERS%) do (
    for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.providers.'%%p'.name}"`) do (
        echo !index!^) %%n
    )

    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.providers.'%%p'.description -replace '\\n', \"`n   \")}"`) do (
        echo    %%d
    )

    echo.
    set /a index+=1
)

REM Get user choice
set /p "provider_choice=Choose provider [1-%provider_count%]: "

REM Validate choice
if not defined provider_choice (
    echo [ERROR] No choice made
    exit /b 1
)

if %provider_choice% LSS 1 (
    echo [ERROR] Invalid choice: %provider_choice%
    exit /b 1
)

if %provider_choice% GTR %provider_count% (
    echo [ERROR] Invalid choice: %provider_choice%
    exit /b 1
)

REM Get selected provider
set /a index=1
for %%p in (%PROVIDERS%) do (
    if !index! EQU %provider_choice% (
        set "PROVIDER=%%p"
    )
    set /a index+=1
)

REM Memory provider doesn't need model selection
if "%PROVIDER%"=="memory" (
    goto setup_memory_provider
)

REM Step 2: Display models
echo.
echo [*] Loading available models for %PROVIDER%...
echo.

REM Get models for provider using PowerShell
for /f "usebackq delims=" %%m in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.models | Where-Object {$_.provider -eq '%PROVIDER%'} | ForEach-Object {$_.id}}"`) do (
    set "MODELS=!MODELS!%%m "
)

REM Count models
set /a model_count=0
for %%m in (%MODELS%) do set /a model_count+=1

if %model_count% EQU 0 (
    echo [ERROR] No models available for provider: %PROVIDER%
    exit /b 1
)

REM Display models
set /a index=1
for %%m in (%MODELS%) do (
    REM Get model details
    for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).name}"`) do (
        set "MODEL_NAME=%%n"
    )

    for /f "usebackq delims=" %%b in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).badge}"`) do (
        set "MODEL_BADGE=%%b"
    )

    for /f "usebackq delims=" %%l in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).language}"`) do (
        set "MODEL_LANG=%%l"
    )

    for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).context_tokens}"`) do (
        set "MODEL_TOKENS=%%t"
    )

    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).dimensions}"`) do (
        set "MODEL_DIMS=%%d"
    )

    for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).size_mb}"`) do (
        set "MODEL_SIZE=%%s"
    )

    for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%%m'}).description}"`) do (
        set "MODEL_DESC=%%r"
    )

    REM Display model
    if "!MODEL_BADGE!"=="null" (
        echo !index!^) !MODEL_NAME!
    ) else (
        echo !index!^) !MODEL_NAME! !MODEL_BADGE!
    )

    echo    • Language: !MODEL_LANG! ^| Context: !MODEL_TOKENS! tokens ^| Dimensions: !MODEL_DIMS!
    echo    • Size: ~!MODEL_SIZE! MB
    echo    • !MODEL_DESC!
    echo.

    set /a index+=1
)

REM Get user choice
set /p "model_choice=Choose model [1-%model_count%]: "

REM Validate choice
if not defined model_choice (
    echo [ERROR] No choice made
    exit /b 1
)

if %model_choice% LSS 1 (
    echo [ERROR] Invalid choice: %model_choice%
    exit /b 1
)

if %model_choice% GTR %model_count% (
    echo [ERROR] Invalid choice: %model_choice%
    exit /b 1
)

REM Get selected model
set /a index=1
for %%m in (%MODELS%) do (
    if !index! EQU %model_choice% (
        set "MODEL_ID=%%m"
    )
    set /a index+=1
)

REM Step 3: GPU/CPU mode (for TEI only)
if "%PROVIDER%"=="tei" (
    REM Check if model supports GPU
    for /f "usebackq delims=" %%g in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).gpu_support}"`) do (
        set "GPU_SUPPORT=%%g"
    )

    if "!GPU_SUPPORT!"=="True" (
        echo.
        echo Choose Mode:
        echo 1^) Auto (Use GPU if available^) ⭐
        echo 2^) Force CPU only
        echo.

        set /p "mode_choice=Choice [1-2]: "

        if "!mode_choice!"=="2" (
            set "FORCE_CPU=true"
        )
    )
)

REM Step 4: Install
if "%PROVIDER%"=="tei" (
    goto install_tei
) else if "%PROVIDER%"=="ollama" (
    goto install_ollama
)

REM ==============================================================================
REM Non-Interactive Mode
REM ==============================================================================

:non_interactive_mode

if "%PROVIDER%"=="" (
    echo [ERROR] Provider not specified in non-interactive mode
    echo Use --provider ^<tei^|ollama^|memory^>
    exit /b 1
)

if "%PROVIDER%"=="memory" (
    goto setup_memory_provider
)

REM Get default model if not specified
if "%MODEL_ID%"=="" (
    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.default_models.'%PROVIDER%'}"`) do (
        set "MODEL_ID=%%d"
    )
)

REM Verify model exists
powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $model = $cfg.models | Where-Object {$_.id -eq '%MODEL_ID%' -and $_.provider -eq '%PROVIDER%'}; if (-not $model) {exit 1}}"

if errorlevel 1 (
    echo [ERROR] Model not found: %MODEL_ID%
    exit /b 1
)

if "%PROVIDER%"=="tei" (
    goto install_tei
) else if "%PROVIDER%"=="ollama" (
    goto install_ollama
)

REM ==============================================================================
REM TEI Installation
REM ==============================================================================

:install_tei

echo.
echo =================================================================
echo Installing TEI
echo =================================================================
echo.

REM Get model details from config
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).model_id}"`) do (
    set "MODEL_HF_ID=%%i"
)

for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).name}"`) do (
    set "MODEL_NAME=%%n"
)

echo [*] Model: !MODEL_NAME! (!MODEL_HF_ID!)
echo.

REM Step 1: Check Docker
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

REM Step 2: Detect GPU
set "USE_GPU=false"
set "GPU_FLAGS="

if "%FORCE_CPU%"=="true" (
    echo [*] Force CPU mode requested - skipping GPU detection
    echo.
    goto skip_gpu_detection
)

echo [*] Detecting GPU capabilities...

where nvidia-smi >nul 2>&1
if not errorlevel 1 (
    REM Get GPU info
    for /f "tokens=1,2 delims=," %%a in ('nvidia-smi --query-gpu^=name^,compute_cap --format^=csv^,noheader 2^>nul') do (
        set "GPU_NAME=%%a"
        set "COMPUTE_CAP=%%b"
    )

    if defined GPU_NAME (
        echo [OK] GPU detected: !GPU_NAME! (Compute Capability: !COMPUTE_CAP!)

        REM Extract major version
        for /f "tokens=1 delims=." %%a in ("!COMPUTE_CAP!") do set "CC_MAJOR=%%a"
        set "CC_MAJOR=!CC_MAJOR: =!"

        REM Check if GPU is suitable (CC >= 8 for RTX 30xx/40xx)
        if !CC_MAJOR! GEQ 8 (
            echo [OK] GPU is suitable for TEI acceleration

            REM Test GPU support in Docker
            echo [*] Testing GPU support in Docker...
            docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi >nul 2>&1
            if not errorlevel 1 (
                echo [OK] Docker GPU support confirmed
                set "USE_GPU=true"
                set "GPU_FLAGS=--gpus all"
            ) else (
                echo [WARNING] Docker GPU support test failed - using CPU mode
            )
        ) else (
            echo [WARNING] GPU Compute Capability !COMPUTE_CAP! is too old (need 8.0+^)
            echo [*] Using CPU mode
        )
    )
) else (
    echo [*] No NVIDIA GPU detected - using CPU mode
)

echo.

:skip_gpu_detection

REM Get appropriate image based on GPU availability
if "%USE_GPU%"=="true" (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).image_gpu}"`) do (
        set "TEI_IMAGE=%%i"
    )
    echo [INFO] Using GPU mode: !GPU_NAME!
) else (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).image_cpu}"`) do (
        set "TEI_IMAGE=%%i"
    )
    echo [INFO] Using CPU mode
)

echo     Image: !TEI_IMAGE!
echo.

REM Get container name from config
for /f "usebackq delims=" %%c in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.providers.tei.container_name}"`) do (
    set "CONTAINER_NAME=%%c"
)

REM Get port
if "%PORT%"=="" (
    for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $cfg.providers.tei.default_port}"`) do (
        set "PORT=%%p"
    )
)

REM Step 3: Check if container already running
echo [*] Checking if port !PORT! is available...

docker ps --filter "name=!CONTAINER_NAME!" --format "{{.Names}}" 2>nul | findstr /x "!CONTAINER_NAME!" >nul
if not errorlevel 1 (
    echo [OK] TEI container is already running on port !PORT!

    REM Test health
    curl -sf http://localhost:!PORT!/health >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Container is healthy and responding
        goto tei_success
    ) else (
        echo [WARNING] Container exists but not responding, restarting...
        docker stop !CONTAINER_NAME! >nul 2>&1
        docker rm !CONTAINER_NAME! >nul 2>&1
    )
)

REM Step 4: Remove old container if exists
echo [*] Checking for existing TEI container...

docker ps -a --filter "name=!CONTAINER_NAME!" --format "{{.Names}}" 2>nul | findstr /x "!CONTAINER_NAME!" >nul
if not errorlevel 1 (
    echo [WARNING] Removing old container...
    docker stop !CONTAINER_NAME! >nul 2>&1
    docker rm !CONTAINER_NAME! >nul 2>&1
    echo [OK] Old container removed
)

REM Step 5: Pull image
echo [*] Pulling TEI Docker image (this may take a few minutes^)...

docker pull !TEI_IMAGE!
if errorlevel 1 (
    echo [ERROR] Failed to pull TEI image
    exit /b 1
)

echo [OK] TEI image pulled successfully
echo.

REM Step 6: Create container
echo [*] Creating TEI container with model: !MODEL_HF_ID!
echo.
echo This will download the model (size varies^)
echo Container will restart automatically on system reboot (--restart=always^)
echo.

docker run -d ^
  --name !CONTAINER_NAME! ^
  -p !PORT!:80 ^
  --restart=always ^
  !GPU_FLAGS! ^
  -e MAX_BATCH_TOKENS=16384 ^
  -e MAX_CLIENT_BATCH_SIZE=128 ^
  !TEI_IMAGE! ^
  --model-id !MODEL_HF_ID! ^
  --max-batch-tokens 16384

if errorlevel 1 (
    echo [ERROR] Failed to create container
    exit /b 1
)

echo [OK] Container created successfully
echo.

REM Step 7: Wait for health check
echo [*] Waiting for TEI server to become ready (max 60 seconds^)...

set WAIT_TIME=0
set MAX_WAIT=60

:wait_loop
if %WAIT_TIME% geq %MAX_WAIT% goto wait_timeout

curl -sf http://localhost:!PORT!/health >nul 2>&1
if not errorlevel 1 goto wait_success

REM Check if container is still running
docker ps --filter "name=!CONTAINER_NAME!" --format "{{.Names}}" 2>nul | findstr /x "!CONTAINER_NAME!" >nul
if errorlevel 1 (
    echo.
    echo [ERROR] Container stopped unexpectedly
    echo.
    echo Logs:
    docker logs !CONTAINER_NAME!
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
docker logs !CONTAINER_NAME!
exit /b 1

:wait_success
echo.
echo [OK] TEI server is ready!
echo.

REM Step 8: Verify setup
echo [*] Verifying setup...

curl -sf http://localhost:!PORT!/health 2>nul | findstr "ok" >nul
if not errorlevel 1 (
    echo [OK] Health check passed
) else (
    echo [WARNING] Health check returned unexpected response
)

:tei_success
echo.
echo =================================================================
echo [SUCCESS] TEI Setup Complete!
echo =================================================================
echo.
echo Configuration:
echo   - Model: !MODEL_HF_ID!
echo   - Base URL: http://127.0.0.1:!PORT!
echo   - Container: !CONTAINER_NAME! (auto-restart enabled^)
echo.
echo Next Steps:
echo   1. Update config/default.yaml or config/development.yaml:
echo      mcp:
echo        embedding:
echo          provider: "tei"
echo          model: "!MODEL_HF_ID!"
echo          enabled: true
echo          tei:
echo            baseUrl: "http://127.0.0.1:!PORT!"
echo.
echo   2. Test embedding generation:
echo      curl -X POST http://localhost:!PORT!/embed ^
echo        -H "Content-Type: application/json" ^
echo        -d "{\"inputs\": \"Hello world\"}"
echo.
echo Container Management:
echo   - View logs:    docker logs !CONTAINER_NAME!
echo   - Stop server:  docker stop !CONTAINER_NAME!
echo   - Start server: docker start !CONTAINER_NAME!
echo   - Remove:       docker rm -f !CONTAINER_NAME!
echo.
echo The container will auto-restart on system reboot
echo.

goto end

REM ==============================================================================
REM Ollama Installation
REM ==============================================================================

:install_ollama

echo.
echo =================================================================
echo Installing Ollama
echo =================================================================
echo.

REM Get model details
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).model_id}"`) do (
    set "MODEL_OLLAMA_ID=%%i"
)

for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "& {$cfg = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; ($cfg.models | Where-Object {$_.id -eq '%MODEL_ID%'}).name}"`) do (
    set "MODEL_NAME=%%n"
)

echo [*] Model: !MODEL_NAME! (!MODEL_OLLAMA_ID!)
echo.

REM Step 1: Check if Ollama is installed
echo [*] Checking Ollama installation...

where ollama >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Ollama is not installed
    echo.
    echo Please install Ollama first:
    echo   https://ollama.com/download
    echo.
    echo After installation, run this script again.
    exit /b 1
)

echo [OK] Ollama is installed
ollama --version
echo.

REM Step 2: Check if Ollama is running
echo [*] Checking Ollama service...

curl -sf http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Ollama service is not running
    echo.
    echo Please start Ollama:
    echo   ollama serve
    echo.
    echo Then run this script again.
    exit /b 1
)

echo [OK] Ollama service is running
echo.

REM Step 3: Pull model
echo [*] Pulling Ollama model: !MODEL_OLLAMA_ID!
echo.
echo This will download the model (size varies^)
echo.

ollama pull !MODEL_OLLAMA_ID!
if errorlevel 1 (
    echo [ERROR] Failed to pull model
    exit /b 1
)

echo [OK] Model pulled successfully
echo.

REM Step 4: Verify model
echo [*] Verifying model...

ollama list | findstr "!MODEL_OLLAMA_ID!" >nul
if not errorlevel 1 (
    echo [OK] Model is available
) else (
    echo [WARNING] Model verification failed
)

echo.
echo =================================================================
echo [SUCCESS] Ollama Setup Complete!
echo =================================================================
echo.
echo Configuration:
echo   - Model: !MODEL_OLLAMA_ID!
echo   - Base URL: http://127.0.0.1:11434
echo.
echo Next Steps:
echo   1. Update config/default.yaml or config/development.yaml:
echo      mcp:
echo        embedding:
echo          provider: "ollama"
echo          model: "!MODEL_OLLAMA_ID!"
echo          enabled: true
echo          ollama:
echo            baseUrl: "http://127.0.0.1:11434"
echo.
echo   2. Test embedding generation:
echo      curl -X POST http://localhost:11434/api/embeddings ^
echo        -H "Content-Type: application/json" ^
echo        -d "{\"model\": \"!MODEL_OLLAMA_ID!\", \"prompt\": \"Hello world\"}"
echo.
echo Ollama Management:
echo   - List models:  ollama list
echo   - Pull model:   ollama pull ^<model^>
echo   - Remove model: ollama rm ^<model^>
echo   - Start server: ollama serve
echo.

goto end

REM ==============================================================================
REM Memory Provider
REM ==============================================================================

:setup_memory_provider

echo.
echo =================================================================
echo Memory Provider (No ML^)
echo =================================================================
echo.
echo [WARNING] Memory provider uses deterministic hashing (no ML embeddings^)
echo.
echo Configuration:
echo   Update config/default.yaml or config/development.yaml:
echo      mcp:
echo        embedding:
echo          provider: "memory"
echo          enabled: true
echo.
echo No installation required. You can set up embeddings later by running:
echo   %~nx0
echo.

goto end

REM ==============================================================================
REM End
REM ==============================================================================

:end
endlocal
exit /b 0
