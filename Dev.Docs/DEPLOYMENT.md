# Deployment & Runtime Guide

Руководство по развертыванию и работе GPU backends для конечных пользователей.

## Для разработчиков vs Для пользователей

### 🔧 Разработчики (Development Setup)

**Цель**: Установить все инструменты для разработки

**Quick Start:**

**Linux/macOS:**
```bash
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

**Windows:**
```powershell
PowerShell -ExecutionPolicy Bypass -File scripts\dev-setup.ps1
```

**Что устанавливается:**
- ✅ Node.js dependencies
- ✅ Rust toolchain + wasm-pack
- ✅ CUDA Toolkit (если доступен)
- ✅ WebGPU support
- ✅ Сборка всех backends
- ✅ Запуск тестов

---

### 📦 Пользователи (Production Installation)

**Цель**: Установить npm package и собрать оптимальные backends

**Quick Start:**

```bash
# Установка из npm (когда опубликован)
npm install @er77/ultrascript-tools-mcp

# Или из git
npm install https://github.com/er77/ultrascript-tools-mcp.git
```

**Что происходит автоматически:**

1. **npm install** запускает `postinstall` script
2. Script **автоматически определяет** доступные build tools
3. **Собирает** доступные GPU backends (WASM, CUDA если есть)
4. **Graceful fallback** если build tools недоступны

**Результат**: Работающий проект с максимальной доступной производительностью!

---

## Runtime: Автоопределение Backend

### Алгоритм выбора Backend

При запуске приложения `BackendSelector` автоматически:

```
┌─────────────────────────┐
│ Application Start       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ GPU Detection           │  ← Определяет GPU автоматически
│ - NVIDIA (nvidia-smi)   │
│ - WebGPU (adapter)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Try CUDA Backend        │  ← Priority: 100 (fastest)
│ - Load native addon     │
│ - Check GPU available   │
└───────────┬─────────────┘
            │ Failed/Not available
            ▼
┌─────────────────────────┐
│ Try WebGPU Backend      │  ← Priority: 80
│ - Import webgpu   │
│ - Request GPU adapter   │
└───────────┬─────────────┘
            │ Failed/Not available
            ▼
┌─────────────────────────┐
│ Try WASM SIMD Backend   │  ← Priority: 50
│ - Import WASM module    │
│ - Check SIMD support    │
└───────────┬─────────────┘
            │ Failed/Not built
            ▼
┌─────────────────────────┐
│ Use Pure JS Backend     │  ← Priority: 1 (always works)
│ - Loop unrolling        │
│ - No dependencies       │
└─────────────────────────┘
```

### Runtime Code (автоматически)

```typescript
import { BackendSelector } from '@er77/ultrascript-tools-mcp';

// При первом использовании - автоматический выбор
const selector = BackendSelector.getInstance();
const backend = await selector.initialize();

// Backend уже выбран оптимально!
const results = await backend.batchCosineSimilarity(query, database);

console.log('Using:', backend.name);
// Outputs:
// "CUDA Native" - если NVIDIA GPU + CUDA addon built
// "WebGPU Compute" - если любая GPU + webgpu installed
// "WASM SIMD" - если WASM module built
// "Pure JS (Loop Unrolling)" - fallback (всегда работает)
```

---

## Что попадает в npm package

### Файлы в package (npm publish)

**✅ Всегда включено:**
```
dist/                        # Compiled TypeScript
├── index.js
├── gpu/
│   ├── backend-selector.js
│   ├── backends/
│   │   ├── base.js
│   │   ├── js-backend.js       # ✅ Pure JS - всегда работает
│   │   ├── wasm-backend.js     # Wrapper (WASM модуль опционален)
│   │   ├── webgpu-backend.js   # Wrapper (требует webgpu)
│   │   └── cuda-backend.js     # Wrapper (требует native addon)
│   └── detection/
│       └── gpu-detector.js

