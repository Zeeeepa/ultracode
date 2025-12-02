#!/bin/bash
#
# UltraScript Tools - Interactive Environment Setup for Linux
#
# Checks and optionally installs required dependencies for language parsing:
# - Node.js (required)
# - Python (for Python parsing)
# - Go (for Go parsing)
# - Rust (for Rust parsing)
# - Clang (for C/C++ parsing)
# - Java (for Java/Kotlin parsing)
# - shfmt (for Bash parsing)
#
# Usage: ./user-setup-linux.sh
#        ./user-setup-linux.sh --auto  (auto-install without prompts)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

AUTO_INSTALL=false
if [[ "$1" == "--auto" ]]; then
    AUTO_INSTALL=true
fi

print_header() {
    echo ""
    echo -e "${MAGENTA}============================================${NC}"
    echo -e "${MAGENTA}  UltraScript Tools - Environment Setup${NC}"
    echo -e "${MAGENTA}============================================${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }
print_error() { echo -e "${RED}$1${NC}"; }
print_info() { echo -e "${CYAN}$1${NC}"; }

command_exists() {
    command -v "$1" &> /dev/null
}

get_version() {
    local cmd=$1
    local arg=${2:---version}
    $cmd $arg 2>&1 | head -1
}

ask_install() {
    local name=$1
    local url=$2

    if $AUTO_INSTALL; then
        return 0
    fi

    echo ""
    print_warning "$name is not installed."
    print_info "More info: $url"
    read -p "Install $name now? (y/n): " response
    [[ "$response" =~ ^[yY] ]]
}

detect_package_manager() {
    if command_exists apt-get; then
        echo "apt"
    elif command_exists dnf; then
        echo "dnf"
    elif command_exists yum; then
        echo "yum"
    elif command_exists pacman; then
        echo "pacman"
    elif command_exists zypper; then
        echo "zypper"
    elif command_exists apk; then
        echo "apk"
    else
        echo "unknown"
    fi
}

install_package() {
    local pkg_apt=$1
    local pkg_dnf=$2
    local pkg_pacman=$3
    local name=$4

    local pm=$(detect_package_manager)

    case $pm in
        apt)
            print_info "Installing $name via apt..."
            sudo apt-get update && sudo apt-get install -y $pkg_apt
            ;;
        dnf)
            print_info "Installing $name via dnf..."
            sudo dnf install -y $pkg_dnf
            ;;
        yum)
            print_info "Installing $name via yum..."
            sudo yum install -y $pkg_dnf
            ;;
        pacman)
            print_info "Installing $name via pacman..."
            sudo pacman -S --noconfirm $pkg_pacman
            ;;
        zypper)
            print_info "Installing $name via zypper..."
            sudo zypper install -y $pkg_apt
            ;;
        apk)
            print_info "Installing $name via apk..."
            sudo apk add $pkg_apt
            ;;
        *)
            print_error "Unknown package manager. Please install $name manually."
            return 1
            ;;
    esac
}

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

declare -A results

print_header

# 1. Node.js (Required)
echo -n "Checking Node.js..."
if command_exists node; then
    version=$(get_version node -v)
    print_success " OK ($version)"
    results["Node.js"]="OK"
else
    print_error " NOT FOUND"
    results["Node.js"]="MISSING"

    if ask_install "Node.js" "https://nodejs.org/"; then
        install_package "nodejs npm" "nodejs npm" "nodejs npm" "Node.js"
    fi
fi

# 2. Python
echo -n "Checking Python..."
python_cmd=""
for cmd in python3 python; do
    if command_exists $cmd; then
        python_cmd=$cmd
        break
    fi
done

if [[ -n "$python_cmd" ]]; then
    version=$(get_version $python_cmd)
    print_success " OK ($version)"
    results["Python"]="OK"
else
    print_warning " NOT FOUND (Python parsing will use regex fallback)"
    results["Python"]="OPTIONAL"

    if ask_install "Python" "https://www.python.org/downloads/"; then
        install_package "python3" "python3" "python" "Python"
    fi
fi

