# Native Module Build Guide

Руководство по сборке нативных модулей для UltraScript Tools MCP.

> **Важно**: Node.js 24+ требует C++20, но tree-sitter использует C++17. npm-пакет включает прекомпилированные prebuilds для всех платформ.

Скрипты `build.sh` и `build.cmd` **автоматически устанавливают** необходимые тулчейны для сборки нативных модулей.

## Quick Start

```bash
# Windows - сборка в dist/
.\scripts\build.cmd

# Linux/macOS - сборка в dist/
bash scripts/build.sh

# Упаковка npm пакета с prebuilds
.\scripts\pack-npm.cmd          # или pack-npm.ps1 -Apply -Publish
```

## Tree-sitter Prebuilds (Node.js 24+)

**Проблема**: Node.js 24 требует C++20, но tree-sitter компилируется с C++17. Это вызывает ошибки при `npm install`.

**Решение**: Прекомпилированные native модули (`prebuilds`) для всех платформ.

### Структура prebuilds

```
external-libs/
├── tree-sitter-win32-x64/      # Windows x64 (~26 MB)
│   ├── tree-sitter.node
│   ├── tree-sitter-javascript.node
│   ├── tree-sitter-typescript.node
│   └── ... (17 файлов)
├── tree-sitter-linux-x64/      # Linux x64
├── tree-sitter-darwin-arm64/   # macOS Apple Silicon
└── tree-sitter-darwin-x64/     # macOS Intel
```

### Сборка prebuilds

```bash
# Windows
npm run build:tree-sitter
# или
powershell scripts/build-tree-sitter-prebuilds.ps1

# Linux/macOS
bash scripts/build-tree-sitter-prebuilds.sh
```

Скрипт автоматически:
1. Патчит `binding.gyp` файлы (C++17 → C++20)
2. Пересобирает все tree-sitter модули
3. Копирует `.node` файлы в `external-libs/`

### Автоматический выбор prebuild

Loader в `src/parsers/tree-sitter-parser.ts`:
1. Ищет prebuilds в `external-libs/tree-sitter-{platform}-{arch}/`
2. Если не найдены → fallback на npm версию

### CI/CD сборка

GitHub Actions workflow (`.github/workflows/build-prebuilds.yml`):
- Собирает prebuilds на Windows, Linux, macOS (x64 + ARM64)
- Артефакты доступны для скачивания

---

## Что устанавливается автоматически

