# OVMS Setup for UltraScript Tools

## Quick Start (Рекомендуется)

### Option 1: Docker (Простейший вариант)

```bash
# Запуск OVMS с моделью embeddings
docker run -d --name ovms -p 8082:8082 \
  -v ~/.local/share/ultrascript-tools/ovms/models:/models \
  openvino/model_server:latest \
  --model_path /models/multilingual-e5-base --model_name embeddings --port 8082
```

### Option 2: ToMe Tools Only (Конвертация моделей)

ToMe (Token Merging) дает 1.5-2x ускорение с потерей точности <1%.

**Windows:**
```cmd
scripts\setup-tome-tools.cmd
```

**Linux:**
```bash
./scripts/setup-tome-tools.sh
```

После установки:
```bash
python convert_tome_model.py --model intfloat/multilingual-e5-base --output ./models
```

## Native OVMS Build (Продвинутый)

### Linux

```bash
./scripts/setup-ovms-nvidia.sh
```

Требования:
- GCC/Clang
- CMake
- vcpkg (скачается автоматически)
- OpenVINO 2025.4.0 (скачается автоматически)

### Windows

```cmd
scripts\setup-ovms-nvidia.cmd
```

**ВАЖНО:** OVMS на Windows требует Visual Studio 2019 (toolset v142).

Если у вас VS2022/VS2026, нужно дополнительно установить VS2019 Build Tools:
https://visualstudio.microsoft.com/vs/older-downloads/

## Структура каталогов

```
Windows: %LOCALAPPDATA%\UltraScriptTools\
Linux:   ~/.local/share/ultrascript-tools/

├── ovms/
│   ├── ovms.exe (или ovms на Linux)
│   └── models/
│       └── multilingual-e5-base/
│           └── 1/
│               ├── model.xml
│               └── model.bin
├── openvino/       (автоматически скачается)
└── tome/
    └── convert_tome_model.py
```

## ToMe Параметры

| Ratio | Speedup | Accuracy Loss |
|-------|---------|---------------|
| 0.0   | 1.0x    | 0%            |
| 0.3   | ~1.4x   | <0.5%         |
| 0.5   | ~2.0x   | <1%           |
| 0.7   | ~3.3x   | ~2%           |

**Рекомендация для embeddings: ratio=0.3**

## Конфигурация в UltraScript Tools

После установки OVMS, настройте `semantic-config.json`:

```json
{
  "enabled": true,
  "embedding": {
    "platform": "ovms",
    "architecture": "cuda",
    "ovms": {
      "endpoint": "http://localhost:8082",
      "batch_size": 32,
      "selected_model": "multilingual-e5-base",
      "target_device": "NVIDIA"
    }
  }
}
```

Или запустите:
```bash
npx ultrascript-tools setup
```

## Рекомендуемые модели

| Модель | Размер | Языки | Dimensions |
|--------|--------|-------|------------|
| multilingual-e5-base | 278M | 100+ | 768 |
| multilingual-e5-small | 118M | 100+ | 384 |
| all-MiniLM-L6-v2 | 23M | EN | 384 |
| bge-m3 | 567M | 100+ | 1024 |
| bge-small-en-v1.5 | 33M | EN | 384 |

## Устранение проблем

### OVMS не запускается

1. Проверьте что порт 8082 свободен
2. Проверьте логи: `docker logs ovms`
3. Убедитесь что модель конвертирована правильно

### Build fails on Windows

OVMS требует VS2019 toolset. Установите VS2019 Build Tools или используйте Docker.

### OpenVINO не найден

Скрипты автоматически скачают OpenVINO 2025.4.0. Если это не работает, скачайте вручную:
- Windows: https://storage.openvinotoolkit.org/repositories/openvino/packages/2025.4/windows/
- Linux: https://storage.openvinotoolkit.org/repositories/openvino/packages/2025.4/linux/
