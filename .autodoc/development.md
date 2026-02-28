# Development Guide

Consolidated documentation covering prerequisites, installation, build system, Bun runtime support, TypeScript configuration, and testing.

---

## Prerequisites

### Minimum Requirements

| Component | Minimum | Recommended | Source |
|-----------|---------|-------------|--------|
| Node.js | 24.x | 24.x LTS | https://nodejs.org/ |
| npm | 10.x | 10.x+ | Included with Node.js |
| Git | 2.x | latest | https://git-scm.com/ |
| Bun (optional) | 1.0+ | latest | https://bun.sh |

**Important**: Node.js 24 requires C++20, but tree-sitter uses C++17. The npm package includes precompiled prebuilds for all platforms.

### For CUDA Backend (Optional)

| Component | Version | Required | Source |
|-----------|---------|----------|--------|
| NVIDIA GPU | Compute Capability 7.0+ | Yes | GTX 1650+, RTX series |
| CUDA Toolkit | 11.0+ | Yes | https://developer.nvidia.com/cuda-downloads |
| Visual Studio Build Tools | 2019+ | Yes | https://visualstudio.microsoft.com/downloads/ |
| CMake | 3.18+ | Yes | https://cmake.org/download/ |

---

## Quick Start

### Windows

```powershell
git clone https://github.com/anthropic/ultracode.git
cd ultracode

# Run automatic setup
.\scripts\dev-setup.ps1

# Expected time: 10-30 minutes (depends on internet speed)
```

### Linux/macOS

```bash
git clone https://github.com/anthropic/ultracode.git
cd ultracode

chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

---

## Installation Steps

The setup script (`scripts/dev-setup.ps1` on Windows) performs the following steps:

### Step 1: Node.js Verification

Checks for `node` command and verifies version.

### Step 2: npm Dependencies

Runs `npm install`, installs all dependencies, and executes the postinstall script (GPU backend auto-configuration).

If network issues occur:
```powershell
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

### Step 3: Rust Toolchain

Checks for `rustc`. If not installed, download from https://rustup.rs/.

```powershell
# After installation, Rust is located at:
# C:\Users\<YourName>\.cargo\bin\   (Windows)
# $HOME/.cargo/bin                  (Linux/macOS)
```

### Step 4: wasm-pack

Checks for `wasm-pack`. If missing, auto-installs via `cargo install wasm-pack`.

### Step 5: WASM SIMD Module Build

Builds the WASM module with SIMD optimizations:

```bash
cd wasm/vector-ops
wasm-pack build --target nodejs --release
```

Output:
```
wasm/vector-ops/pkg/
  index.js          # JavaScript bindings
  index_bg.wasm     # WASM binary
  index.d.ts        # TypeScript declarations
  package.json
```

### Step 6: CUDA Toolkit Verification

- Checks for NVIDIA GPU via `nvidia-smi`
- Checks for `nvcc` (CUDA compiler)
- Auto-adds CUDA to PATH if found
- Verifies Visual Studio CUDA integration
- Verifies CUDA Development Headers

If Visual Studio CUDA integration is missing:
```powershell
# Auto-fix (recommended):
.\_ul\install-cuda-vs-integration.ps1
```

If CUDA Development Headers are missing: reinstall CUDA Toolkit with "CUDA -> Development" component selected via Custom Installation.

### Step 7: CMake Installation

Auto-installs CMake via winget (primary), chocolatey (fallback), or provides manual instructions.

### Step 8: WebGPU Support

Installs `@webgpu/node` and `@webgpu/types` as optional dependencies. WebGPU is optional -- project works without it.

### Step 9: TypeScript Build

```bash
npm run build    # Compiles TypeScript via tsup
```

### Step 10: Tests

```bash
npm test         # Runs all Jest tests
```

---

## Build System

### Build Commands

```bash
# Core build
npm run build              # Compile TypeScript via tsup
npm run build:watch        # Watch mode for development
npm run typecheck          # TypeScript type checking
npm run lint               # Biome linting
npm run lint:fix           # Auto-fix lint errors
npm run format             # Code formatting via Biome

# Native modules
npm run build:cuda         # CUDA backend (Windows PowerShell)
npm run build:cuda:debug   # Debug CUDA build
npm run build:cuda:clean   # Clean CUDA rebuild
npm run build:native       # All platforms (Windows + Linux via WSL)
npm run build:tree-sitter  # Tree-sitter prebuilds

# Quick builds
scripts\build-cuda-x64.bat       # Quick Windows CUDA build
bash scripts/build-linux-wsl.sh   # Quick Linux/WSL build

# Packaging
make package               # NPM package with metadata checks
.\scripts\pack-npm.ps1     # Pack with prebuilds
```

### Build Process (5 stages)

```
[1/5] TypeScript type check
[2/5] Main build (tsup)
[3/5] Setting up native toolchains
      - Auto-install Rust/wasm-pack if missing
      - Auto-install CMake if missing
      - Build WASM modules (if Rust available)
      - Build CUDA module (if CUDA Toolkit + CMake available)
[4/5] Build artifacts summary
[5/5] Build summary
```

