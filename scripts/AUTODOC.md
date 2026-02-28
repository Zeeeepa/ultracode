# Scripts Module

Development, build, and setup scripts for UltraCode.

## Embeddings Setup

**Unified script for all embedding providers:**

```bash
# Linux/macOS
./scripts/setup-embeddings.sh

# Windows
scripts\setup-embeddings.cmd
```

### Features

- **Interactive Mode**: Step-by-step wizard for provider and model selection
- **Auto GPU Detection**: Detects NVIDIA GPUs (RTX 30xx/40xx/50xx)
- **Dependency Installation**: Auto-installs Docker, NVIDIA Container Toolkit, or Ollama
- **Centralized Config**: Models defined in `config/embedding-models.json`

### Supported Providers

| Provider | Description | Requirements |
|----------|-------------|-------------|
| **TEI** | HuggingFace Text Embeddings Inference, GPU acceleration | Docker Desktop |
| **Ollama** | Simple local inference, auto-detects GPU | Ollama binary |
| **Memory** | Hash-based (no ML), instant start | None |

### Non-Interactive Mode

```bash
./scripts/setup-embeddings.sh --provider tei
./scripts/setup-embeddings.sh --provider tei --model granite-embedding-278m
./scripts/setup-embeddings.sh --provider tei --force-cpu
./scripts/setup-embeddings.sh --provider ollama
./scripts/setup-embeddings.sh --provider memory
```

### Available Models

Defined in `config/embedding-models.json`: IBM Granite (125M, 278M, 30M), BGE (Small/Base/Large/M3), E5 (Small/Base/Large), GTE Base, Nomic Embed Text, MxBai Embed Large, and more.

---

## FAISS Native Build

Prebuilt `faiss-node` binaries for npm distribution. Targets Node 24 (ABI v137).

### Quick Start

```bash
# Linux (Docker - recommended)
npm run build:faiss:docker

# Windows (auto-installs vcpkg + OpenBLAS)
npm run build:faiss

# macOS (Apple Silicon or Intel)
npm run build:faiss:macos

# Linux (WSL alternative)
npm run build:faiss:wsl
```

### Output Structure

```
external-libs/
├── faiss-linux-x64/faiss-node.node       (Docker, ~5.5 MB)
├── faiss-win32-x64/faiss-node.node       (vcpkg, ~3.5 MB + DLLs)
├── faiss-darwin-arm64/faiss-node.node    (Homebrew, ~5 MB)
└── faiss-darwin-x64/faiss-node.node      (Homebrew, ~5 MB)
```

Total package: ~34 MB (all platforms) or ~24 MB (Linux + Windows only).

### Windows BLAS Requirement

Windows build requires BLAS/LAPACK (not auto-installed):
1. **Intel MKL** (recommended) — download from Intel oneAPI
2. **OpenBLAS via vcpkg** — `vcpkg install openblas:x64-windows`
3. **Skip Windows** — use Linux binary for production/Docker

### Testing

```bash
node -e "const f=require('./external-libs/faiss-linux-x64/faiss-node.node');console.log('OK')"
```

---

## OVMS Setup

OpenVINO Model Server for embeddings.

### Option 1: Docker (Simplest)

```bash
docker run -d --name ovms -p 8082:8082 \
  -v ~/.local/share/ultracode/ovms/models:/models \
  openvino/model_server:latest \
  --model_path /models/multilingual-e5-base --model_name embeddings --port 8082
```

### Option 2: Native Build

```bash
# Linux
./scripts/setup-ovms-nvidia.sh

# Windows (requires VS2019 toolset v142!)
scripts\setup-ovms-nvidia.cmd
```

**Important:** OVMS on Windows requires Visual Studio 2019 (toolset v142). If you have VS2022/VS2026, install VS2019 Build Tools additionally.

### ToMe (Token Merging) — Optional

1.5-2x speedup with <1% accuracy loss:

```bash
# Windows: scripts\setup-tome-tools.cmd
# Linux: ./scripts/setup-tome-tools.sh
python convert_tome_model.py --model intfloat/multilingual-e5-base --output ./models
```

| Ratio | Speedup | Accuracy Loss |
|-------|---------|--------------|
| 0.0 | 1.0x | 0% |
| 0.3 | ~1.4x | <0.5% |
| 0.5 | ~2.0x | <1% |
| 0.7 | ~3.3x | ~2% |

Recommended for embeddings: ratio=0.3.

### Recommended Models

| Model | Size | Languages | Dimensions |
|-------|------|-----------|-----------|
| multilingual-e5-base | 278M | 100+ | 768 |
| multilingual-e5-small | 118M | 100+ | 384 |
| all-MiniLM-L6-v2 | 23M | EN | 384 |
| bge-m3 | 567M | 100+ | 1024 |

### Configuration

After OVMS setup, configure `semantic-config.json`:

```json
{
  "enabled": true,
  "embedding": {
    "platform": "ovms",
    "ovms": {
      "endpoint": "http://localhost:8082",
      "batch_size": 32,
      "selected_model": "multilingual-e5-base",
      "target_device": "CPU"
    }
  }
}
```

Or run: `npx ultracode setup`

---

## Build Scripts

### CUDA Backend

```bash
npm run build:cuda          # Windows (PowerShell)
npm run build:cuda:debug    # Debug build
npm run build:cuda:clean    # Clean rebuild
```

Requirements: CUDA Toolkit 12.x, cmake-js, node-addon-api.

### Comm Proxy (Cosmopolitan)

```bash
./src/comm/build.ps1        # Build APE binary (~50KB)
```

### Native Libraries

```bash
# Windows
scripts\build-native-libs.ps1

# Linux (WSL)
scripts/build-linux-wsl.sh

# macOS
scripts/build-native-libs-macos.sh
```

### Dawn/WebGPU

```bash
scripts\build-dawn-x64.bat       # Build Dawn addon
scripts\install-dawn-blackwell.bat # Install for Blackwell GPUs
```

---

## Script Reference

| Script | Description |
|--------|-------------|
| `benchmark-large-entities.ts` | Benchmark with large entities |
| `benchmark-runtime.ts` | Node.js vs Bun runtime comparison |
| `download-comm-binary.js` | Download Comm proxy binary |
| `download-native-libs.js` | Download prebuilt native libraries |
| `download-openvino-model.ts` | Download OpenVINO embedding models |
| `postinstall.js` | Post-install: copy native binaries, show welcome |
| `setup-embeddings.*` | Interactive embedding provider setup |
| `setup-ovms-nvidia.*` | OVMS native build with NVIDIA support |
| `setup-tome-tools.*` | Install ToMe conversion tools |
| `build-cuda.*` | Build CUDA native addon |
| `build-native-libs.*` | Build all native libraries |
| `build-roslyn.*` | Build Roslyn addon for C# analysis |
| `dev-setup.*` | Development environment setup |
| `read-logs.ps1` | Log analysis with filtering |
| `pack-npm.ps1` | Build and package for npm |

---

## Troubleshooting

### Docker not found (TEI/OVMS)
Install Docker Desktop and start it.

### GPU not detected
- Verify: `nvidia-smi`
- For WSL2: Enable GPU support in Docker Desktop settings

### OVMS build fails on Windows
OVMS requires VS2019 toolset (v142). Install VS2019 Build Tools or use Docker.

### FAISS build: "Could NOT find BLAS"
Install Intel MKL or use Docker build: `npm run build:faiss:docker`

### Port already in use
Use `--port <number>` or check: `docker ps`