# 3. Go
echo -n "Checking Go..."
if command_exists go; then
    version=$(get_version go version)
    print_success " OK ($version)"
    results["Go"]="OK"
else
    print_warning " NOT FOUND (Go parsing will use regex fallback)"
    results["Go"]="OPTIONAL"

    if ask_install "Go" "https://go.dev/dl/"; then
        install_package "golang" "golang" "go" "Go"
    fi
fi

# 4. Rust
echo -n "Checking Rust..."
if command_exists rustc; then
    version=$(get_version rustc)
    print_success " OK ($version)"
    results["Rust"]="OK"

    # Check rust-analyzer
    echo -n "Checking rust-analyzer..."
    if command_exists rust-analyzer; then
        ra_version=$(get_version rust-analyzer)
        print_success " OK ($ra_version)"
    else
        print_warning " NOT FOUND (will use regex parser)"
    fi
else
    print_warning " NOT FOUND (Rust parsing will use regex fallback)"
    results["Rust"]="OPTIONAL"

    if ask_install "Rust" "https://rustup.rs/"; then
        print_info "Installing Rust via rustup..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi
fi

# 5. Clang (C/C++)
echo -n "Checking Clang..."
if command_exists clang; then
    version=$(get_version clang)
    print_success " OK ($version)"
    results["Clang"]="OK"
else
    print_warning " NOT FOUND (C/C++ parsing will use regex fallback)"
    results["Clang"]="OPTIONAL"

    if ask_install "Clang" "https://releases.llvm.org/download.html"; then
        install_package "clang" "clang" "clang" "Clang"
    fi
fi

# 6. Java
echo -n "Checking Java..."
if command_exists java; then
    version=$(get_version java)
    print_success " OK ($version)"
    results["Java"]="OK"
else
    print_warning " NOT FOUND (Java/Kotlin parsing will use regex fallback)"
    results["Java"]="OPTIONAL"

    if ask_install "Java" "https://adoptium.net/"; then
        install_package "default-jdk" "java-17-openjdk" "jdk-openjdk" "Java"
    fi
fi

# 7. shfmt (Bash)
echo -n "Checking shfmt..."
if command_exists shfmt; then
    version=$(get_version shfmt)
    print_success " OK ($version)"
    results["shfmt"]="OK"
else
    print_warning " NOT FOUND (Bash parsing will use regex fallback)"
    results["shfmt"]="OPTIONAL"

    if ask_install "shfmt" "https://github.com/mvdan/sh/releases"; then
        if command_exists go; then
            print_info "Installing shfmt via go install..."
            go install mvdan.cc/sh/v3/cmd/shfmt@latest
        else
            install_package "shfmt" "shfmt" "shfmt" "shfmt"
        fi
    fi
fi

# 8. Bash (always available on Linux)
echo -n "Checking Bash..."
bash_version=$(bash --version | head -1)
print_success " OK ($bash_version)"
results["Bash"]="OK"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo -e "${MAGENTA}============================================${NC}"
echo -e "${MAGENTA}  SUMMARY${NC}"
echo -e "${MAGENTA}============================================${NC}"
echo ""

missing=0
optional=0

for key in "${!results[@]}"; do
    value=${results[$key]}
    case $value in
        "OK")
            echo -e "${GREEN}[+] $key: $value${NC}"
            ;;
        "OPTIONAL")
            echo -e "${YELLOW}[~] $key: $value${NC}"
            ((optional++))
            ;;
        "MISSING")
            echo -e "${RED}[!] $key: $value${NC}"
            ((missing++))
            ;;
    esac
done

echo ""

if [[ $missing -gt 0 ]]; then
    print_error "Some required dependencies are missing. Please install them."
    exit 1
elif [[ $optional -gt 0 ]]; then
    print_warning "Some optional dependencies are missing."
    print_info "Parsers for those languages will use regex fallback."
    echo ""
    print_success "UltraScript Tools can run with reduced functionality."
else
    print_success "All dependencies are installed!"
    echo ""
    print_success "UltraScript Tools is ready to use with full functionality."
fi

echo ""
print_info "To start the MCP server, run:"
echo "  npm start"
echo ""
