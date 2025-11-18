# CUDA Toolkit Installation Guide

Инструкция по установке CUDA Toolkit для максимальной производительности (100-200x speedup).

## Зачем нужен CUDA?

CUDA Toolkit позволяет использовать CUDA Native Backend - самый быстрый вариант GPU ускорения:

| Backend | Performance | Availability |
|---------|------------|--------------|
| Pure JS | 10ms (baseline) | ✅ Всегда доступен |
| WASM SIMD | 2-3ms (4-8x) | ✅ Требует Rust |
| WebGPU | 0.2-0.3ms (50-100x) | ✅ Все GPU |
| **CUDA** | **0.1-0.2ms (100-200x)** | ⚠️ Только NVIDIA |

**CUDA - optional** - проект работает без него, но дает максимальную производительность на NVIDIA GPU.

---

## Системные требования

- ✅ **NVIDIA GPU** (GTX 1650 Ti или новее, Compute Capability 7.5+)
- ✅ **Обновленные драйверы NVIDIA** (версия 450+ для CUDA 11.x)
- ✅ **Операционная система**:
  - Windows 10/11 (64-bit)
  - Linux (Ubuntu 18.04+, CentOS 7+, etc.)
  - macOS не поддерживается (NVIDIA прекратила поддержку CUDA на macOS)

---

## Установка CUDA Toolkit

### Windows

#### Шаг 1: Проверка GPU

```powershell
# Проверить наличие NVIDIA GPU
nvidia-smi

# Если команда не найдена - установите драйверы NVIDIA:
# https://www.nvidia.com/Download/index.aspx
```

#### Шаг 2: Скачать CUDA Toolkit

1. Перейти на https://developer.nvidia.com/cuda-downloads
2. Выбрать:
   - **Operating System**: Windows
   - **Architecture**: x86_64
   - **Version**: 10 или 11
   - **Installer Type**: exe (network) - рекомендуется
3. Скачать установщик (~3GB)

**Рекомендуемая версия**: CUDA 11.8 или 12.x

#### Шаг 3: Установить CUDA Toolkit

```powershell
# Запустить скачанный установщик
cuda_11.8.0_522.06_windows.exe

# Выбрать "Custom" установку:
# ✅ CUDA Toolkit
# ✅ CUDA Compiler (nvcc)
# ✅ Development Tools
# ❌ Visual Studio Integration (опционально)
# ❌ Nsight (опционально, только для разработки)
```

**Важно**: Установщик добавит `nvcc` в PATH автоматически.

#### Шаг 4: Установить Visual Studio Build Tools

CUDA на Windows требует Visual Studio C++ compiler:

1. Скачать: https://visualstudio.microsoft.com/downloads/
2. Установить **Visual Studio 2019 или 2022**
3. Выбрать workload: **Desktop development with C++**

**Альтернатива** (только Build Tools без IDE):
```powershell
# Скачать Visual Studio Build Tools
https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

# При установке выбрать:
# ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools
# ✅ Windows 10 SDK
```

#### Шаг 5: Проверить установку

```powershell
# Проверить CUDA Toolkit
nvcc --version

# Ожидаемый вывод:
# nvcc: NVIDIA (R) Cuda compiler driver
# Cuda compilation tools, release 11.8, V11.8.89

# Проверить компилятор MSVC
cl

# Если команда не найдена, запустите:
# "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
```

#### Шаг 6: Собрать CUDA backend

```powershell
# В корне проекта
npm install

# Postinstall автоматически попытается собрать CUDA backend
# Если не получилось, соберите вручную:
npm run build:cuda
```

---

### Linux (Ubuntu/Debian)

#### Шаг 1: Проверка GPU

```bash
# Проверить наличие NVIDIA GPU
nvidia-smi

# Если команда не найдена - установите драйверы:
sudo ubuntu-drivers autoinstall
sudo reboot
```

#### Шаг 2: Установить CUDA Toolkit

**Метод 1: Через APT (рекомендуется для Ubuntu)**

```bash
# Добавить NVIDIA CUDA repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update

# Установить CUDA Toolkit 11.8
sudo apt-get install cuda-11-8

# Или последнюю версию:
sudo apt-get install cuda
```

**Метод 2: Через runfile installer**

```bash
# Скачать installer
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_520.61.05_linux.run

# Запустить установку
sudo sh cuda_11.8.0_520.61.05_linux.run

# Следовать инструкциям:
# ✅ CUDA Toolkit
# ✅ CUDA Compiler
# ❌ Driver (если уже установлен)
```

#### Шаг 3: Настроить переменные окружения

```bash
# Добавить в ~/.bashrc или ~/.zshrc
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc

# Перезагрузить shell
source ~/.bashrc
```

#### Шаг 4: Установить build tools

```bash
# Ubuntu/Debian
sudo apt-get install build-essential cmake

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install cmake
```

