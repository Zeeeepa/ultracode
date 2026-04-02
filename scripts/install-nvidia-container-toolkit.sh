#!/bin/bash
# NVIDIA Container Toolkit Installation Script
# Автоматическая установка nvidia-container-toolkit для Docker GPU support

set -e

COLORS_RESET='\033[0m'
COLORS_BOLD='\033[1m'
COLORS_GREEN='\033[32m'
COLORS_YELLOW='\033[33m'
COLORS_BLUE='\033[34m'
COLORS_RED='\033[31m'
COLORS_GRAY='\033[90m'

log() {
    echo -e "${2:-$COLORS_RESET}$1${COLORS_RESET}"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

separator() {
    log "$(printf '═%.0s' {1..70})" "$COLORS_BOLD"
}

separator
log "  🐳 NVIDIA Container Toolkit Installation" "$COLORS_BOLD"
separator

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    log "❌ This script is for Linux only" "$COLORS_RED"
    log "   NVIDIA Container Toolkit is not needed on Windows" "$COLORS_GRAY"
    exit 1
fi

# Check if Docker is installed
if ! check_command docker; then
    log "❌ Docker not installed!" "$COLORS_RED"
    log "   Install Docker first from: https://docs.docker.com/engine/install/" "$COLORS_GRAY"
    exit 1
fi

log "✅ Docker installed: $(docker --version)" "$COLORS_GREEN"

# Check if NVIDIA GPU is available
if ! check_command nvidia-smi; then
    log "❌ NVIDIA GPU not detected" "$COLORS_RED"
    log "   Install NVIDIA drivers first" "$COLORS_GRAY"
    exit 1
fi

GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
log "✅ NVIDIA GPU detected: $GPU_NAME" "$COLORS_GREEN"

# Check if nvidia-container-toolkit is already installed
if check_command nvidia-ctk; then
    log "✅ nvidia-container-toolkit already installed" "$COLORS_GREEN"
    nvidia-ctk --version
    exit 0
fi

log "\n📦 Installing NVIDIA Container Toolkit..." "$COLORS_BLUE"

# Detect Linux distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    log "❌ Cannot detect Linux distribution" "$COLORS_RED"
    exit 1
fi

case $OS in
    ubuntu|debian)
        log "   Detected: Ubuntu/Debian" "$COLORS_GRAY"

        # Add NVIDIA GPG key
        log "   Adding NVIDIA GPG key..." "$COLORS_GRAY"
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

        # Add repository
        log "   Adding NVIDIA Container Toolkit repository..." "$COLORS_GRAY"
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

        # Update and install
        log "   Updating package list..." "$COLORS_GRAY"
        sudo apt-get update -qq

        log "   Installing nvidia-container-toolkit..." "$COLORS_GRAY"
        sudo apt-get install -y nvidia-container-toolkit

        log "✅ nvidia-container-toolkit installed successfully" "$COLORS_GREEN"
        ;;

    rhel|centos|fedora|rocky|almalinux)
        log "   Detected: RHEL/CentOS/Fedora" "$COLORS_GRAY"

        # Add repository
        log "   Adding NVIDIA Container Toolkit repository..." "$COLORS_GRAY"
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
            sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo

        # Install
        if check_command dnf; then
            log "   Installing via dnf..." "$COLORS_GRAY"
            sudo dnf install -y nvidia-container-toolkit
        else
            log "   Installing via yum..." "$COLORS_GRAY"
            sudo yum install -y nvidia-container-toolkit
        fi

        log "✅ nvidia-container-toolkit installed successfully" "$COLORS_GREEN"
        ;;

    *)
        log "❌ Unsupported distribution: $OS" "$COLORS_RED"
        log "   Please install manually from: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html" "$COLORS_GRAY"
        exit 1
        ;;
esac

# Configure Docker daemon
log "\n🔧 Configuring Docker runtime..." "$COLORS_BLUE"
sudo nvidia-ctk runtime configure --runtime=docker

# Restart Docker service
log "🔄 Restarting Docker service..." "$COLORS_BLUE"
if check_command systemctl; then
    sudo systemctl restart docker
    log "✅ Docker service restarted" "$COLORS_GREEN"
else
    log "⚠️  Please restart Docker manually" "$COLORS_YELLOW"
fi

# Verify installation
log "\n🧪 Verifying installation..." "$COLORS_BLUE"
if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi >/dev/null 2>&1; then
    log "✅ GPU access in Docker verified!" "$COLORS_GREEN"
else
    log "⚠️  GPU verification failed - Docker may need restart" "$COLORS_YELLOW"
    log "   Run: sudo systemctl restart docker" "$COLORS_GRAY"
fi

separator
log "  ✅ NVIDIA Container Toolkit Setup Complete!" "$COLORS_BOLD$COLORS_GREEN"
separator

log "\n📋 Next steps:" "$COLORS_BOLD"
log "  • Test GPU in Docker: docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi" "$COLORS_GRAY"
log "  • Run TEI with GPU:   bash setup-tei.sh" "$COLORS_GRAY"
log "\n"
