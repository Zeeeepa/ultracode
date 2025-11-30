# Developer Setup Guide - Полное руководство

## 📋 Оглавление

1. [Предварительные требования](#предварительные-требования)
2. [Быстрый старт](#быстрый-старт)
3. [Автоматическая установка (оптимистический сценарий)](#автоматическая-установка-оптимистический-сценарий)
4. [Ручная установка (пессимистический сценарий)](#ручная-установка-пессимистический-сценарий)
5. [Диагностика проблем](#диагностика-проблем)
6. [Проверка установки](#проверка-установки)

---

## Предварительные требования

### Минимальные требования:

| Компонент | Минимум | Рекомендуется | Где взять |
|-----------|---------|---------------|-----------|
| Node.js | 24.x | 24.x LTS | https://nodejs.org/ |
| npm | 10.x | 10.x+ | Идёт с Node.js |
| Git | 2.x | latest | https://git-scm.com/ |
| Bun (опционально) | 1.0+ | latest | https://bun.sh |

> **Важно**: Node.js 24 требует C++20, но tree-sitter использует C++17. npm-пакет включает прекомпилированные prebuilds для всех платформ.

### Для CUDA backend (опционально):

| Компонент | Версия | Обязательно | Где взять |
|-----------|--------|-------------|-----------|
| NVIDIA GPU | Compute Capability 7.0+ | Да | GTX 1650+, RTX серия |
| CUDA Toolkit | 11.0+ | Да | https://developer.nvidia.com/cuda-downloads |
| Visual Studio Build Tools | 2019+ | Да | https://visualstudio.microsoft.com/downloads/ |
| CMake | 3.18+ | Да | https://cmake.org/download/ |

---

## Быстрый старт

### Windows:

```powershell
# Клонировать репозиторий
git clone https://github.com/your-org/ultrascript-tools-mcp.git
cd ultrascript-tools-mcp

# Запустить автоматическую установку
.\scripts\dev-setup.ps1

# Ожидаемое время: 10-30 минут (зависит от скорости интернета)
```

### Linux/macOS:

```bash
# Клонировать репозиторий
git clone https://github.com/your-org/ultrascript-tools-mcp.git
cd ultrascript-tools-mcp

# Запустить автоматическую установку
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh

# Ожидаемое время: 10-30 минут
```

---

## Автоматическая установка (оптимистический сценарий)

Скрипт `scripts/dev-setup.ps1` (Windows) выполняет следующие шаги:

### Step 1: Проверка Node.js ✅

**Что делает:**
- Проверяет наличие команды `node`
- Выводит текущую версию

**Оптимистический сценарий:**
```
📦 Step 1: Checking Node.js...
✅ Node.js v24.x.x
```

**Пессимистический сценарий:**
```
📦 Step 1: Checking Node.js...
❌ Node.js not found!
   Install from: https://nodejs.org/
```

**Действия при ошибке:**
1. Скачать Node.js LTS с https://nodejs.org/
2. Запустить installer (выбрать "Add to PATH")
3. Перезапустить PowerShell
4. Запустить `dev-setup.ps1` снова

---

### Step 2: Установка npm dependencies ✅

**Что делает:**
- Запускает `npm install`
- Устанавливает все зависимости из package.json
- Запускает postinstall скрипт (GPU backend auto-configuration)

**Оптимистический сценарий:**
```
📦 Step 2: Installing npm dependencies...
up to date in 14s
112 packages installed
```

**Пессимистический сценарий:**
```
📦 Step 2: Installing npm dependencies...
npm ERR! network timeout
npm ERR! network This is a problem related to network connectivity.
```

**Действия при ошибке:**
1. Проверить интернет-соединение
2. Попробовать другую сеть
3. Настроить npm proxy если нужно:
   ```powershell
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```
4. Запустить `npm install` вручную

---

### Step 3: Проверка Rust toolchain ✅

**Что делает:**
- Проверяет наличие команды `rustc`
- Выводит версию Rust

**Оптимистический сценарий:**
```
🦀 Step 3: Checking Rust toolchain...
✅ Rust rustc 1.91.1 (ed61e7d7e 2025-11-07)
```

**Пессимистический сценарий:**
```
🦀 Step 3: Checking Rust toolchain...
⚠️  Rust not installed
   Please install from: https://rustup.rs/
   Download: https://win.rustup.rs/x86_64
   After installation, restart PowerShell and run this script again
```

**Действия при ошибке:**
1. Скачать rustup-init.exe с https://win.rustup.rs/x86_64
2. Запустить installer
3. Выбрать "1) Proceed with installation (default)"
4. **Важно**: Закрыть и открыть новый PowerShell
5. Проверить: `rustc --version`

**Где искать если установилось:**
```powershell
# Rust обычно устанавливается в:
C:\Users\<YourName>\.cargo\bin\

# Проверить PATH:
$env:Path -split ';' | Select-String -Pattern 'cargo'

# Если не в PATH, добавить:
$env:Path += ";$env:USERPROFILE\.cargo\bin"
[Environment]::SetEnvironmentVariable("Path", $env:Path, "User")
```

---

### Step 4: Проверка wasm-pack ✅

**Что делает:**
- Проверяет наличие `wasm-pack`
- Если нет - автоматически устанавливает через `cargo install wasm-pack`

**Оптимистический сценарий:**
```
📦 Step 4: Checking wasm-pack...
✅ wasm-pack 0.13.1
```

**Пессимистический сценарий (автоустановка):**
```
📦 Step 4: Checking wasm-pack...
⚠️  wasm-pack not installed - installing...
[cargo install wasm-pack может занять 5-10 минут]
✅ wasm-pack installed
```

**Пессимистический сценарий (нет Rust):**
```
📦 Step 4: Checking wasm-pack...
⚠️  Rust not installed - wasm-pack cannot be installed
   Please install Rust first from: https://rustup.rs/
```

**Действия при ошибке:**
1. Убедиться что Rust установлен (Step 3)
2. Вручную установить: `cargo install wasm-pack`
3. Проверить: `wasm-pack --version`

**Где искать:**
```powershell
# wasm-pack устанавливается в:
C:\Users\<YourName>\.cargo\bin\wasm-pack.exe

# Проверить:
Get-Command wasm-pack -ErrorAction SilentlyContinue
```

---

### Step 5: Сборка WASM SIMD module ✅

**Что делает:**
- Переходит в `wasm/vector-ops/`
- Запускает `wasm-pack build --target nodejs --release`
- Компилирует Rust → WASM с SIMD оптимизациями
- Создаёт `wasm/vector-ops/pkg/` с JavaScript bindings

**Оптимистический сценарий:**
```
🔨 Step 5: Building WASM SIMD module...
✅ WASM module built (4-8x speedup)
```

**Пессимистический сценарий:**
```
🔨 Step 5: Building WASM SIMD module...
error: could not compile `vector-ops`
⚠️  WASM build failed
```

**Действия при ошибке:**
1. Проверить wasm-pack версию: должна быть 0.13.0+
2. Очистить и пересобрать:
   ```powershell
   cd wasm\vector-ops
   Remove-Item -Recurse -Force target\, pkg\ -ErrorAction SilentlyContinue
   wasm-pack build --target nodejs --release
   ```
3. Проверить наличие `wasm/vector-ops/pkg/index.js`

**Где искать результат:**
```
wasm/vector-ops/pkg/
├── index.js          ← JavaScript bindings
├── index_bg.wasm     ← WASM binary
├── index_bg.wasm.d.ts
├── index.d.ts
└── package.json
```

---

### Step 6: Проверка CUDA Toolkit ⚡

**Что делает:**
- Проверяет наличие NVIDIA GPU через `nvidia-smi`
- Проверяет наличие `nvcc` (CUDA compiler)
- Проверяет версию CUDA Toolkit
- **Автоматически добавляет CUDA в PATH** если найден
- Проверяет Visual Studio CUDA integration
- **Проверяет наличие CUDA Development Headers**

**Оптимистический сценарий (всё готово):**
```
🚀 Step 6: Checking CUDA Toolkit...
✅ NVIDIA GPU detected
   NVIDIA GeForce GTX 1650 Ti
✅ CUDA Toolkit 13.0 detected
✅ CMake detected: cmake version 4.1.2

🔍 Checking CUDA PATH configuration...
✅ nvcc already in PATH

🔍 Checking Visual Studio CUDA integration...
✅ Visual Studio CUDA integration found

🔍 Checking CUDA Development Headers...
✅ CUDA Development Headers found (1511 headers)

✅ Visual Studio detected
🔨 Building CUDA native addon...
✅ CUDA backend built successfully (100-200x speedup)
```

**Пессимистический сценарий 1 (GPU не найден):**
```
🚀 Step 6: Checking CUDA Toolkit...
⚠️  NVIDIA GPU not detected - skipping CUDA
```

**Действия:** Это нормально если нет NVIDIA GPU. CUDA опционален.

**Пессимистический сценарий 2 (CUDA не в PATH):**
```
🚀 Step 6: Checking CUDA Toolkit...
✅ NVIDIA GPU detected
✅ CUDA Toolkit 13.0 detected

🔍 Checking CUDA PATH configuration...
⚠️  CUDA found but not in PATH - adding...
✅ CUDA added to PATH permanently
   (Restart PowerShell to apply for other sessions)
✅ nvcc is now accessible
```

**Действия:** Скрипт автоматически добавил в PATH, но нужно перезапустить PowerShell.

**Пессимистический сценарий 3 (VS CUDA integration отсутствует):**
```
🔍 Checking Visual Studio CUDA integration...
⚠️  Visual Studio CUDA integration NOT found

   CUDA backend requires Visual Studio CUDA support.
   Choose one of these options:

   Option 1: Modify Visual Studio (Recommended)
      1. Run Visual Studio Installer
      2. Click 'Modify' on VS 2022 Build Tools/Community
      3. Go to 'Individual components'
      4. Search and check:
         ✓ 'MSVC v143 - VS 2022 C++ x64/x86 build tools'
         ✓ 'C++ CMake tools for Windows'
      5. Install and restart PowerShell

   Option 2: Install Visual Studio Community (Full)
      winget install Microsoft.VisualStudio.2022.Community
      (Includes CUDA support by default)

   Option 3: Use Ninja generator (Alternative)
      winget install Ninja-build.Ninja
      (Doesn't require VS CUDA integration)

   For detailed instructions: cat _ul/CUDA_BUILD_FIX.md
```

**Действия:**
1. **Автоматический фикс** (рекомендуется):
   ```powershell
   .\_ul\install-cuda-vs-integration.ps1
   ```
   Этот скрипт скопирует CUDA integration файлы из CUDA Toolkit в Visual Studio.

2. **Ручной фикс** (если автоматический не сработал):
   - Вариант A: Modify VS через Installer (см. инструкции выше)
   - Вариант B: Установить полную VS Community
   - Вариант C: Использовать Ninja generator

**Где искать CUDA integration файлы:**
```powershell
# Источник (CUDA Toolkit):
C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\extras\visual_studio_integration\MSBuildExtensions\
├── CUDA 13.0.props
├── CUDA 13.0.targets
├── CUDA 13.0.xml
├── CUDA 13.0.Version.props
└── Nvda.Build.CudaTasks.v13.0.dll

# Назначение (Visual Studio):
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\
(должны быть те же файлы)
```

**Пессимистический сценарий 4 (CUDA Development Headers отсутствуют):**
```
🔍 Checking CUDA Development Headers...
❌ CUDA Development Headers NOT found
   Expected: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include\cuda_runtime.h

   CUDA Development components are required for native build.
   Action: Reinstall CUDA Toolkit with 'Development' components

   Quick fix:
   1. Download CUDA Toolkit from:
      https://developer.nvidia.com/cuda-downloads
   2. Run installer → Custom Installation
   3. Check: 'CUDA → Development' and 'Visual Studio Integration'
   4. Complete installation

   For detailed instructions: cat _ul\CUDA_HEADERS_MISSING.md
```

**Действия:**
1. Переустановить CUDA Toolkit:
   - Скачать с https://developer.nvidia.com/cuda-13-0-download-archive
   - Запустить installer
   - Выбрать **Custom Installation** (НЕ Express!)
   - Отметить:
     - ✅ CUDA → Development
     - ✅ CUDA → Runtime
     - ✅ Visual Studio Integration
   - Завершить установку

2. Проверить установку:
   ```powershell
   Test-Path "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include\cuda_runtime.h"
   # Должно вернуть: True

   (Get-ChildItem "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include\" -Recurse -Filter "*.h").Count
   # Должно быть >100 (обычно ~1500)
   ```

**Где искать CUDA компоненты:**
```
C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\
├── bin\
│   ├── nvcc.exe          ← CUDA compiler
│   ├── cuda-gdb.exe
│   └── ...
├── include\
│   ├── cuda_runtime.h    ← КРИТИЧНО! Должен быть!
│   ├── cuda.h
│   ├── device_launch_parameters.h
│   └── ... (>1500 файлов)
├── lib\x64\
│   ├── cudart.lib
│   └── ...
└── extras\
    └── visual_studio_integration\
```

---

### Step 7: Установка CMake ✅

**Что делает:**
- Проверяет наличие `cmake`
- Если нет - **автоматически устанавливает** через cascading методы:
  1. **winget** (встроен в Windows 10/11)
  2. **chocolatey** (fallback)
  3. **manual** (показывает инструкции)

**Оптимистический сценарий (уже установлен):**
```
✅ CMake detected: cmake version 4.1.2
```

**Оптимистический сценарий (автоустановка через winget):**
```
⚠️  CMake not installed - attempting automatic installation...
📦 Installing CMake via winget...
[winget устанавливает CMake]
✅ CMake installed successfully via winget
```

**Пессимистический сценарий (winget failed, trying chocolatey):**
```
⚠️  CMake not installed - attempting automatic installation...
📦 Installing CMake via winget...
⚠️  winget installation failed, trying chocolatey...
📦 Installing CMake via Chocolatey...
✅ CMake installed successfully via Chocolatey
```

**Пессимистический сценарий (всё failed, manual):**
```
⚠️  CMake not installed - attempting automatic installation...
📦 Installing CMake via winget...
⚠️  winget installation failed, trying chocolatey...
📦 Installing CMake via Chocolatey...
⚠️  Chocolatey installation failed

❌ Automatic installation failed - manual installation required

Please install CMake manually:
   1. Download from: https://cmake.org/download/
      (Windows x64 Installer: cmake-X.X.X-windows-x86_64.msi)
   2. Run the installer
   3. ✅ Check 'Add CMake to system PATH'
   4. Restart PowerShell and run this script again

Alternative package managers:
   - winget: winget install --id Kitware.CMake
   - choco:  choco install cmake
```

**Действия при ошибке:**
1. **Ручная установка**:
   - Скачать https://cmake.org/download/ (Windows x86_64 Installer)
   - Запустить .msi
   - **ВАЖНО**: Отметить "Add CMake to system PATH for all users"
   - Завершить установку
   - Перезапустить PowerShell

2. **Проверка установки**:
   ```powershell
   cmake --version
   # Должно вывести: cmake version X.X.X
   ```

**Где искать CMake:**
```powershell
# CMake обычно устанавливается в:
C:\Program Files\CMake\bin\cmake.exe

# Проверить PATH:
$env:Path -split ';' | Select-String -Pattern 'CMake'

# Если не в PATH, добавить:
$cmakeBin = "C:\Program Files\CMake\bin"
$env:Path += ";$cmakeBin"
[Environment]::SetEnvironmentVariable("Path", "$env:Path", "User")
```

**Использовать fix скрипт:**
```powershell
.\_ul\fix-cmake-path.ps1
```

---

### Step 8: Установка WebGPU support ✅

**Что делает:**
- Устанавливает `@webgpu/node` и `@webgpu/types` как optional dependencies

**Оптимистический сценарий:**
```
🎨 Step 7: Installing WebGPU support...
✅ WebGPU support installed
```

**Пессимистический сценарий:**
```
🎨 Step 7: Installing WebGPU support...
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: @webgpu/node
```

**Действия:** WebGPU опционален, можно продолжать без него.

---

### Step 9: Сборка TypeScript ✅

**Что делает:**
- Запускает `npm run build`
- Компилирует TypeScript через `tsup`
- Создаёт `dist/` директорию с скомпилированным кодом

**Оптимистический сценарий:**
```
🔨 Step 8: Building TypeScript...
✅ TypeScript compiled
```

**Пессимистический сценарий:**
```
🔨 Step 8: Building TypeScript...
error TS2322: Type 'string' is not assignable to type 'number'
⚠️  TypeScript build failed
```

**Действия при ошибке:**
1. Проверить TypeScript errors
2. Запустить typecheck: `npm run typecheck`
3. Исправить ошибки в коде
4. Пересобрать: `npm run build`

---

### Step 10: Запуск тестов ✅

**Что делает:**
- Запускает `npm test`
- Прогоняет все unit и integration тесты

**Оптимистический сценарий:**
```
🧪 Step 9: Running tests...
✅ All tests passed
```

**Пессимистический сценарий:**
```
🧪 Step 9: Running tests...
FAIL tests/semantic/vector-store.test.ts
⚠️  Some tests failed (check above)
```

**Действия при ошибке:**
1. Проверить лог тестов
2. Исправить failing tests
3. Перезапустить: `npm test`

---

## Ручная установка (пессимистический сценарий)

Если автоматический скрипт полностью failed, выполните вручную:

### 1. Node.js

```powershell
# Скачать и установить
# https://nodejs.org/en/download/

# Проверка
node --version  # должно быть >= 18.x
npm --version   # должно быть >= 8.x
```

### 2. Rust + wasm-pack

```powershell
# Скачать rustup-init.exe
# https://win.rustup.rs/x86_64

# Запустить installer
.\rustup-init.exe

# Установить wasm-pack
cargo install wasm-pack

# Проверка
rustc --version
wasm-pack --version
```

### 3. CMake

```powershell
# Option A: winget
winget install --id Kitware.CMake -e

# Option B: chocolatey
choco install cmake -y

# Option C: manual
# https://cmake.org/download/ → Windows x86_64 Installer

# Проверка
cmake --version  # должно быть >= 3.18
```

### 4. Visual Studio Build Tools (для CUDA)

```powershell
# Option A: Build Tools только
winget install Microsoft.VisualStudio.2022.BuildTools

# После установки через VS Installer → Modify:
# - Individual components
#   ✓ MSVC v143 - VS 2022 C++ x64/x86 build tools
#   ✓ C++ CMake tools for Windows

# Option B: Visual Studio Community (полная)
winget install Microsoft.VisualStudio.2022.Community
```

### 5. CUDA Toolkit (для CUDA backend)

```powershell
# Скачать
# https://developer.nvidia.com/cuda-13-0-download-archive
# Windows → x86_64 → 10/11 → exe (local)

# Запустить installer
# ✅ Выбрать: Custom Installation
# ✅ Отметить:
#    - CUDA → Development ← КРИТИЧНО!
#    - CUDA → Runtime
#    - Visual Studio Integration ← КРИТИЧНО!

# Проверка
nvcc --version
Test-Path "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include\cuda_runtime.h"
```

### 6. Установка VS CUDA integration (если пропущено)

```powershell
# Автоматически скопировать файлы
.\_ul\install-cuda-vs-integration.ps1

# Проверка
Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\" -Filter "CUDA*"
# Должны быть: CUDA 13.0.props, .targets, .xml, .dll, .Version.props
```

### 7. Сборка проекта

```powershell
# npm dependencies
npm install

# TypeScript
npm run build

# WASM SIMD (опционально)
cd wasm\vector-ops
wasm-pack build --target nodejs --release
cd ..\..

# CUDA backend (опционально, требует всё вышеперечисленное)
npm run build:cuda

# Тесты
npm test
```

---

## Диагностика проблем

### Инструменты диагностики:

```powershell
# Полная диагностика CUDA
.\_ul\diagnose-cuda.ps1

# Проверка dev environment
.\scripts\dev-setup.ps1  # просто запустить ещё раз
```

### Частые проблемы:

#### 1. "Command not found" после установки

**Причина**: Программа установилась, но не в PATH, или PATH не обновился в текущей сессии.

**Решение**:
```powershell
# Перезапустить PowerShell (обязательно!)
# Или обновить PATH в текущей сессии:
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
```

#### 2. CMake не находит CUDA

**Причина**: CUDA_PATH environment variable не установлена.

**Решение**:
```powershell
# Проверить
[System.Environment]::GetEnvironmentVariable("CUDA_PATH", "Machine")

# Если null, установить вручную:
[System.Environment]::SetEnvironmentVariable("CUDA_PATH", "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0", "Machine")

# Перезапустить PowerShell
```

#### 3. "No CUDA toolset found"

**Причина**: Visual Studio CUDA integration файлы отсутствуют.

**Решение**:
```powershell
.\_ul\install-cuda-vs-integration.ps1
```

Подробности: `cat _ul\CUDA_BUILD_FIX.md`

#### 4. "cuda_runtime.h: No such file or directory"

**Причина**: CUDA Development Headers не установлены.

**Решение**: Переустановить CUDA Toolkit с "CUDA → Development" компонентом.

Подробности: `cat _ul\CUDA_HEADERS_MISSING.md`

---

## Проверка установки

### Полная проверка всех компонентов:

```powershell
# 1. Node.js
node --version
npm --version

# 2. Rust + wasm-pack
rustc --version
cargo --version
wasm-pack --version

# 3. CMake
cmake --version

# 4. Visual Studio
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property displayName

# 5. CUDA (если есть NVIDIA GPU)
nvidia-smi
nvcc --version
Test-Path "$env:CUDA_PATH\include\cuda_runtime.h"

# 6. VS CUDA integration
Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio\2022\*\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props"

# 7. Project build
Get-ChildItem dist\index.js  # TypeScript compiled
Get-ChildItem wasm\vector-ops\pkg\index.js  # WASM built
Get-ChildItem build\Release\cuda_vector_ops.node -ErrorAction SilentlyContinue  # CUDA built (optional)
```

### Ожидаемый результат (полный success):

```
✅ Node.js: v24.x.x
✅ npm: 10.x.x
✅ Rust: 1.x.x
✅ wasm-pack: 0.13.x
✅ CMake: 3.x+
✅ Visual Studio: 2022 BuildTools
✅ CUDA Toolkit: 12.x+ (опционально)
✅ CUDA Headers: True (опционально)
✅ VS CUDA integration: True (опционально)
✅ TypeScript build: dist/index.js
✅ WASM build: wasm/vector-ops/pkg/index.js
✅ CUDA build: build/Release/cuda_vector_ops.node (опционально)
```

---

## Итоговый чеклист

- [ ] Node.js 24+ установлен и в PATH
- [ ] npm dependencies установлены (`node_modules/` существует)
- [ ] Rust toolchain установлен
- [ ] wasm-pack установлен
- [ ] WASM SIMD module собран (`wasm/vector-ops/pkg/` существует)
- [ ] TypeScript скомпилирован (`dist/` существует)
- [ ] Тесты пройдены (`npm test` успешен)

### Для CUDA backend (опционально):

- [ ] NVIDIA GPU detected (`nvidia-smi` работает)
- [ ] CUDA Toolkit 11.0+ установлен
- [ ] CUDA Development Headers установлены (>100 files)
- [ ] nvcc в PATH
- [ ] CUDA_PATH environment variable установлена
- [ ] Visual Studio Build Tools установлены
- [ ] MSVC C++ tools установлены
- [ ] CMake 3.18+ установлен и в PATH
- [ ] Visual Studio CUDA integration установлена (5 files)
- [ ] CUDA backend собран (`build/Release/cuda_vector_ops.node` существует)

---

## Справка

### Документация:

- **CUDA_BUILD_FIX.md** - решение "No CUDA toolset found"
- **CUDA_HEADERS_MISSING.md** - решение отсутствующих headers
- **CUDA_SETUP_SUMMARY.md** - полный процесс CUDA setup
- **FINAL_CUDA_SUCCESS.md** - success story и бенчмарки

### Диагностические скрипты:

- `_ul\diagnose-cuda.ps1` - полная диагностика CUDA
- `_ul\fix-cmake-path.ps1` - быстрый фикс CMake PATH
- `_ul\install-cuda-vs-integration.ps1` - установка VS CUDA integration
- `_ul\build-cuda-fixed-path.ps1` - сборка CUDA с env variables

### Время установки (ориентировочно):

| Компонент | Время загрузки | Время установки | Всего |
|-----------|----------------|-----------------|-------|
| Node.js | 2 мин | 1 мин | 3 мин |
| npm packages | 3 мин | 2 мин | 5 мин |
| Rust | 5 мин | 3 мин | 8 мин |
| wasm-pack | 1 мин | 5 мин | 6 мин |
| CMake | 1 мин | 1 мин | 2 мин |
| VS Build Tools | 5 мин | 10 мин | 15 мин |
| CUDA Toolkit | 10 мин | 5 мин | 15 мин |
| **Всего** | ~30 мин | ~30 мин | **~60 мин** |

*Время зависит от скорости интернета и производительности ПК.*

---

## Получить помощь

Если возникли проблемы:

1. Проверить логи в консоли
2. Запустить диагностику: `.\_ul\diagnose-cuda.ps1`
3. Проверить документацию в `_ul/`
4. Создать Issue на GitHub с полным логом

**Важно**: При создании Issue приложить вывод:
```powershell
# Системная информация
systeminfo | Select-String "OS"

# Версии всех компонентов
node --version
npm --version
rustc --version
cmake --version
nvcc --version 2>&1

# Диагностика CUDA
.\_ul\diagnose-cuda.ps1 > cuda-diag.txt
```
