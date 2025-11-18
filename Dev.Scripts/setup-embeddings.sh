#!/usr/bin/env bash
# Setup Ollama + Granite Embeddings for UltraScript Tools MCP
# Автоматическая установка и настройка локальных эмбеддингов

set -e  # Exit on error

echo "========================================"
echo "UltraScript Tools MCP - Embeddings Setup"
echo "========================================"
echo ""
echo "Эта утилита установит:"
echo "  - Ollama (локальный AI runtime)"
echo "  - IBM Granite Embedding (модель для кода)"
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "[INFO] Обнаружена система: ${MACHINE}"
echo ""

# Step 1: Check if Ollama is installed
echo "[1/5] Проверка установки Ollama..."
if command -v ollama &> /dev/null; then
    echo "[OK] Ollama уже установлен"
    ollama --version
else
    echo "[INFO] Ollama не найден, начинаем установку..."
    echo ""

    if [ "${MACHINE}" == "Mac" ]; then
        echo "[INFO] Установка Ollama для macOS..."

        # Check if Homebrew is available
        if command -v brew &> /dev/null; then
            echo "[INFO] Используем Homebrew..."
            brew install ollama
        else
            echo "[INFO] Homebrew не найден, используем официальный установщик..."
            curl -fsSL https://ollama.com/install.sh | sh
        fi

    elif [ "${MACHINE}" == "Linux" ]; then
        echo "[INFO] Установка Ollama для Linux..."
        curl -fsSL https://ollama.com/install.sh | sh

    else
        echo "[ERROR] Неподдерживаемая система: ${MACHINE}"
        exit 1
    fi

    # Verify installation
    if command -v ollama &> /dev/null; then
        echo "[OK] Ollama успешно установлен"
        ollama --version
    else
        echo "[ERROR] Не удалось установить Ollama"
        echo "Попробуйте установить вручную: https://ollama.com/download"
        exit 1
    fi
fi

echo ""
echo "[2/5] Проверка сервиса Ollama..."

# Check if Ollama service is running
if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    echo "[OK] Ollama сервис запущен"
else
    echo "[INFO] Ollama сервис не запущен, пробуем запустить..."

    # Try to start Ollama in background
    if [ "${MACHINE}" == "Mac" ]; then
        # macOS might have Ollama as an app
        if [ -d "/Applications/Ollama.app" ]; then
            open -a Ollama
            echo "[INFO] Запущено Ollama.app"
        else
            ollama serve > /dev/null 2>&1 &
            echo "[INFO] Запущен ollama serve в фоне"
        fi
    else
        # Linux
        ollama serve > /dev/null 2>&1 &
        echo "[INFO] Запущен ollama serve в фоне"
    fi

    # Wait for service to start
    echo "[INFO] Ожидание запуска сервиса (5 секунд)..."
    sleep 5

    # Check again
    if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        echo "[OK] Ollama сервис успешно запущен"
    else
        echo "[WARNING] Не удалось автоматически запустить Ollama"
        echo "[INFO] Попробуйте запустить вручную: ollama serve"
        exit 1
    fi
fi

echo ""
echo "[3/5] Загрузка Granite моделей..."
echo ""
echo "Будут установлены следующие модели:"
echo "  1. ibm/granite-embedding:278m (278M, 512 tokens, multilingual) - основная"
echo "  2. ibm/granite-embedding:30m (30M, 512 tokens, English only) - быстрая"
echo ""
echo "Общий размер загрузки: ~170 MB"
echo "Это может занять несколько минут..."
echo ""

# Array of models to install
MODELS=(
    "ibm/granite-embedding:278m"
    "ibm/granite-embedding:30m"
)

INSTALLED_COUNT=0
FAILED_MODELS=()

