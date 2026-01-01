# Провайдеры (providers)

## Описание модуля

Модуль `providers` реализует систему провайдеров для работы с различными LLM (языковыми моделями) и сервисами, такими как OpenAI, Hugging Face, Ollama и другие. Он предоставляет унифицированный интерфейс для взаимодействия с различными источниками моделей, включая локальные и облачные решения. Модуль использует фабричный паттерн для создания экземпляров провайдеров в зависимости от конфигурации.

## Файлы модуля

| Файл | Описание |
|------|----------|
| `base.ts` | Базовый класс провайдера, определяющий общий интерфейс и методы для работы с моделями |
| `cloudru-provider.ts` | Провайдер для работы с облачными моделями Cloud.ru |
| `factory.ts` | Фабрика для создания экземпляров провайдеров на основе конфигурации (включая auto-detection) |
| `http-engine.ts` | HTTP-движок для выполнения запросов к API провайдеров |
| `huggingface-provider.ts` | Провайдер для работы с моделями из Hugging Face API |
| `ollama-provider.ts` | Провайдер для работы с локальной моделью Ollama (все GPU включая RTX 50xx) |
| `openai-provider.ts` | Провайдер для работы с API OpenAI |
| `openvino-provider.ts` | Провайдер для работы с моделями через Intel OpenVINO (CPU, быстрейший) |
| `tei-provider.ts` | Провайдер для работы с TEI (Text Embedding Inference) Docker |
| `transformers-provider.ts` | Провайдер для работы с моделями из библиотеки Hugging Face Transformers |

## Экспорты

Внутренний модуль. Нет публичных экспортов.

## Пример использования

```typescript
import { createProvider } from './providers/factory';

const provider = createProvider('openai', {
  apiKey: 'your-api-key',
  model: 'gpt-4'
});

const result = await provider.generate('Привет, как дела?');
```