# FAISS Build Guide - Полная документация

## Обзор

Этот документ описывает процесс сборки нативных бинарников `faiss-node` для Node 24 (ABI v137) и их интеграцию в npm пакет.

## Архитектура

```
ultrascript-tools-mcp/
├── scripts/
│   ├── build-faiss-node.js        # Windows: auto-install vcpkg + сборка
│   ├── build-faiss-wsl.sh         # Linux/WSL: сборка с OpenBLAS
│   ├── build-faiss-wsl.ps1        # PowerShell wrapper для WSL
│   ├── build-faiss-docker.sh      # Docker: изолированная сборка (рекомендуется)
│   ├── build-faiss-docker.ps1     # PowerShell wrapper для Docker
│   ├── build-faiss-macos.sh       # macOS: Homebrew + OpenBLAS
│   └── postinstall.js             # Копирование бинарников после npm install
│
├── external-libs/
│   ├── faiss-win32-x64/
│   │   ├── faiss-node.node        # Windows нативный модуль (3.5 MB)
│   │   └── *.dll                  # 6 DLL зависимостей (OpenBLAS, gfortran и т.д.)
│   ├── faiss-linux-x64/
│   │   └── faiss-node.node        # Linux нативный модуль (5.5 MB)
│   ├── faiss-darwin-arm64/
│   │   └── faiss-node.node        # macOS Apple Silicon (M1/M2/M3)
│   └── faiss-darwin-x64/
│       └── faiss-node.node        # macOS Intel
│
├── docs/
│   └── FAISS_BUILD_GUIDE.md       # Эта документация
│
└── package.json                   # npm scripts и files список
```

## Поддерживаемые платформы

| Платформа | Архитектура | Скрипт | Статус | Размер |
|-----------|-------------|--------|--------|--------|
| Windows | x64 | `build:faiss` | ✅ Готов | 3.5 MB + 15 MB DLL |
| Linux | x64 | `build:faiss:docker` | ✅ Готов | 5.5 MB |
| macOS | ARM64 (M1/M2/M3) | `build:faiss:macos` | ⚠️ Требует Mac | ~5 MB |
| macOS | Intel x64 | `build:faiss:macos` | ⚠️ Требует Mac | ~5 MB |

---

## Скрипты сборки

### 1. `build-faiss-node.js` - Windows сборка

**Платформа:** Windows
**Метод:** vcpkg + OpenBLAS + LAPACK
**Время сборки:** 15-25 минут

#### Что делает:

1. **Проверяет зависимости:**
   - Git
   - CMake 3.20+
   - Visual Studio Build Tools 2022 (MSVC)
   - Python 3.x
   - node-gyp
   - vcpkg (Microsoft C++ package manager)
   - OpenBLAS + LAPACK

2. **Автоматически устанавливает недостающие зависимости:**
   - Клонирует vcpkg в `C:\vcpkg`
   - Bootstrapping vcpkg (1-2 минуты)
   - Устанавливает `openblas:x64-windows` (10-15 минут)
   - Устанавливает `lapack:x64-windows` (3-5 минут)
   - Интегрирует vcpkg с CMake глобально

3. **Клонирует faiss-node:**
   - Репозиторий: https://github.com/ewfian/faiss-node.git
   - Директория: `.build-cache/faiss-node`

4. **Собирает нативный модуль:**
   - Очищает старые артефакты (`deps/`, `node_modules/`, `build/`)
   - Запускает `npm install` → автоматически запускает `cmake-js compile`
   - CMake находит OpenBLAS/LAPACK через vcpkg toolchain
   - Компилирует FAISS библиотеку (C++)
   - Собирает Node.js addon (`faiss-node.node`)

5. **Копирует результаты:**
   - `faiss-node.node` → `external-libs/faiss-win32-x64/`
   - 6 DLL из vcpkg → `external-libs/faiss-win32-x64/`:
     ```
     openblas.dll
     liblapack.dll
     libgfortran-5.dll
     libgcc_s_seh-1.dll
     libquadmath-0.dll
     libwinpthread-1.dll
     ```

6. **Тестирует модуль:**
   - Пытается загрузить `faiss-node.node` через `require()`
   - Проверяет, что модуль работает корректно

#### Использование:

```powershell
# Полная автоматическая сборка (все зависимости устанавливаются автоматически)
npm run build:faiss

# Или напрямую
node scripts/build-faiss-node.js
```

#### Требования:

- **Windows 10/11** (64-bit)
- **~15 GB свободного места** (vcpkg + компиляция + зависимости)
- **Интернет соединение** (скачивание зависимостей)
- **Права администратора** (для установки VS Build Tools, если нет)

#### Что устанавливается автоматически:

✅ vcpkg
✅ OpenBLAS (через vcpkg)
✅ LAPACK (через vcpkg)
✅ node-gyp

❌ **НЕ устанавливается автоматически:**
- Git (нужно установить вручную: https://git-scm.com/download/win)
- CMake (устанавливается скриптом, но требует перезапуск терминала)
- Python (устанавливается скриптом, но требует перезапуск терминала)
- Visual Studio Build Tools (требует GUI установку)

---

### 2. `build-faiss-docker.sh` + `build-faiss-docker.ps1` - Docker сборка

**Платформа:** Linux (через Docker)
**Метод:** Docker container с `node:24-slim`
**Время сборки:** 10-20 минут
**Рекомендуется:** ✅ Самый надежный способ

#### Что делает:

1. **Запускает Docker контейнер:**
   ```bash
   docker run --rm \
     -v "D:\github\ultrascript-tools-mcp:/work" \
     -w /work \
     node:24-slim \
     bash /work/scripts/build-faiss-docker.sh
   ```

2. **Внутри контейнера:**
   - Устанавливает зависимости (apt-get):
     ```bash
     git cmake build-essential
     libopenblas-dev libblas-dev liblapack-dev
     python3 patchelf
     ```
   - Устанавливает `node-gyp` глобально
   - Клонирует faiss-node в `.build-cache/faiss-node`
   - Очищает старые артефакты
   - Запускает `npm install` → `cmake-js compile`
   - Копирует `faiss-node.node` → `/work/external-libs/faiss-linux-x64/`

#### Использование:

```powershell
# Windows PowerShell
npm run build:faiss:docker

# Или напрямую
pwsh scripts/build-faiss-docker.ps1

# Linux/macOS
docker run --rm -v "$(pwd):/work" -w /work node:24-slim bash /work/scripts/build-faiss-docker.sh
```

#### Требования:

- **Docker Desktop** установлен и запущен
- **~5 GB свободного места** (образ node:24-slim + зависимости)
- **Интернет соединение**

#### Преимущества:

✅ Чистая изолированная среда
✅ Нет загрязнения хост-системы
✅ Работает на Windows, Linux, macOS
✅ Идеально для CI/CD
✅ Нет проблем с WSL сетью

---

### 3. `build-faiss-wsl.sh` + `build-faiss-wsl.ps1` - WSL сборка

**Платформа:** Linux (через WSL на Windows)
**Метод:** WSL Ubuntu + OpenBLAS
**Время сборки:** 10-20 минут
**Статус:** ⚠️ Альтернатива Docker (может быть медленнее из-за apt-get)

#### Что делает:

1. **PowerShell wrapper (`build-faiss-wsl.ps1`):**
   - Проверяет наличие WSL
   - Конвертирует Windows пути в WSL пути
   - Запускает bash скрипт в WSL

2. **Bash скрипт (`build-faiss-wsl.sh`):**
   - Устанавливает зависимости через `sudo apt-get`
   - Клонирует faiss-node
   - Собирает через `npm install` → `cmake-js`
   - Копирует в `external-libs/faiss-linux-x64/`

#### Использование:

```powershell
# Windows PowerShell
npm run build:faiss:wsl

# Или напрямую
pwsh scripts/build-faiss-wsl.ps1
```

#### Требования:

- **WSL 2** установлен
- **Ubuntu** (или другой дистрибутив Linux)
- **sudo права** в WSL

#### Известные проблемы:

⚠️ `apt-get update` может быть медленным (5+ минут)
⚠️ Проблемы с зеркалами Ubuntu
⚠️ Требует sudo пароль

**Рекомендация:** Используйте Docker вместо WSL

---

### 4. `build-faiss-macos.sh` - macOS сборка

**Платформа:** macOS (Apple Silicon ARM64 + Intel x86_64)
**Метод:** Homebrew + OpenBLAS
**Время сборки:** 10-20 минут
**Статус:** ⚠️ Требует macOS для сборки

#### Что делает:

1. **Определяет архитектуру:**
   - Apple Silicon (ARM64) → `faiss-darwin-arm64`
   - Intel (x86_64) → `faiss-darwin-x64`

2. **Проверяет зависимости:**
   - Homebrew (обязательно)
   - Xcode Command Line Tools
   - Node 24
   - node-gyp

3. **Устанавливает через Homebrew:**
   ```bash
   brew install openblas cmake
   ```

4. **Собирает:**
   - Клонирует faiss-node
   - Устанавливает npm зависимости
   - Компилирует с OpenBLAS (из Homebrew)
   - Копирует в `external-libs/faiss-darwin-{arm64|x64}/`

5. **Тестирует модуль**

#### Использование:

```bash
# На macOS (Apple Silicon или Intel)
bash scripts/build-faiss-macos.sh

# Или через npm (добавить в package.json)
npm run build:faiss:macos
```

#### Требования:

- **macOS 11+** (Big Sur или новее)
- **Homebrew** установлен
- **Xcode Command Line Tools**:
  ```bash
  xcode-select --install
  ```
- **Node 24**:
  ```bash
  brew install node@24
  brew link node@24 --force
  ```

#### Установка зависимостей:

```bash
# 1. Homebrew (если еще не установлен)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Xcode Command Line Tools
xcode-select --install

# 3. Node 24
brew install node@24
brew link node@24 --force

# 4. Запустить скрипт сборки
bash scripts/build-faiss-macos.sh
```

#### Где хранятся бинарники:

```
external-libs/
├── faiss-darwin-arm64/
│   └── faiss-node.node      # Apple Silicon (M1/M2/M3)
└── faiss-darwin-x64/
    └── faiss-node.node      # Intel Mac
```

#### Особенности:

✅ OpenBLAS из Homebrew (оптимизирован для macOS)
✅ Автоматическое определение архитектуры
✅ Нет DLL зависимостей (статическая линковка)
✅ Работает на Apple Silicon и Intel

⚠️ **Важно:** Если вы разработчик **без macOS**, попросите кого-то с Mac собрать бинарники:
1. Клонировать репозиторий на macOS
2. Запустить `bash scripts/build-faiss-macos.sh`
3. Закоммитить `external-libs/faiss-darwin-*/faiss-node.node`
4. Отправить pull request

---

## Интеграция с npm

### 1. `package.json` - npm scripts

```json
{
  "scripts": {
    "build:faiss": "node scripts/build-faiss-node.js",
    "build:faiss:wsl": "pwsh scripts/build-faiss-wsl.ps1",
    "build:faiss:wsl:clean": "pwsh scripts/build-faiss-wsl.ps1 -Clean",
    "build:faiss:docker": "pwsh scripts/build-faiss-docker.ps1",
    "build:faiss:docker:clean": "pwsh scripts/build-faiss-docker.ps1 -Clean"
  }
}
```

### 2. `package.json` - files для npm publish

```json
{
  "files": [
    "external-libs/faiss-win32-x64/*.node",
    "external-libs/faiss-win32-x64/*.dll",
    "external-libs/faiss-linux-x64/*.node",
    "scripts/postinstall.js",
    "scripts/build-faiss-node.js",
    "scripts/build-faiss-wsl.sh",
    "scripts/build-faiss-wsl.ps1",
    "scripts/build-faiss-docker.sh",
    "scripts/build-faiss-docker.ps1",
    "scripts/BUILD_FAISS_README.md",
    "scripts/FAISS_QUICKSTART.md"
  ]
}
```

**Что публикуется в npm:**
- ✅ Готовые бинарники (`.node` + `.dll`)
- ✅ Скрипты сборки (для разработчиков)
- ✅ Документация
- ❌ НЕ публикуется: исходники FAISS, `.build-cache/`, `node_modules/`

### 3. `scripts/postinstall.js` - автоматическая установка

Этот скрипт запускается **после `npm install`** у пользователя.

#### Что делает:

```javascript
function copyFaissNode() {
  const plat = platform();           // "win32" или "linux"
  const architecture = arch();        // "x64"
  const abiVersion = process.versions.modules; // "137" для Node 24

  // Путь к нашему prebuild бинарнику
  const sourcePath = join(
    projectRoot,
    "external-libs",
    `faiss-${plat}-${architecture}`,
    "faiss-node.node"
  );

  // Путь куда нужно скопировать (faiss-node ожидает его там)
  const bindingDir = join(
    projectRoot,
    "node_modules",
    "faiss-node",
    "lib",
    "binding",
    `node-v${abiVersion}-${plat}-${architecture}`
  );

  // Создаем директорию и копируем
  mkdirSync(bindingDir, { recursive: true });
  copyFileSync(sourcePath, join(bindingDir, "faiss-node.node"));

  // Windows: копируем DLL рядом с node_modules
  if (plat === "win32") {
    const dllSource = join(projectRoot, "external-libs", "faiss-win32-x64");
    const dllFiles = readdirSync(dllSource).filter(f => f.endsWith(".dll"));

    for (const dll of dllFiles) {
      copyFileSync(
        join(dllSource, dll),
        join(projectRoot, "node_modules", ".bin", dll)
      );
    }
  }
}
```

#### Результат:

После `npm install ultrascript-tools-mcp`:

```
node_modules/
├── faiss-node/
│   └── lib/
│       └── binding/
│           └── node-v137-win32-x64/    # или node-v137-linux-x64
│               └── faiss-node.node     # ← наш prebuild
└── .bin/
    ├── openblas.dll                    # только на Windows
    ├── liblapack.dll
    └── ... (другие DLL)
```

---

## Использование в коде

### 1. Импорт faiss-node

```typescript
import * as faiss from "faiss-node";

// faiss-node автоматически загружает правильный бинарник
// из node_modules/faiss-node/lib/binding/node-v137-{platform}-{arch}/
```

### 2. Создание индекса

```typescript
const dimension = 384; // размерность векторов
const index = new faiss.IndexFlatL2(dimension);

// Добавление векторов
const vectors = new Float32Array([
  0.1, 0.2, 0.3, ...,  // 384 значения
  0.4, 0.5, 0.6, ...,  // 384 значения
]);
index.add(vectors);

// Поиск
const query = new Float32Array([0.1, 0.2, 0.3, ...]); // 384 значения
const k = 5; // топ-5 результатов
const result = index.search(query, k);

console.log("Distances:", result.distances);
console.log("Labels:", result.labels);
```

### 3. В ultrascript-tools-mcp

Используется через subprocess (из-за несовместимости Bun):

```typescript
// src/semantic/faiss/faiss-worker.ts
import { Worker } from "node:worker_threads";

class FaissWorker {
  private worker: Worker;

  constructor() {
    // Запускаем Node.js subprocess для FAISS
    this.worker = new Worker("./faiss-worker-impl.js", {
      execArgv: ["--expose-gc"]
    });
  }

  async addVectors(vectors: Float32Array, ids: number[]) {
    return this.worker.postMessage({
      type: "add",
      vectors: vectors.buffer,
      ids
    });
  }

  async search(query: Float32Array, k: number) {
    return this.worker.postMessage({
      type: "search",
      query: query.buffer,
      k
    });
  }
}
```

---

## Workflow для разработчиков

### Первичная сборка (один раз)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/faxenoff/ultrascript-tools-mcp.git
cd ultrascript-tools-mcp

# 2. Установить зависимости
npm install

# 3. Собрать FAISS бинарники
npm run build:faiss:docker    # Linux (рекомендуется)
npm run build:faiss           # Windows (если нужен Windows бинарник)

# 4. Проверить что бинарники созданы
ls -lh external-libs/faiss-linux-x64/faiss-node.node
ls -lh external-libs/faiss-win32-x64/faiss-node.node
```

### Пересборка после обновления faiss-node

```bash
# Очистка кеша
rm -rf .build-cache/faiss-node

# Пересборка
npm run build:faiss:docker:clean  # с очисткой кеша
```

### Публикация в npm

```bash
# 1. Убедиться что бинарники собраны
ls external-libs/faiss-*/*.node

# 2. Проверить что они в package.json files
cat package.json | grep "faiss-"

# 3. Собрать проект
npm run build

# 4. Опубликовать
npm publish
```

Пользователи после `npm install ultrascript-tools-mcp` получат:
- ✅ Готовые бинарники (не нужно компилировать)
- ✅ Автоматическая установка через postinstall
- ✅ Работает сразу из коробки

---

## Troubleshooting

### Windows: Could NOT find BLAS

**Проблема:**
```
CMake Error: Could NOT find BLAS (missing: BLAS_LIBRARIES)
```

**Решение:**
Скрипт автоматически установит vcpkg + OpenBLAS. Если не сработало:

```powershell
# Проверить что vcpkg установлен
C:\vcpkg\vcpkg.exe version

# Проверить что OpenBLAS установлен
C:\vcpkg\vcpkg.exe list | findstr openblas

# Переустановить вручную
C:\vcpkg\vcpkg.exe install openblas:x64-windows
C:\vcpkg\vcpkg.exe install lapack:x64-windows
C:\vcpkg\vcpkg.exe integrate install
```

### Docker: Permission denied

**Проблема:**
```
docker: Error response from daemon: path is invalid
```

**Решение:**
Используйте PowerShell скрипт вместо прямого запуска Docker:

```powershell
# Вместо docker run ...
npm run build:faiss:docker
```

### Test failed: module could not be loaded

**Проблема:**
```
Error: The specified module could not be found.
```

**Решение:**
Скопируйте DLL зависимости (только Windows):

```powershell
cp C:\vcpkg\installed\x64-windows\bin\*.dll external-libs\faiss-win32-x64\
```

Скрипт делает это автоматически, но если что-то пошло не так - можно вручную.

### Node ABI mismatch

**Проблема:**
```
Error: The module was compiled against a different Node.js version
```

**Решение:**
Пересобрать с правильной версией Node:

```bash
# Проверить версию Node
node --version  # должно быть v24.x.x

# Проверить ABI
node -p "process.versions.modules"  # должно быть 137

# Пересобрать
npm run build:faiss:docker:clean
```

---

## Размеры файлов

### Linux бинарник:
- `faiss-node.node`: **5.5 MB**
- Зависимости: встроены в бинарник (статическая линковка OpenBLAS)

### Windows бинарник:
- `faiss-node.node`: **3.5 MB**
- DLL зависимости: **~15 MB** (6 файлов)
  - `openblas.dll`: ~8 MB
  - `liblapack.dll`: ~3 MB
  - `libgfortran-5.dll`: ~2 MB
  - остальные: <1 MB каждый

### macOS бинарники:
- `faiss-darwin-arm64/faiss-node.node`: **~5 MB** (Apple Silicon)
- `faiss-darwin-x64/faiss-node.node`: **~5 MB** (Intel)
- Зависимости: встроены в бинарник (статическая линковка OpenBLAS из Homebrew)

**Итого в npm package (если все платформы собраны):**
- Linux: ~5.5 MB
- Windows: ~18.5 MB
- macOS (ARM64 + Intel): ~10 MB
- **Всего**: ~34 MB (вместе с документацией и скриптами)

**Примечание:** Если вы не собираете macOS версии, размер пакета будет ~24 MB.

---

## CI/CD интеграция

### GitHub Actions пример:

```yaml
name: Build FAISS Binaries

on:
  push:
    branches: [main, dev]
  release:
    types: [created]

jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node 24
        uses: actions/setup-node@v3
        with:
          node-version: 24

      - name: Build FAISS (Linux)
        run: npm run build:faiss:docker

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: faiss-linux-x64
          path: external-libs/faiss-linux-x64/

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node 24
        uses: actions/setup-node@v3
        with:
          node-version: 24

      - name: Build FAISS (Windows)
        run: npm run build:faiss

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: faiss-win32-x64
          path: external-libs/faiss-win32-x64/

  build-macos-arm64:
    runs-on: macos-14  # M1 runner
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node 24
        uses: actions/setup-node@v3
        with:
          node-version: 24

      - name: Install Homebrew dependencies
        run: brew install openblas cmake

      - name: Build FAISS (macOS ARM64)
        run: npm run build:faiss:macos

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: faiss-darwin-arm64
          path: external-libs/faiss-darwin-arm64/

  build-macos-x64:
    runs-on: macos-13  # Intel runner
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node 24
        uses: actions/setup-node@v3
        with:
          node-version: 24

      - name: Install Homebrew dependencies
        run: brew install openblas cmake

      - name: Build FAISS (macOS Intel)
        run: npm run build:faiss:macos

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: faiss-darwin-x64
          path: external-libs/faiss-darwin-x64/
```

---

## Лицензии

- **faiss-node**: MIT License
- **FAISS** (Facebook AI Similarity Search): MIT License
- **OpenBLAS**: BSD-3-Clause
- **LAPACK**: BSD-3-Clause-Open-MPI
- **vcpkg**: MIT License

Все зависимости имеют permissive лицензии и могут использоваться в коммерческих проектах.

---

## Ссылки

- faiss-node GitHub: https://github.com/ewfian/faiss-node
- FAISS GitHub: https://github.com/facebookresearch/faiss
- vcpkg GitHub: https://github.com/Microsoft/vcpkg
- OpenBLAS: https://www.openblas.net/
- Node.js ABI versions: https://nodejs.org/en/download/releases/