for model in "${MODELS[@]}"; do
    MODEL_NAME=$(basename "$model")
    echo "[INFO] Проверка модели ${MODEL_NAME}..."

    if ollama list | grep -q "${MODEL_NAME}"; then
        echo "[OK] ${MODEL_NAME} уже загружена"
        ((INSTALLED_COUNT++))
    else
        echo "[INFO] Загрузка ${MODEL_NAME}..."

        if ollama pull "$model"; then
            echo "[OK] ${MODEL_NAME} успешно загружена"
            ((INSTALLED_COUNT++))
        else
            echo "[ERROR] Не удалось загрузить ${MODEL_NAME}"
            FAILED_MODELS+=("$model")
        fi
    fi
    echo ""
done

# Report results
echo "========================================"
echo "Результат установки моделей:"
echo "  Успешно установлено: ${INSTALLED_COUNT}/2"
if [ ${#FAILED_MODELS[@]} -gt 0 ]; then
    echo "  Ошибки при установке:"
    for model in "${FAILED_MODELS[@]}"; do
        echo "    - $model"
    done
fi
echo "========================================"
echo ""

if [ "$INSTALLED_COUNT" -eq 0 ]; then
    echo "[ERROR] Ни одна модель не установлена"
    echo "Попробуйте установить вручную:"
    for model in "${MODELS[@]}"; do
        echo "  ollama pull $model"
    done
    exit 1
fi

echo ""
echo "[4/5] Проверка работоспособности моделей..."

# Test primary embedding model
if curl -s -X POST http://127.0.0.1:11434/api/embeddings \
    -d '{"model": "ibm/granite-embedding:278m", "prompt": "test code"}' \
    > /dev/null 2>&1; then
    echo "[OK] Основная модель (278m) отвечает корректно"
else
    echo "[WARNING] Модель 278m не отвечает, но установка продолжена"
fi

echo ""
echo "[5/5] Настройка проекта..."

# Check if config file exists
if [ ! -f "config/development.yaml" ]; then
    echo "[WARNING] Файл config/development.yaml не найден"
    echo "[INFO] Пропускаем автоматическую настройку"
else
    # Create backup
    if [ -f "config/development.yaml.bak" ]; then
        echo "[INFO] Backup уже существует, пропускаем создание"
    else
        cp "config/development.yaml" "config/development.yaml.bak"
        echo "[OK] Создан backup: config/development.yaml.bak"
    fi

    echo "[INFO] Для включения Granite эмбеддингов:"
    echo ""
    echo "1. Откройте: config/development.yaml"
    echo "2. Найдите секцию mcp.embedding"
    echo "3. Измените:"
    echo "     provider: \"memory\"  ->  provider: \"auto\""
    echo "     enabled: false       ->  enabled: true"
    echo ""
    echo "Или используйте переменные окружения:"
    echo "  export MCP_EMBEDDING_PROVIDER=auto"
    echo "  export MCP_EMBEDDING_ENABLED=true"
    echo ""
fi

echo ""
echo "========================================"
echo "Установка завершена успешно!"
echo "========================================"
echo ""
echo "Установленные компоненты:"
ollama --version 2>/dev/null || echo "Ollama: не удалось определить версию"
echo ""
echo "Установленные модели:"
ollama list | grep "granite-embedding" || echo "Модели granite-embedding: не найдены"
echo ""
echo "Следующие шаги:"
echo "1. Убедитесь что Ollama запущен: ollama serve"
echo "2. Конфиг настроен на ibm/granite-embedding:278m (по умолчанию)"
echo "3. Запустите MCP сервер: node dist/index.js ."
echo ""
echo "Для доступа к моделям с 8192 токенами:"
echo "  Используйте Hugging Face API (не локально):"
echo "    1. Получите API ключ: https://huggingface.co/settings/tokens"
echo "    2. Установите: npm install @huggingface/inference"
echo "    3. В config/development.yaml:"
echo "       provider: \"huggingface\""
echo "       model: \"ibm-granite/granite-embedding-english-r2\""
echo "       huggingface:"
echo "         apiKey: \"YOUR_HF_TOKEN\""
echo ""
echo "Документация: EMBEDDINGS_SETUP.md"
echo ""
