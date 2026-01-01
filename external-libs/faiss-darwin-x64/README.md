# FAISS Prebuilt Binary - macOS Intel (x86_64)

This directory contains the prebuilt `faiss-node` native addon for **macOS Intel (x86_64)** and **Node 24 (ABI v137)**.

## What's inside

- `faiss-node.node` - Native addon (~5 MB)
- Statically linked with OpenBLAS (from Homebrew)

## How to build (for contributors with Intel Mac)

If you need to rebuild this binary:

```bash
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install dependencies
brew install openblas cmake node@24
brew link node@24 --force

# 3. Build
npm run build:faiss:macos

# Or directly
bash scripts/build-faiss-macos.sh
```

The script will automatically detect Intel architecture and build for `darwin-x64`.

## Requirements for building

- **macOS 11+** (Big Sur or newer)
- **Intel processor** (x86_64)
- **Xcode Command Line Tools**: `xcode-select --install`
- **Homebrew**: https://brew.sh
- **Node 24**: `brew install node@24`

## Build time

Approximately **10-20 minutes** (compiling FAISS C++ library)

## For Windows/Linux developers

If you don't have a Mac, you can:

1. Ask a colleague with macOS to build this binary
2. Use GitHub Actions CI/CD (see `.github/workflows/` if configured)
3. Skip macOS support (Linux + Windows binaries are sufficient for most use cases)

## Verification

After building, verify the binary works:

```bash
node -e "require('./external-libs/faiss-darwin-x64/faiss-node.node'); console.log('✓ Works!')"
```

## Documentation

Full build guide: `docs/FAISS_BUILD_GUIDE.md`
