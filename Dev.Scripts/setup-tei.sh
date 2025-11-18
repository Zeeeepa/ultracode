#!/usr/bin/env bash

# ==============================================================================
# TEI (Text Embeddings Inference) Setup Script - Auto GPU/CPU
# ==============================================================================
# This script sets up HuggingFace Text Embeddings Inference Docker container
# for local embedding inference with 8192-token IBM Granite models.
#
# Features:
#   - Auto-detects NVIDIA GPU (RTX 30xx/40xx series)
#   - Auto-installs NVIDIA Container Toolkit if needed
#   - Falls back to CPU mode if GPU unavailable
#
# Requirements:
#   - Docker installed and running
#   - ~2GB disk space for model download
#   - Port 8080 available (or specify custom port)
#   - NVIDIA GPU (optional, for acceleration)
#
# Usage:
#   ./setup-tei.sh                                    # Default setup
#   ./setup-tei.sh --model <model-id>                 # Custom model
#   ./setup-tei.sh --port <port>                      # Custom port
#   ./setup-tei.sh --model <model-id> --port <port>   # Both custom
#
# Models available:
#   - ibm-granite/granite-embedding-english-r2 (default, 149M params, 8192 tokens)
#   - ibm-granite/granite-embedding-small-english-r2 (47M params, 8192 tokens, fast)
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
DEFAULT_MODEL="ibm-granite/granite-embedding-english-r2"
DEFAULT_PORT=8080
CONTAINER_NAME="tei-server"
TEI_IMAGE_GPU="ghcr.io/huggingface/text-embeddings-inference:1.2"
TEI_IMAGE_CPU="ghcr.io/huggingface/text-embeddings-inference:cpu-1.2"

# Parse command line arguments
MODEL="$DEFAULT_MODEL"
PORT="$DEFAULT_PORT"
FORCE_CPU=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --model)
      MODEL="$2"
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
      echo "  --model <model-id>  HuggingFace model ID (default: $DEFAULT_MODEL)"
      echo "  --port <port>       Host port to expose (default: $DEFAULT_PORT)"
      echo "  --force-cpu         Force CPU mode (skip GPU detection)"
      echo "  --help, -h          Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0"
      echo "  $0 --model ibm-granite/granite-embedding-small-english-r2"
      echo "  $0 --port 8081"
      echo "  $0 --force-cpu"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# ==============================================================================
# Helper Functions
# ==============================================================================

