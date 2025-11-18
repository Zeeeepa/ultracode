# Embeddings Setup Guide

Руководство по настройке эмбеддингов для семантического анализа кода.

## Оглавление

- [Быстрый старт](#быстрый-старт)
- [🆕 TEI - Локальный инференс с 8192 токенами](#-tei---локальный-инференс-с-8192-токенами)
- [🆕 Новые модели с расширенным контекстом](#-новые-модели-с-расширенным-контекстом-8192-токена)
- [Версии моделей](#версии-моделей)
- [Настройка модели в конфиге](#настройка-модели-в-конфиге)
- [Что такое эмбеддинги](#что-такое-эмбеддинги)
- [Автоматическая установка](#автоматическая-установка)
- [Ручная установка](#ручная-установка)
- [Конфигурация](#конфигурация)
- [🆕 Адаптивные векторные бэкенды](#адаптивные-векторные-бэкенды)
- [Проверка работоспособности](#проверка-работоспособности)
- [Альтернативные провайдеры](#альтернативные-провайдеры)
- [Troubleshooting](#troubleshooting)

---

## Быстрый старт

### 🎯 Интерактивная установка (рекомендуется)

**Windows:**
```cmd
setup-embeddings-interactive.cmd
```

**macOS/Linux:**
```bash
chmod +x setup-embeddings-interactive.sh
./setup-embeddings-interactive.sh
```

**Что предлагает интерактивный скрипт:**

1. **TEI (Text Embeddings Inference)** 🏆 **РЕКОМЕНДУЕТСЯ**
   - ✅ 8192 токена контекста (16x больше чем Ollama)
   - ⚡ Оптимизированная производительность
   - 🐳 Требует Docker Desktop
   - 📦 ~2 GB (образ + модель)

2. **Ollama** - Альтернатива без Docker
   - ✅ Простая установка
   - ⚠️ 512 токенов контекста
   - 📦 ~200 MB

3. **Memory Provider** - Без установки
   - ⚠️ Без ML эмбеддингов (детерминированный хеш)

### Автоматическая установка (только Ollama, legacy)

**Windows:**
```cmd
setup-embeddings.cmd
```

**macOS/Linux:**
```bash
chmod +x setup-embeddings.sh
./setup-embeddings.sh
```

Скрипт автоматически:
1. Установит Ollama (если не установлен)
2. Скачает **IBM Granite Embedding 278M** модель (~150 MB)
3. Проверит работоспособность
4. Подскажет как включить в конфиге

> ⚠️ **LEGACY СКРИПТ**: Устанавливает только Ollama (512 токенов контекста).
> **Рекомендуется использовать** `setup-embeddings-interactive.sh` для выбора между TEI (8192 токена) и Ollama.

### Включение эмбеддингов

**Вариант 1: Через конфиг (config/development.yaml)**
```yaml
mcp:
  embedding:
    provider: "auto"        # Автодетект Ollama > Memory
    enabled: true           # Включить эмбеддинги
```

**Вариант 2: Через переменные окружения**
```bash
# Windows
set MCP_EMBEDDING_PROVIDER=auto
set MCP_EMBEDDING_ENABLED=true

# Unix/macOS
export MCP_EMBEDDING_PROVIDER=auto
export MCP_EMBEDDING_ENABLED=true
```

**Готово!** Запускайте MCP сервер, эмбеддинги будут работать автоматически.

> 🚀 **Auto-Start:** MCP сервер автоматически проверяет Ollama при запуске и запускает его, если не запущен.
> Вам не нужно вручную запускать `ollama serve` - все происходит автоматически!

---

## 🆕 TEI - Локальный инференс с 8192 токенами

**⚠️ ТРЕБУЕТ RTX 30xx/40xx GPU** (Ampere/Ada, Compute Capability 8.0+)
**❌ НЕ РАБОТАЕТ** на GTX 16xx/20xx (Turing, CC 7.5) и CPU

**Text Embeddings Inference (TEI)** - это оптимизированный Docker контейнер от HuggingFace для быстрого локального инференса эмбеддингов.

### Минимальные требования GPU
- ✅ RTX 30xx серия (3060, 3070, 3080, 3090)
- ✅ RTX 40xx серия (4060, 4070, 4080, 4090)
- ❌ GTX 16xx серия (1650, 1660)
- ❌ RTX 20xx серия (2060, 2070, 2080)
- ❌ CPU-only системы

### 🚀 Преимущества TEI

| Характеристика | TEI | Ollama | HuggingFace API |
|----------------|-----|--------|-----------------|
| **Контекст** | ✅ 8192 токена | ⚠️ 512 токенов | ✅ 8192 токена |
| **Локально** | ✅ Да | ✅ Да | ❌ Cloud |
| **API ключ** | ✅ Не нужен | ✅ Не нужен | ❌ Требуется |
| **Производительность** | ⚡⚡⚡⚡⚡ | ⚡⚡⚡⚡ | ⚡⚡⚡ |
| **Batch processing** | ✅ Да | ✅ Да | ✅ Да |
| **Auto-restart** | ✅ Да | ⚠️ Ручной | N/A |

### 📦 Быстрая установка

**Unix/macOS/Linux:**
```bash
chmod +x setup-tei.sh
./setup-tei.sh
```

**Windows:**
```cmd
setup-tei.cmd
```

**Что делает скрипт:**
1. ✅ Проверяет Docker (требуется Docker Desktop)
2. ✅ Скачивает TEI образ (~1 GB)
3. ✅ Скачивает модель `ibm-granite/granite-embedding-english-r2` (~600 MB)
4. ✅ Создает контейнер с auto-restart
5. ✅ Проверяет работоспособность

**Требования:**
- Docker Desktop установлен и запущен
- ~2 GB свободного места
- Порт 8080 свободен

### ⚙️ Конфигурация (уже настроено по умолчанию!)

```yaml
# config/default.yaml
mcp:
  embedding:
    provider: "tei"                                      # TEI провайдер
    model: "ibm-granite/granite-embedding-english-r2"   # 8192 токена!
    enabled: true                                        # Включено

    tei:
      baseUrl: "http://127.0.0.1:8080"  # TEI сервер
      timeoutMs: 30000                   # 30 секунд timeout
      concurrency: 4                     # Параллельные запросы
      checkServer: true                  # Auto-start контейнера
```

### 🔧 Доступные модели для TEI

| Модель | Параметры | Контекст | Размер | Рекомендация |
|--------|-----------|----------|--------|--------------|
| **ibm-granite/granite-embedding-english-r2** | 149M | **8192** | ~600 MB | 🏆 **По умолчанию** |
| ibm-granite/granite-embedding-small-english-r2 | 47M | **8192** | ~190 MB | ⚡ Быстрая |

**Установка с другой моделью:**
```bash
# Быстрая версия
./setup-tei.sh --model ibm-granite/granite-embedding-small-english-r2

# На другом порту
./setup-tei.sh --port 8081
```

### 🎯 Автоматический запуск контейнера

MCP автоматически проверяет и запускает TEI контейнер при инициализации:

```typescript
// При запуске MCP:
1. Проверяет http://127.0.0.1:8080/health
2. Если не отвечает → проверяет существование контейнера
3. Если найден → запускает: docker start tei-server
4. Ждет готовности (max 30 секунд)
5. Если ошибка → fallback на memory provider
```

### 🔍 Управление контейнером

```bash
# Просмотр логов
docker logs tei-server

# Остановка
docker stop tei-server

# Запуск
docker start tei-server

# Удаление
docker rm -f tei-server

# Статус
docker ps --filter "name=tei-server"
```

### 🧪 Проверка работы

```bash
# Health check
curl http://localhost:8080/health

# Тест эмбеддинга
curl -X POST http://localhost:8080/embed \
  -H 'Content-Type: application/json' \
  -d '{"inputs": "Hello world"}'
```

### 🔄 Альтернатива: HuggingFace Cloud API

Если Docker недоступен, можно использовать облачный API:

```yaml
# config/default.yaml
mcp:
  embedding:
    provider: "huggingface"
    model: "ibm-granite/granite-embedding-english-r2"
    enabled: true
    apiKey: "hf_..."  # Получить на https://huggingface.co/settings/tokens
```

**Минусы cloud API:**
- ❌ Требует API ключ
- ❌ Зависит от интернета
- ❌ Медленнее из-за сети

---

## 🆕 Новые модели с расширенным контекстом (8192 токена) - Ollama

IBM Granite выпустил новое поколение моделей с **16x больше контекста**: 8192 токена вместо 512!

### 🏆 Рекомендуемые модели 2025

| Модель | Контекст | Dimension | Параметры | Размер | Языки | Рекомендация |
|--------|----------|-----------|-----------|--------|-------|--------------|
| **granite-embedding-english-r2** | **8192** | 768 | 149M | ~600 MB | English | 🏆 **По умолчанию** |
| granite-embedding-small-english-r2 | **8192** | 384 | 47M | ~190 MB | English | ⚡ Быстрая версия |
| granite-embedding | 512 | 768 | 278M | ~150 MB | Multilingual | 🌐 Русский+Английский |
| granite-embedding:30m | 512 | 384 | 30M | ~50 MB | English | 🥈 Легковесная |

### 📦 Установка новых моделей

```bash
# 🏆 Лучшая для английского кода (8192 токена!)
ollama pull ibm-granite/granite-embedding-english-r2

# ⚡ Быстрая версия (8192 токена, меньше модель)
ollama pull ibm-granite/granite-embedding-small-english-r2

# 🔄 Reranker для максимальной точности (опционально)
ollama pull ibm-granite/granite-embedding-reranker-english-r2
```

### ⚙️ Настройка в config/development.yaml

**По умолчанию (уже настроено):**
```yaml
mcp:
  embedding:
    # 🏆 RECOMMENDED: English-only codebases (8192 tokens, best quality)
    model: "granite-embedding-english-r2"
    provider: "ollama"
    enabled: true
```

**Для multilingual кодовых баз (русский + английский):**
```yaml
mcp:
  embedding:
    # 🌐 MULTILINGUAL: Russian + English codebases (512 tokens)
    model: "granite-embedding"
    provider: "ollama"
    enabled: true
    queryLanguage: "multilingual"  # Подсказка для оптимизации
```

**Для максимальной скорости:**
```yaml
mcp:
  embedding:
    # ⚡ LIGHTWEIGHT: English-only, fast (8192 tokens, smaller model)
    model: "granite-embedding-small-english-r2"
    provider: "ollama"
    enabled: true
```

### 🔬 Продвинутая настройка: Two-stage retrieval с reranker

Для максимальной точности можно включить двухэтапный поиск:

```yaml
mcp:
  embedding:
    model: "granite-embedding-english-r2"
    provider: "ollama"
    enabled: true

    # Двухэтапный поиск с reranker
    useReranker: true
    rerankerModel: "granite-embedding-reranker-english-r2"
    rerankerTopK: 100   # Этап 1: найти 100 кандидатов
    rerankerFinalK: 10  # Этап 2: уточнить до топ-10
```

**Как это работает:**
1. **Embedding модель** (быстрая) - находит 100 похожих кандидатов
2. **Reranker** (точный) - уточняет порядок, оставляет топ-10

**Когда использовать reranker:**
- ✅ Production системы с высокими требованиями к точности
- ✅ Критичные поисковые запросы
- ⚠️ Медленнее (~2-3x), но точнее

---

## Версии моделей (legacy)

Доступны две версии IBM Granite Embedding для локального использования через Ollama:

### 🏆 Granite Embedding 278M (рекомендуется, устанавливается по умолчанию)

```bash
ollama pull granite-embedding          # или granite-embedding:latest
```

**Характеристики:**
- 📦 **Размер файла:** ~149 MB
- 🧠 **Параметры:** 278M
- 📊 **Dimension:** 768
- 🌐 **Языки:** Multilingual (поддержка русского, английского и др.)
- ⭐ **Качество:** ⭐⭐⭐⭐⭐ (максимальное)
- ⚡ **Скорость:** ⚡⚡⚡⚡ (быстро)

**Когда использовать:**
- ✅ Максимальное качество семантического поиска
- ✅ Multilingual кодовые базы (русский + английский код)
- ✅ Крупные проекты с дубликатами
- ✅ Достаточно памяти (требует ~500 MB RAM)

### 🥈 Granite Embedding 30M (легковесная версия)

```bash
ollama pull granite-embedding:30m
```

**Характеристики:**
- 📦 **Размер файла:** ~47 MB (в 3 раза меньше!)
- 🧠 **Параметры:** 30M
- 📊 **Dimension:** 384
- 🌐 **Языки:** English only
- ⭐ **Качество:** ⭐⭐⭐⭐ (очень хорошо)
- ⚡ **Скорость:** ⚡⚡⚡⚡⚡ (быстрее)

**Когда использовать:**
- ✅ Ограниченная память/CPU (<4GB RAM)
- ✅ Быстрый отклик важнее качества
- ✅ Только английский код
- ✅ Небольшие кодовые базы

### 🔄 Как переключиться на другую версию

**Вариант 1: Скачать и указать в конфиге**

```bash
# Скачать легковесную версию
ollama pull granite-embedding:30m

# Посмотреть установленные модели
ollama list
```

Затем в `config/development.yaml`:

```yaml
mcp:
  embedding:
    provider: "ollama"
    enabled: true
    modelName: "granite-embedding:30m"  # Указать нужную версию
```

**Вариант 2: Через переменные окружения**

```bash
# Windows
set MCP_EMBEDDING_MODEL=granite-embedding:30m

# Unix/macOS
export MCP_EMBEDDING_MODEL=granite-embedding:30m
```

**Удаление ненужной версии (опционально):**

```bash
# Удалить полную версию, если нужно освободить место
ollama rm granite-embedding:latest

# Удалить легковесную
ollama rm granite-embedding:30m
```

---

## Что такое эмбеддинги?

**Эмбеддинги** - векторное представление кода, позволяющее находить семантически похожий код.

### Примеры использования:

#### 1. Умный поиск по коду
```typescript
// Вопрос: "Найди код для обработки HTTP запросов"
// С эмбеддингами находит:
- handleRequest()      // similarity: 0.92
- processApiCall()     // similarity: 0.89
- fetchData()          // similarity: 0.87
```

#### 2. Обнаружение дубликатов
```typescript
// Файл A
function calculateDiscount(user) {
  if (user.premium) return 0.2;
  return 0;
}

// Файл B (другое название, та же логика!)
function getDiscount(customer) {
  if (customer.isPremium) return 0.2;
  return 0;
}
// Эмбеддинги: similarity 0.93 - дубликат обнаружен!
```

#### 3. Рефакторинг
Находит похожие паттерны в вашей кодовой базе и предлагает улучшения.

### Нужны ли вам эмбеддинги?

| Задача | БЕЗ эмбеддингов | С эмбеддингами |
|--------|----------------|----------------|
| Граф зависимостей | ✅ Отлично | ✅ Отлично |
| Структурный анализ | ✅ Отлично | ✅ Отлично |
| Семантический поиск | ❌ Только точные совпадения | ✅ Умный поиск |
| Поиск дубликатов | ❌ Только копипаста | ✅ Семантические клоны |
| Рефакторинг | ⚠️ Базовый | ✅ Умные рекомендации |

**Вывод:** Если вам нужны только граф и структурный анализ - эмбеддинги не обязательны. Для семантического поиска - рекомендуются.

---

## Автоматическая установка

### Windows

```cmd
setup-embeddings.cmd
```

**Что делает скрипт:**
1. Проверяет наличие Ollama
2. Устанавливает через winget (если нет)
3. Запускает Ollama сервис
4. Скачивает granite-embedding модель
5. Проверяет работоспособность
6. Создает backup конфига

**Требования:**
- Windows 10/11
- ~200 MB свободного места
- Интернет соединение

### macOS/Linux

```bash
chmod +x setup-embeddings.sh
./setup-embeddings.sh
```

**Что делает скрипт:**
1. Определяет ОС (macOS/Linux)
2. Устанавливает Ollama (через Homebrew или curl)
3. Запускает Ollama сервис
4. Скачивает granite-embedding
5. Проверяет работоспособность

**Требования:**
- macOS 10.15+ или Linux
- ~200 MB свободного места
- Интернет соединение

---

## Ручная установка

### 1. Установка Ollama

**Windows:**
```powershell
winget install Ollama.Ollama
# или скачать: https://ollama.com/download/windows
```

**macOS:**
```bash
brew install ollama
# или скачать: https://ollama.com/download/macos
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Запуск Ollama

```bash
ollama serve
```

Ollama будет работать на `http://127.0.0.1:11434`

### 3. Загрузка модели

```bash
# IBM Granite Embedding (рекомендуется для кода)
ollama pull granite-embedding

# Или легковесная версия (47M параметров)
ollama pull granite-embedding:30m

# Или другие модели
ollama pull nomic-embed-text  # Универсальная
ollama pull llama2            # Для экспериментов
```

### 4. Проверка

```bash
# Проверить список моделей
ollama list

# Тест эмбеддинга
curl http://127.0.0.1:11434/api/embeddings \
  -d '{"model": "granite-embedding", "prompt": "test code"}'
```

---

## Конфигурация

### Auto режим (рекомендуется)

```yaml
# config/development.yaml
mcp:
  embedding:
    provider: "auto"        # Автодетект
    enabled: true
```

**Логика автодетекта:**
1. Проверяет Ollama на `127.0.0.1:11434`
2. Ищет модель `granite-embedding`
3. Если не найдена - использует любую доступную модель
4. Если Ollama недоступен - fallback на `memory`

### Явное указание провайдера

```yaml
mcp:
  embedding:
    provider: "ollama"      # Принудительно Ollama
    enabled: true
    modelName: "granite-embedding"  # Конкретная модель
```

### Ollama с кастомными настройками

```yaml
mcp:
  embedding:
    provider: "ollama"
    enabled: true
    modelName: "granite-embedding"
    ollama:
      baseUrl: "http://192.168.1.100:11434"  # Удаленный Ollama
      timeoutMs: 15000                       # 15s timeout
      concurrency: 8                         # Параллельные запросы
      autoPull: true                         # Автоскачивание модели
```

### Переменные окружения

```bash
# Provider
export MCP_EMBEDDING_PROVIDER=auto

# Enabled
export MCP_EMBEDDING_ENABLED=true

# Model (опционально)
export MCP_EMBEDDING_MODEL=granite-embedding

# Ollama URL (опционально)
export OLLAMA_BASE_URL=http://localhost:11434
```

Приоритет: **env variables > config file**

---

## Адаптивные векторные бэкенды

**Новое в v3.8.0**: Автоматический выбор оптимального векторного бэкенда по размеру кодовой базы!

### 🎯 Зачем нужно адаптивное переключение?

**Проблема**: sqlite-vec отлично работает на малых базах (<10k векторов), но медленный поиск на больших. Vectorlite быстрее ищет, но медленнее вставляет.

**Решение**: Система автоматически выбирает оптимальный бэкенд:
- **Малые/средние** (<10k векторов) → sqlite-vec (быстрая вставка, точный поиск)
- **Большие** (>10k векторов) → vectorlite (HNSW индекс, 3-100x быстрее поиск)
- **Fallback** → чистый SQLite (если расширения недоступны)

### ⚡ Производительность

| Размер базы | Операция | sqlite-vec | vectorlite | Разница |
|-------------|----------|------------|------------|---------|
| <10k vectors | Insert | ⚡⚡⚡⚡⚡ Быстро | ⚡⚡⚡ Медленнее (4-5x) | sqlite-vec лучше |
| <10k vectors | Search | ⚡⚡⚡⚡ Быстро | ⚡⚡⚡⚡ Быстро | Примерно одинаково |
| >10k vectors | Insert | ⚡⚡⚡⚡⚡ Быстро | ⚡⚡⚡ Медленнее (4-5x) | sqlite-vec лучше |
| >10k vectors | Search | ⚡ Медленно | ⚡⚡⚡⚡⚡ Очень быстро (3-100x) | **vectorlite лучше** |

**Вывод**: Для больших проектов (>10k векторов) vectorlite даёт огромный прирост скорости поиска при допустимом замедлении вставки.

### 📦 Установка vectorlite

Vectorlite автоматически устанавливается через npm:

```bash
npm install vectorlite
```

Пакет содержит platform-specific бинарники для:
- Linux x64/ARM64
- macOS x64/ARM64 (Intel/Apple Silicon)
- Windows x64

**Требования:**
- Node.js 18+
- Нативная компиляция не требуется (prebuilt binaries)

### ⚙️ Конфигурация

**Auto режим (рекомендуется, по умолчанию):**

```yaml
# config/default.yaml
vectorBackend:
  backend: "auto"              # Автоматический выбор
  autoSwitchThreshold: 10000   # Порог переключения (векторов)

  # Настройки HNSW для vectorlite (опционально)
  vectorlite:
    maxElements: 100000        # Максимум векторов
    M: 16                      # Связей на слой (выше = лучше recall, больше памяти)
    efConstruction: 200        # Качество построения индекса (выше = лучше качество, медленнее)
    efSearch: 50               # Качество поиска (выше = точнее, медленнее)
    distanceMetric: "l2"       # l2 | cosine | ip
```

**Явное указание бэкенда:**

```yaml
# Принудительно vectorlite (для больших проектов)
vectorBackend:
  backend: "vectorlite"
  vectorlite:
    M: 24                      # Больше связей = лучше качество
    efSearch: 100              # Более точный поиск

# Принудительно sqlite-vec (для малых проектов)
vectorBackend:
  backend: "sqlite-vec"

# Fallback без расширений (медленнее)
vectorBackend:
  backend: "fallback"
```

### 📊 Когда использовать каждый бэкенд

#### `auto` (рекомендуется) 🏆
```yaml
vectorBackend:
  backend: "auto"
```
**Когда использовать:**
- ✅ Универсальное решение для любых проектов
- ✅ Автоматическая оптимизация по размеру
- ✅ Не нужно настраивать вручную

**Логика работы:**
1. Подсчитывает количество векторов в БД
2. Оценивает финальное количество по файлам (~5 entities/file)
3. Выбирает бэкенд по threshold (default: 10k)
4. Логирует выбор и причину

**Примеры логов:**
```
[VectorStore] Selected backend: sqlite-vec
[VectorStore] Reason: Small/medium codebase (2500 vectors < 10000 threshold). Sqlite-vec provides fast inserts.

[VectorStore] Selected backend: vectorlite
[VectorStore] Reason: Large codebase (15000 vectors >= 10000 threshold). Vectorlite provides 3-100x faster search with HNSW.
```

#### `vectorlite` (для больших проектов)
```yaml
vectorBackend:
  backend: "vectorlite"
  vectorlite:
    M: 32              # Больше = лучше recall
    efSearch: 100      # Больше = точнее
```
**Когда использовать:**
- ✅ Большие проекты (>10k векторов, >2000 файлов)
- ✅ Приоритет: **скорость поиска** (семантический поиск используется часто)
- ✅ Read-heavy workload (больше поисков, чем вставок)
- ⚠️ Медленнее insert при индексации (4-5x)

**Параметры HNSW:**
- `M` (default: 16) - количество связей на слой
  - Больше = лучше recall, но больше памяти
  - Рекомендуется: 16-48 для кода
- `efConstruction` (default: 200) - качество построения индекса
  - Больше = лучше качество, медленнее build
  - Рекомендуется: 200-400
- `efSearch` (default: 50) - качество поиска
  - Больше = точнее результаты, медленнее поиск
  - Рекомендуется: 50-200
- `distanceMetric` - метрика расстояния
  - `l2` (default) - Euclidean distance
  - `cosine` - Cosine similarity
  - `ip` - Inner product

#### `sqlite-vec` (для малых/средних проектов)
```yaml
vectorBackend:
  backend: "sqlite-vec"
```
**Когда использовать:**
- ✅ Малые/средние проекты (<10k векторов, <2000 файлов)
- ✅ Приоритет: **скорость индексации** (вставки происходят часто)
- ✅ Write-heavy workload
- ✅ Exact search (brute-force гарантирует 100% точность)

**Преимущества:**
- Очень быстрая вставка (простой BLOB)
- Exact search (нет аппроксимации)
- Меньше памяти

**Недостатки:**
- Медленный поиск при >10k векторов (brute-force O(n))

#### `fallback` (без расширений)
```yaml
vectorBackend:
  backend: "fallback"
```
**Когда использовать:**
- ⚠️ Расширения sqlite-vec/vectorlite недоступны
- ⚠️ Проблемы с установкой нативных модулей
- ⚠️ Graceful degradation

**Характеристики:**
- Работает всегда (чистый SQLite + JavaScript)
- Медленный поиск (ручной cosine similarity)
- Exact search
- Нет зависимостей от расширений

### 🔍 Диагностика бэкенда

**Проверить текущий бэкенд:**

```typescript
// В логах при запуске
[VectorStore] Detected capabilities: { sqliteVec: true, vectorlite: true, fallbackOnly: false }
[VectorStore] Selected backend: vectorlite
[VectorStore] Reason: Large codebase (12500 vectors >= 10000 threshold)...
[VectorStore] Initialized vectorlite backend with HNSW index
```

**Получить информацию через API:**

```typescript
const backendInfo = vectorStore.getBackendInfo();
console.log(backendInfo);
// {
//   currentBackend: 'vectorlite',
//   vectorCount: 12500,
//   recommended: true,
//   performance: {
//     insertSpeed: 'slow',
//     searchSpeed: 'fast',
//     accuracy: 'approximate',
//     memoryUsage: 'medium'
//   }
// }
```

**Migration recommendation:**

```typescript
const backendInfo = vectorStore.getBackendInfo();
if (backendInfo.migrationRecommendation) {
  console.log(`Рекомендуется миграция:`);
  console.log(`  Текущий: ${backendInfo.currentBackend}`);
  console.log(`  Рекомендуемый: ${backendInfo.migrationRecommendation.targetBackend}`);
  console.log(`  Причина: ${backendInfo.migrationRecommendation.reason}`);
}
```

### 🛠️ Troubleshooting

#### Vectorlite не загружается

**Проблема:** `[VectorliteAdapter] Failed to load vectorlite extension`

**Решение:**
```bash
# 1. Проверить установку
npm list vectorlite

# 2. Переустановить
npm install vectorlite

# 3. Fallback на sqlite-vec
# config/default.yaml
vectorBackend:
  backend: "sqlite-vec"  # Временный workaround
```

#### Медленная индексация с vectorlite

**Проблема:** Индексация занимает слишком долго

**Причина:** HNSW строит индекс при вставке (4-5x медленнее)

**Решение:**
```yaml
# Опция 1: Уменьшить качество индекса
vectorBackend:
  vectorlite:
    M: 8                # Меньше связей (default: 16)
    efConstruction: 100 # Меньше качество (default: 200)

# Опция 2: Использовать sqlite-vec для индексации
vectorBackend:
  backend: "sqlite-vec"  # Быстрая индексация
```

#### Неточные результаты поиска

**Проблема:** Vectorlite возвращает неточные результаты

**Причина:** HNSW - approximate алгоритм (99%+ recall, но не 100%)

**Решение:**
```yaml
# Увеличить качество поиска
vectorBackend:
  vectorlite:
    efSearch: 200       # Больше точность (default: 50)
    M: 32               # Больше связей (default: 16)

# Или использовать sqlite-vec для exact search
vectorBackend:
  backend: "sqlite-vec"  # Гарантированно exact
```

### 📈 Рекомендации по выбору

| Размер проекта | Файлов | Векторов | Рекомендуемый бэкенд | Причина |
|----------------|--------|----------|---------------------|---------|
| Малый | <500 | <2.5k | `auto` или `sqlite-vec` | Быстрая индексация, поиск не критичен |
| Средний | 500-2000 | 2.5k-10k | `auto` или `sqlite-vec` | Баланс скорости |
| Большой | 2000-10k | 10k-50k | `auto` или `vectorlite` | Поиск становится узким местом |
| Очень большой | >10k | >50k | `vectorlite` | Критична скорость поиска |

**Общая рекомендация**: Используйте `auto` режим - он автоматически выберет оптимальный бэкенд!

---

## Проверка работоспособности

### 1. Автоматическая проверка при запуске

**MCP сервер автоматически проверяет Ollama при старте:**

```bash
node dist/index.js .
```

**Вы увидите:**
```
Starting MCP Code Graph Server for directory: D:\project
Multi-agent LiteRAG architecture initialized
Resource constraints: 1GB memory, 80% CPU, 10 concurrent agents

🔍 Checking Ollama service status...
✅ Ollama запущен с granite-embedding (1 моделей)

MCP server running on stdio transport
```

**Возможные статусы:**

- ✅ **Ollama запущен с granite-embedding** - все отлично, ML embeddings работают
- ⚠️ **Ollama запущен, но granite-embedding не найден** - запустите `ollama pull granite-embedding`
- ❌ **Ollama не запущен** - MCP попытается запустить автоматически, fallback на memory provider
- ⚠️ **Ollama check failed** - используется memory provider (без ML)

### 2. Ручная проверка Ollama (опционально)

```bash
# Статус сервиса
curl http://127.0.0.1:11434/api/tags

# Список моделей
ollama list

# Должна быть granite-embedding
```

### 3. Запуск MCP с логами

```bash
# Windows
set DEBUG=*
node dist/index.js .

# Unix
DEBUG=* node dist/index.js .
```

**Ищите в логах:**
```
[EmbeddingFactory] Auto-detected: Ollama with granite-embedding
[PROVIDER_OLLAMA] initialized { dimension: 768 }
```

### 3. Тест семантического поиска

```bash
# Через MCP вызов
{
  "method": "semantic_search",
  "params": {
    "query": "authentication code",
    "limit": 5
  }
}
```

**Если работает:**
```json
{
  "results": [
    { "path": "src/auth/verify.ts", "similarity": 0.92 },
    ...
  ]
}
```

---

## Альтернативные провайдеры

### TEI (локальный Docker, 8192 токена) 🏆

**Рекомендуемый провайдер для локального использования!**

```yaml
mcp:
  embedding:
    provider: "tei"
    model: "ibm-granite/granite-embedding-english-r2"
    enabled: true
    tei:
      baseUrl: "http://127.0.0.1:8080"
      timeoutMs: 30000
      concurrency: 4
      checkServer: true  # Auto-start контейнера
```

**Преимущества:**
- ✅ 8192 токена контекста (vs 512 в Ollama)
- ⚡⚡⚡⚡⚡ Оптимизированная производительность
- 🔒 Локально (без облачных API)
- 🚀 Auto-restart контейнера
- 💾 Требует Docker

**Установка:** `./setup-tei.sh` или `setup-tei.cmd`

### HuggingFace Inference API (cloud, 8192 токена)

```yaml
mcp:
  embedding:
    provider: "huggingface"
    model: "ibm-granite/granite-embedding-english-r2"
    enabled: true
    huggingface:
      apiKey: "hf_..."  # https://huggingface.co/settings/tokens
```

**Преимущества:**
- ✅ 8192 токена контекста
- 🚀 Не требует Docker
- 💾 Не использует локальные ресурсы

**Недостатки:**
- 🔑 Требует API ключ (бесплатный)
- 🌐 Требует интернет
- ⚠️ Rate limits в бесплатном плане

### OpenAI (cloud, платный)

```yaml
mcp:
  embedding:
    provider: "openai"
    enabled: true
    modelName: "text-embedding-3-small"
    openai:
      apiKey: "sk-..."
```

**Преимущества:**
- ⭐⭐⭐⭐⭐ Лучшее качество
- 🚀 Быстро (API)

**Недостатки:**
- 💰 Платный
- 🌐 Требует интернет

### CloudRu (cloud, платный)

```yaml
mcp:
  embedding:
    provider: "cloudru"
    enabled: true
    cloudru:
      apiKey: "..."
```

### Memory (fallback, без ML)

```yaml
mcp:
  embedding:
    provider: "memory"
    enabled: false  # Обычно выключен
```

**Преимущества:**
- ⚡ Мгновенно
- 💾 Нет зависимостей

**Недостатки:**
- ❌ Нет семантики (детерминированный хеш)

---

## Troubleshooting

### Ollama не запускается

**Проблема:** `curl: (7) Failed to connect to 127.0.0.1:11434`

**Решение:**
```bash
# Запустить вручную
ollama serve

# Проверить порт
netstat -an | grep 11434
```

### Модель не найдена

**Проблема:** `[EmbeddingFactory] Using memory provider (no ML embeddings)`

**Решение:**
```bash
# Проверить список
ollama list

# Установить granite
ollama pull granite-embedding

# Перезапустить MCP
```

### "Auto-detected: Ollama with llama2" вместо granite

**Проблема:** Используется не та модель

**Решение:**
```yaml
# Явно указать модель
mcp:
  embedding:
    provider: "ollama"
    modelName: "granite-embedding"  # Принудительно granite
```

### Медленная работа

**Проблема:** Эмбеддинги генерируются долго

**Решение:**
```bash
# 1. Использовать легковесную модель
ollama pull granite-embedding:30m

# 2. Или отключить эмбеддинги
# config/development.yaml
mcp:
  embedding:
    enabled: false
```

### Windows: "Access denied"

**Проблема:** Не хватает прав для установки

**Решение:**
```powershell
# Запустить PowerShell от администратора
Right-click > Run as Administrator

# Затем установить
winget install Ollama.Ollama
```

---

## Сравнение провайдеров и моделей

### Сравнение провайдеров

| Провайдер | Контекст | Локально | API ключ | Docker | Качество | Скорость | Рекомендация |
|-----------|----------|----------|----------|--------|----------|----------|--------------|
| **TEI** | **8192** | ✅ | ❌ | ✅ Требуется | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ | 🏆 **Лучший выбор** |
| Ollama | 512 | ✅ | ❌ | ❌ | ⭐⭐⭐⭐ | ⚡⚡⚡⚡ | 🥈 Если нет Docker |
| HuggingFace API | 8192 | ❌ Cloud | ✅ Нужен | ❌ | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | 🌐 Без Docker/Ollama |
| OpenAI API | 8192 | ❌ Cloud | ✅ Платный | ❌ | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡ | 💰 Production |
| Memory | N/A | ✅ | ❌ | ❌ | ⭐ | ⚡⚡⚡⚡⚡ | 🔙 Fallback |

### Сравнение моделей

| Модель | Провайдер | Контекст | Размер | Параметры | Качество | Для кода | Рекомендация |
|--------|-----------|----------|--------|-----------|----------|----------|--------------|
| **granite-embedding-english-r2** | **TEI/HF API** | **8192** | **600 MB** | **149M** | ⭐⭐⭐⭐⭐ | ✅ Специально | 🏆 **По умолчанию (TEI)** |
| granite-embedding-small-english-r2 | TEI/HF API | 8192 | 190 MB | 47M | ⭐⭐⭐⭐ | ✅ Да | ⚡ Быстрая (TEI) |
| granite-embedding:latest | Ollama | 512 | 149 MB | 278M | ⭐⭐⭐⭐ | ✅ Да | 🥈 Если нет Docker |
| granite-embedding:30m | Ollama | 512 | 47 MB | 30M | ⭐⭐⭐⭐ | ✅ Да | 🥉 Легковесная |
| text-embedding-3-small | OpenAI API | 8192 | Cloud | API | ⭐⭐⭐⭐⭐ | ✅ Да | 💰 Платный |

**Рекомендации:**
- 🏆 **По умолчанию:** TEI + `granite-embedding-english-r2` - 8192 токена, локально, лучшая производительность
- 🥈 **Без Docker:** Ollama + `granite-embedding:latest` (278M) - 512 токенов, но multilingual
- 🌐 **Без локальных ресурсов:** HuggingFace API + `granite-embedding-english-r2` - 8192 токена, бесплатно
- 💰 **Production с бюджетом:** OpenAI API - максимальное качество, платно

---

## Дополнительные ресурсы

- 📚 [Ollama Documentation](https://ollama.com/docs)
- 🏆 [IBM Granite Models](https://github.com/ibm-granite/granite-embedding-models)
- 🔧 [Troubleshooting Guide](https://ollama.com/docs/troubleshooting)
- 💬 [Community Discord](https://discord.gg/ollama)

---

## Changelog

- **2025-01-13:** Добавлен auto-detect режим
- **2025-01-13:** Скрипты установки для Windows/Unix
- **2025-01-13:** Документация по Granite embeddings
