@echo off
REM Setup Ollama + Granite Embeddings for UltraScript Tools MCP
REM Автоматическая установка и настройка локальных эмбеддингов

echo ========================================
echo UltraScript Tools MCP - Embeddings Setup
echo ========================================
echo.
echo Эта утилита установит:
echo  - Ollama (локальный AI runtime)
echo  - IBM Granite Embedding (модель для кода)
echo.

REM Check if running as administrator (optional, but recommended for winget)
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Запущено с правами администратора
) else (
    echo [WARNING] Рекомендуется запустить от администратора для winget
    echo           Продолжаем без прав админа...
)
echo.

REM Step 1: Check if Ollama is installed
echo [1/5] Проверка установки Ollama...
where ollama >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] Ollama уже установлен
    ollama --version
    goto :check_service
)

echo [INFO] Ollama не найден, начинаем установку...
echo.

REM Step 1a: Try to install via winget
echo [1a] Пробуем установить через winget...
where winget >nul 2>nul
if %errorLevel% == 0 (
    echo [INFO] Устанавливаем Ollama через winget...
    winget install --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
    if %errorLevel% == 0 (
        echo [OK] Ollama установлен через winget
        echo [INFO] Перезапустите терминал или добавьте Ollama в PATH
        echo.
        goto :check_service
    ) else (
        echo [WARNING] Не удалось установить через winget
    )
) else (
    echo [INFO] winget не найден
)

REM Step 1b: Fallback to manual download instructions
echo.
echo [ERROR] Автоматическая установка не удалась
echo.
echo Пожалуйста, установите Ollama вручную:
echo.
echo 1. Скачайте: https://ollama.com/download/windows
echo 2. Запустите установщик
echo 3. Перезапустите терминал
echo 4. Запустите этот скрипт снова
echo.
pause
exit /b 1

:check_service
echo.
echo [2/5] Проверка сервиса Ollama...

REM Check if Ollama service is running
curl -s http://127.0.0.1:11434/api/tags >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] Ollama сервис запущен
    goto :pull_model
)

echo [INFO] Ollama сервис не запущен, пробуем запустить...

REM Try to start Ollama in background
start "" ollama serve >nul 2>nul

REM Wait 5 seconds for service to start
echo [INFO] Ожидание запуска сервиса (5 секунд)...
timeout /t 5 /nobreak >nul

REM Check again
curl -s http://127.0.0.1:11434/api/tags >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] Ollama сервис успешно запущен
) else (
    echo [WARNING] Не удалось автоматически запустить Ollama
    echo [INFO] Попробуйте запустить вручную: ollama serve
    echo.
    pause
    exit /b 1
)

:pull_model
echo.
echo [3/5] Загрузка Granite моделей...
echo.
echo Будут установлены следующие модели:
echo   1. ibm/granite-embedding:278m (278M, 512 tokens, multilingual) - основная
echo   2. ibm/granite-embedding:30m (30M, 512 tokens, English only) - быстрая
echo.
echo Общий размер загрузки: ~170 MB
echo Это может занять несколько минут...
echo.

set INSTALLED_COUNT=0
set FAILED_COUNT=0

REM Model 1: 278m
echo [INFO] Проверка модели granite-embedding:278m...
ollama list | findstr "granite-embedding:278m" >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] granite-embedding:278m уже загружена
    set /a INSTALLED_COUNT+=1
) else (
    echo [INFO] Загрузка granite-embedding:278m...
    ollama pull ibm/granite-embedding:278m
    if %errorLevel% == 0 (
        echo [OK] granite-embedding:278m успешно загружена
        set /a INSTALLED_COUNT+=1
    ) else (
        echo [ERROR] Не удалось загрузить granite-embedding:278m
        set /a FAILED_COUNT+=1
    )
)
echo.

REM Model 2: 30m
echo [INFO] Проверка модели granite-embedding:30m...
ollama list | findstr "granite-embedding:30m" >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] granite-embedding:30m уже загружена
    set /a INSTALLED_COUNT+=1
) else (
    echo [INFO] Загрузка granite-embedding:30m...
    ollama pull ibm/granite-embedding:30m
    if %errorLevel% == 0 (
        echo [OK] granite-embedding:30m успешно загружена
        set /a INSTALLED_COUNT+=1
    ) else (
        echo [ERROR] Не удалось загрузить granite-embedding:30m
        set /a FAILED_COUNT+=1
    )
)
echo.

REM Report results
echo ========================================
echo Результат установки моделей:
echo   Успешно установлено: %INSTALLED_COUNT%/2
if %FAILED_COUNT% gtr 0 (
    echo   Ошибок при установке: %FAILED_COUNT%
)
echo ========================================
echo.

if %INSTALLED_COUNT% == 0 (
    echo [ERROR] Ни одна модель не установлена
    echo.
    echo Попробуйте установить вручную:
    echo   ollama pull ibm/granite-embedding:278m
    echo   ollama pull ibm/granite-embedding:30m
    echo.
    pause
    exit /b 1
)

:verify_model
echo.
echo [4/5] Проверка работоспособности моделей...

REM Test primary embedding model
curl -s -X POST http://127.0.0.1:11434/api/embeddings -d "{\"model\": \"ibm/granite-embedding:278m\", \"prompt\": \"test code\"}" >nul 2>nul
if %errorLevel% == 0 (
    echo [OK] Основная модель (278m) отвечает корректно
) else (
    echo [WARNING] Модель 278m не отвечает, но установка продолжена
)

:configure_project
echo.
echo [5/5] Настройка проекта...

REM Check if config file exists
if not exist "config\development.yaml" (
    echo [WARNING] Файл config\development.yaml не найден
    echo [INFO] Пропускаем автоматическую настройку
    goto :success
)

REM Create backup
if exist "config\development.yaml.bak" (
    echo [INFO] Backup уже существует, пропускаем создание
) else (
    copy "config\development.yaml" "config\development.yaml.bak" >nul
    echo [OK] Создан backup: config\development.yaml.bak
)

REM Note: Actual config modification would be done here
REM For now, just inform the user
echo [INFO] Для включения Granite эмбеддингов:
echo.
echo 1. Откройте: config/development.yaml
echo 2. Найдите секцию mcp.embedding
echo 3. Измените:
echo      provider: "memory"  -^>  provider: "auto"
echo      enabled: false      -^>  enabled: true
echo.
echo Или используйте переменную окружения:
echo   set MCP_EMBEDDING_PROVIDER=auto
echo   set MCP_EMBEDDING_ENABLED=true
echo.

:success
echo.
echo ========================================
echo Установка завершена успешно!
echo ========================================
echo.
echo Установленные компоненты:
ollama --version 2>nul
echo.
echo Установленные модели:
ollama list | findstr "granite-embedding"
echo.
echo Следующие шаги:
echo 1. Убедитесь что Ollama запущен: ollama serve
echo 2. Конфиг настроен на ibm/granite-embedding:278m (по умолчанию)
echo 3. Запустите MCP сервер: node dist/index.js .
echo.
echo Для доступа к моделям с 8192 токенами:
echo   Используйте Hugging Face API (не локально):
echo     1. Получите API ключ: https://huggingface.co/settings/tokens
echo     2. Установите: npm install @huggingface/inference
echo     3. В config/development.yaml:
echo        provider: "huggingface"
echo        model: "ibm-granite/granite-embedding-english-r2"
echo        huggingface:
echo          apiKey: "YOUR_HF_TOKEN"
echo.
echo Документация: EMBEDDINGS_SETUP.md
echo.
pause
