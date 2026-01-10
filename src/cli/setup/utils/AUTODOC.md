# Utils

*Last updated: 2026-01-10*

Утилиты для проверки и управления Docker, Ollama, GPU и конфигурации устройств.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `checkDocker` | function | Проверяет доступность Docker и запущенность демона | [→ docker.ts:10-53] |
| `cleanupDockerLlamaServer` | function | Завершает процесс Docker llama-server на Windows | [→ docker.ts:63-76] |
| `checkOllama` | function | Проверяет установку Ollama с повторными попытками по таймауту | [→ docker.ts:78-117] |
| `USE_NVIDIA_GPU_1` | const | Флаг для включения поддержки NVIDIA GPU вместо Intel iGPU | [→ multi-device.ts:39-193] |
| `createMultiDeviceConfig` | function | Создаёт конфигурацию для параллельного вывода GPU и CPU | [→ multi-device.ts:52-193] |
| `generateEndpointsArray` | function | Генерирует массив точек доступа для устройств | [→ multi-device.ts:199-212] |
| `checkNvidiaContainerToolkit` | function | Проверяет и настраивает NVIDIA Container Toolkit для Docker GPU | [→ nvidia-toolkit.ts:15-175] |
| `sleep` | function | Асинхронная функция паузы совместимая с Bun и Node.js | [→ runtime.ts:10-16] |

## Files

- **docker.ts** — Проверка Docker и Ollama, очистка процессов llama-server
- **index.ts** — Переэкспорт всех функций утилит для использования
- **multi-device.ts** — Создание конфигурации для работы на нескольких устройствах
- **nvidia-toolkit.ts** — Проверка и настройка NVIDIA Container Toolkit для GPU
- **runtime.ts** — Кросс-платформенные утилиты для Node.js и Bun совместимости
