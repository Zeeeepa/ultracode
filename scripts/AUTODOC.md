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

## New (pending description)

- **BenchmarkResult** — `compare-benchmarks.ts:9-13`
- **BenchmarkFile** — `compare-benchmarks.ts:15-21`
- **log** — `build-faiss-node.js:44-47`
- **<anonymous>** — `build-faiss-node.js:44-44`
- **logSection** — `build-faiss-node.js:49-53`
- **<anonymous>** — `build-faiss-node.js:49-49`
- **exec** — `build-faiss-node.js:59-76`
- **<anonymous>** — `build-faiss-node.js:59-59`
- **checkCommand** — `build-faiss-node.js:78-85`
- **<anonymous>** — `build-faiss-node.js:78-78`
- **downloadFile** — `build-faiss-node.js:91-129`
- **<anonymous>** — `build-faiss-node.js:91-91`
- **resolve** — `build-faiss-node.js:94-128`
- **res** — `build-faiss-node.js:96-115`
- **file** — `build-faiss-node.js:111-114`
- **err** — `build-faiss-node.js:117-121`
- **err** — `build-faiss-node.js:123-127`
- **checkGit** — `build-faiss-node.js:135-143`
- **<anonymous>** — `build-faiss-node.js:135-135`
- **checkCMake** — `build-faiss-node.js:145-153`
- **<anonymous>** — `build-faiss-node.js:145-145`
- **checkPython** — `build-faiss-node.js:155-165`
- **<anonymous>** — `build-faiss-node.js:155-155`
- **checkVSBuildTools** — `build-faiss-node.js:167-190`
- **<anonymous>** — `build-faiss-node.js:167-167`
- **checkNodeGyp** — `build-faiss-node.js:192-200`
- **<anonymous>** — `build-faiss-node.js:192-192`
- **checkVcpkg** — `build-faiss-node.js:202-211`
- **<anonymous>** — `build-faiss-node.js:202-202`
- **checkOpenBLAS** — `build-faiss-node.js:213-221`
- **<anonymous>** — `build-faiss-node.js:213-213`
- **installGit** — `build-faiss-node.js:227-232`
- **<anonymous>** — `build-faiss-node.js:227-227`
- **installCMake** — `build-faiss-node.js:234-260`
- **<anonymous>** — `build-faiss-node.js:234-234`
- **installPython** — `build-faiss-node.js:262-286`
- **<anonymous>** — `build-faiss-node.js:262-262`
- **installVSBuildTools** — `build-faiss-node.js:288-321`
- **<anonymous>** — `build-faiss-node.js:288-288`
- **installNodeGyp** — `build-faiss-node.js:323-327`
- **<anonymous>** — `build-faiss-node.js:323-323`
- **installVcpkg** — `build-faiss-node.js:329-348`
- **<anonymous>** — `build-faiss-node.js:329-329`
- **installOpenBLAS** — `build-faiss-node.js:350-381`
- **<anonymous>** — `build-faiss-node.js:350-350`
- **cloneFaissNode** — `build-faiss-node.js:387-397`
- **<anonymous>** — `build-faiss-node.js:387-387`
- **buildNativeAddon** — `build-faiss-node.js:399-431`
- **<anonymous>** — `build-faiss-node.js:399-399`
- **installToExternalLibs** — `build-faiss-node.js:433-456`
- **<anonymous>** — `build-faiss-node.js:433-433`
- **testBuiltAddon** — `build-faiss-node.js:458-471`
- **<anonymous>** — `build-faiss-node.js:458-458`
- **sleep** — `build-faiss-node.js:477-479`
- **<anonymous>** — `build-faiss-node.js:477-477`
- **resolve** — `build-faiss-node.js:478-478`
- **askYesNo** — `build-faiss-node.js:481-496`
- **<anonymous>** — `build-faiss-node.js:481-481`
- **resolve** — `build-faiss-node.js:490-495`
- **answer** — `build-faiss-node.js:491-494`
- **main** — `build-faiss-node.js:502-575`
- **<anonymous>** — `build-faiss-node.js:502-502`
- **err** — `build-faiss-node.js:578-584`
- **modelToSlug** — `build-global-embeddings.ts:32-34`
- **<anonymous>** — `build-global-embeddings.ts:32-32`
- **isServerReachable** — `build-global-embeddings.ts:36-48`
- **<anonymous>** — `build-global-embeddings.ts:36-36`
- **main** — `build-global-embeddings.ts:50-223`
- **<anonymous>** — `build-global-embeddings.ts:50-50`
- **f** — `build-global-embeddings.ts:68-69`
- **r** — `build-global-embeddings.ts:87-87`
- **e** — `build-global-embeddings.ts:135-140`
- **e** — `build-global-embeddings.ts:150-150`
- **t** — `build-global-embeddings.ts:151-151`
- **err** — `build-global-embeddings.ts:225-228`
- **f** — `compare-benchmarks.ts:25-25`
- **f** — `compare-benchmarks.ts:34-37`
- **b** — `compare-benchmarks.ts:40-40`
- **b** — `compare-benchmarks.ts:41-41`
- **r** — `compare-benchmarks.ts:56-56`
- **r** — `compare-benchmarks.ts:57-57`
- **kw** — `compare-benchmarks.ts:137-137`
- **convert_model** — `convert-model-for-npu.py:16-80`
- **main** — `convert-model-for-npu.py:80-107`
- **log** — `convert-tokenizer-simple.ts:42-51`
- **<anonymous>** — `convert-tokenizer-simple.ts:42-42`
- **ensureDir** — `convert-tokenizer-simple.ts:53-57`
- **<anonymous>** — `convert-tokenizer-simple.ts:53-53`
- **downloadFile** — `convert-tokenizer-simple.ts:62-94`
- **<anonymous>** — `convert-tokenizer-simple.ts:62-62`
- **generateTokenizerJson** — `convert-tokenizer-simple.ts:99-133`
- **<anonymous>** — `convert-tokenizer-simple.ts:99-99`
- **verifyTokenizerJson** — `convert-tokenizer-simple.ts:138-161`
- **<anonymous>** — `convert-tokenizer-simple.ts:138-138`
- **convertModel** — `convert-tokenizer-simple.ts:167-275`
- **<anonymous>** — `convert-tokenizer-simple.ts:167-167`
- **file** — `convert-tokenizer-simple.ts:248-253`
- **main** — `convert-tokenizer-simple.ts:281-319`
- **<anonymous>** — `convert-tokenizer-simple.ts:281-281`
- **error** — `convert-tokenizer-simple.ts:323-326`
- **convert_to_fast_tokenizer** — `convert-tokenizer-to-fast.py:28-141`
- **cutensorStatus_t** — `cutensor_compat.h:13-15`
- **cutensorStatus_t** — `cutensor_compat.h:20-31`
- **cutensorStatus_t** — `cutensor_compat.h:34-88`
- **printOK** — `install-ovms-native.ts:47-49`
- **<anonymous>** — `install-ovms-native.ts:47-47`
- **printInfo** — `install-ovms-native.ts:50-52`
- **<anonymous>** — `install-ovms-native.ts:50-50`
- **printWarn** — `install-ovms-native.ts:53-55`
- **<anonymous>** — `install-ovms-native.ts:53-53`
- **printError** — `install-ovms-native.ts:56-58`
- **<anonymous>** — `install-ovms-native.ts:56-56`
- **getOVMSDir** — `install-ovms-native.ts:63-72`
- **<anonymous>** — `install-ovms-native.ts:63-63`
- **getModelsDir** — `install-ovms-native.ts:77-86`
- **<anonymous>** — `install-ovms-native.ts:77-77`
- **getDownloadUrl** — `install-ovms-native.ts:91-125`
- **<anonymous>** — `install-ovms-native.ts:91-91`
- **downloadFile** — `install-ovms-native.ts:130-179`
- **<anonymous>** — `install-ovms-native.ts:130-130`
- **resolve** — `install-ovms-native.ts:171-175`
- **extractArchive** — `install-ovms-native.ts:184-222`
- **<anonymous>** — `install-ovms-native.ts:184-184`
- **createStartupScript** — `install-ovms-native.ts:227-274`
- **<anonymous>** — `install-ovms-native.ts:227-227`
- **createSystemdService** — `install-ovms-native.ts:279-307`
- **<anonymous>** — `install-ovms-native.ts:279-279`
- **checkExistingInstallation** — `install-ovms-native.ts:312-316`
- **<anonymous>** — `install-ovms-native.ts:312-312`
- **main** — `install-ovms-native.ts:321-475`
- **<anonymous>** — `install-ovms-native.ts:321-321`
- **resolve** — `install-ovms-native.ts:343-348`
- **ans** — `install-ovms-native.ts:344-347`
- **error** — `install-ovms-native.ts:477-480`
- **log** — `postinstall-gpu.js:28-30`
- **<anonymous>** — `postinstall-gpu.js:28-28`
- **execCommand** — `postinstall-gpu.js:32-44`
- **<anonymous>** — `postinstall-gpu.js:32-32`
- **checkCommand** — `postinstall-gpu.js:46-56`
- **<anonymous>** — `postinstall-gpu.js:46-46`
- **checkCUDAToolkit** — `postinstall-gpu.js:58-82`
- **<anonymous>** — `postinstall-gpu.js:58-58`
- **buildWASM** — `postinstall-gpu.js:84-148`
- **<anonymous>** — `postinstall-gpu.js:84-84`
- **_buildCUDA** — `postinstall-gpu.js:150-200`
- **<anonymous>** — `postinstall-gpu.js:150-150`
- **main** — `postinstall-gpu.js:202-261`
- **<anonymous>** — `postinstall-gpu.js:202-202`
- **error** — `postinstall-gpu.js:265-269`
- **args** — `postinstall.cjs:22-22`
- **printBox** — `postinstall.cjs:36-49`
- **<anonymous>** — `postinstall.cjs:36-36`
- **printSuccess** — `postinstall.cjs:51-53`
- **<anonymous>** — `postinstall.cjs:51-51`
- **printInfo** — `postinstall.cjs:55-57`
- **<anonymous>** — `postinstall.cjs:55-55`
- **_printWarning** — `postinstall.cjs:59-61`
- **<anonymous>** — `postinstall.cjs:59-59`
- **printError** — `postinstall.cjs:63-65`
- **<anonymous>** — `postinstall.cjs:63-63`
- **isAppleSilicon** — `postinstall.cjs:67-69`
- **<anonymous>** — `postinstall.cjs:67-67`
- **isIntelMac** — `postinstall.cjs:71-73`
- **<anonymous>** — `postinstall.cjs:71-71`
- **checkMetalLibExists** — `postinstall.cjs:75-78`
- **<anonymous>** — `postinstall.cjs:75-75`
- **checkCudaLibExists** — `postinstall.cjs:80-89`
- **<anonymous>** — `postinstall.cjs:80-80`
- **askYesNo** — `postinstall.cjs:91-109`
- **<anonymous>** — `postinstall.cjs:91-91`
- **resolve** — `postinstall.cjs:97-108`
- **answer** — `postinstall.cjs:104-107`
- **askSkip** — `postinstall.cjs:111-130`
- **<anonymous>** — `postinstall.cjs:111-111`
- **resolve** — `postinstall.cjs:117-129`
- **answer** — `postinstall.cjs:124-128`
- **buildMetalBackend** — `postinstall.cjs:132-157`
- **<anonymous>** — `postinstall.cjs:132-132`
- **handleAppleSilicon** — `postinstall.cjs:159-194`
- **<anonymous>** — `postinstall.cjs:159-159`
- **detectPlatformInfo** — `postinstall.cjs:196-213`
- **<anonymous>** — `postinstall.cjs:196-196`
- **main** — `postinstall.cjs:215-267`
- **<anonymous>** — `postinstall.cjs:215-215`
- **runSetupWizard** — `postinstall.cjs:269-320`
- **<anonymous>** — `postinstall.cjs:269-269`
- **error** — `postinstall.cjs:322-326`
- **main** — `reshape-model-for-npu.py:20-124`
- **CONFIG** — `build-faiss-node.js:27-38`
- **timestamp** — `build-faiss-node.js:45-45`
- **silent** — `build-faiss-node.js:60-60`
- **allowFail** — `build-faiss-node.js:61-61`
- **result** — `build-faiss-node.js:66-70`
- **file** — `build-faiss-node.js:95-95`
- **request** — `build-faiss-node.js:96-115`
- **version** — `build-faiss-node.js:137-137`
- **version** — `build-faiss-node.js:147-147`
- **version** — `build-faiss-node.js:158-158`
- **vswhere** — `build-faiss-node.js:168-168`
- **output** — `build-faiss-node.js:176-179`
- **version** — `build-faiss-node.js:182-182`
- **version** — `build-faiss-node.js:194-194`
- **vcpkgExe** — `build-faiss-node.js:203-203`
- **version** — `build-faiss-node.js:205-205`
- **openblasPath** — `build-faiss-node.js:214-214`
- **tempDir** — `build-faiss-node.js:237-237`
- **installerPath** — `build-faiss-node.js:240-240`
- **tempDir** — `build-faiss-node.js:265-265`
- **installerPath** — `build-faiss-node.js:268-268`
- **answer** — `build-faiss-node.js:298-298`
- **tempDir** — `build-faiss-node.js:304-304`
- **installerPath** — `build-faiss-node.js:307-307`
- **vcpkgExe** — `build-faiss-node.js:354-354`
- **openblasPath** — `build-faiss-node.js:362-362`
- **binPath** — `build-faiss-node.js:367-367`
- **vcpkgToolchain** — `build-faiss-node.js:371-371`
- **depsDir** — `build-faiss-node.js:401-401`
- **nodeModulesDir** — `build-faiss-node.js:402-402`
- **buildDir** — `build-faiss-node.js:403-403`
- **vcpkgToolchain** — `build-faiss-node.js:415-415`
- **builtAddon** — `build-faiss-node.js:434-434`
- **plat** — `build-faiss-node.js:440-440`
- **architecture** — `build-faiss-node.js:441-441`
- **targetDir** — `build-faiss-node.js:446-446`
- **targetPath** — `build-faiss-node.js:449-449`
- **readline** — `build-faiss-node.js:484-484`
- **rl** — `build-faiss-node.js:485-488`
- **nodeVersion** — `build-faiss-node.js:505-505`
- **abiVersion** — `build-faiss-node.js:506-506`
- **deps** — `build-faiss-node.js:519-527`
- **addonPath** — `build-faiss-node.js:556-556`
- **success** — `build-faiss-node.js:560-560`
- **BATCH_SIZE** — `build-global-embeddings.ts:30-30`
- **resp** — `build-global-embeddings.ts:38-38`
- **resp** — `build-global-embeddings.ts:42-42`
- **semanticConfig** — `build-global-embeddings.ts:52-52`
- **modelArg** — `build-global-embeddings.ts:55-55`
- **model** — `build-global-embeddings.ts:56-59`
- **modelSlug** — `build-global-embeddings.ts:61-61`
- **scriptDir** — `build-global-embeddings.ts:62-62`
- **outDir** — `build-global-embeddings.ts:63-63`
- **forceRebuild** — `build-global-embeddings.ts:67-67`
- **allFilesExist** — `build-global-embeddings.ts:68-70`
- **execSync** — `build-global-embeddings.ts:83-83`
- **{ execSync }** — `build-global-embeddings.ts:83-83`
- **providerKind** — `build-global-embeddings.ts:93-93`
- **genOptions** — `build-global-embeddings.ts:95-101`
- **serverUrl** — `build-global-embeddings.ts:108-112`
- **reachable** — `build-global-embeddings.ts:114-114`
- **gen** — `build-global-embeddings.ts:126-126`
- **dim** — `build-global-embeddings.ts:129-129`
- **entries** — `build-global-embeddings.ts:133-133`
- **seen** — `build-global-embeddings.ts:134-134`
- **uniqueEntries** — `build-global-embeddings.ts:135-140`
- **key** — `build-global-embeddings.ts:136-136`
- **hashToEmbedding** — `build-global-embeddings.ts:144-144`
- **hashToText** — `build-global-embeddings.ts:145-145`
- **generated** — `build-global-embeddings.ts:147-147`
- **i** — `build-global-embeddings.ts:148-148`
- **batch** — `build-global-embeddings.ts:149-149`
- **texts** — `build-global-embeddings.ts:150-150`
- **normalizedTexts** — `build-global-embeddings.ts:151-151`
- **embeddings** — `build-global-embeddings.ts:153-153`
- **j** — `build-global-embeddings.ts:155-155`
- **normalized** — `build-global-embeddings.ts:156-156`
- **hash** — `build-global-embeddings.ts:157-157`
- **textsRecord** — `build-global-embeddings.ts:170-170`
- **hashes** — `build-global-embeddings.ts:177-177`
- **buffer** — `build-global-embeddings.ts:178-178`
- **offset** — `build-global-embeddings.ts:179-179`
- **emb** — `build-global-embeddings.ts:181-181`
- **k** — `build-global-embeddings.ts:182-182`
- **hashesBin** — `build-global-embeddings.ts:191-191`
- **i** — `build-global-embeddings.ts:192-192`
- **entryCounts** — `build-global-embeddings.ts:198-198`
- **files** — `compare-benchmarks.ts:24-26`
- **benchmarks** — `compare-benchmarks.ts:34-37`
- **content** — `compare-benchmarks.ts:35-35`
- **nodeData** — `compare-benchmarks.ts:40-40`
- **bunData** — `compare-benchmarks.ts:41-41`
- **nodeMap** — `compare-benchmarks.ts:56-56`
- **bunMap** — `compare-benchmarks.ts:57-57`
- **allTests** — `compare-benchmarks.ts:60-60`
- **totalNodeTime** — `compare-benchmarks.ts:68-68`
- **totalBunTime** — `compare-benchmarks.ts:69-69`
- **comparisons** — `compare-benchmarks.ts:70-70`
- **nodeResult** — `compare-benchmarks.ts:73-73`
- **bunResult** — `compare-benchmarks.ts:74-74`
- **nodeMs** — `compare-benchmarks.ts:78-78`
- **bunMs** — `compare-benchmarks.ts:79-79`
- **speedup** — `compare-benchmarks.ts:80-80`
- **speedupStr** — `compare-benchmarks.ts:86-86`
- **overallSpeedup** — `compare-benchmarks.ts:104-104`
- **categories** — `compare-benchmarks.ts:118-129`
- **catNodeTime** — `compare-benchmarks.ts:132-132`
- **catBunTime** — `compare-benchmarks.ts:133-133`
- **count** — `compare-benchmarks.ts:134-134`
- **nodeResult** — `compare-benchmarks.ts:139-139`
- **bunResult** — `compare-benchmarks.ts:140-140`
- **speedup** — `compare-benchmarks.ts:149-149`
- **emoji** — `compare-benchmarks.ts:150-150`
- **HUGGINGFACE_BASE** — `convert-tokenizer-simple.ts:23-23`
- **REQUIRED_FILES** — `convert-tokenizer-simple.ts:26-36`
- **prefix** — `convert-tokenizer-simple.ts:43-48`
- **url** — `convert-tokenizer-simple.ts:67-67`
- **response** — `convert-tokenizer-simple.ts:72-72`
- **content** — `convert-tokenizer-simple.ts:83-83`
- **sizeMB** — `convert-tokenizer-simple.ts:86-86`
- **config** — `convert-tokenizer-simple.ts:103-103`
- **tokenizerJson** — `convert-tokenizer-simple.ts:106-123`
- **tokenizer** — `convert-tokenizer-simple.ts:147-147`
- **downloadedCount** — `convert-tokenizer-simple.ts:184-184`
- **tokenizerJsonDownloaded** — `convert-tokenizer-simple.ts:185-185`
- **outputPath** — `convert-tokenizer-simple.ts:188-188`
- **downloaded** — `convert-tokenizer-simple.ts:189-189`
- **configPath** — `convert-tokenizer-simple.ts:209-209`
- **tokenizerPath** — `convert-tokenizer-simple.ts:210-210`
- **generated** — `convert-tokenizer-simple.ts:213-213`
- **tokenizerPath** — `convert-tokenizer-simple.ts:231-231`
- **valid** — `convert-tokenizer-simple.ts:232-232`
- **files** — `convert-tokenizer-simple.ts:247-247`
- **filePath** — `convert-tokenizer-simple.ts:249-249`
- **stats** — `convert-tokenizer-simple.ts:250-250`
- **sizeMB** — `convert-tokenizer-simple.ts:251-251`
- **absPath** — `convert-tokenizer-simple.ts:261-261`
- **args** — `convert-tokenizer-simple.ts:282-282`
- **modelId** — `convert-tokenizer-simple.ts:297-297`
- **outputDir** — `convert-tokenizer-simple.ts:298-298`
- **success** — `convert-tokenizer-simple.ts:300-300`
- **OVMS_VERSION** — `install-ovms-native.ts:33-35`
- **c** — `install-ovms-native.ts:37-45`
- **localAppData** — `install-ovms-native.ts:65-66`
- **home** — `install-ovms-native.ts:69-69`
- **localAppData** — `install-ovms-native.ts:79-80`
- **home** — `install-ovms-native.ts:83-83`
- **baseUrl** — `install-ovms-native.ts:92-92`
- **ubuntuVersion** — `install-ovms-native.ts:103-103`
- **osRelease** — `install-ovms-native.ts:105-107`
- **response** — `install-ovms-native.ts:133-135`
- **totalSize** — `install-ovms-native.ts:141-141`
- **totalMB** — `install-ovms-native.ts:142-142`
- **fileStream** — `install-ovms-native.ts:146-146`
- **reader** — `install-ovms-native.ts:147-147`
- **downloadedSize** — `install-ovms-native.ts:153-153`
- **lastProgress** — `install-ovms-native.ts:154-154`
- **done** — `install-ovms-native.ts:157-157`
- **{ done, value }** — `install-ovms-native.ts:157-157`
- **progress** — `install-ovms-native.ts:163-163`
- **winArchive** — `install-ovms-native.ts:192-192`
- **winDest** — `install-ovms-native.ts:193-193`
- **result** — `install-ovms-native.ts:196-204`
- **stderr** — `install-ovms-native.ts:207-207`
- **scriptPath** — `install-ovms-native.ts:228-229`
- **ovmsBin** — `install-ovms-native.ts:231-231`
- **modelsPathArg** — `install-ovms-native.ts:234-234`
- **batchContent** — `install-ovms-native.ts:237-250`
- **shellContent** — `install-ovms-native.ts:253-266`
- **serviceContent** — `install-ovms-native.ts:282-296`
- **serviceDir** — `install-ovms-native.ts:298-298`
- **servicePath** — `install-ovms-native.ts:301-301`
- **ovmsBin** — `install-ovms-native.ts:313-313`
- **ovmsDir** — `install-ovms-native.ts:328-328`
- **modelsDir** — `install-ovms-native.ts:329-329`
- **readline** — `install-ovms-native.ts:340-340`
- **rl** — `install-ovms-native.ts:341-341`
- **answer** — `install-ovms-native.ts:343-348`
- **url** — `install-ovms-native.ts:360-360`
- **{ url, filename }** — `install-ovms-native.ts:360-360`
- **tempDir** — `install-ovms-native.ts:361-361`
- **archivePath** — `install-ovms-native.ts:362-362`
- **altUrl** — `install-ovms-native.ts:373-373`
- **extractTempDir** — `install-ovms-native.ts:392-392`
- **extractedOvms** — `install-ovms-native.ts:397-397`
- **sourceDir** — `install-ovms-native.ts:398-398`
- **result** — `install-ovms-native.ts:413-415`
- **startScript** — `install-ovms-native.ts:445-445`
- **ovmsBin** — `install-ovms-native.ts:459-459`
- **fs** — `patch-subsystem.cjs:2-2`
- **path** — `patch-subsystem.cjs:3-3`
- **buf** — `patch-subsystem.cjs:10-10`
- **peOffset** — `patch-subsystem.cjs:19-19`
- **optionalHeaderOffset** — `patch-subsystem.cjs:29-29`
- **magic** — `patch-subsystem.cjs:30-30`
- **subsystemOffset** — `patch-subsystem.cjs:34-34`
- **currentSubsystem** — `patch-subsystem.cjs:37-37`
- **subsystemNames** — `patch-subsystem.cjs:38-38`
- **dryRun** — `patch-subsystem.cjs:45-45`
- **__filename** — `postinstall-gpu.js:14-14`
- **__dirname** — `postinstall-gpu.js:15-15`
- **rootDir** — `postinstall-gpu.js:16-16`
- **COLORS** — `postinstall-gpu.js:18-26`
- **version** — `postinstall-gpu.js:71-74`
- **match** — `postinstall-gpu.js:75-75`
- **cudaVersion** — `postinstall-gpu.js:76-76`
- **installed** — `postinstall-gpu.js:99-99`
- **wasmDiffDir** — `postinstall-gpu.js:111-111`
- **wasmVectorDir** — `postinstall-gpu.js:112-112`
- **buildScript** — `postinstall-gpu.js:120-123`
- **buildCommand** — `postinstall-gpu.js:130-133`
- **success** — `postinstall-gpu.js:135-137`
- **cudaCheck** — `postinstall-gpu.js:154-154`
- **success** — `postinstall-gpu.js:181-181`
- **addonPath** — `postinstall-gpu.js:188-188`
- **results** — `postinstall-gpu.js:210-213`
- **backends** — `postinstall-gpu.js:231-244`
- **spawnSync** — `postinstall.cjs:13-13`
- **{ spawnSync }** — `postinstall.cjs:13-13`
- **existsSync** — `postinstall.cjs:14-14`
- **{ existsSync }** — `postinstall.cjs:14-14`
- **arch** — `postinstall.cjs:15-15`
- **{ arch, platform }** — `postinstall.cjs:15-15`
- **join** — `postinstall.cjs:16-16`
- **{ join }** — `postinstall.cjs:16-16`
- **readline** — `postinstall.cjs:17-17`
- **projectRoot** — `postinstall.cjs:19-19`
- **log** — `postinstall.cjs:22-22`
- **colors** — `postinstall.cjs:25-34`
- **width** — `postinstall.cjs:37-37`
- **border** — `postinstall.cjs:38-38`
- **metalPath** — `postinstall.cjs:76-76`
- **plat** — `postinstall.cjs:81-81`
- **rl** — `postinstall.cjs:92-95`
- **rl** — `postinstall.cjs:112-115`
- **skip** — `postinstall.cjs:126-126`
- **buildScript** — `postinstall.cjs:136-136`
- **result** — `postinstall.cjs:143-148`
- **shouldBuild** — `postinstall.cjs:179-179`
- **success** — `postinstall.cjs:183-183`
- **plat** — `postinstall.cjs:197-197`
- **architecture** — `postinstall.cjs:198-198`
- **platformInfo** — `postinstall.cjs:227-227`
- **shouldSkip** — `postinstall.cjs:277-277`
- **setupScript** — `postinstall.cjs:289-290`
- **setupJs** — `postinstall.cjs:293-293`
- **result** — `postinstall.cjs:295-298`