### Tree-sitter Prebuilds (Node.js 24+)

**Problem**: Node.js 24 requires C++20, but tree-sitter compiles with C++17.

**Solution**: Precompiled native modules for all platforms.

```bash
# Windows
npm run build:tree-sitter

# Linux/macOS
bash scripts/build-tree-sitter-prebuilds.sh
```

The script automatically:
1. Patches `binding.gyp` files (C++17 -> C++20)
2. Rebuilds all tree-sitter modules (17 total)
3. Copies `.node` files to `external-libs/tree-sitter-{platform}-{arch}/`

Supported modules: tree-sitter, tree-sitter-javascript, tree-sitter-typescript, tree-sitter-python, tree-sitter-c, tree-sitter-cpp, tree-sitter-c-sharp, tree-sitter-go, tree-sitter-rust, tree-sitter-java, tree-sitter-kotlin, tree-sitter-swift, tree-sitter-ruby, tree-sitter-php, tree-sitter-bash, tree-sitter-json, tree-sitter-yaml.

### Output Structure

```
dist/
  index.js            # Main bundle (~2.5 MB)
  *.wasm              # WASM modules

external-libs/
  tree-sitter-win32-x64/     # ~26 MB, 17 files
  tree-sitter-linux-x64/
  tree-sitter-darwin-arm64/
  tree-sitter-darwin-x64/
  cuda-win32-x64/ultracode_cuda.node
  cuda-linux-x64/ultracode_cuda.node
```

---

## Build Warning: onnxruntime-web eval

During build, you may see:

```
dist/index.js (7841:22): Use of eval is strongly discouraged...
```

This is **safe to ignore**. It comes from Microsoft's `onnxruntime-web` library, not project code. The eval reconstructs `require()` for Node.js compatibility in ONNX Runtime's dynamic module loading. It is not a security risk.

---

## Bun Runtime Support

### Why Bun?

| Benefit | Details |
|---------|---------|
| Faster package install | ~3x faster than npm |
| Faster build | ~2x faster (built-in transpiler) |
| Native TypeScript | No separate compilation step needed |
| Drop-in replacement | Full Node.js compatibility |

### Installation

```bash
# Windows (winget - recommended)
winget install Oven-sh.Bun

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Linux/macOS
curl -fsSL https://bun.sh/install | bash
```

### Running the MCP Server

```bash
# Option 1: Run TypeScript directly (no build needed, great for development)
bun src/index.ts /path/to/project

# Option 2: Run compiled dist (recommended for production)
npm run build
bun dist/index.js /path/to/project

# Option 3: Node.js runtime (maximum compatibility)
node dist/index.js /path/to/project
```

### Performance Comparison

| Operation | npm/Node.js | Bun | Improvement |
|-----------|-------------|-----|-------------|
| `install` | 45s | 15s | **3x faster** |
| `run build` | 12s | 6s | **2x faster** |
| Startup time | 150ms | 60ms | **2.5x faster** |
| Memory usage | 120MB | 85MB | **-30%** |

### Runtime Benchmark Results

| Operation | Bun Speedup |
|-----------|-------------|
| File Read | 1.3-1.8x faster |
| fileExists | 3.8x faster |
| stat | 1.4x faster |
| readdir | 1.4x faster |
| glob | 1.4-1.6x faster |
| writeFile (>50KB, FileSink) | 3-4x faster |
| HTTP fetch | 1.7x faster |
| SHA-256 (CryptoHasher) | 2.8x faster |

### Bun-Specific APIs Used

The project uses Bun-optimized APIs with automatic Node.js fallback:

| Module | Description | Bun Optimization |
|--------|-------------|------------------|
| `src/utils/runtime.ts` | Runtime detection (Bun/Node/Deno) | - |
| `src/utils/file-ops.ts` | File operations | `Bun.file()`, `Bun.write()` |
| `src/utils/shell.ts` | Shell commands, Git helpers | `Bun.$` API |
| `src/utils/glob.ts` | Glob file search | `Bun.Glob` |

**Runtime detection pattern**:

```typescript
import { runtime, features } from "./utils/runtime.js";
if (runtime.isBun) { /* Bun-specific code */ }
```

**File operations (auto-selects best API)**:

```typescript
import { readText, writeFile, readJSON } from "./utils/file-ops.js";
const content = await readText("./file.txt");  // Uses Bun.file() under Bun
```

### SQLite Support

`src/storage/sqlite-adapter.ts` supports both runtimes:
- **Node.js**: Uses `better-sqlite3`
- **Bun**: Uses `bun:sqlite` (built-in, 3-6x faster)

Automatic selection via `BunDatabaseAdapter` with API compatibility.

### npm to Bun Command Migration

```bash
npm install            ->    bun install
npm install <package>  ->    bun add <package>
npm uninstall <pkg>    ->    bun remove <package>
npm run <script>       ->    bun run <script>
npm test               ->    bun test
npx <command>          ->    bunx <command>
```

---

## TypeScript Configuration

### Optimization Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| dist/ size | 192 MB | 95 MB | **-50%** |
| TS errors | 884 | 0 | Fixed |

### Size Reduction Options

