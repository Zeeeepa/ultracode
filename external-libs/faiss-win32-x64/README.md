# FAISS Prebuilt Binary for Windows x64

This directory contains prebuilt `faiss-node.node` for Node 24 (ABI v137) on Windows x64.

## Contents

| File | Description |
|------|-------------|
| `faiss-node.node` | Native addon for Node 24 (ABI v137) |
| `openblas.dll` | OpenBLAS library (BLAS/LAPACK operations) |
| `libgfortran-5.dll` | GNU Fortran runtime |
| `liblapack.dll` | LAPACK library |
| `libgcc_s_seh-1.dll` | GCC runtime (SEH exceptions) |
| `libquadmath-0.dll` | Quad-precision math library |
| `libwinpthread-1.dll` | POSIX threads for Windows |

## Installation

All files are **automatically copied** to `node_modules/faiss-node/lib/binding/` during `npm install` via the postinstall script.

### Manual Installation (if postinstall failed)

```bash
# Run postinstall manually
node scripts/postinstall.js

# Or copy files manually:
# Copy all files from this directory to:
# node_modules/faiss-node/lib/binding/node-v137-win32-x64/
```

## Building from Source

Run from project root:

```bash
npm run build:faiss
```

This will compile `faiss-node.node`. See `scripts/BUILD_FAISS_README.md` for details.

### Getting DLLs

DLLs can be obtained from:
- **OpenBLAS**: https://github.com/OpenMathLib/OpenBLAS/releases (download `OpenBLAS-*-x64.zip`)
- **MinGW-w64**: https://winlibs.com/ (for libgfortran, libgcc, etc.)

Or install via MSYS2:
```bash
pacman -S mingw-w64-x86_64-openblas mingw-w64-x86_64-gcc-libs
# DLLs will be in /mingw64/bin/
```
