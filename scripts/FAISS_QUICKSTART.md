# FAISS Build Quick Start

## TL;DR

### For Linux (Docker - Recommended):

```powershell
npm run build:faiss:docker
```

### For Windows native (auto-installs vcpkg + OpenBLAS):

```powershell
npm run build:faiss
```

### For macOS (Apple Silicon or Intel):

```bash
npm run build:faiss:macos
```

### For Linux (WSL - alternative if Docker not available):

```powershell
npm run build:faiss:wsl
```

---

## Supported Platforms

We build prebuilt binaries for:
- **Linux x64** - for production servers and Docker (required)
- **Windows x64** - for development on Windows (auto-installs dependencies)
- **macOS ARM64** - for Apple Silicon Macs (M1/M2/M3)
- **macOS Intel x64** - for Intel Macs

## Recommended Workflow

### Option 1: Docker (Easiest, most reliable)

```powershell
# Build in Docker (10-20 minutes)
npm run build:faiss:docker

# Test
node -e "require('./external-libs/faiss-linux-x64/faiss-node.node')"

# Commit
git add external-libs/faiss-linux-x64/faiss-node.node
git commit -m "feat: add FAISS prebuilt binary for Linux x64"
```

**Requirements**: Docker Desktop installed and running

### Option 2: WSL (If Docker not available)

```powershell
# Build in WSL (may have network issues)
npm run build:faiss:wsl

# Same test and commit steps as above
```

**Requirements**: WSL with Ubuntu installed

### Option 3: macOS (For Mac developers)

```bash
# On macOS (Apple Silicon or Intel)
brew install openblas cmake node@24
npm run build:faiss:macos

# Test
node -e "require('./external-libs/faiss-darwin-arm64/faiss-node.node')"
```

**Requirements**: Homebrew, Xcode Command Line Tools, Node 24

**If you don't have a Mac**:
- Ask a colleague with macOS to build
- Use GitHub Actions CI/CD
- Skip macOS support (Linux + Windows is enough)

## What Gets Published?

After building, these files are included in npm package:

```
external-libs/
├── faiss-linux-x64/
│   └── faiss-node.node         ← Build with Docker (5.5 MB)
├── faiss-win32-x64/
│   ├── faiss-node.node         ← Build with vcpkg (3.5 MB)
│   └── *.dll                   ← 6 DLL dependencies (15 MB)
├── faiss-darwin-arm64/
│   └── faiss-node.node         ← Build with Homebrew on M1/M2/M3 (~5 MB)
└── faiss-darwin-x64/
    └── faiss-node.node         ← Build with Homebrew on Intel Mac (~5 MB)
```

**Total package size**: ~34 MB (all platforms) or ~24 MB (Linux + Windows only)

Users get these prebuilt binaries automatically - no compilation needed!

## Full Documentation

See `scripts/BUILD_FAISS_README.md` for:
- Detailed prerequisites
- Troubleshooting BLAS errors
- Docker and CI/CD examples
- Manual compilation steps