src/                         # TypeScript source (для sourcemaps)
wasm/vector-ops/             # Rust source (для сборки на клиенте)
native/cuda/                 # CUDA source (для сборки на клиенте)
scripts/                     # Build scripts
package.json
README.md
```

**❌ НЕ включено (собирается на клиенте):**
```
wasm/vector-ops/pkg/         # WASM compiled module (собирается postinstall)
build/Release/               # CUDA native addon (собирается postinstall)
node_modules/webgpu/   # Optional dependency
```

### Почему не включаем compiled modules?

**CUDA Native Addon:**
- ❌ **Platform-specific binary** (Windows .node != Linux .node)
- ❌ **Привязан к Node.js version** (N-API version)
- ✅ Должен собираться на **target machine**

**WASM Module:**
- ✅ Можно включить (platform-independent)
- ❌ Увеличивает размер package (~100KB)
- ✅ Решение: optional postinstall сборка

**WebGPU:**
- ✅ Обычная npm dependency
- ✅ `optionalDependencies` в package.json

---

## package.json Configuration

```json
{
  "name": "@er77/ultrascript-tools-mcp",
  "files": [
    "dist",
    "src",
    "wasm",
    "native",
    "scripts",
    "README.md",
    "CUDA_INSTALLATION.md",
    "WEBGPU_INSTALLATION.md"
  ],
  "scripts": {
    "postinstall": "node scripts/postinstall-gpu.js",
    "build:wasm": "cd wasm/vector-ops && wasm-pack build --target nodejs --release",
    "build:cuda": "cd native/cuda && cmake-js compile"
  },
  "optionalDependencies": {
    "webgpu": "^0.1.0",
    "@webgpu/types": "^0.1.0"
  },
  "devDependencies": {
    "cmake-js": "^7.3.0",
    "node-addon-api": "^8.2.1"
  }
}
```

---

## Postinstall Script Logic

`scripts/postinstall-gpu.js` делает:

1. **Проверяет окружение:**
   - ✅ Rust + wasm-pack → собирает WASM
   - ✅ CUDA Toolkit + CMake → собирает CUDA
   - ✅ Любая GPU → устанавливает WebGPU
   - ⚠️ Ничего → Pure JS backend (всегда работает)

2. **Не падает при ошибках:**
   - Build failed → просто warning
   - Tool not found → skip этот backend
   - CI environment → skip (через `SKIP_GPU_BUILD=1`)

3. **Показывает результаты:**
   ```
   ═══════════════════════════════════════════════════════════
     Build Summary
   ═══════════════════════════════════════════════════════════
     Pure JS (Loop Unrolling)   ✅ Always available           1.45x
     WASM SIMD                  ✅ Built successfully         4-8x
     WebGPU                     ℹ️  Runtime detection          50-100x
     CUDA Native                ⚠️  Not built                 100-200x
   ═══════════════════════════════════════════════════════════
   ```

---

## User Scenarios

### Сценарий 1: Обычный пользователь (без GPU tools)

```bash
npm install @er77/ultrascript-tools-mcp

# Postinstall:
# ⚠️  Rust not installed - WASM will not be built
# ⚠️  CUDA Toolkit not found
# ✅ Using Pure JS backend

# Runtime:
# → Backend: "Pure JS (Loop Unrolling)" (1.45x speedup)
```

**Результат**: Проект работает, performance baseline!

---

### Сценарий 2: Пользователь с Rust (no GPU)

```bash
# Пользователь установил Rust для других проектов
npm install @er77/ultrascript-tools-mcp

# Postinstall:
# ✅ Rust detected - building WASM module...
# ✅ WASM SIMD backend built (4-8x speedup)

# Runtime:
# → Backend: "WASM SIMD" (4-8x speedup)
```

**Результат**: Отличная performance без GPU!

---

### Сценарий 3: Пользователь с любой GPU

```bash
npm install @er77/ultrascript-tools-mcp

# Postinstall:
# ✅ GPU detected - installing WebGPU support
# ✅ webgpu installed

# Runtime:
# → Backend: "WebGPU Compute" (50-100x speedup)
```

**Результат**: Отличная GPU performance на NVIDIA/AMD/Intel!

---

### Сценарий 4: Пользователь с NVIDIA GPU + CUDA

```bash
# Пользователь developer с CUDA Toolkit
npm install @er77/ultrascript-tools-mcp

# Postinstall:
# ✅ CUDA Toolkit detected
# ✅ Building CUDA native addon...
# ✅ CUDA backend built (100-200x speedup)

# Runtime:
# → Backend: "CUDA Native" (100-200x speedup)
```

**Результат**: Максимальная performance!

---

## CI/CD Configuration

### Skip GPU builds in CI

```yaml
# .github/workflows/ci.yml
env:
  SKIP_GPU_BUILD: "1"  # Не собирать GPU backends в CI

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install    # Postinstall пропускает GPU builds
      - run: npm test       # Тесты работают с Pure JS backend
