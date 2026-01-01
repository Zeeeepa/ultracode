# Building FAISS Native Binaries

This guide explains how to build prebuilt `faiss-node` binaries for npm distribution.

## Overview

The `faiss-node` package requires native compilation for each Node.js ABI version. We build prebuilt binaries for **Node 24 (ABI v137)** on both Windows and Linux, and include them in the npm package.

## Directory Structure

```
external-libs/
├── faiss-win32-x64/
│   └── faiss-node.node      # Windows x64 binary
└── faiss-linux-x64/
    └── faiss-node.node      # Linux x64 binary
```

## Building for Windows

### ⚠️ Important: BLAS/LAPACK Required

Windows build requires **BLAS/LAPACK** libraries. **This is NOT auto-installed** due to complexity.

**Options:**

1. **Intel oneAPI Math Kernel Library (MKL)** - Recommended
   - Download: https://www.intel.com/content/www/us/en/developer/tools/oneapi/onemkl.html
   - Install Intel oneAPI Base Toolkit (~1 GB)
   - MKL provides optimized BLAS/LAPACK for Intel CPUs

2. **OpenBLAS via vcpkg**
   ```powershell
   git clone https://github.com/Microsoft/vcpkg.git
   cd vcpkg
   .\bootstrap-vcpkg.bat
   .\vcpkg install openblas:x64-windows
   # Add to PATH: vcpkg\installed\x64-windows\bin
   ```

3. **Skip Windows build** - Easiest option
   - Use Linux binary for production/Docker
   - WSL users can use Linux binary
   - Windows dev: Use DiskANN fallback (built into LibSQL)

### Prerequisites (auto-installed by script)

- CMake 3.20+
- Visual Studio Build Tools 2022 (MSVC)
- Python 3.x
- Git
- node-gyp
- **BLAS/LAPACK** (Intel MKL or OpenBLAS) - **MANUAL INSTALL REQUIRED**

### Build Command

```bash
npm run build:faiss
```

or

```cmd
node scripts/build-faiss-node.js
```

The script will:

1. Check for required dependencies (except BLAS/MKL)
2. Auto-install missing dependencies
3. Clone `faiss-node` repository
4. Compile with `cmake-js` (10-20 minutes)
5. Copy to `external-libs/faiss-win32-x64/faiss-node.node`

**Note:** Build will fail with `Could NOT find BLAS` if MKL/OpenBLAS not installed.

## Building for Linux

### Option 1: Docker (Recommended - Most Reliable)

```powershell
# From Windows PowerShell
npm run build:faiss:docker
```

or

```bash
pwsh scripts/build-faiss-docker.ps1
```

This will:
1. Launch Docker container with `node:24-slim` image
2. Install BLAS/LAPACK dependencies (libopenblas)
3. Clone faiss-node repository
4. Build with cmake-js (10-20 minutes)
5. Copy to `external-libs/faiss-linux-x64/faiss-node.node`

**Advantages:**
- ✅ Clean isolated environment
- ✅ No WSL network issues
- ✅ Works on Windows, Linux, macOS
- ✅ Reproducible builds for CI/CD

Clean build:
```powershell
npm run build:faiss:docker:clean
```

### Option 2: WSL (Alternative for Windows users)

```powershell
# From Windows PowerShell or CMD
npm run build:faiss:wsl
```

This will:
1. Launch WSL automatically
2. Install BLAS/LAPACK dependencies
3. Clone faiss-node repository
4. Build with cmake-js
5. Copy to `external-libs/faiss-linux-x64/`

**Note:** May have network issues with `apt-get update` in WSL.

Clean build:
```powershell
npm run build:faiss:wsl:clean
```

### Option 3: Native Linux Machine

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y cmake build-essential git libopenblas-dev libblas-dev liblapack-dev python3 patchelf

# Install Node 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install node-gyp globally
sudo npm install -g node-gyp

# Run build script
bash scripts/build-faiss-docker.sh
```

## Testing

After building, test the native addon:

```bash
node -e "const f=require('./external-libs/faiss-win32-x64/faiss-node.node');console.log('OK')"
```

## NPM Package Integration

### 1. Files included in package

See `package.json`:

```json
"files": [
  "external-libs/faiss-win32-x64/*.node",
  "external-libs/faiss-linux-x64/*.node"
]
```

### 2. Postinstall script

The `scripts/postinstall.js` automatically copies the correct `.node` file to:

```
node_modules/faiss-node/lib/binding/node-v137-{platform}-{arch}/faiss-node.node
```

### 3. User installation

When users install the package:

```bash
npm install ultrascript-tools-mcp
```

The postinstall script will:
- Detect platform (Windows/Linux)
- Copy prebuilt binary from `external-libs/`
- No compilation needed!

## Troubleshooting

### Windows Build Fails: "Could NOT find BLAS"

**Problem**: Windows build requires BLAS/LAPACK libraries which are not easily installable on Windows.

**Solution**: Use WSL instead for Linux builds:
```powershell
npm run build:faiss:wsl
```

**Why Windows is hard**: FAISS requires BLAS/LAPACK (linear algebra libraries). On Windows, you would need to:
- Install Intel MKL (very large download)
- Or compile OpenBLAS from source (complex)
- Or use vcpkg (time-consuming)

**Recommendation**: Build Windows version on a machine with Intel MKL, or skip Windows version and only distribute Linux binaries (users can run Linux binaries in Docker/WSL).

### Windows Build with Visual Studio

If you still want to build for Windows:

1. Install Visual Studio Build Tools 2022:
   - Download: https://aka.ms/vs/17/release/vs_BuildTools.exe
   - Select "Desktop development with C++"
   - Include MSVC v143 and Windows 11 SDK

2. Install Intel MKL:
   - Download: https://www.intel.com/content/www/us/en/developer/tools/oneapi/onemkl-download.html
   - Or install via conda: `conda install mkl mkl-devel`

3. Set environment variables before building:
   ```powershell
   $env:MKLROOT = "C:\Program Files (x86)\Intel\oneAPI\mkl\latest"
   npm run build:faiss
   ```

### Linux Build Fails

```bash
# Install missing dependencies
sudo apt-get install -y libblas-dev liblapack-dev libopenblas-dev
```

### Test Loading

```bash
node -e "const f=require('faiss-node');console.log('Loaded:', Object.keys(f))"
```

## CI/CD Integration

For GitHub Actions:

```yaml
- name: Build FAISS Windows
  if: runner.os == 'Windows'
  run: npm run build:faiss

- name: Build FAISS Linux
  if: runner.os == 'Linux'
  run: npm run build:faiss
```

## Version Compatibility

| Node Version | ABI Version | Status |
|--------------|-------------|--------|
| Node 24      | v137        | ✅ Built by this script |
| Node 22      | v127        | ⚠️ Use official prebuilds |
| Node 20      | v115        | ⚠️ Use official prebuilds |

We target Node 24+ for this project due to modern ESM and native module requirements.
