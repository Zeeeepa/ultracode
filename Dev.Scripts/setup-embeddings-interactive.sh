#!/usr/bin/env bash
# Interactive Embeddings Setup for UltraScript Tools MCP
# Интерактивный выбор между TEI и Ollama

set -e  # Exit on error

echo "========================================"
echo "UltraScript Tools MCP - Embeddings Setup"
echo "========================================"
echo ""
echo "Выберите провайдер эмбеддингов для локального использования:"
echo ""
echo "1) TEI - Auto (GPU если доступен, иначе CPU)"
echo "   ✅ 8192 токена контекста"
echo "   🚀 Автоопределение GPU (RTX 30xx/40xx) + автоустановка драйверов"
echo "   🐳 Требует Docker Desktop"
echo "   📦 ~2 GB"
echo "   ⚡ В 5-10x быстрее на GPU"
echo ""
echo "2) TEI - CPU only (принудительно без GPU)"
echo "   ✅ 8192 токена контекста"
echo "   💻 Работает на любом CPU"
echo "   🐳 Требует Docker Desktop"
echo "   📦 ~2 GB"
echo "   ⚙️  Освобождает GPU для других задач"
echo ""
echo "3) Ollama - Альтернатива без Docker"
echo "   ✅ Простая установка (авто-определяет GPU)"
echo "   ⚠️  512 токенов контекста"
echo "   📦 ~200 MB"
echo ""
echo "4) Пропустить установку (использовать memory provider)"
echo "   ⚠️  Без ML эмбеддингов (детерминированный хеш)"
echo ""

# Prompt user
read -p "Ваш выбор [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "[INFO] Выбран: TEI - Auto (GPU/CPU)"
        echo ""

        # Check if Docker is available
        if ! command -v docker &> /dev/null; then
            echo "[ERROR] Docker не найден!"
            echo ""
            echo "TEI требует Docker. Установите Docker Desktop:"
            echo "  - macOS: https://docs.docker.com/desktop/install/mac-install/"
            echo "  - Linux: https://docs.docker.com/engine/install/"
            echo ""
            echo "Или выберите Ollama (вариант 3) при повторном запуске."
            exit 1
        fi

        echo "[OK] Docker найден"
        docker --version
        echo ""

        # Run TEI setup script with auto GPU detection
        if [ -f "./setup-tei.sh" ]; then
            echo "[INFO] Запуск установки TEI с автоопределением GPU..."
            chmod +x ./setup-tei.sh
            ./setup-tei.sh
        else
            echo "[ERROR] setup-tei.sh не найден!"
            echo "Убедитесь, что вы находитесь в корневой директории проекта."
            exit 1
        fi

        echo ""
        echo "================================================"
        echo "✅ TEI установлен и настроен!"
        echo ""
        echo "Контейнер 'tei-server' запущен на http://127.0.0.1:8080"
        echo ""
        echo "Конфигурация (уже настроена в config/default.yaml):"
        echo "  provider: tei"
        echo "  model: ibm-granite/granite-embedding-english-r2"
        echo "  context: 8192 tokens"
        echo ""
        echo "Управление:"
        echo "  docker logs tei-server    # Просмотр логов"
        echo "  docker stop tei-server    # Остановка"
        echo "  docker start tei-server   # Запуск"
        echo "================================================"
        ;;

    2)
        echo ""
        echo "[INFO] Выбран: TEI - CPU only"
        echo ""

        # Check if Docker is available
        if ! command -v docker &> /dev/null; then
            echo "[ERROR] Docker не найден!"
            echo ""
            echo "TEI требует Docker. Установите Docker Desktop:"
            echo "  - macOS: https://docs.docker.com/desktop/install/mac-install/"
            echo "  - Linux: https://docs.docker.com/engine/install/"
            echo ""
            echo "Или выберите Ollama (вариант 3) при повторном запуске."
            exit 1
        fi

        echo "[OK] Docker найден"
        docker --version
        echo ""

        # Run TEI setup script with forced CPU mode
        if [ -f "./setup-tei.sh" ]; then
            echo "[INFO] Запуск установки TEI в CPU режиме (без GPU)..."
            chmod +x ./setup-tei.sh
            ./setup-tei.sh --force-cpu
        else
            echo "[ERROR] setup-tei.sh не найден!"
            echo "Убедитесь, что вы находитесь в корневой директории проекта."
            exit 1
        fi

        echo ""
        echo "================================================"
        echo "✅ TEI установлен и настроен (CPU режим)!"
        echo ""
        echo "Контейнер 'tei-server' запущен на http://127.0.0.1:8080"
        echo ""
        echo "Конфигурация (уже настроена в config/default.yaml):"
        echo "  provider: tei"
        echo "  model: ibm-granite/granite-embedding-english-r2"
        echo "  context: 8192 tokens"
        echo "  mode: CPU only"
        echo ""
        echo "Управление:"
        echo "  docker logs tei-server    # Просмотр логов"
        echo "  docker stop tei-server    # Остановка"
        echo "  docker start tei-server   # Запуск"
        echo "================================================"
        ;;

    3)
        echo ""
        echo "[INFO] Выбран: Ollama"
        echo ""

        # Run Ollama setup script
        if [ -f "./setup-embeddings.sh" ]; then
            echo "[INFO] Запуск установки Ollama..."
            chmod +x ./setup-embeddings.sh
            ./setup-embeddings.sh
        else
            echo "[ERROR] setup-embeddings.sh не найден!"
            echo "Убедитесь, что вы находитесь в корневой директории проекта."
            exit 1
        fi

        echo ""
        echo "================================================"
        echo "✅ Ollama установлен и настроен!"
        echo ""
        echo "Для использования Ollama вместо TEI, обновите config:"
        echo ""
        echo "config/development.yaml:"
        echo "  mcp:"
        echo "    embedding:"
        echo "      provider: ollama"
        echo "      model: granite-embedding"
        echo "      enabled: true"
        echo ""
        echo "Управление:"
        echo "  ollama serve              # Запуск сервера"
        echo "  ollama list               # Список моделей"
        echo "  ollama pull <model>       # Скачать модель"
        echo "================================================"
        ;;

    4)
        echo ""
        echo "[INFO] Установка пропущена"
        echo ""
        echo "⚠️  Будет использован memory provider (без ML эмбеддингов)"
        echo ""
        echo "Для настройки в config/development.yaml:"
        echo "  mcp:"
        echo "    embedding:"
        echo "      provider: memory"
        echo "      enabled: true"
        echo ""
        echo "Эмбеддинги можно установить позже:"
        echo "  ./setup-embeddings-interactive.sh"
        ;;

    *)
        echo ""
        echo "[ERROR] Неверный выбор: $choice"
        echo "Пожалуйста, выберите 1-4"
        exit 1
        ;;
esac

echo ""
echo "Готово! Запустите MCP сервер:"
echo "  npm run build"
echo "  node dist/index.js ."