```

### Build GPU backends in CI (optional)

```yaml
# .github/workflows/test-gpu.yml
jobs:
  test-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1  # Install Rust
      - uses: actions/setup-node@v3
      - run: npm install               # Builds WASM automatically
      - run: npm test

  test-cuda:
    runs-on: self-hosted  # Requires NVIDIA GPU
    steps:
      - uses: actions/checkout@v3
      - run: npm install  # Builds CUDA if toolkit available
      - run: npm test
```

---

## Distribution Strategies

### Стратегия 1: Source-only (рекомендуется)

**Публикуем:**
- ✅ TypeScript source
- ✅ Rust WASM source
- ✅ CUDA C++ source
- ✅ Build scripts

**Пользователь собирает** на своей машине через postinstall.

**Плюсы:**
- ✅ Оптимально под конкретную систему
- ✅ Маленький package size
- ✅ Всегда совместимо с Node.js version

**Минусы:**
- ❌ Требует build tools у пользователя (опционально)

---

### Стратегия 2: Pre-built WASM (опционально)

**Публикуем:**
- ✅ Compiled WASM module в package
- ✅ Fallback на postinstall если нужно rebuild

**Плюсы:**
- ✅ Instant WASM backend (4-8x speedup)
- ✅ Не требует Rust у пользователя

**Минусы:**
- ❌ +100KB package size

**Конфигурация:**
```json
{
  "files": [
    "dist",
    "wasm/vector-ops/pkg"  // Include pre-built WASM
  ]
}
```

---

### Стратегия 3: Multiple packages (advanced)

**Разделить на packages:**

1. **@er77/ultrascript-tools-mcp** - Core (Pure JS)
2. **@er77/ultrascript-tools-mcp-wasm** - WASM backend (pre-built)
3. **@er77/ultrascript-tools-mcp-cuda** - CUDA backend source

**Пользователь выбирает:**
```bash
# Minimum
npm install @er77/ultrascript-tools-mcp

# With WASM
npm install @er77/ultrascript-tools-mcp @er77/ultrascript-tools-mcp-wasm

# With CUDA
npm install @er77/ultrascript-tools-mcp @er77/ultrascript-tools-mcp-cuda
```

**Плюсы:**
- ✅ Минимальный core package
- ✅ Пользователь контролирует dependencies

**Минусы:**
- ❌ Сложнее поддерживать

---

## Проверка Runtime Backend

Пользователи могут проверить какой backend используется:

```typescript
import { BackendSelector } from '@er77/ultrascript-tools-mcp';

// Get selected backend info
const selector = BackendSelector.getInstance();
const backend = await selector.initialize();

console.log('Backend:', {
  name: backend.name,
  type: backend.type,
  priority: backend.priority,
  capabilities: backend.getCapabilities()
});

// Output example (NVIDIA GPU with CUDA):
// {
//   name: "CUDA Native",
//   type: "cuda",
//   priority: 100,
//   capabilities: {
//     maxVectorCount: 1000000,
//     maxDimension: 8192,
//     supportsBatching: true,
//     supportsAsync: true,
//     memoryMB: 4096
//   }
// }
```

---

## Troubleshooting для пользователей

### "No GPU backend available"

**Решение**:
```bash
# 1. Проверить что было собрано
ls wasm/vector-ops/pkg        # WASM module
ls build/Release/*.node       # CUDA addon
npm list webgpu          # WebGPU

# 2. Пересобрать вручную
npm run build:wasm             # Если есть Rust
npm run build:cuda             # Если есть CUDA Toolkit

# 3. Установить WebGPU
npm install webgpu --save-optional
```

### "Performance slower than expected"

**Проверка backend:**
```bash
node -e "
import('./dist/gpu/backend-selector.js').then(async m => {
  const selector = m.BackendSelector.getInstance();
  const backend = await selector.initialize();
  console.log('Using:', backend.name, '- Expected:',
    backend.type === 'cuda' ? '100-200x' :
    backend.type === 'webgpu' ? '50-100x' :
    backend.type === 'wasm' ? '4-8x' : '1.45x');
})
"
```

---

## Рекомендации

### Для npm package (production):

✅ **Рекомендуем**:
- Source-only distribution
- Postinstall auto-build
- WebGPU в optionalDependencies
- Graceful fallback на Pure JS

✅ **Результат**:
- Работает всегда (Pure JS fallback)
- Оптимальная performance где доступно
- Маленький package size

---

**Вывод**: Пользователи получают working package "из коробки" с автоматической оптимизацией под их систему! 🚀
