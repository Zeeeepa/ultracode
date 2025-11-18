# Build Script - Сообщения для пользователя

## Визуализация сообщений об ошибках

### Сценарий 1: Visual Studio C++ компилятор не найден

```
[WARNING] Visual Studio C++ compiler (cl.exe) not found

[INFO] CUDA module requires C++ компилятор из Visual Studio

Если у вас Visual Studio 2022 (любая версия):
  1. Откройте Visual Studio Installer
  2. Нажмите "Изменить" (Modify) на VS 2022
  3. Выберите компонент: "Разработка классических приложений на C++"
     (Desktop development with C++)
  4. Нажмите "Изменить" и дождитесь установки (~6-8 GB)

Если Visual Studio НЕ установлена:
  1. Скачайте Build Tools: https://aka.ms/vs/17/release/vs_BuildTools.exe
  2. При установке выберите: "Desktop development with C++"

После установки запускайте сборку из:
  "Developer Command Prompt for VS 2022"

[SKIP] Skipping CUDA build (missing C++ compiler)
```

### Сценарий 2: CMake не найден

```
[WARNING] CMake not found, cannot build CUDA module

[INFO] Установите CMake для сборки CUDA модуля:
  - Скачать: https://cmake.org/download/
  - Или через winget: winget install Kitware.CMake

После установки CMake также потребуется:
  - Visual Studio компонент: "Desktop development with C++"
```

### Сценарий 3: CUDA Toolkit не найден

```
[SKIP] CUDA Toolkit not found

[INFO] Для GPU ускорения (100-200x быстрее для embeddings) установите CUDA:

  1. Скачайте CUDA Toolkit 13.x:
     https://developer.nvidia.com/cuda-downloads

  2. Установите CUDA Toolkit (~3GB)
     Требования: NVIDIA GPU + актуальные драйверы

  3. Установите компонент Visual Studio:
     "Разработка классических приложений на C++"
     (Desktop development with C++)

  4. Запустите сборку из:
     "Developer Command Prompt for VS 2022"

  Поддерживаются GPU: NVIDIA RTX 2060 и новее (Compute Capability 7.5+)
```

### Сценарий 4: Успешная сборка CUDA

```
[INFO] CUDA Toolkit detected: v13.0
[INFO] Using CUDA_PATH: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
[INFO] Building CUDA native module...
  - Source directory: ..\native\cuda
  - CUDA version: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
  - C++ Compiler: Found
  - This may take 3-5 minutes...

[Компиляция CUDA...]

[OK] CUDA module built successfully
[OK] Output: dist\native\cuda\ultrascript_cuda.node
```

## Ключевые названия компонентов

### Русский (в Visual Studio Installer на русском)
- **"Разработка классических приложений на C++"**

### English (in Visual Studio Installer in English)
- **"Desktop development with C++"**

### Что включает этот компонент:
- ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools
- ✅ Windows 11 SDK (10.0.22621.0+)
- ✅ C++ CMake tools for Windows
- ✅ C++ core features
- ✅ Just-In-Time debugger

### Размер установки:
- ~6-8 GB (в зависимости от выбранных подкомпонентов)
- Время: ~5-10 минут

## Проверка установки

### Открыть Developer Command Prompt:
```
Win + S → "Developer Command Prompt for VS 2022"
```

### Проверить компилятор:
```cmd
where cl.exe
cl.exe

# Ожидаемый вывод:
# C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC\14.XX.XXXXX\bin\Hostx64\x64\cl.exe
# Microsoft (R) C/C++ Optimizing Compiler Version 19.XX.XXXXX for x64
```

### Проверить CUDA:
```cmd
where nvcc
nvcc --version

# Ожидаемый вывод:
# C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin\nvcc.exe
# nvcc: NVIDIA (R) Cuda compiler driver
# Cuda compilation tools, release 13.0, ...
```

## Частые ошибки и решения

### ❌ Ошибка: "cl.exe не найден" после установки

**Причина:** Запущен обычный cmd.exe вместо Developer Command Prompt

**Решение:**
1. Закройте обычный cmd.exe
2. Откройте: `Win + S` → `"Developer Command Prompt for VS 2022"`
3. Запустите сборку снова

### ❌ Ошибка: "Cannot find Windows SDK"

**Причина:** Не установлен Windows SDK (обычно устанавливается автоматически с "Desktop development with C++")

**Решение:**
1. Visual Studio Installer → Modify VS 2022
2. Individual components → найти "Windows 11 SDK (10.0.22621.0)"
3. Поставить галочку → Modify

### ❌ Ошибка: "LINK : fatal error LNK1104: cannot open file 'kernel32.lib'"

**Причина:** Windows SDK не установлен или PATH не настроен

**Решение:** См. решение для "Cannot find Windows SDK" выше

## Быстрый старт - чек-лист

### Для вашего случая (Visual Studio 2022 Professional уже установлена):

- [ ] 1. Открыть Visual Studio Installer
- [ ] 2. Нажать "Изменить" на VS 2022 Professional
- [ ] 3. Выбрать workload: **"Разработка классических приложений на C++"**
- [ ] 4. Нажать "Изменить" и дождаться установки
- [ ] 5. Открыть **"Developer Command Prompt for VS 2022"**
- [ ] 6. Запустить: `cd D:\OneDrive\_mcp\ultrascript-tools-mcp`
- [ ] 7. Запустить: `Dev.Scripts\build-bun.cmd`
- [ ] 8. Проверить вывод: `[OK] CUDA module built successfully`
- [ ] 9. Проверить файл: `dist\native\cuda\ultrascript_cuda.node`

Готово! 🚀