print_header() {
  echo ""
  echo -e "${BLUE}===================================================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}===================================================================${NC}"
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

# ==============================================================================
# Main Installation Steps
# ==============================================================================

print_header "TEI (Text Embeddings Inference) Setup"

# Step 1: Check Docker availability
print_step "Checking Docker availability..."
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed or not in PATH"
  echo ""
  echo "Please install Docker first:"
  echo "  - macOS/Windows: https://www.docker.com/products/docker-desktop"
  echo "  - Linux: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker info &> /dev/null; then
  print_error "Docker daemon is not running"
  echo ""
  echo "Please start Docker Desktop or Docker daemon and try again"
  exit 1
fi

print_success "Docker is available and running"

# Step 1.5: Auto-detect GPU and install toolkit if needed
echo ""

USE_GPU=false
TEI_IMAGE="$TEI_IMAGE_CPU"
GPU_FLAGS=""

# Check if force CPU mode is requested
if [ "$FORCE_CPU" = true ]; then
  print_step "Force CPU mode requested - skipping GPU detection"
  echo ""
  echo -e "${BLUE}ℹ TEI will use CPU mode${NC}"
  echo "  Image: $TEI_IMAGE"
  echo "  (GPU detection skipped via --force-cpu flag)"
  echo ""
else
  print_step "Detecting GPU capabilities..."

  # Check for NVIDIA GPU
  if command -v nvidia-smi &> /dev/null; then
  GPU_INFO=$(nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader 2>/dev/null | head -1)

  if [ -n "$GPU_INFO" ]; then
    GPU_NAME=$(echo "$GPU_INFO" | cut -d',' -f1 | xargs)
    COMPUTE_CAP=$(echo "$GPU_INFO" | cut -d',' -f2 | xargs)

    print_success "GPU detected: $GPU_NAME (Compute Capability: $COMPUTE_CAP)"

    # Check if GPU is suitable (CC >= 8.0 for RTX 30xx/40xx)
    CC_MAJOR=$(echo "$COMPUTE_CAP" | cut -d'.' -f1)

    if [ "$CC_MAJOR" -ge 8 ]; then
      print_success "GPU is suitable for TEI acceleration (RTX 30xx/40xx series)"

      # Check if nvidia-container-toolkit is installed
      if command -v nvidia-ctk &> /dev/null || docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi &> /dev/null; then
        print_success "NVIDIA Container Toolkit is already installed"
        USE_GPU=true
        TEI_IMAGE="$TEI_IMAGE_GPU"
        GPU_FLAGS="--gpus all"
      else
        print_warning "NVIDIA Container Toolkit not found - installing automatically..."
        echo ""

        # Detect OS for installation
        if [ -f /etc/os-release ]; then
          . /etc/os-release
          OS_ID="$ID"

          # Install nvidia-container-toolkit
          case "$OS_ID" in
            ubuntu|debian)
              print_step "Installing for Ubuntu/Debian..."

              # Add repository
              curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null
              curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
                sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
                sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

              # Install
              sudo apt-get update > /dev/null 2>&1
              sudo apt-get install -y nvidia-container-toolkit > /dev/null 2>&1

              # Configure Docker
              sudo nvidia-ctk runtime configure --runtime=docker > /dev/null 2>&1
              sudo systemctl restart docker > /dev/null 2>&1

              if [ $? -eq 0 ]; then
                print_success "NVIDIA Container Toolkit installed successfully"
                USE_GPU=true
                TEI_IMAGE="$TEI_IMAGE_GPU"
                GPU_FLAGS="--gpus all"
              else
                print_error "Installation failed - falling back to CPU mode"
              fi
              ;;

            fedora|rhel|centos)
              print_step "Installing for Fedora/RHEL/CentOS..."

              curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
                sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo > /dev/null

              sudo yum install -y nvidia-container-toolkit > /dev/null 2>&1
              sudo nvidia-ctk runtime configure --runtime=docker > /dev/null 2>&1
              sudo systemctl restart docker > /dev/null 2>&1

              if [ $? -eq 0 ]; then
                print_success "NVIDIA Container Toolkit installed successfully"
                USE_GPU=true
                TEI_IMAGE="$TEI_IMAGE_GPU"
                GPU_FLAGS="--gpus all"
              else
                print_error "Installation failed - falling back to CPU mode"
              fi
              ;;

            *)
              print_warning "Unsupported OS for auto-install: $OS_ID"
              echo "Please install manually: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
              ;;
          esac

        elif [[ "$OSTYPE" == "darwin"* ]]; then
          print_warning "macOS detected - Docker Desktop doesn't support GPU on Mac"
          echo "Falling back to CPU mode"

        else
          print_warning "Could not detect OS - falling back to CPU mode"
        fi
      fi

    else
      print_warning "GPU Compute Capability $COMPUTE_CAP is too old (need 8.0+ for RTX 30xx/40xx)"
      echo "Falling back to CPU mode"
    fi

  else
    print_warning "Could not query GPU information"
    echo "Falling back to CPU mode"
  fi

  else
    print_step "No NVIDIA GPU detected"
    echo "Using CPU mode"
  fi

  echo ""
  if [ "$USE_GPU" = true ]; then
    echo -e "${GREEN}✓ TEI will use GPU acceleration${NC}"
    echo "  Image: $TEI_IMAGE"
    echo "  GPU: $GPU_NAME"
  else
    echo -e "${BLUE}ℹ TEI will use CPU mode${NC}"
    echo "  Image: $TEI_IMAGE"
    echo "  (No suitable GPU found or toolkit installation failed)"
  fi
  echo ""
fi