#### Шаг 5: Проверить установку

```bash
# Проверить CUDA Toolkit
nvcc --version

# Проверить драйверы
nvidia-smi

# Проверить CMake
cmake --version
```

#### Шаг 6: Собрать CUDA backend

```bash
# В корне проекта
npm install

# Postinstall автоматически соберет CUDA backend если доступен
# Или вручную:
npm run build:cuda
```

---

## Проверка работы CUDA Backend

После установки и сборки:

```bash
# Собрать TypeScript
npm run build

# Проверить какой backend выбран
node -e "
import('./dist/gpu/backend-selector.js').then(async m => {
  const selector = m.BackendSelector.getInstance();
  const backend = await selector.initialize();
  console.log('✅ Selected backend:', backend.name);
  console.log('   Type:', backend.type);
  console.log('   Priority:', backend.priority);
})
"

# Ожидаемый вывод если CUDA доступен:
# ✅ Selected backend: CUDA Native
#    Type: cuda
#    Priority: 100
```

---

## Устранение проблем

### Windows

**Проблема**: `nvcc: command not found`

**Решение**:
```powershell
# Проверить PATH
echo $env:PATH

# Добавить вручную (замените на вашу версию):
$env:PATH += ";C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8\bin"

# Или через System Properties → Environment Variables
```

**Проблема**: `LINK : fatal error LNK1104: cannot open file 'cudart.lib'`

**Решение**:
```powershell
# Проверить CUDA_PATH
echo $env:CUDA_PATH

# Если не установлен:
$env:CUDA_PATH = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8"
```

**Проблема**: `MSBuild version not supported`

**Решение**: Установите Visual Studio 2019 или 2022 (см. Шаг 4)

---

### Linux

**Проблема**: `nvcc: command not found`

**Решение**:
```bash
# Найти CUDA installation
find /usr/local -name nvcc

# Добавить в PATH (example для /usr/local/cuda-11.8)
export PATH=/usr/local/cuda-11.8/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH
```

**Проблема**: `cannot find -lcudart`

**Решение**:
```bash
# Проверить библиотеки CUDA
ls /usr/local/cuda/lib64 | grep cudart

# Если не найдены - переустановите CUDA Toolkit
```

**Проблема**: `Unsupported gpu architecture 'compute_XX'`

**Решение**: Ваша GPU не поддерживается. Требуется Compute Capability 7.5+.

```bash
# Проверить Compute Capability вашей GPU
nvidia-smi --query-gpu=compute_cap --format=csv

# Если < 7.5 - используйте WebGPU или WASM backends
```

---

## Альтернативы CUDA

Если CUDA недоступен или не подходит:

### 1. WebGPU (рекомендуется для всех GPU)

```bash
npm install webgpu --save-optional
```

- ✅ Работает на **всех** GPU (NVIDIA, AMD, Intel)
- ✅ 50-100x speedup (почти как CUDA)
- ✅ Кроссплатформенность
- ❌ Чуть медленнее CUDA на NVIDIA GPU

### 2. WASM SIMD (всегда работает)

```bash
# Требуется Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Собрать WASM
npm run build:wasm
```

- ✅ Работает **везде** (CPU SIMD)
- ✅ 4-8x speedup
- ✅ Легкая установка
- ❌ Медленнее GPU backends

---

## Версии CUDA

| CUDA Version | Release | Min Driver | GTX 1650 Ti | RTX 5060 | Recommended |
|--------------|---------|------------|-------------|----------|-------------|
| 11.8 | 2022 | 450.80 | ✅ Yes | ✅ Yes | ⭐ Best compatibility |
| 12.0 | 2023 | 525.60 | ✅ Yes | ✅ Yes | Latest features |
| 12.1+ | 2023+ | 530+ | ✅ Yes | ✅ Yes | Cutting edge |

**Рекомендация**: CUDA 11.8 для максимальной совместимости, CUDA 12.x для новейших GPU.

---

## Дополнительные ресурсы

- **CUDA Downloads**: https://developer.nvidia.com/cuda-downloads
- **CUDA Installation Guide (Official)**: https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/
- **NVIDIA Driver Downloads**: https://www.nvidia.com/Download/index.aspx
- **GPU Compute Capability**: https://developer.nvidia.com/cuda-gpus

---

## Автоматизация через Postinstall

После установки CUDA Toolkit, просто выполните:

```bash
npm install
```

Postinstall script автоматически:
1. ✅ Обнаружит CUDA Toolkit
2. ✅ Проверит версию nvcc
3. ✅ Соберет CUDA native addon
4. ✅ Покажет результаты сборки

Если CUDA недоступен - проект продолжит работу с другими backends (WebGPU/WASM/Pure JS).

---

**Не хочется устанавливать CUDA?** - Используйте WebGPU или WASM SIMD backends! Они обеспечивают отличную производительность без сложной установки.
