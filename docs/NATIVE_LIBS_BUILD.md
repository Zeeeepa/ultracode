# Native GPU Libraries - Build & Distribution

Документация по сборке и распространению нативных GPU-библиотек для UltraScript Tools MCP.

## Обзор

UltraScript Tools поддерживает GPU-ускорение через нативные библиотеки:

| Платформа | Библиотека | Технология | Распространение |
|-----------|------------|------------|-----------------|
| Windows x64 | `ultrascript_cuda.node` | NVIDIA CUDA | ✅ Встроен в npm |
| Linux x64 | `ultrascript_cuda.node` | NVIDIA CUDA | ✅ Встроен в npm |
| macOS ARM64 | `ultrascript_metal.node` | Apple Metal | 🔧 Сборка при установке |
| macOS Intel | — | — | WASM fallback |
| Все платформы | WASM SIMD | WebAssembly | ✅ Встроен в npm |
| Все платформы | tree-sitter prebuilds | Node.js N-API | ✅ Встроен в npm |

## Что происходит при npm install

```
npm install ultrascript-tools-mcp
    │
    ├─> Распаковка npm-пакета
    │       │
    │       ├─> external-libs/cuda-win32-x64/ultrascript_cuda.node  ✅ Уже есть
    │       ├─> external-libs/cuda-linux-x64/ultrascript_cuda.node  ✅ Уже есть
    │       └─> dist/wasm/simd-ops.wasm                             ✅ Уже есть
    │
    ├─> postinstall.js
    │       │
    │       ├─> Windows/Linux? ───────> Готово (CUDA встроен)
    │       │
    │       ├─> macOS Apple Silicon? ─> Предложить собрать Metal backend
    │       │       │
    │       │       ├─> Пользователь согласен? ──yes──> Сборка Metal
    │       │       │
    │       │       └─> Пользователь отказался? ──────> WASM fallback
    │       │
    │       └─> macOS Intel? ─────────> WASM fallback (Metal не поддерживается)
    │
    └─> Готово!
```

### Приоритет бэкендов (runtime)

| Приоритет | Бэкенд | Условие |
|-----------|--------|---------|
| 100 | CUDA | NVIDIA GPU + библиотека найдена |
| 95 | Metal | Apple Silicon + библиотека найдена |
| 80 | WebGPU | WebGPU API доступен |
| 50 | WASM SIMD | Всегда доступен |
| 1 | Pure JS | Fallback |

### Переменные окружения

| Переменная | Описание |
|------------|----------|
| `ULTRASCRIPT_SKIP_POSTINSTALL=1` | Пропустить postinstall скрипт |
| `CI=true` | Интерактивные prompts пропускаются |

## Сборка библиотек

### Windows + Linux (через WSL)