### ✅ Rust + wasm-pack (для WASM модулей)
- **Размер**: ~200MB (Rust toolchain)
- **Время установки**: 3-5 минут
- **Метод**:
  - Скачивается и запускается [rustup](https://rustup.rs/)
  - Устанавливает Rust stable toolchain
  - Устанавливает wasm-pack через `cargo install`
- **Требования**: Интернет-соединение
- **Результат**: WASM модули с SIMD → **3-10x быстрее** векторных операций

### ✅ CMake (для CUDA модулей)
- **Размер**: ~50MB
- **Время установки**: 1-3 минуты
- **Методы установки**:
  - **Linux**: `apt-get install cmake`
  - **macOS**: `brew install cmake`
  - **Windows**: `winget install Kitware.CMake` (или `choco install cmake`)
- **Требования**:
  - Linux: sudo права
  - macOS: Homebrew
  - Windows: winget (Windows 10+) или Chocolatey

### ⚠️ CUDA Toolkit (НЕ устанавливается автоматически)
- **Размер**: ~3GB
- **Время установки**: 10-30 минут
- **Требования**: Admin права, NVIDIA GPU
- **Установка**: Только вручную из-за большого размера
- **Результат**: GPU ускорение → **10-50x быстрее** embeddings

**Скачать CUDA Toolkit**: https://developer.nvidia.com/cuda-downloads

## Использование

### Запуск сборки

**Unix/Linux/macOS:**
```bash
bash Dev.Scripts/build-bun.sh
```

**Windows:**
```cmd
Dev.Scripts\build-bun.cmd
```

### Процесс сборки (5 этапов)

```
[1/5] TypeScript type check
[2/5] Main build (tsup)
[3/5] Setting up native toolchains
      → Auto-install Emscripten if missing
      → Auto-install CMake if missing
      → Build WASM modules (if Emscripten available)
      → Build CUDA module (if CUDA Toolkit + CMake available)
[4/5] Build artifacts summary
[5/5] Build summary
```

## Примеры вывода

### Успешная сборка со всеми модулями:
```
[5/5] Build summary:

Core build: ✓ Success
WASM modules: ✓ Built
CUDA module: ✓ Built

Performance optimizations:
  ✓ WASM SIMD: 3-10x faster vector operations
  ✓ CUDA GPU: 10-50x faster embeddings
```

### Первая сборка (автоматическая установка):
```
[3/5] Setting up native toolchains...

[INFO] Rust not found, installing via rustup...
  - Downloading rustup-init.exe...
  - Running Rust installer...
  - This will install Rust and Cargo (~1-2 minutes)

[OK] Rust installed successfully
[INFO] Cargo added to PATH for current session

[INFO] wasm-pack not found, installing...
  → Installing wasm-pack via cargo (~1-2 minutes)...
[OK] wasm-pack installed successfully

[INFO] Building WASM modules with Rust/wasm-pack...
========================================
Building WASM modules with SIMD support
========================================
✅ Prerequisites installed
📦 Building wasm/diff-simd...
✅ diff-simd built successfully
📦 Building wasm/vector-ops-simd...
✅ vector-ops-simd built successfully
[OK] WASM modules built successfully

[INFO] CMake not found, attempting to install...
  → Installing CMake via winget...
[OK] CMake installed successfully
[INFO] Please restart this script to use CMake

[INFO] CUDA Toolkit detected
[WARNING] native\cuda directory not found
[INFO] CUDA module source code not included in this version
```

**Важно**: После первой установки CMake нужно **перезапустить скрипт** для обновления PATH (только если планируете использовать CUDA).

### Вторая сборка (всё уже установлено):
```
[3/5] Setting up native toolchains...

[INFO] Building WASM modules with Rust/wasm-pack...
[OK] WASM modules built successfully

[INFO] CUDA Toolkit detected
[WARNING] native\cuda directory not found
[INFO] CUDA module source code not included in this version
```

### Сборка без CUDA (нормальная ситуация):
```
[SKIP] CUDA Toolkit not found

To enable GPU acceleration (10-50x faster):
  1. Download CUDA Toolkit: https://developer.nvidia.com/cuda-downloads
  2. Install CUDA Toolkit (~3GB, requires admin rights)
  3. Re-run this build script
```

## Структура директорий

```
ultrascript-tools-mcp/
├── tools/                    # Автоматически установленные тулчейны
│   └── emsdk/               # Emscripten SDK (если установлен)
├── native/
│   └── cuda/                # CUDA модуль (требует CUDA Toolkit)
├── wasm/                    # WASM модули
└── dist/                    # Результат сборки
    ├── index.js            # Main bundle
    ├── *.node              # Native модули (CUDA)
    └── *.wasm              # WASM модули
```

**Примечание**: Директория `tools/` автоматически игнорируется в `.gitignore`

## Требования

### Минимальные (CPU режим)
- Bun или Node.js
- Git
- ~100MB свободного места

### Рекомендуемые (WASM ускорение)
- Все минимальные требования
- Rust + wasm-pack (устанавливается автоматически)
- ~500MB свободного места (для Rust toolchain)
- Результат: 3-10x быстрее

### Максимальные (GPU ускорение)
- Все рекомендуемые требования
- NVIDIA GPU с поддержкой CUDA
- CUDA Toolkit (~3GB, только вручную)
- ~5GB свободного места
- Результат: 10-50x быстрее

## Troubleshooting

### Peer dependency warnings при npm install

При установке tree-sitter грамматик появляются warnings:
```
npm warn ERESOLVE overriding peer dependency
```

Это **безопасно** — грамматики имеют устаревшие peerDependencies на tree-sitter 0.21.x, но API совместим с 0.25.x. Варианты решения:
- Игнорировать warnings (API совместим)
- Использовать `npm install --legacy-peer-deps`
- Локально: создать `.npmrc` с `legacy-peer-deps=true`

### Rust установка не удалась
**Windows:**
```cmd
REM Скачайте rustup вручную
powershell -Command "Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile %TEMP%\rustup-init.exe"
%TEMP%\rustup-init.exe
```

**Unix/Linux/macOS:**
```bash
# Установите Rust вручную
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Обновите PATH
source $HOME/.cargo/env
```

### wasm-pack не найден после установки
```bash
# Установите wasm-pack вручную
cargo install wasm-pack

# Проверьте что cargo в PATH
which cargo  # Unix
where cargo  # Windows

# Если нет, добавьте в PATH:
# Windows: %USERPROFILE%\.cargo\bin
# Unix: $HOME/.cargo/bin
```

### WASM сборка падает с ошибкой
```bash
# Проверьте что все инструменты установлены
cargo --version
wasm-pack --version

# Попробуйте собрать вручную
bash scripts/build-wasm.sh
```

### CUDA модуль не собирается
1. Проверьте наличие CUDA Toolkit: `nvidia-smi`
2. Проверьте наличие CMake: `cmake --version`
3. Проверьте наличие директории: `ls native/cuda`

## Performance Impact

| Режим | Векторные операции | Embeddings | Рекомендация |
|-------|-------------------|-----------|--------------|
| CPU только | Baseline | Baseline | Для небольших проектов |
| CPU + WASM | **3-10x быстрее** | Baseline | Для средних проектов |
| CPU + WASM + CUDA | **3-10x быстрее** | **10-50x быстрее** | Для больших проектов |

## Для разработчиков

### Пропустить автоматическую установку
Если вы хотите контролировать установку вручную:
1. Установите Emscripten самостоятельно
2. Установите CMake самостоятельно
3. Запустите скрипт - он обнаружит установленные тулчейны

### Проверить наличие тулчейнов
```bash
# Rust
cargo --version
rustc --version

# wasm-pack
wasm-pack --version

# CMake
cmake --version

# CUDA
nvcc --version
nvidia-smi
```

### Очистка
```bash
# Удалить собранные модули
rm -rf dist/
rm -rf wasm/diff-simd/target/
rm -rf wasm/vector-ops-simd/target/
rm -rf native/cuda/build/

# Удалить кэши Rust
cargo clean

# Полная переустановка Rust (если нужно)
rustup self uninstall
```