**`target: "ESNext"` / `lib: ["ESNext"]`**: Minimal polyfills and transformations. Code generated close to native JS. No helpers needed for private fields, optional chaining, nullish coalescing, top-level await. Requires Node 18+ / Bun 1.0+.

**`importHelpers: true`**: -20-25% bundle size. Helpers (`__extends`, `__awaiter`, `__spread`) imported from `tslib` instead of duplicated in each file. Requires `tslib` dependency.

**`removeComments: true`**: -5-10% size. Removes all comments from generated JS.

### Runtime Performance Options

**`useDefineForClassFields: true`**: Faster class initialization. Uses modern class field syntax that V8 optimizes better.

**`verbatimModuleSyntax: true`**: Cleaner imports, better tree-shaking. Requires explicit `import type` for types.

**`isolatedModules: true`**: Improved tree-shaking. Each file compiled independently. Required for esbuild/swc/Bun compatibility. Disallows `const enum`, `export =`.

### Strict Mode Options

`strict: true` enables all strict checks:
- `noImplicitAny`
- `strictNullChecks`
- `strictFunctionTypes`
- `strictBindCallApply`
- `strictPropertyInitialization`
- `noImplicitThis`
- `alwaysStrict`

Additional strict options enabled:
- `noPropertyAccessFromIndexSignature` -- safer index signature access
- `noImplicitOverride` -- explicit `override` keyword required
- `useUnknownInCatchVariables` -- `unknown` instead of `any` in catch
- `noUncheckedIndexedAccess` -- arrays/objects return `T | undefined`
- `noUncheckedSideEffectImports` -- validates side-effect imports exist

### Full tsconfig.json

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "allowJs": true,

    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "verbatimModuleSyntax": true,

    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    "importHelpers": true,
    "removeComments": true,

    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "useDefineForClassFields": true,

    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "isolatedModules": true,

    "types": ["node", "bun"]
  }
}
```

---

## Testing

### Test Infrastructure

**Jest-based testing** with ES modules support:

```bash
npm test                # Run all tests
npm run test:verbose    # Verbose output
npm run test:watch      # Watch mode
npm run test:coverage   # Code coverage
npm run test:quiet      # Minimal output
```

### Test Locations

```
tests/                   # Main integration tests
src/**/__tests__/        # Unit tests alongside code
tests/fixtures/          # Test data
```

### Configuration

- `jest.config.js` -- Jest config with ESM support
- `jest.setup.js` -- Global mocks and setup
- `tsconfig.test.json` -- TypeScript config for tests

### Notes

- `maxWorkers: 1` -- tests run sequentially (SQLite constraints)
- Mocks: `src/__mocks__/` -- nanoid, p-limit, connection-pool
- Coverage: aim to maintain current coverage levels

### Running Benchmarks

```bash
npx tsx scripts/benchmark-runtime.ts  # Node.js
bun scripts/benchmark-runtime.ts       # Bun
npx tsx scripts/compare-benchmarks.ts  # Compare results
```

---

## Build Troubleshooting

### "Command not found" after installation

The program was installed but is not in PATH, or PATH was not updated in the current session.

```powershell
# Restart PowerShell, or refresh PATH:
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
```

### CMake cannot find CUDA

CUDA_PATH environment variable is not set.

```powershell
# Check:
[System.Environment]::GetEnvironmentVariable("CUDA_PATH", "Machine")

# Set manually:
[System.Environment]::SetEnvironmentVariable("CUDA_PATH", "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0", "Machine")
```

### "No CUDA toolset found"

Visual Studio CUDA integration files are missing.

```powershell
.\_ul\install-cuda-vs-integration.ps1
```

### "cuda_runtime.h: No such file or directory"

CUDA Development Headers are not installed. Reinstall CUDA Toolkit with "CUDA -> Development" component.

### Peer dependency warnings during npm install

Tree-sitter grammars have outdated peerDependencies on tree-sitter 0.21.x, but the API is compatible with 0.25.x. Safe to ignore.

```bash
npm install --legacy-peer-deps    # Suppresses warnings
```

### "Native module mismatch"

Rebuild better-sqlite3:

```bash
npm rebuild better-sqlite3
```

### Bun "command not found" after installation

```powershell
# Windows: Restart terminal, check PATH
# Bun installs to: C:\Users\<user>\.bun\bin

# Linux/macOS: Add to shell config
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

---

## Code Style

- **TypeScript strict mode** enabled
- **Biome** for linting and formatting (`.biome.json`)
- **Naming conventions**: kebab-case files, PascalCase classes, camelCase variables
- **Git hooks**: pre-commit runs `lint-staged` + `typecheck`

---

## Key Source Files

| File | Purpose |
|------|---------|
| `tsup.config.ts` | Build configuration (externals) |
| `jest.config.js` | Test configuration |
| `tsconfig.json` | TypeScript compiler options |
| `.biome.json` | Linter and formatter settings |
| `package.json` | Scripts and dependencies |
| `scripts/dev-setup.ps1` | Windows setup script |
| `scripts/build.cmd` | Windows build script |
| `scripts/build.sh` | Linux/macOS build script |
