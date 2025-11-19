# CUDA Setup Guide

## ⚠️ Правильный порядок установки (КРИТИЧНО!)

**ВНИМАНИЕ**: Порядок установки компонентов КРИТИЧЕН для правильной работы!

### Шаг 1: Установка Visual Studio с C++ (СНАЧАЛА!)

⚠️ **КРИТИЧНО**: Visual Studio ДОЛЖНА быть установлена С C++ компонентами ДО установки CUDA Toolkit!

```powershell
# Установите Visual Studio 2022 Build Tools или Community
winget install Microsoft.VisualStudio.2022.BuildTools

# ИЛИ
winget install Microsoft.VisualStudio.2022.Community
```

После установки выберите компоненты:

**Вариант 1 (РЕКОМЕНДУЕТСЯ)**: Установить весь Workload
1. Запустите Visual Studio Installer
2. Выберите "Изменить" (Modify)
3. Во вкладке "Workloads" выберите:
   - ✅ **Desktop development with C++** (Разработка классических приложений на C++)
4. Нажмите "Modify" и дождитесь установки

**Вариант 2**: Установить минимальные компоненты
1. Запустите Visual Studio Installer
2. Выберите "Изменить" (Modify)
3. Перейдите в "Отдельные компоненты" (Individual components)
4. Установите галочки:
   - ✅ **MSVC v143 - VS 2022 C++ x64/x86 build tools** (ОБЯЗАТЕЛЬНО!)
   - ✅ **C++ CMake tools for Windows**
   - ✅ **Windows 10/11 SDK** (последняя версия)

**Проверка установки C++**:
```powershell
# После установки проверьте наличие компилятора:
& "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
where cl.exe
# Должен вывести путь к cl.exe
```

### Шаг 2: Установка CMake (если не установлен)

```powershell
winget install --id Kitware.CMake
```

**Важно**: После установки перезапустите PowerShell!

### Шаг 3: Установка CUDA Toolkit (ТОЛЬКО ПОСЛЕ Visual Studio!)

```powershell
# Скачайте CUDA Toolkit с официального сайта NVIDIA:
# https://developer.nvidia.com/cuda-downloads

# Выберите:
# - Operating System: Windows
# - Architecture: x86_64
# - Version: 10/11 (ваша версия Windows)
# - Installer Type: exe (network) или exe (local)
```

**КРИТИЧНО**: При установке CUDA Toolkit выберите "Custom Installation" и убедитесь, что выбраны:
- ✅ CUDA → Development (Headers, Libraries)
- ✅ CUDA → Visual Studio Integration
- ✅ CUDA → Runtime

**Почему это важно?**
CUDA Toolkit при установке ищет установленные версии Visual Studio и автоматически интегрируется с ними, копируя необходимые файлы интеграции (CUDA*.props, CUDA*.targets) в директорию MSBuild Visual Studio. Если Visual Studio не установлена ДО установки CUDA - эти файлы НЕ будут скопированы!

### Шаг 4: Проверка установки

```powershell
# Проверьте что все установлено корректно:
cmake --version
nvcc --version

# Проверьте наличие CUDA интеграции:
dir "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\CUDA*.props"
```

Если файлы `CUDA*.props` не найдены - значит CUDA была установлена ДО Visual Studio. Нужно:
1. Удалить CUDA Toolkit
2. Переустановить CUDA Toolkit (она автоматически обнаружит Visual Studio и установит интеграцию)

### Шаг 5: Установка Node.js и npm зависимостей

```powershell
# Установите Node.js v24+ (если не установлен)
winget install OpenJS.NodeJS

# Перезапустите PowerShell

# Установите зависимости проекта
npm install --legacy-peer-deps
```

### Шаг 6: Сборка проекта

```powershell
# Запустите скрипт автоматической настройки
.\scripts\dev-setup.ps1

# ИЛИ соберите вручную:
npm run build
npm run build:cuda  # CUDA native addon (опционально)
```

## Устранение проблем

### Проблема: "Visual C++ compiler not found"

**Причина**: C++ Build Tools не установлены в Visual Studio

**Решение**:
```powershell
# 1. Убедитесь что Visual Studio установлена:
"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath

# 2. Проверьте наличие C++ компилятора:
dir "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\" -ErrorAction SilentlyContinue
# Должна быть папка с версией MSVC (например, 14.XX.XXXXX)

# 3. Если папка пустая или отсутствует:
# - Запустите Visual Studio Installer
# - Нажмите "Modify"
# - Установите "Desktop development with C++"
# - Нажмите "Modify" для установки

# 4. После установки C++, проверьте cl.exe:
& "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
where cl.exe

# 5. Попробуйте собрать снова:
npm run build:cuda
```

**ВАЖНО**: Если вы установили C++ компоненты ПОСЛЕ установки CUDA Toolkit - нужно:
1. Удалить CUDA Toolkit
2. Переустановить CUDA Toolkit (она обнаружит C++ компоненты и установит интеграцию)

### Проблема: "CUDA integration not found"

**Причина**: CUDA была установлена ДО Visual Studio

**Решение**:
1. Панель управления → Удалить программу
2. Удалите NVIDIA CUDA Toolkit
3. Переустановите CUDA Toolkit (она обнаружит VS и установит интеграцию)

### Проблема: "nvcc not found"

**Причина**: CUDA не добавлена в PATH

**Решение**:
```powershell
# Добавьте CUDA в PATH вручную:
$env:Path += ";C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin"

# Для постоянного добавления:
[Environment]::SetEnvironmentVariable(
    "Path",
    $env:Path + ";C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin",
    [EnvironmentVariableTarget]::User
)
```

## Требования к системе

- ✅ **Windows 10/11** (64-bit)
- ✅ **NVIDIA GPU** с поддержкой CUDA (Compute Capability 5.0+)
  - Рекомендуется: RTX 2060 или новее
- ✅ **Visual Studio 2019-2022** (Build Tools или полная версия)
- ✅ **CUDA Toolkit 11.8 - 13.0**
- ✅ **CMake 3.20+**
- ✅ **Node.js 24+**

## Дополнительные ресурсы

- [CUDA Toolkit Documentation](https://docs.nvidia.com/cuda/)
- [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
- [CMake Downloads](https://cmake.org/download/)