# Step 2: Check if port is available
print_step "Checking if port $PORT is available..."
if lsof -Pi :$PORT -sTCP:LISTEN -t &> /dev/null; then
  print_warning "Port $PORT is already in use"

  # Check if it's our container
  EXISTING_CONTAINER=$(docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" 2>/dev/null)

  if [ "$EXISTING_CONTAINER" == "$CONTAINER_NAME" ]; then
    print_success "TEI container is already running on port $PORT"

    # Test health
    if curl -sf http://localhost:$PORT/health &> /dev/null; then
      print_success "Container is healthy and responding"
      echo ""
      echo -e "${GREEN}✓ TEI is ready to use!${NC}"
      echo ""
      echo "Configuration:"
      echo "  - Base URL: http://127.0.0.1:$PORT"
      echo "  - Model: $MODEL"
      echo "  - Container: $CONTAINER_NAME"
      echo ""
      echo "Test it:"
      echo "  curl http://localhost:$PORT/health"
      exit 0
    else
      print_warning "Container exists but not responding, will restart..."
      docker stop $CONTAINER_NAME &> /dev/null || true
      docker rm $CONTAINER_NAME &> /dev/null || true
    fi
  else
    print_error "Port $PORT is occupied by another process"
    echo "Please specify a different port with --port <port>"
    exit 1
  fi
fi

# Step 3: Check for existing container
print_step "Checking for existing TEI container..."
EXISTING_CONTAINER=$(docker ps -a --filter "name=$CONTAINER_NAME" --format "{{.Names}}" 2>/dev/null)

if [ "$EXISTING_CONTAINER" == "$CONTAINER_NAME" ]; then
  print_warning "Existing container found: $CONTAINER_NAME"
  print_step "Removing old container..."
  docker stop $CONTAINER_NAME &> /dev/null || true
  docker rm $CONTAINER_NAME &> /dev/null || true
  print_success "Old container removed"
fi

# Step 4: Pull TEI Docker image
print_step "Pulling TEI Docker image (this may take a few minutes)..."
if docker pull $TEI_IMAGE; then
  print_success "TEI image pulled successfully"
else
  print_error "Failed to pull TEI image"
  exit 1
fi

# Step 5: Create and start TEI container
print_step "Creating TEI container with model: $MODEL"
echo ""
echo "This will download the model (~200-400MB depending on model size)"
echo "Container will restart automatically on system reboot (--restart=always)"
echo ""

if docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:80 \
  --restart=always \
  $GPU_FLAGS \
  -e MAX_BATCH_TOKENS=16384 \
  -e MAX_CLIENT_BATCH_SIZE=128 \
  $TEI_IMAGE \
  --model-id $MODEL \
  --max-batch-tokens 16384; then

  print_success "Container created successfully"
else
  print_error "Failed to create container"
  exit 1
fi

# Step 6: Wait for container to become healthy
print_step "Waiting for TEI server to become ready (max 60 seconds)..."

WAIT_TIME=0
MAX_WAIT=60

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  if curl -sf http://localhost:$PORT/health &> /dev/null; then
    print_success "TEI server is ready!"
    break
  fi

  # Check if container is still running
  if ! docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
    print_error "Container stopped unexpectedly"
    echo ""
    echo "Logs:"
    docker logs $CONTAINER_NAME
    exit 1
  fi

  echo -n "."
  sleep 2
  WAIT_TIME=$((WAIT_TIME + 2))
done

echo ""

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
  print_error "Timeout waiting for server to start"
  echo ""
  echo "Container logs:"
  docker logs $CONTAINER_NAME
  exit 1
fi

# Step 7: Verify setup
print_step "Verifying setup..."

# Test health endpoint
if curl -sf http://localhost:$PORT/health | grep -q "ok"; then
  print_success "Health check passed"
else
  print_warning "Health check returned unexpected response"
fi

# ==============================================================================
# Success Summary
# ==============================================================================

print_header "✓ TEI Setup Complete!"

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  - Model: $MODEL"
echo "  - Base URL: http://127.0.0.1:$PORT"
echo "  - Container: $CONTAINER_NAME (auto-restart enabled)"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Update config/default.yaml or config/development.yaml:"
echo "     mcp:"
echo "       embedding:"
echo "         provider: \"tei\""
echo "         model: \"$MODEL\""
echo "         enabled: true"
echo "         tei:"
echo "           baseUrl: \"http://127.0.0.1:$PORT\""
echo ""
echo "  2. Test embedding generation:"
echo "     curl -X POST http://localhost:$PORT/embed \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"inputs\": \"Hello world\"}'"
echo ""
echo -e "${GREEN}Container Management:${NC}"
echo "  - View logs:    docker logs $CONTAINER_NAME"
echo "  - Stop server:  docker stop $CONTAINER_NAME"
echo "  - Start server: docker start $CONTAINER_NAME"
echo "  - Remove:       docker rm -f $CONTAINER_NAME"
echo ""
echo -e "${BLUE}The container will auto-restart on system reboot${NC}"
echo ""
