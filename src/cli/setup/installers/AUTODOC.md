# Installers

*Last updated: 2026-01-13*

Модуль инсталляторов для различных поставщиков моделей встраивания

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `installLlamaCpp` | function | Скачивает и устанавливает бинарный файл llama-server с моделями | [→ llamacpp-installer.ts:402-409] |
| `installOllama` | function | Проверяет установку и запускает сервис Ollama для встраивания | [→ ollama-installer.ts:11-65] |
| `installOVMSNative` | function | Устанавливает OpenVINO Model Server с поддержкой нескольких устройств | [→ ovms-installer.ts:15-468] |
| `installTEI` | function | Развёртывает контейнер с Text Embeddings Inference и моделями | [→ tei-installer.ts:17-19] |
| `installVLLM` | function | Создаёт контейнер vLLM с поддержкой OpenAI-совместимого API | [→ vllm-installer.ts:14-192] |

## Files

- **index.ts** — Экспортирует функции инсталляции для всех поставщиков моделей
- **llamacpp-installer.ts** — Установка llama.cpp с автоматическим определением GPU бэкенда
- **ollama-installer.ts** — Установка и запуск Ollama с загрузкой моделей встраивания
- **ovms-installer.ts** — Установка OpenVINO Model Server без Docker с поддержкой NPU
- **tei-installer.ts** — Развёртывание Text Embeddings Inference через Docker контейнер
- **vllm-installer.ts** — Развёртывание vLLM для NVIDIA GPU через Docker контейнер
