# Visual Studio 2022 - Установка компонентов для CUDA

## ✅ У вас уже установлено:
- Visual Studio 2022 Professional
- CUDA Toolkit v13.0

## ❌ Не хватает:
- C++ компилятор (MSVC)
- Windows SDK
- CMake tools

## 🔧 Шаги установки:

### 1. Откройте Visual Studio Installer

**Способ 1:** Через поиск Windows
```
Win + S → "Visual Studio Installer" → Enter
```

**Способ 2:** Через меню Start
```
Start → Visual Studio 2022 → Visual Studio Installer
```

### 2. Измените установку VS 2022

В Visual Studio Installer:
1. Найдите **Visual Studio Professional 2022**
2. Нажмите кнопку **"Изменить"** (Modify)

### 3. Выберите Workload

В окне модификации:

#### Вкладка "Workloads":
✅ **Разработка классических приложений на C++** (Desktop development with C++)

Это автоматически установит основные компоненты.

#### Вкладка "Individual components" (опционально, для проверки):

Убедитесь что выбраны (обычно выбираются автоматически):

**Компиляторы, инструменты сборки и среды выполнения:**
- ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools (latest)
- ✅ C++ 2022 Redistributable Update
- ✅ C++ CMake tools for Windows

**SDK, библиотеки и платформы:**
- ✅ Windows 11 SDK (10.0.22621.0 или новее)

**Средства для работы с кодом:**
- ✅ C++ core features
- ✅ Just-In-Time debugger

### 4. Запустите установку

1. Нажмите кнопку **"Изменить"** внизу окна
2. Подождите завершения установки (~5-10 минут)
3. После установки может потребоваться перезагрузка

## 🧪 Проверка установки

После установки компонентов, откройте **Developer Command Prompt for VS 2022**:

```cmd
# Способ 1: Через поиск
Win + S → "Developer Command Prompt for VS 2022"

# Способ 2: Через меню Start
Start → Visual Studio 2022 → Developer Command Prompt for VS 2022
```

В открывшейся командной строке выполните:

```cmd
# Проверка компилятора C++
where cl.exe
cl.exe

# Должен вывести:
# Microsoft (R) C/C++ Optimizing Compiler Version 19.XX.XXXXX for x64
# Copyright (C) Microsoft Corporation.  All rights reserved.

# Проверка CUDA
where nvcc
nvcc --version

# Должен вывести:
# nvcc: NVIDIA (R) Cuda compiler driver
# Copyright (c) 2005-2024 NVIDIA Corporation
# Cuda compilation tools, release 13.0, ...
```

Если все команды работают - компоненты установлены правильно! ✅

## 🚀 Сборка CUDA модуля

После успешной установки компонентов:

```cmd
# В Developer Command Prompt for VS 2022:

cd D:\OneDrive\_mcp\ultrascript-tools-mcp
Dev.Scripts\build-bun.cmd
```

**Ожидаемый вывод:**
```
[INFO] CUDA Toolkit detected: v13.0
[INFO] Using CUDA_PATH: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
[INFO] Building CUDA native module...
  - Source directory: ..\native\cuda
  - CUDA version: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
  - C++ Compiler: Found ✅
  - This may take 3-5 minutes...

[Компиляция...]

[OK] CUDA module built successfully ✅
[OK] Output: dist\native\cuda\ultrascript_cuda.node
```

## 📦 Размер установки

- **Desktop development with C++**: ~6-8 GB
- Время установки: ~5-10 минут (зависит от скорости интернета)

## ❓ Если возникли проблемы

### Проблема: "cl.exe не найден" после установки

**Решение 1:** Обязательно используйте **Developer Command Prompt for VS 2022**
- НЕ обычный cmd.exe
- НЕ PowerShell
- Только Developer Command Prompt (он настраивает PATH автоматически)

**Решение 2:** Вручную запустить vcvars64.bat
```cmd
"C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
```

### Проблема: "Cannot find Windows SDK"

**Решение:** В Visual Studio Installer:
1. Вкладка "Individual components"
2. Найти: "Windows 11 SDK (10.0.22621.0)"
3. Поставить галочку
4. Нажать "Modify"

### Проблема: "LINK : fatal error LNK1104: cannot open file 'kernel32.lib'"

**Решение:** Не установлен Windows SDK. См. решение выше.

## 🎯 Итого - что установить:

1. ✅ Открыть Visual Studio Installer
2. ✅ Изменить Visual Studio Professional 2022
3. ✅ Выбрать: "Desktop development with C++"
4. ✅ Нажать "Modify" и дождаться установки
5. ✅ Открыть Developer Command Prompt for VS 2022
6. ✅ Запустить: `Dev.Scripts\build-bun.cmd`

Готово! 🚀
