#!/usr/bin/env bash
# ==============================================================================
# UltraScript Tools MCP - Unified Embeddings Setup Script
# ==============================================================================
# This script provides interactive setup for local embedding providers:
#   - TEI (Text Embeddings Inference) with Docker
#   - Ollama (native installation)
#   - Memory provider (no ML, hash-based)
#
# Features:
#   - Loads models from config/embedding-models.json
#   - Auto-detects GPU capabilities
#   - Auto-installs dependencies (Docker, NVIDIA toolkit, Ollama)
#   - Interactive model selection
#
# Usage:
#   ./setup-embeddings.sh                    # Interactive mode
#   ./setup-embeddings.sh --provider tei     # Non-interactive TEI
#   ./setup-embeddings.sh --provider ollama  # Non-interactive Ollama
#   ./setup-embeddings.sh --help             # Show help
# ==============================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/config/embedding-models.json"
YAML_CONFIG="$PROJECT_ROOT/config/default.yaml"

# Command-line arguments
PROVIDER=""
MODEL_ID=""
PORT=""
FORCE_CPU=false
NON_INTERACTIVE=false

# ==============================================================================
# Helper Functions
# ==============================================================================

print_header() {
  echo ""
  echo -e "${BLUE}${BOLD}=================================================================${NC}"
  echo -e "${BLUE}${BOLD}$1${NC}"
  echo -e "${BLUE}${BOLD}=================================================================${NC}"
  echo ""
}

print_step() {
  echo -e "${GREEN}➜${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✖${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_info() {
  echo -e "${CYAN}ℹ${NC} $1"
}

# Check if jq is installed
check_jq() {
  if ! command -v jq &> /dev/null; then
    print_error "jq is not installed (required for JSON parsing)"
    echo ""
    echo "Install jq:"
    echo "  - macOS: brew install jq"
    echo "  - Ubuntu/Debian: sudo apt-get install jq"
    echo "  - Fedora/RHEL: sudo yum install jq"
    exit 1
  fi
}

# Load configuration file
load_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
  fi

  # Validate JSON
  if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
    print_error "Invalid JSON in configuration file"
    exit 1
  fi
}

# Get provider list
get_providers() {
  jq -r '.providers | keys[]' "$CONFIG_FILE"
}

# Get provider info
get_provider_info() {
  local provider=$1
  local field=$2
  jq -r ".providers.\"$provider\".\"$field\"" "$CONFIG_FILE"
}

# Get models by provider
get_models_by_provider() {
  local provider=$1
  jq -c ".models[] | select(.provider == \"$provider\")" "$CONFIG_FILE"
}

# Get model field
get_model_field() {
  local model_json=$1
  local field=$2
  echo "$model_json" | jq -r ".$field"
}

# Get default model for provider
get_default_model() {
  local provider=$1
  jq -r ".default_models.\"$provider\"" "$CONFIG_FILE"
}

# ==============================================================================
# Display Functions
# ==============================================================================

display_providers() {
  local i=1
  local providers=()

  echo -e "${BOLD}Choose Embedding Provider:${NC}"
  echo ""

  while IFS= read -r provider; do
    providers+=("$provider")
    local name=$(get_provider_info "$provider" "name")
    local desc=$(get_provider_info "$provider" "description")

    echo -e "${BOLD}$i) $name${NC}"
    echo -e "$desc" | sed 's/^/   /'
    echo ""

    ((i++))
  done < <(get_providers)

  # Return array via global variable
  PROVIDER_LIST=("${providers[@]}")
}

display_models() {
  local provider=$1
  local i=1
  local models=()

  echo ""
  echo -e "${BOLD}Available Models for $(get_provider_info "$provider" "name"):${NC}"
  echo ""

  while IFS= read -r model; do
    models+=("$model")
    local name=$(get_model_field "$model" "name")
    local badge=$(get_model_field "$model" "badge")
    local lang=$(get_model_field "$model" "language")
    local tokens=$(get_model_field "$model" "context_tokens")
    local dims=$(get_model_field "$model" "dimensions")
    local size=$(get_model_field "$model" "size_mb")
    local desc=$(get_model_field "$model" "description")

    # Display with badge if present
    if [ "$badge" != "null" ]; then
      echo -e "${BOLD}$i) $name ${CYAN}$badge${NC}"
    else
      echo -e "${BOLD}$i) $name${NC}"
    fi

    echo -e "   • Language: $lang | Context: $tokens tokens | Dimensions: $dims"
    echo -e "   • Size: ~$size MB"
    echo -e "   • $desc"
    echo ""

    ((i++))
  done < <(get_models_by_provider "$provider")

  # Return array via global variable
  MODEL_LIST=("${models[@]}")
}

