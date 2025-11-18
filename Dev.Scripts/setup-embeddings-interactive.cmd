@echo off
REM Interactive Embeddings Setup for UltraScript Tools MCP
REM Интерактивный выбор между TEI и Ollama

echo ========================================
echo UltraScript Tools MCP - Embeddings Setup
echo ========================================
echo.
echo Выберите провайдер эмбеддингов для локального использования:
echo.
echo 1) TEI - Auto (GPU если доступен, иначе CPU)
echo    ✅ 8192 токена контекста
echo    🚀 Автоопределение GPU (RTX 30xx/40xx) + автоустановка драйверов
echo    🐳 Требует Docker Desktop
echo    📦 ~2 GB
echo    ⚡ В 5-10x быстрее на GPU
echo.
echo 2) TEI - CPU only (принудительно без GPU)
echo    ✅ 8192 токена контекста
echo    💻 Работает на любом CPU
echo    🐳 Требует Docker Desktop
echo    📦 ~2 GB
echo    ⚙️  Освобождает GPU для других задач
echo.
echo 3) TEI - Конвертировать модель (если ошибка "tokenizer.json not found")
echo    🔄 Конвертирует slow tokenizer в fast tokenizer
echo    📦 Использует JS/TypeScript (без Python)
echo    ✅ Совместимость с любыми HuggingFace моделями
echo.
echo 4) Ollama - Альтернатива без Docker
echo    ✅ Простая установка (авто-определяет GPU)
echo    ⚠️  512 токенов контекста
echo    📦 ~200 MB
echo.
echo 5) Пропустить установку (использовать memory provider)
echo    ⚠️  Без ML эмбеддингов (детерминированный хеш)
echo.

set /p choice="Ваш выбор [1-5]: "

if "%choice%"=="1" goto install_tei_auto
if "%choice%"=="2" goto install_tei_cpu
if "%choice%"=="3" goto convert_tokenizer
if "%choice%"=="4" goto install_ollama
if "%choice%"=="5" goto skip_install

echo.
echo [ERROR] Неверный выбор: %choice%
echo Пожалуйста, выберите 1, 2, 3, 4 или 5
exit /b 1

:install_tei_auto
echo.
echo [INFO] Выбран: TEI - Auto (GPU если доступен, иначе CPU)
echo.

REM Check if Docker is available
where docker >nul 2>nul
if %errorlevel% neq 0 goto docker_not_found

echo [OK] Docker найден
docker --version
echo.

REM Run TEI setup script (auto mode)
if not exist "setup-tei.cmd" goto tei_script_not_found

echo [INFO] Запуск установки TEI с автоопределением GPU...
call setup-tei.cmd

echo.
echo ================================================
echo ✅ TEI установлен и настроен!
echo.
echo Контейнер 'tei-server' запущен на http://127.0.0.1:8080
echo.
echo Конфигурация (уже настроена в config/default.yaml):
echo   provider: tei
echo   model: ibm-granite/granite-embedding-english-r2
echo   context: 8192 tokens
echo.
echo Управление:
echo   docker logs tei-server    # Просмотр логов
echo   docker stop tei-server    # Остановка
echo   docker start tei-server   # Запуск
echo ================================================
goto end

:install_tei_cpu
echo.
echo [INFO] Выбран: TEI - CPU only (без GPU)
echo.

REM Check if Docker is available
where docker >nul 2>nul
if %errorlevel% neq 0 goto docker_not_found

echo [OK] Docker найден
docker --version
echo.

REM Run TEI setup script (force CPU mode)
if not exist "setup-tei.cmd" goto tei_script_not_found

echo [INFO] Запуск установки TEI в режиме CPU...
call setup-tei.cmd --force-cpu

echo.
echo ================================================
echo ✅ TEI установлен и настроен в режиме CPU!
echo.
echo Контейнер 'tei-server' запущен на http://127.0.0.1:8080
echo.
echo Конфигурация (уже настроена в config/default.yaml):
echo   provider: tei
echo   model: ibm-granite/granite-embedding-english-r2
echo   context: 8192 tokens
echo   mode: CPU only
echo.
echo Управление:
echo   docker logs tei-server    # Просмотр логов
echo   docker stop tei-server    # Остановка
echo   docker start tei-server   # Запуск
echo ================================================
goto end