**Требования для Windows:**
- CUDA Toolkit 11.x+ ([скачать](https://developer.nvidia.com/cuda-downloads))
- **Visual Studio 2022 Build Tools** (рекомендуется) или VS 2022
  - VS 2026 имеет проблемы совместимости с CUDA 13.0 (CVTRES баги)
- CMake 3.18+
- Node.js 18+

```powershell
# Установить VS 2022 Build Tools (рекомендуется)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

**Требования для Linux (WSL):**
- WSL2 с Ubuntu
- CUDA Toolkit в WSL (`sudo apt install nvidia-cuda-toolkit`)
- CMake, GCC, Node.js

```powershell
# Собрать для всех платформ
npm run build:native

# Только Windows
npm run build:native:windows

# Только Linux (через WSL)
npm run build:native:linux

# Чистая сборка
npm run build:native:clean

# Сборка + упаковка в tar.gz для GitHub Releases
.\scripts\build-native-libs.ps1 -Package
.\scripts\build-native-libs.ps1 -Platform windows -Package

# Альтернатива: CMD wrapper (собирает всё и упаковывает без параметров)
.\scripts\build-native-libs.cmd
```

### Быстрая сборка (только Windows)

Для быстрой сборки только Windows CUDA addon используйте batch-скрипт:

```cmd
scripts\build-cuda-x64.bat
```

Этот скрипт автоматически:
- Находит и использует VS 2022 BuildTools (предпочтительно для CUDA 13.0)
- Отключает npm rc shims (конфликт с Windows SDK rc.exe)
- Использует Visual Studio generator (безопаснее чем Ninja)

### Быстрая сборка (только Linux/WSL)

Standalone bash скрипт для сборки в WSL без PowerShell:

```bash
# В WSL терминале
bash scripts/build-linux-wsl.sh

# Чистая сборка
bash scripts/build-linux-wsl.sh --clean
```

Этот скрипт:
- Проверяет prerequisites (cmake, nvcc, node)
- Собирает CUDA addon через cmake-js
- Копирует результат в `external-libs/cuda-linux-x64/`

### macOS (Apple Silicon) — Metal Backend

> ⚡ **Metal предлагается собрать автоматически при `npm install`** на Apple Silicon Mac.
> Если вы отказались или хотите собрать позже — используйте скрипт ниже.

**Требования для сборки:**
- ✅ **Apple Silicon Mac** (M1/M2/M3/M4)
- ✅ **Xcode Command Line Tools** — `xcode-select --install`
- ✅ **Homebrew** — https://brew.sh
- ✅ **CMake** — `brew install cmake`
- ✅ **Node.js** 18+

```bash
# Сборка Metal backend
chmod +x scripts/build-native-libs-macos.sh
./scripts/build-native-libs-macos.sh

# Или из node_modules после npm install:
./node_modules/ultrascript-tools-mcp/scripts/build-native-libs-macos.sh
```

**Что происходит при сборке:**
1. Скрипт проверяет/устанавливает зависимости (Homebrew, CMake)
2. Компилирует Metal shaders → `vector_ops.metallib`
3. Собирает Node.js addon → `ultrascript_metal.node`
4. Копирует в `external-libs/metal-darwin-arm64/`

**Результат:**
```
external-libs/metal-darwin-arm64/
├── ultrascript_metal.node    # Node.js N-API addon
└── vector_ops.metallib       # Compiled Metal shaders
```

### macOS (Intel) — WASM Fallback

На Intel Mac используется **WASM SIMD** (уже встроен в npm-пакет).
Metal и CUDA не поддерживаются на этой платформе.

## Tree-sitter Prebuilds (Node.js 24+)

### Проблема

Node.js 24 требует C++20, но tree-sitter и языковые грамматики компилируются с C++17. Это вызывает ошибки при `npm install`:

```
error C7555: use of designated initializers requires at least '/std:c++20'
```

### Решение

Прекомпилированные native модули (`prebuilds`) для всех платформ:

```
external-libs/
├── tree-sitter-win32-x64/      # Windows x64 (~26 MB)
│   ├── tree-sitter.node
│   ├── tree-sitter-javascript.node
│   ├── tree-sitter-typescript.node
│   └── ... (17 модулей)
├── tree-sitter-linux-x64/      # Linux x64
├── tree-sitter-darwin-arm64/   # macOS Apple Silicon
└── tree-sitter-darwin-x64/     # macOS Intel
```

### Сборка prebuilds

```bash
# Windows (PowerShell)
npm run build:tree-sitter
# или
powershell scripts/build-tree-sitter-prebuilds.ps1

# Linux/macOS
bash scripts/build-tree-sitter-prebuilds.sh
```

Скрипт автоматически:
1. Патчит `binding.gyp` файлы (C++17 → C++20)
2. Пересобирает все tree-sitter модули через `npm rebuild`
3. Копирует `.node` файлы в `external-libs/tree-sitter-{platform}-{arch}/`

### Список модулей

| Модуль | Файл prebuild |
|--------|---------------|
| tree-sitter | tree-sitter.node |
| tree-sitter-javascript | tree-sitter-javascript.node |
| tree-sitter-typescript | tree-sitter-typescript.node |
| tree-sitter-python | tree-sitter-python.node |
| tree-sitter-c | tree-sitter-c.node |
| tree-sitter-cpp | tree-sitter-cpp.node |
| tree-sitter-c-sharp | tree-sitter-c-sharp.node |
| tree-sitter-go | tree-sitter-go.node |
| tree-sitter-rust | tree-sitter-rust.node |
| tree-sitter-java | tree-sitter-java.node |
| tree-sitter-kotlin | tree-sitter-kotlin.node |
| tree-sitter-swift | tree-sitter-swift.node |
| tree-sitter-ruby | tree-sitter-ruby.node |
| tree-sitter-php | tree-sitter-php.node |
| tree-sitter-bash | tree-sitter-bash.node |
| tree-sitter-json | tree-sitter-json.node |
| tree-sitter-yaml | tree-sitter-yaml.node |

### Автоматический выбор prebuild (runtime)

Loader в `src/parsers/tree-sitter-parser.ts`:
1. Ищет prebuilds в `external-libs/tree-sitter-{platform}-{arch}/`
2. Если не найдены → fallback на npm версию (работает на Node.js < 24)

### CI/CD сборка

GitHub Actions workflow (`.github/workflows/build-prebuilds.yml`):
- Собирает prebuilds на Windows, Linux, macOS (x64 + ARM64)
- Артефакты доступны для скачивания

## Структура выходных файлов

```
external-libs/
├── cuda-win32-x64/
│   └── ultrascript_cuda.node      # Windows CUDA
├── cuda-linux-x64/
│   └── ultrascript_cuda.node      # Linux CUDA
├── metal-darwin-arm64/
│   ├── ultrascript_metal.node     # macOS Metal addon
│   └── vector_ops.metallib        # Metal shaders
├── tree-sitter-win32-x64/         # Windows tree-sitter prebuilds
│   ├── tree-sitter.node
│   ├── tree-sitter-javascript.node
│   └── ... (17 файлов)
├── tree-sitter-linux-x64/         # Linux tree-sitter prebuilds
├── tree-sitter-darwin-arm64/      # macOS ARM64 tree-sitter prebuilds
└── tree-sitter-darwin-x64/        # macOS Intel tree-sitter prebuilds
```

## Публикация в npm (для мейнтейнеров)

### Что включается в npm-пакет

CUDA, WASM и tree-sitter библиотеки **встроены в npm-пакет** через `package.json` → `files`:

```json
{
  "files": [
    "external-libs/**/*.node",      // CUDA, Metal, tree-sitter prebuilds
    "external-libs/**/*.metallib",  // Metal shaders (если есть)
    "dist/**/*.wasm",               // WASM SIMD
    "scripts/postinstall.js",       // postinstall скрипт
    "scripts/build-native-libs-macos.sh"  // Metal build script
  ]
}
```

**Tree-sitter prebuilds** (~26 MB на платформу) решают проблему установки на Node.js 24+, где tree-sitter не компилируется из-за требования C++20.

### Перед публикацией

1. **Собрать CUDA для Windows и Linux:**
```powershell
# На Windows машине с CUDA и WSL
npm run build:native

# Проверить что файлы на месте:
dir external-libs\cuda-win32-x64\ultrascript_cuda.node
dir external-libs\cuda-linux-x64\ultrascript_cuda.node
```

2. **Собрать WASM:**
```bash
npm run build:wasm
# Результат: dist/wasm/simd-ops.wasm
```

3. **Собрать tree-sitter prebuilds:**
```powershell
# Windows
npm run build:tree-sitter

# Проверить что файлы на месте:
dir external-libs\tree-sitter-win32-x64\*.node
# Должно быть 17 файлов
```

> **Примечание:** Скрипт `pack-npm.ps1` автоматически собирает tree-sitter prebuilds если они отсутствуют.

4. **Публикация:**
```bash
npm run build
npm publish
# или через скрипт с проверками:
.\scripts\pack-npm.ps1 -Apply -Publish
```

### Проверка установки

```bash
# В чистой директории
npm init -y
npm install ultrascript-tools-mcp

# Windows/Linux: Должно сразу работать (CUDA встроен)
# macOS ARM64: Предложит собрать Metal
# macOS Intel: WASM fallback
```

## Архивирование для GitHub Releases (опционально)

Для удобства можно также загрузить архивы в GitHub Releases:

```powershell
cd external-libs
tar -czvf native-libs-cuda-win32-x64.tar.gz cuda-win32-x64/
tar -czvf native-libs-cuda-linux-x64.tar.gz cuda-linux-x64/
```

## CI/CD Pipeline (GitHub Actions)

Пример workflow для автоматической сборки:

```yaml
# .github/workflows/build-native.yml
name: Build Native Libraries

on:
  release:
    types: [created]

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup CUDA
        uses: Jimver/cuda-toolkit@v0.2.11
        with:
          cuda: '12.2.0'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build CUDA addon
        run: npm run build:native:windows

      - name: Package
        run: |
          cd external-libs
          tar -czvf native-libs-cuda-win32-x64.tar.gz cuda-win32-x64/

      - name: Upload to Release
        uses: softprops/action-gh-release@v1
        with:
          files: external-libs/native-libs-cuda-win32-x64.tar.gz

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup CUDA
        uses: Jimver/cuda-toolkit@v0.2.11
        with:
          cuda: '12.2.0'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build CUDA addon
        run: |
          cd external-tools/native/cuda
          npx cmake-js compile
          mkdir -p ../../../external-libs/cuda-linux-x64
          cp build/Release/ultrascript_cuda.node ../../../external-libs/cuda-linux-x64/

      - name: Package
        run: |
          cd external-libs
          tar -czvf native-libs-cuda-linux-x64.tar.gz cuda-linux-x64/

      - name: Upload to Release
        uses: softprops/action-gh-release@v1
        with:
          files: external-libs/native-libs-cuda-linux-x64.tar.gz

  build-macos:
    runs-on: macos-14  # Apple Silicon runner
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          brew install cmake
          npm ci

      - name: Build Metal addon
        run: |
          # Metal build commands here
          echo "Metal build not yet automated"

      # - name: Upload to Release
      #   ...
```

## Отладка

### Проверить загрузку библиотеки

```javascript
// test-native.js
import { existsSync } from 'fs';
import { join } from 'path';

const libs = [
  'external-libs/cuda-win32-x64/ultrascript_cuda.node',
  'external-libs/cuda-linux-x64/ultrascript_cuda.node',
  'external-libs/metal-darwin-arm64/ultrascript_metal.node',
];

for (const lib of libs) {
  console.log(`${lib}: ${existsSync(lib) ? '✓' : '✗'}`);
}
```

### Проверить CUDA доступность

```javascript
// В runtime библиотека загружается через gpu-detector.ts
import { GPUDetector } from 'ultrascript-tools-mcp';

const gpu = await GPUDetector.detect();
console.log('GPU:', gpu);
// { vendor: 'nvidia', model: 'RTX 3080', cudaAvailable: true, ... }
```

### Логи postinstall

```bash
# Verbose установка
npm install ultrascript-tools-mcp --foreground-scripts
```

## Troubleshooting

### Visual Studio 2026 / CUDA 13.0 несовместимость

**Проблема:** CUDA 13.0 официально поддерживает только VS 2019-2022. VS 2026 (VS 18) имеет:
- Ошибку `CVTRES : fatal error CVT1101` при линковке
- Несовместимость версий компилятора

**Решение:**
```powershell
# Установить VS 2022 Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Скрипты автоматически предпочитают VS 2022 перед VS 2026.

### npm rc package конфликт с Windows SDK rc.exe

**Проблема:** npm пакет `rc` (config loader) создаёт shim `node_modules\.bin\rc.cmd`, который CMake находит вместо Windows SDK Resource Compiler `rc.exe`.

**Симптомы:**
```
LINK : fatal error LNK1123: failure during conversion to COFF
{
  "_": ["/nologo", "/x", "/fo", ...]
}
```

**Решение:** Скрипты автоматически временно переименовывают npm rc shims во время сборки.

### "No CUDA toolset found"

**Решение:** Добавить путь к CUDA в CMakeLists.txt или установить `CUDA_PATH`:
```cmd
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
```

## FAQ

### Q: Что уже встроено в npm-пакет?

| Компонент | Платформа | Встроен? |
|-----------|-----------|----------|
| CUDA addon | Windows x64 | ✅ Да |
| CUDA addon | Linux x64 | ✅ Да |
| WASM SIMD | Все | ✅ Да |
| tree-sitter prebuilds | Windows x64 | ✅ Да |
| tree-sitter prebuilds | Linux x64 | ✅ Да |
| tree-sitter prebuilds | macOS ARM64 | ✅ Да |
| tree-sitter prebuilds | macOS Intel | ✅ Да |
| Metal addon | macOS ARM64 | ❌ Нет (собирается при установке) |

### Q: Что если у пользователя нет NVIDIA GPU?

Библиотека автоматически использует WASM SIMD fallback, который работает везде. Производительность ~3-5x медленнее чем CUDA, но всё равно быстрее чистого JS.

### Q: Можно ли пропустить postinstall?

```bash
ULTRASCRIPT_SKIP_POSTINSTALL=1 npm install ultrascript-tools-mcp
```

### Q: Почему Metal не встроен в npm-пакет?

Metal addon должен быть скомпилирован на macOS с Xcode. Cross-compilation из Windows/Linux невозможна. Поэтому postinstall предлагает собрать Metal на месте.

### Q: Почему Metal вместо CUDA на macOS?

Apple не поддерживает CUDA с 2019 года. Metal — нативный GPU API для macOS/iOS с отличной производительностью на Apple Silicon.

### Q: Как проверить какой бэкенд используется?

При запуске сервера в логах видно:
```
[BackendSelector] ✅ Selected: CUDA Native (priority: 100)
# или
[BackendSelector] ✅ Selected: Metal Native (priority: 95)
# или
[BackendSelector] ✅ Selected: WASM SIMD (priority: 50)
```

### Q: Почему tree-sitter prebuilds в npm-пакете?

Node.js 24 использует V8 с C++20, но tree-sitter и языковые грамматики компилируются с C++17. Это вызывает ошибки компиляции при `npm install`.

**Решение:** Прекомпилированные `.node` файлы для всех платформ (~26 MB каждая). Loader автоматически использует prebuilds, если они доступны.

### Q: Как собрать tree-sitter prebuilds вручную?

```powershell
# Windows
npm run build:tree-sitter

# Linux/macOS
bash scripts/build-tree-sitter-prebuilds.sh
```

Скрипт патчит `binding.gyp` (C++17 → C++20), пересобирает модули и копирует `.node` файлы в `external-libs/`.