# ==============================================================================
# Provider Installation Functions
# ==============================================================================

check_docker() {
  print_step "Checking Docker availability..."

  if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    echo ""
    echo "Please install Docker first:"
    echo "  - macOS: https://docs.docker.com/desktop/install/mac-install/"
    echo "  - Linux: https://docs.docker.com/engine/install/"
    return 1
  fi

  if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    echo ""
    echo "Please start Docker and try again"
    return 1
  fi

  print_success "Docker is available and running"
  return 0
}

detect_gpu() {
  local use_gpu=false
  local gpu_name=""
  local compute_cap=""

  if [ "$FORCE_CPU" = true ]; then
    print_info "Force CPU mode requested - skipping GPU detection"
    USE_GPU=false
    return
  fi

  print_step "Detecting GPU capabilities..."

  if command -v nvidia-smi &> /dev/null; then
    local gpu_info=$(nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader 2>/dev/null | head -1)

    if [ -n "$gpu_info" ]; then
      gpu_name=$(echo "$gpu_info" | cut -d',' -f1 | xargs)
      compute_cap=$(echo "$gpu_info" | cut -d',' -f2 | xargs)

      print_success "GPU detected: $gpu_name (Compute Capability: $compute_cap)"

      # Check if GPU is suitable (CC >= 8.0 for RTX 30xx/40xx)
      local cc_major=$(echo "$compute_cap" | cut -d'.' -f1)

      if [ "$cc_major" -ge 8 ]; then
        print_success "GPU is suitable for acceleration (RTX 30xx/40xx series)"

        # Check if nvidia-container-toolkit is installed
        if command -v nvidia-ctk &> /dev/null || docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi &> /dev/null 2>&1; then
          print_success "NVIDIA Container Toolkit is available"
          use_gpu=true
        else
          print_warning "NVIDIA Container Toolkit not found - installing..."
          install_nvidia_toolkit
          if [ $? -eq 0 ]; then
            use_gpu=true
          fi
        fi
      else
        print_warning "GPU Compute Capability $compute_cap is too old (need 8.0+)"
        print_info "Falling back to CPU mode"
      fi
    else
      print_warning "Could not query GPU information"
      print_info "Using CPU mode"
    fi
  else
    print_info "No NVIDIA GPU detected - using CPU mode"
  fi

  USE_GPU=$use_gpu
  GPU_NAME="$gpu_name"
}

install_nvidia_toolkit() {
  if [ ! -f /etc/os-release ]; then
    print_warning "Cannot detect OS - please install NVIDIA Container Toolkit manually"
    echo "See: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
    return 1
  fi

  . /etc/os-release

  case "$ID" in
    ubuntu|debian)
      print_step "Installing NVIDIA Container Toolkit for Ubuntu/Debian..."

      curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null

      curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

      sudo apt-get update > /dev/null 2>&1
      sudo apt-get install -y nvidia-container-toolkit > /dev/null 2>&1
      sudo nvidia-ctk runtime configure --runtime=docker > /dev/null 2>&1
      sudo systemctl restart docker > /dev/null 2>&1

      if [ $? -eq 0 ]; then
        print_success "NVIDIA Container Toolkit installed successfully"
        return 0
      else
        print_error "Installation failed"
        return 1
      fi
      ;;

    fedora|rhel|centos)
      print_step "Installing NVIDIA Container Toolkit for Fedora/RHEL/CentOS..."

      curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
        sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo > /dev/null

      sudo yum install -y nvidia-container-toolkit > /dev/null 2>&1
      sudo nvidia-ctk runtime configure --runtime=docker > /dev/null 2>&1
      sudo systemctl restart docker > /dev/null 2>&1

      if [ $? -eq 0 ]; then
        print_success "NVIDIA Container Toolkit installed successfully"
        return 0
      else
        print_error "Installation failed"
        return 1
      fi
      ;;

    *)
      print_warning "Unsupported OS: $ID"
      echo "Please install manually: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
      return 1
      ;;
  esac
}