:convert_tokenizer
echo.
echo [INFO] Выбран: Конвертация токенайзера для TEI
echo.
echo Этот режим конвертирует slow tokenizer в fast tokenizer,
echo делая модель совместимой с TEI.
echo.

REM Prompt for model ID
set /p model_id="Введите model ID (например, ibm-granite/granite-embedding-30m-english): "

if "%model_id%"=="" (
    echo [ERROR] Model ID не может быть пустым!
    exit /b 1
)

echo.
echo [INFO] Модель: %model_id%
echo [INFO] Output: .\converted-model
echo.

REM Check if Bun or Node is available
where bun >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Using Bun for conversion...
    bun scripts\convert-tokenizer.ts "%model_id%" ".\converted-model"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        echo [INFO] Using Node.js for conversion...
        node scripts\convert-tokenizer.ts "%model_id%" ".\converted-model"
    ) else (
        echo [ERROR] Ни Bun, ни Node.js не найдены!
        echo.
        echo Установите один из них:
        echo   Bun: https://bun.sh
        echo   Node.js: https://nodejs.org
        exit /b 1
    )
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Конвертация не удалась!
    echo.
    echo Попробуйте использовать готовую модель с fast tokenizer:
    echo   - BAAI/bge-small-en-v1.5 (384-dim, fast)
    echo   - sentence-transformers/all-MiniLM-L6-v2 (384-dim)
    exit /b 1
)

echo.
echo ================================================
echo ✅ Конвертация завершена!
echo.
echo Модель сохранена в: .\converted-model\
echo.
echo Теперь запустите TEI с конвертированной моделью:
echo.
echo   docker run -d --name tei-server -p 8080:80 ^
echo     -v "%CD%\converted-model:/model" ^
echo     ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 ^
echo     --model-id /model
echo.
echo Или используйте setup-tei.cmd:
echo   setup-tei.cmd --model /model
echo ================================================
goto end

:install_ollama
echo.
echo [INFO] Выбран: Ollama
echo.

REM Run Ollama setup script
if not exist "setup-embeddings.cmd" goto ollama_script_not_found

echo [INFO] Запуск установки Ollama...
call setup-embeddings.cmd

echo.
echo ================================================
echo ✅ Ollama установлен и настроен!
echo.
echo Для использования Ollama вместо TEI, обновите config:
echo.
echo config/development.yaml:
echo   mcp:
echo     embedding:
echo       provider: ollama
echo       model: granite-embedding
echo       enabled: true
echo.
echo Управление:
echo   ollama serve              # Запуск сервера
echo   ollama list               # Список моделей
echo   ollama pull ^<model^>       # Скачать модель
echo ================================================
goto end

:skip_install
echo.
echo [INFO] Установка пропущена
echo.
echo ⚠️  Будет использован memory provider (без ML эмбеддингов)
echo.
echo Для настройки в config/development.yaml:
echo   mcp:
echo     embedding:
echo       provider: memory
echo       enabled: true
echo.
echo Эмбеддинги можно установить позже:
echo   setup-embeddings-interactive.cmd
goto end

:docker_not_found
echo [ERROR] Docker не найден!
echo.
echo TEI требует Docker. Установите Docker Desktop:
echo   https://docs.docker.com/desktop/install/windows-install/
echo.
echo Или выберите Ollama ^(вариант 2^) при повторном запуске.
exit /b 1

:tei_script_not_found
echo [ERROR] setup-tei.cmd не найден!
echo Убедитесь, что вы находитесь в корневой директории проекта.
exit /b 1

:ollama_script_not_found
echo [ERROR] setup-embeddings.cmd не найден!
echo Убедитесь, что вы находитесь в корневой директории проекта.
exit /b 1

:end
echo.
echo Готово! Запустите MCP сервер:
echo   npm run build
echo   node dist\index.js .
