# Setup

*Last updated: 2026-01-15*

Модуль установки и конфигурации embedding и LLM провайдеров с интерактивным пользовательским интерфейсом.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `detectGPU` | function | Обнаруживает NVIDIA GPU через nvidia-smi и определяет архитектуру | [→ setup-hardware.ts:11-56] |
| `printHardwareInfo` | function | Выводит информацию о CPU и GPU в форматированном виде | [→ setup-hardware.ts:58-86] |
| `installProvider` | function | Маршрутизирует установку выбранного embedding провайдера | [→ setup-installers.ts:35-62] |
| `askEnableLLM` | function | Спрашивает пользователя о включении LLM функции AutoDoc | [→ setup-llm.ts:166-182] |
| `selectLLMProvider` | function | Интерактивно выбирает провайдер LLM из доступных опций | [→ setup-llm.ts:186-202] |
| `selectLLMModel` | function | Интерактивно выбирает модель LLM для выбранного провайдера | [→ setup-llm.ts:295-298] |
| `installLLMProvider` | function | Выполняет установку и запуск выбранного LLM провайдера | [→ setup-llm.ts:489-489] |
| `selectLanguage` | function | Интерактивно выбирает язык комментариев кода (English или multi) | [→ setup-selection.ts:14-31] |
| `getProviderRecommendations` | function | Возвращает список рекомендуемых провайдеров на основе аппаратного обеспечения | [→ setup-selection.ts:37-106] |
| `selectProvider` | function | Интерактивно выбирает embedding провайдер из списка рекомендаций | [→ setup-selection.ts:115-127] |
| `selectModel` | function | Интерактивно выбирает embedding модель для выбранного провайдера | [→ setup-selection.ts:152-286] |
| `EmbeddingModel` | interface | Интерфейс конфигурации embedding модели с параметрами и характеристиками | [→ setup-types.ts:5-39] |
| `ModelsConfig` | interface | Интерфейс конфигурации всех доступных embedding моделей и провайдеров | [→ setup-types.ts:41-46] |
| `GPUInfo` | interface | Интерфейс информации о GPU (доступность, архитектура, VRAM) | [→ setup-types.ts:48-55] |
| `LLMModel` | interface | Интерфейс конфигурации LLM модели с контекстом и производительностью | [→ setup-types.ts:57-73] |
| `TGIModel` | interface | Интерфейс модели для Text Generation Inference с GPU архитектурами | [→ setup-types.ts:75-88] |
| `OllamaLLMModel` | interface | Интерфейс модели для Ollama провайдера с токенами в секунду | [→ setup-types.ts:90-100] |
| `LLMConfig` | interface | Интерфейс конфигурации всех доступных LLM моделей и провайдеров | [→ setup-types.ts:102-110] |
| `ProviderOption` | interface | Интерфейс опции провайдера с рекомендацией и характеристиками | [→ setup-types.ts:112-120] |
| `InstallResult` | interface | Интерфейс результата установки провайдера с статусом успеха | [→ setup-types.ts:122-134] |
| `SelectedLLMModel` | interface | Интерфейс выбранной LLM модели с провайдером и параметрами | [→ setup-types.ts:136-144] |
| `c` | const | Объект с ANSI кодами цветов для форматирования консольного вывода | [→ setup-ui.ts:8-11] |
| `printBanner` | function | Выводит приветственный баннер setup модуля в консоль | [→ setup-ui.ts:21-27] |
| `printOK` | function | Выводит зелёное сообщение об успешном выполнении операции | [→ setup-ui.ts:27-42] |
| `printInfo` | function | Выводит голубое информационное сообщение пользователю | [→ setup-ui.ts:27-42] |
| `printWarn` | function | Выводит жёлтое предупреждение о потенциальной проблеме | [→ setup-ui.ts:27-42] |
| `printError` | function | Выводит красное сообщение об ошибке при выполнении | [→ setup-ui.ts:27-42] |
| `prompt` | function | Интерактивно запрашивает ввод строки у пользователя через консоль | [→ setup-ui.ts:27-42] |
| `printCompleteBanner` | function | Выводит финальный баннер об успешном завершении setup | [→ setup-ui.ts:44-46] |

## Files

- **index.ts** — Переэкспортирует все публичные функции и типы модуля setup
- **setup-hardware.ts** — Детектирует GPU и CPU, выводит информацию об аппаратном обеспечении
- **setup-installers.ts** — Маршрутизирует установку embedding провайдеров (vLLM, TEI, llama.cpp, OVMS)
- **setup-llm.ts** — Обработка выбора и установки LLM провайдеров для AutoDoc генератора документации
- **setup-selection.ts** — Интерактивные диалоги выбора языка, провайдера и модели embedding
- **setup-types.ts** — Определяет интерфейсы для конфигурации моделей и провайдеров
- **setup-ui.ts** — Цвета ANSI, печать сообщений и функция интерактивного ввода данных