install_tei() {
  local model_json=$1
  local port=${PORT:-8080}

  local model_id=$(get_model_field "$model_json" "model_id")
  local name=$(get_model_field "$model_json" "name")
  local container_name=$(get_provider_info "tei" "container_name")

  print_header "Installing TEI with $name"

  # Check Docker
  if ! check_docker; then
    exit 1
  fi

  # Detect GPU
  detect_gpu

  # Select image based on GPU availability
  local image
  local gpu_flags=""

  if [ "$USE_GPU" = true ]; then
    image=$(get_model_field "$model_json" "image_gpu")
    gpu_flags="--gpus all"
    print_info "Using GPU mode: $GPU_NAME"
  else
    image=$(get_model_field "$model_json" "image_cpu")
    print_info "Using CPU mode"
  fi

  # Check if port is available
  print_step "Checking if port $port is available..."

  if lsof -Pi :$port -sTCP:LISTEN -t &> /dev/null; then
    local existing=$(docker ps --filter "name=$container_name" --format "{{.Names}}" 2>/dev/null)

    if [ "$existing" == "$container_name" ]; then
      print_success "TEI container is already running on port $port"

      if curl -sf http://localhost:$port/health &> /dev/null; then
        print_success "Container is healthy and responding"
        display_tei_success "$model_id" "$port" "$container_name"
        return 0
      else
        print_warning "Container exists but not responding, restarting..."
        docker stop $container_name &> /dev/null || true
        docker rm $container_name &> /dev/null || true
      fi
    else
      print_error "Port $port is occupied by another process"
      echo "Please specify a different port with --port <port>"
      exit 1
    fi
  fi

  # Remove old container if exists
  print_step "Checking for existing TEI container..."
  local existing=$(docker ps -a --filter "name=$container_name" --format "{{.Names}}" 2>/dev/null)

  if [ "$existing" == "$container_name" ]; then
    print_warning "Removing old container..."
    docker stop $container_name &> /dev/null || true
    docker rm $container_name &> /dev/null || true
    print_success "Old container removed"
  fi

  # Pull image
  print_step "Pulling TEI Docker image (this may take a few minutes)..."
  if docker pull $image; then
    print_success "TEI image pulled successfully"
  else
    print_error "Failed to pull TEI image"
    exit 1
  fi

  # Create container
  print_step "Creating TEI container with model: $model_id"
  echo ""
  echo "This will download the model (size varies by model)"
  echo "Container will restart automatically on system reboot (--restart=always)"
  echo ""

  if docker run -d \
    --name $container_name \
    -p $port:80 \
    --restart=always \
    $gpu_flags \
    -e MAX_BATCH_TOKENS=16384 \
    -e MAX_CLIENT_BATCH_SIZE=128 \
    $image \
    --model-id $model_id \
    --max-batch-tokens 16384; then

    print_success "Container created successfully"
  else
    print_error "Failed to create container"
    exit 1
  fi

  # Wait for health check
  print_step "Waiting for TEI server to become ready (max 60 seconds)..."

  local wait_time=0
  local max_wait=60

  while [ $wait_time -lt $max_wait ]; do
    if curl -sf http://localhost:$port/health &> /dev/null; then
      echo ""
      print_success "TEI server is ready!"
      break
    fi

    # Check if container is still running
    if ! docker ps --filter "name=$container_name" --format "{{.Names}}" | grep -q "$container_name"; then
      echo ""
      print_error "Container stopped unexpectedly"
      echo ""
      echo "Logs:"
      docker logs $container_name
      exit 1
    fi

    echo -n "."
    sleep 2
    wait_time=$((wait_time + 2))
  done

  if [ $wait_time -ge $max_wait ]; then
    echo ""
    print_error "Timeout waiting for server to start"
    echo ""
    echo "Container logs:"
    docker logs $container_name
    exit 1
  fi

  # Verify setup
  print_step "Verifying setup..."

  if curl -sf http://localhost:$port/health | grep -q "ok"; then
    print_success "Health check passed"
  else
    print_warning "Health check returned unexpected response"
  fi

  display_tei_success "$model_id" "$port" "$container_name"
}

display_tei_success() {
  local model_id=$1
  local port=$2
  local container_name=$3

  print_header "✓ TEI Setup Complete!"

  echo -e "${GREEN}Configuration:${NC}"
  echo "  - Model: $model_id"
  echo "  - Base URL: http://127.0.0.1:$port"
  echo "  - Container: $container_name (auto-restart enabled)"
  echo ""
  echo -e "${GREEN}Next Steps:${NC}"
  echo "  1. Update config/default.yaml or config/development.yaml:"
  echo "     mcp:"
  echo "       embedding:"
  echo "         provider: \"tei\""
  echo "         model: \"$model_id\""
  echo "         enabled: true"
  echo "         tei:"
  echo "           baseUrl: \"http://127.0.0.1:$port\""
  echo ""
  echo "  2. Test embedding generation:"
  echo "     curl -X POST http://localhost:$port/embed \\"
  echo "       -H 'Content-Type: application/json' \\"
  echo "       -d '{\"inputs\": \"Hello world\"}'"
  echo ""
  echo -e "${GREEN}Container Management:${NC}"
  echo "  - View logs:    docker logs $container_name"
  echo "  - Stop server:  docker stop $container_name"
  echo "  - Start server: docker start $container_name"
  echo "  - Remove:       docker rm -f $container_name"
  echo ""
  echo -e "${BLUE}The container will auto-restart on system reboot${NC}"
  echo ""
}

