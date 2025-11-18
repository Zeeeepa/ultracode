# Build Instructions

## Quick Start

### Windows
```cmd
# From project root:
.\Dev.Scripts\build-bun.cmd

# Or just the WASM modules:
powershell -ExecutionPolicy Bypass -File scripts\build-wasm.ps1
```

### Linux/macOS
```bash
# From project root:
./scripts/build.sh

# Or just the WASM modules:
./scripts/build-wasm.sh
```

---

## Platform-Specific Scripts

### Windows (PowerShell)

**Full build:**
- Script: `Dev.Scripts\build-bun.cmd`
- Uses: Native Windows PowerShell
- Sees: Windows PATH with cargo/rustc

**WASM only:**
- Script: `scripts\build-wasm.ps1`
- Requirements: Rust + wasm-pack in PATH

### Linux/macOS (Bash)

**Full build:**
- Script: `scripts/build.sh`
- Uses: Native bash shell
- Sees: Unix PATH with cargo/rustc

**WASM only:**
- Script: `scripts/build-wasm.sh`
- Requirements: Rust + wasm-pack in PATH

---

## Prerequisites

### All Platforms

1. **Bun** (required)
   ```bash
   # Windows:
   powershell -c "irm bun.sh/install.ps1 | iex"

   # Linux/macOS:
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Rust + Cargo** (optional, for WASM)
   ```bash
   # Windows:
   # Download from: https://rustup.rs/

   # Linux/macOS:
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

3. **wasm-pack** (optional, for WASM)
   ```bash
   cargo install wasm-pack
   ```

### Windows Only

4. **Visual Studio Build Tools** (optional, for CUDA)
   - Install component: **"Desktop development with C++"**
   - Download: https://aka.ms/vs/17/release/vs_BuildTools.exe
   - Run build from: **"Developer Command Prompt for VS 2022"**

5. **CUDA Toolkit** (optional, for GPU acceleration)
   - Download: https://developer.nvidia.com/cuda-downloads
   - Requires: NVIDIA GPU (RTX 2060+ recommended)

---

## Build Outputs

### TypeScript → JavaScript
- **Input**: `src/**/*.ts`
- **Output**: `dist/index.js`, `dist/index.d.ts`, `dist/index.js.map`
- **Tool**: tsup (Bun runtime)

### Rust → WASM
- **Input**: `wasm/diff-simd/`, `wasm/vector-ops-simd/`
- **Output**: `dist/wasm/diff-simd/`, `dist/wasm/vector-ops-simd/`
- **Tool**: wasm-pack
- **Benefits**: 3-10x faster diff/similarity operations

### CUDA → Native Module (Windows only)
- **Input**: `native/cuda/src/*.cu`, `native/cuda/src/*.cpp`
- **Output**: `dist/native/cuda/*.node`
- **Tool**: cmake-js + nvcc (CUDA compiler)
- **Benefits**: 100-200x faster embedding operations on GPU
- **Auto-detected**: Script checks for CUDA Toolkit at:
  - `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0`
  - `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0`
  - `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8`
- **Requirements**: CMake, Visual Studio Build Tools with C++ support

---

## Troubleshooting

### Windows: "cargo not found"

**Problem**: PowerShell can't find cargo even though Rust is installed.

**Solution 1**: Restart terminal after Rust installation
```cmd
# Close and reopen PowerShell/Command Prompt
```

**Solution 2**: Add cargo to PATH manually
```cmd
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
```

**Solution 3**: Run from Git Bash (if installed)
```bash
bash scripts/build-wasm.sh
```

### Linux: "Permission denied: ./scripts/build.sh"

**Problem**: Script not executable.

**Solution**:
```bash
chmod +x scripts/build.sh scripts/build-wasm.sh
./scripts/build.sh
```

### All Platforms: "wasm-pack not found"

**Problem**: wasm-pack not installed.

**Solution**:
```bash
cargo install wasm-pack
```

### Windows: CUDA build fails

**Problem 1**: CUDA Toolkit not found.

**Solution**:
```cmd
# Install CUDA Toolkit from: https://developer.nvidia.com/cuda-downloads
# Install to: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
# Requires: NVIDIA GPU (RTX 2060 or newer recommended)
```

**Problem 2**: CMake not found.

**Solution**:
```cmd
# Download CMake from: https://cmake.org/download/
# Install and add to PATH
# Verify: cmake --version
```

**Problem 3**: Visual Studio C++ compiler not found.

**Solution**: Run build from **Developer Command Prompt for VS 2022**
1. Install Visual Studio 2022 Build Tools: https://aka.ms/vs/17/release/vs_BuildTools.exe
2. Select component: **"Desktop development with C++"**
3. Open: **Developer Command Prompt for VS 2022** (from Start menu)
4. Navigate to project folder and run: `.\Dev.Scripts\build-bun.cmd`

**Problem 4**: cmake-js compilation errors.

**Solution**: Ensure all prerequisites are installed and script runs from Developer Command Prompt.

---

## Why Different Scripts?

### PowerShell (.ps1) for Windows
- ✅ Native Windows scripting
- ✅ Inherits Windows PATH automatically
- ✅ No WSL/Git Bash needed
- ✅ Better error messages (colored output)

### Bash (.sh) for Linux/macOS
- ✅ Native Unix scripting
- ✅ Standard tool on all Unix systems
- ✅ Portable across distributions
- ✅ Simple, lightweight

### Why not cross-platform Node.js script?
- PowerShell and Bash are **already installed** on their respective platforms
- Better integration with system tools (cargo, git, etc.)
- Clearer error messages
- Faster startup (no Node.js interpreter overhead)

---

## Development Workflow

### Quick iteration (no WASM rebuild)
```bash
# Windows:
bun run build

# Linux/macOS:
bun run build
```

### Full rebuild (with WASM)
```bash
# Windows:
.\Dev.Scripts\build-bun.cmd

# Linux/macOS:
./scripts/build.sh
```

### Watch mode (auto-rebuild on changes)
```bash
bun run dev
```

---

## CI/CD Integration

### GitHub Actions (Linux)
```yaml
- name: Build project
  run: ./scripts/build.sh
```

### GitHub Actions (Windows)
```yaml
- name: Build project
  run: .\Dev.Scripts\build-bun.cmd
  shell: cmd
```

### Docker (Linux)
```dockerfile
RUN ./scripts/build.sh
```