check_ollama() {
  if command -v ollama &> /dev/null; then
    print_success "Ollama is already installed"
    ollama --version
    return 0
  else
    print_warning "Ollama is not installed"
    return 1
  fi
}

install_ollama_binary() {
  print_step "Installing Ollama..."

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    print_info "Downloading Ollama for macOS..."
    curl -fsSL https://ollama.com/install.sh | sh
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    print_info "Downloading Ollama for Linux..."
    curl -fsSL https://ollama.com/install.sh | sh
  else
    print_error "Unsupported OS: $OSTYPE"
    echo "Please install Ollama manually: https://ollama.com/download"
    return 1
  fi

  if [ $? -eq 0 ]; then
    print_success "Ollama installed successfully"
    return 0
  else
    print_error "Ollama installation failed"
    return 1
  fi
}

install_ollama() {
  local model_json=$1

  local model_id=$(get_model_field "$model_json" "model_id")
  local name=$(get_model_field "$model_json" "name")

  print_header "Installing Ollama with $name"

  # Check if Ollama is installed
  if ! check_ollama; then
    if ! install_ollama_binary; then
      exit 1
    fi
  fi

  # Check if Ollama is running
  print_step "Checking Ollama service..."

  if ! curl -sf http://localhost:11434/api/tags &> /dev/null; then
    print_warning "Ollama service is not running"
    print_step "Starting Ollama service..."

    # Start Ollama in background
    nohup ollama serve > /dev/null 2>&1 &

    # Wait for service to start
    sleep 3

    if curl -sf http://localhost:11434/api/tags &> /dev/null; then
      print_success "Ollama service started"
    else
      print_error "Failed to start Ollama service"
      echo "Please start Ollama manually: ollama serve"
      exit 1
    fi
  else
    print_success "Ollama service is running"
  fi

  # Pull model
  print_step "Pulling Ollama model: $model_id"
  echo ""
  echo "This will download the model (size varies)"
  echo ""

  if ollama pull $model_id; then
    print_success "Model pulled successfully"
  else
    print_error "Failed to pull model"
    exit 1
  fi

  # Verify model
  print_step "Verifying model..."

  if ollama list | grep -q "$model_id"; then
    print_success "Model is available"
  else
    print_warning "Model verification failed"
  fi

  display_ollama_success "$model_id"
}

display_ollama_success() {
  local model_id=$1

  print_header "✓ Ollama Setup Complete!"

  echo -e "${GREEN}Configuration:${NC}"
  echo "  - Model: $model_id"
  echo "  - Base URL: http://127.0.0.1:11434"
  echo ""
  echo -e "${GREEN}Next Steps:${NC}"
  echo "  1. Update config/default.yaml or config/development.yaml:"
  echo "     mcp:"
  echo "       embedding:"
  echo "         provider: \"ollama\""
  echo "         model: \"$model_id\""
  echo "         enabled: true"
  echo "         ollama:"
  echo "           baseUrl: \"http://127.0.0.1:11434\""
  echo ""
  echo "  2. Test embedding generation:"
  echo "     curl -X POST http://localhost:11434/api/embeddings \\"
  echo "       -H 'Content-Type: application/json' \\"
  echo "       -d '{\"model\": \"$model_id\", \"prompt\": \"Hello world\"}'"
  echo ""
  echo -e "${GREEN}Ollama Management:${NC}"
  echo "  - List models:  ollama list"
  echo "  - Pull model:   ollama pull <model>"
  echo "  - Remove model: ollama rm <model>"
  echo "  - Start server: ollama serve"
  echo ""
}

setup_memory_provider() {
  print_header "Memory Provider (No ML)"

  echo -e "${YELLOW}⚠${NC}  Memory provider uses deterministic hashing (no ML embeddings)"
  echo ""
  echo -e "${GREEN}Configuration:${NC}"
  echo "  Update config/default.yaml or config/development.yaml:"
  echo "     mcp:"
  echo "       embedding:"
  echo "         provider: \"memory\""
  echo "         enabled: true"
  echo ""
  echo "No installation required. You can set up embeddings later by running:"
  echo "  $0"
  echo ""
}

# ==============================================================================
# Interactive Mode
# ==============================================================================

interactive_setup() {
  print_header "UltraScript Tools MCP - Embeddings Setup"

  # Step 1: Choose provider
  display_providers

  echo -n "Choose provider [1-${#PROVIDER_LIST[@]}]: "
  read provider_choice

  if ! [[ "$provider_choice" =~ ^[0-9]+$ ]] || [ "$provider_choice" -lt 1 ] || [ "$provider_choice" -gt ${#PROVIDER_LIST[@]} ]; then
    print_error "Invalid choice: $provider_choice"
    exit 1
  fi

  local provider="${PROVIDER_LIST[$((provider_choice - 1))]}"

  # Memory provider doesn't need model selection
  if [ "$provider" == "memory" ]; then
    setup_memory_provider
    return
  fi

  # Step 2: Choose model
  display_models "$provider"

  if [ ${#MODEL_LIST[@]} -eq 0 ]; then
    print_error "No models available for provider: $provider"
    exit 1
  fi

  echo -n "Choose model [1-${#MODEL_LIST[@]}]: "
  read model_choice

  if ! [[ "$model_choice" =~ ^[0-9]+$ ]] || [ "$model_choice" -lt 1 ] || [ "$model_choice" -gt ${#MODEL_LIST[@]} ]; then
    print_error "Invalid choice: $model_choice"
    exit 1
  fi

  local model="${MODEL_LIST[$((model_choice - 1))]}"

  # Step 3: GPU/CPU mode (for TEI only)
  if [ "$provider" == "tei" ]; then
    local gpu_support=$(get_model_field "$model" "gpu_support")

    if [ "$gpu_support" == "true" ]; then
      echo ""
      echo -e "${BOLD}Choose Mode:${NC}"
      echo "1) Auto (Use GPU if available) ⭐"
      echo "2) Force CPU only"
      echo ""
      echo -n "Choice [1-2]: "
      read mode_choice

      if [ "$mode_choice" == "2" ]; then
        FORCE_CPU=true
      fi
    fi
  fi

  # Step 4: Install
  case "$provider" in
    tei)
      install_tei "$model"
      ;;
    ollama)
      install_ollama "$model"
      ;;
  esac
}

# ==============================================================================
# Main
# ==============================================================================

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --provider)
      PROVIDER="$2"
      NON_INTERACTIVE=true
      shift 2
      ;;
    --model)
      MODEL_ID="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --force-cpu)
      FORCE_CPU=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --provider <tei|ollama|memory>  Choose provider (interactive if not specified)"
      echo "  --model <model-id>              Choose specific model ID"
      echo "  --port <port>                   Host port for TEI (default: 8080)"
      echo "  --force-cpu                     Force CPU mode for TEI"
      echo "  --help, -h                      Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Interactive mode"
      echo "  $0 --provider tei                     # Interactive TEI setup"
      echo "  $0 --provider ollama                  # Interactive Ollama setup"
      echo "  $0 --provider tei --model granite-embedding-125m"
      echo "  $0 --provider tei --force-cpu"
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Check dependencies
check_jq

# Load configuration
load_config

# Run in interactive mode if no provider specified
if [ "$NON_INTERACTIVE" = false ]; then
  interactive_setup
else
  # Non-interactive mode
  case "$PROVIDER" in
    tei)
      if [ -n "$MODEL_ID" ]; then
        # Find model by ID
        local model=$(jq -c ".models[] | select(.id == \"$MODEL_ID\" and .provider == \"tei\")" "$CONFIG_FILE")
        if [ -z "$model" ]; then
          print_error "Model not found: $MODEL_ID"
          exit 1
        fi
        install_tei "$model"
      else
        # Use default model
        local default_id=$(get_default_model "tei")
        local model=$(jq -c ".models[] | select(.id == \"$default_id\")" "$CONFIG_FILE")
        install_tei "$model"
      fi
      ;;
    ollama)
      if [ -n "$MODEL_ID" ]; then
        local model=$(jq -c ".models[] | select(.id == \"$MODEL_ID\" and .provider == \"ollama\")" "$CONFIG_FILE")
        if [ -z "$model" ]; then
          print_error "Model not found: $MODEL_ID"
          exit 1
        fi
        install_ollama "$model"
      else
        local default_id=$(get_default_model "ollama")
        local model=$(jq -c ".models[] | select(.id == \"$default_id\")" "$CONFIG_FILE")
        install_ollama "$model"
      fi
      ;;
    memory)
      setup_memory_provider
      ;;
    *)
      print_error "Invalid provider: $PROVIDER"
      echo "Valid providers: tei, ollama, memory"
      exit 1
      ;;
  esac
fi
