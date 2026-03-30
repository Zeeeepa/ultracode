/**
 * Russian strings for setup command
 */

import type { SetupStrings } from "./types.js";

export const ru: SetupStrings = {
  // ═══════════════════════════════════════════════════════════════
  // Banner & Complete
  // ═══════════════════════════════════════════════════════════════
  banner: {
    title: "НАСТРОЙКА SEMANTIC EMBEDDING",
    subtitle: "Конфигурация embedding и LLM провайдеров",
  },
  complete: {
    title: "Настройка завершена!",
  },

  // ═══════════════════════════════════════════════════════════════
  // Code Language Selection
  // ═══════════════════════════════════════════════════════════════
  codeLanguage: {
    title: "Язык комментариев в коде",
    option_en: "Использую только English",
    option_en_hint: "Можно использовать более быстрые embedding-модели",
    option_multi: "Есть комментарии на других языках (русский, китайский, ...)",
    option_multi_hint: "Нужно использовать мультиязычные embedding-модели",
  },

  // ═══════════════════════════════════════════════════════════════
  // Embedding Provider Selection
  // ═══════════════════════════════════════════════════════════════
  provider: {
    title: "Выбор провайдера embeddings",
    recommended: "[РЕКОМЕНДУЕТСЯ]",
    selected: "Выбран провайдер: {name}",
    vllm: {
      name: "vLLM Docker (NVIDIA GPU)",
      pros: ["Самый быстрый", "NVIDIA GPU ускорение", "OpenAI API", "Continuous batching"],
      cons: ["Требует Docker", "Требует 8GB+ VRAM"],
    },
    tei: {
      name: "TEI (GPU)",
      pros: ["Native batch", "HuggingFace оптимизация", "Низкая латентность"],
      cons: ["Требует Docker"],
    },
    tei_blackwell: "(не используется — TEI 1.9 поддерживает Blackwell нативно)",
    llamacpp: {
      name: "llama.cpp (Native GGUF)",
      pros: ["Без Docker", "441 emb/s", "CUDA/Vulkan/CPU", "Низкое потребление VRAM"],
      cons: ["/v1/embeddings API"],
    },
    ovms: {
      name: "OVMS Native (без Docker)",
      pros: ["Без Docker", "260-326 emb/s", "INT8 квантизация", "Intel iGPU/CPU"],
      cons: ["Оптимизирован для Intel"],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // Embedding Model Selection
  // ═══════════════════════════════════════════════════════════════
  model: {
    title: "Выбор модели embeddings",
    recommended: "[РЕКОМЕНДУЕТСЯ]",
    legacy: "[LEGACY]",
    section_512: "── 512 токенов (Smart Chunker для длинных методов) ──",
    section_8k: "── 8K токенов (для Legacy кодовых баз) ──",
    section_8k_warning: "8K актуально только для legacy проектов с методами 500+ строк.",
    section_8k_hint: "Smart Chunker эффективно обрабатывает длинный код с 512 моделями.",
    selected: "Выбрана модель: {name}",
    no_models: "Нет доступных моделей для {provider} + {language}",
    skip: "Пропустить (только текстовый поиск)",
  },

  // ═══════════════════════════════════════════════════════════════
  // LLM Setup
  // ═══════════════════════════════════════════════════════════════
  llm: {
    title: "Настройка LLM для документации",
    enable_question: "Хотите настроить LLM для автогенерации документации?",
    enable_hint: "LLM модели генерируют docstrings, README, архитектурные описания.",
    option_yes: "Да, настроить LLM",
    option_no: "Нет, пропустить",
    provider_title: "Выбор LLM провайдера",
    model_title: "Выбор LLM модели",
    skipped: "LLM настройка пропущена",
    selected_provider: "Выбран LLM провайдер: {name}",
    selected_model: "Выбрана модель: {name}",
    claude: {
      name: "Claude Code CLI (использует вашу авторизацию)",
      pros: ["Лучшее качество", "Без настройки", "Поддержка RU/EN"],
      cons: ["Платный (Haiku ~$0.04/100 модулей)"],
    },
    dmr: {
      name: "Docker Model Runner (Docker Desktop 4.40+)",
      pros: ["Простейшая настройка", "docker model run", "Авто-GPU"],
      cons: ["Требует Docker Desktop 4.40+"],
    },
    tgi: {
      name: "TGI (Text Generation Inference)",
      pros: ["Native batch", "Continuous batching", "Best throughput"],
      cons: ["Требует Docker", "Не поддерживает RTX 50xx"],
    },
    ollama: {
      name: "Ollama (GPU/CPU)",
      pros: ["Простая установка", "Все GPU (включая RTX 50xx)", "Streaming"],
      cons: [],
    },
    ollama_blackwell: "Ollama (GPU) — Blackwell работает!",
    skip: {
      name: "Пропустить настройку LLM",
      pros: ["Можно настроить позже"],
      cons: [],
    },
    // Zig-compatible LLM flow keys
    doc_lang_title: "Язык документации",
    zig: {
      claude_cli: "Claude Code CLI (локально, через вашу авторизацию)",
      claude_api: "Claude API (прямой доступ, нужен API ключ)",
      openai_compat: "OpenAI-совместимый (Ollama / vLLM / LMStudio)",
      skip: "Пропустить настройку LLM",
      claude_cli_detected: "Claude CLI обнаружен и доступен",
      claude_cli_not_found: "Claude CLI не найден — установка: npm i -g @anthropic-ai/claude-code",
      claude_api_title: "Настройка Claude API",
      api_key_from_env: "API ключ из ANTHROPIC_API_KEY",
      api_key_prompt: "Anthropic API ключ (sk-ant-...)",
      openai_title: "OpenAI-совместимый эндпоинт",
      endpoint_prompt: "URL эндпоинта",
      api_key_optional: "API ключ (необязательно, Enter чтобы пропустить)",
      model_prompt: "Имя модели",
      context_prompt: "Размер контекста (токены)",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // LLM Models
  // ═══════════════════════════════════════════════════════════════
  llmModels: {
    claude_model_title: "Выбор модели Claude",
    claude_haiku: "Haiku",
    claude_haiku_hint: "Быстрый, дешёвый (~$0.04/100 модулей)",
    claude_sonnet: "Sonnet",
    claude_sonnet_hint: "Баланс качества и скорости (~$0.50/100 модулей)",
    claude_opus: "Opus",
    claude_opus_hint: "Максимальное качество (~$2/100 модулей)",
    dmr_subtitle: "Docker Model Runner — 4 лучших модели для документации",
    tgi_vram_available: "Доступно: {vram}GB VRAM",
    tgi_no_models: "Нет TGI моделей для вашего объёма VRAM",
    ollama_vram_available: "Доступно: {vram}GB VRAM",
    ollama_cpu_only: "CPU only",
    ollama_no_models: "Нет Ollama моделей для вашего оборудования",
  },

  // ═══════════════════════════════════════════════════════════════
  // Hardware Detection
  // ═══════════════════════════════════════════════════════════════
  hardware: {
    title: "Обнаружение оборудования",
    cpu_optimal: "Максимальная производительность для CPU инференса (AVX-512)",
    cpu_excellent: "Отличная производительность для CPU инференса (AVX2)",
    cpu_good: "Хорошая производительность для CPU инференса",
    cpu_basic: "Базовая производительность, рекомендуется GPU",
    cpu_weak: "Слабый CPU, рекомендуется GPU",
    cpu_unknown: "Неизвестно",
    gpu_hint: "Можно использовать GPU embedding/LLM модели через Ollama и TEI (docker)",
    gpu_not_detected: "Не обнаружен",
  },

  // ═══════════════════════════════════════════════════════════════
  // Installation
  // ═══════════════════════════════════════════════════════════════
  install: {
    docker_required: "Docker не установлен или не запущен",
    docker_available: "Docker доступен",
    docker_install_hint: "Установите Docker Desktop:",
    docker_install_url: "https://www.docker.com/products/docker-desktop",
    container_exists: "Контейнер '{name}' уже существует",
    container_action_restart: "Перезапустить",
    container_action_reinstall: "Удалить и переустановить",
    container_action_cancel: "Отмена",
    container_restarted: "Контейнер перезапущен",
    container_removed: "Контейнер удалён",
    container_created: "Контейнер {name} создан",
    image_exists: "Образ уже существует: {tag}",
    pulling_image: "Загрузка образа: {tag}",
    pull_progress: "Это может занять несколько минут...",
    pull_failed: "Не удалось загрузить Docker образ. Проверьте сеть/VPN.",
    model_downloading: "Загрузка модели: {model}",
    model_size_hint: "Размер: ~{size}GB, это может занять несколько минут...",
    model_downloaded: "Модель загружена!",
    model_failed: "Не удалось загрузить модель",
    server_starting: "Запуск сервера...",
    server_ready: "Сервер {name} готов!",
    server_endpoint: "Endpoint: {url}",
    health_waiting: "Ожидание инициализации {name}...",
    health_timeout: "Превышено время ожидания. Проверьте: docker logs {container}",
    ollama_not_found: "Ollama не установлен",
    ollama_install_hint: "Установите Ollama:",
    ollama_install_url: "https://ollama.ai/download",
    ollama_open_download: "Открыть страницу загрузки? [y/N]:",
    ollama_available: "Ollama установлен",
    ollama_service_starting: "Запуск сервиса Ollama...",
    ollama_service_running: "Сервис Ollama работает",
    claude_setup: "Настройка Claude Code CLI...",
    claude_not_found: "Claude Code CLI не найден",
    claude_install_hint:
      "Установите Claude Code:\nnpm install -g @anthropic-ai/claude-code\n\nИли через npx:\nnpx @anthropic-ai/claude-code",
    claude_available: "Claude Code CLI доступен",
    claude_testing: "Тестируем модель: {name}",
    claude_works: "Claude Code работает!",
    claude_response: "Ответ: {text}",
    claude_cost: "Стоимость: ${cost}",
    claude_test_failed: "Тест не прошёл, но Claude Code может работать",
    claude_check_auth: "Проверьте авторизацию:\nclaude --version",
    dmr_setup: "Настройка Docker Model Runner LLM...",
    dmr_not_available: "Docker Model Runner не доступен",
    dmr_requires: "Требуется Docker Desktop 4.40+",
    dmr_enable_hint:
      "После установки включите Model Runner:\nDocker Desktop → Settings → Features in development → Docker Model Runner",
    dmr_available: "Docker Model Runner доступен",
    dmr_testing: "Тестирование модели...",
    dmr_works: "Модель работает корректно!",
    dmr_usage: 'Использование:\ndocker model run {model} "Your prompt here"',
    dmr_important: "ВАЖНО: Настройте Docker Desktop:",
    dmr_enable_gpu: "Enable GPU acceleration (для ускорения на GPU)",
    dmr_enable_tcp: "Enable host-side TCP support (порт 12434, для API)",
    dmr_cli_hint: "Или через CLI:\ndocker desktop enable model-runner --tcp 12434 --gpu",
    dmr_api_endpoint:
      "API endpoint (после включения TCP):\nhttp://localhost:12434/engines/llama.cpp/v1/chat/completions",
    dmr_test_failed: "Тест модели не прошёл, но модель может работать",
  },

  // ═══════════════════════════════════════════════════════════════
  // NVIDIA Toolkit
  // ═══════════════════════════════════════════════════════════════
  nvidia: {
    checking: "Проверка NVIDIA Container Toolkit...",
    toolkit_works: "NVIDIA Container Toolkit работает",
    toolkit_not_configured: "NVIDIA Container Toolkit не настроен",
    driver_ok: "NVIDIA драйвер {version} (✓ поддерживает WSL2 GPU)",
    driver_old: "NVIDIA драйвер {version} слишком старый. Требуется 525+",
    driver_update_hint: "Обновите драйвер NVIDIA:",
    driver_update_url: "https://www.nvidia.com/download/index.aspx",
    driver_not_found: "nvidia-smi не найден. Установите NVIDIA драйвер.",
    wsl_check: "Проверка Docker Desktop WSL2 backend...",
    wsl_requirements: [
      'Docker Desktop → Settings → General → "Use the WSL 2 based engine" ✓',
      "Docker Desktop → Settings → Resources → WSL Integration → Enable",
    ],
    wsl_configured: "Docker Desktop настроен для WSL2? [y/N]:",
    wsl_configure_hint: "Откройте Docker Desktop → Settings и настройте WSL2 backend",
    docker_restarting: "Перезапуск Docker Desktop для применения GPU настроек...",
    docker_starting: "Docker Desktop запускается...",
    docker_restart_failed: "Не удалось перезапустить Docker Desktop. Перезапустите вручную.",
    toolkit_now_works: "NVIDIA Container Toolkit теперь работает!",
    gpu_still_unavailable: "GPU всё ещё недоступен в Docker",
    troubleshoot_hints: [
      "Перезагрузите компьютер",
      "Обновите NVIDIA драйвер до последней версии",
      "Переустановите Docker Desktop",
    ],
    installing: "Установка NVIDIA Container Toolkit...",
    installed: "NVIDIA Container Toolkit установлен",
    gpu_available: "GPU доступен в Docker!",
    install_error: "Ошибка установки: {error}",
  },

  // ═══════════════════════════════════════════════════════════════
  // OVMS specific
  // ═══════════════════════════════════════════════════════════════
  ovms: {
    setup: "Настройка OVMS Native (без Docker)...",
    intel_arc_detected: "Обнаружен Intel Arc GPU ({gpu}) - будет использовано GPU ускорение",
    intel_igpu_detected: "Обнаружен Intel встроенный GPU ({gpu}) - будет использовано GPU ускорение",
    nvidia_with_igpu: "Обнаружен NVIDIA GPU ({gpu}) - для embeddings будет использован Intel iGPU (GPU.0)",
    nvidia_igpu_note: "(OpenVINO NVIDIA plugin экспериментальный - Blackwell не работает, старые GPU не тестировались)",
    nvidia_no_igpu: "Обнаружен NVIDIA GPU ({gpu}) - нет Intel iGPU, используется CPU",
    npu_detected: "NPU обнаружен, но не оптимален для embeddings - используется CPU",
    cpu_fallback: "Используется CPU для инференса (GPU не обнаружен)",
    platform_not_supported: "OVMS Native поддерживается только на Windows и Linux",
    use_alternative: "Используйте OVMS Docker или Ollama",
    already_installed: "OVMS уже установлен",
    action_use: "Использовать существующий",
    action_reinstall: "Переустановить",
    action_cancel: "Отмена",
    configuring_model: "Настройка модели...",
    downloading: "Загрузка OVMS {version} ({platform})...",
    extraction_failed: "Не удалось распаковать OVMS",
    extracted: "OVMS распакован",
    preparing_model_dir: "Подготовка директории модели: {dir}",
    config_failed: "Не удалось создать конфигурацию OVMS",
    config_created: "Конфигурация OVMS создана",
    starting_service: "Запуск OVMS сервиса ({device})...",
    waiting_response: "Ожидание ответа OVMS (http://127.0.0.1:8083)...",
    server_started: "OVMS сервер запущен!",
    health_status: "OVMS health: {status}",
    setup_complete: "Настройка OVMS завершена",
    // Additional OVMS strings
    size_mb: "Размер: {size} MB",
    downloaded: "Скачано",
    extracting: "Распаковка...",
    installed: "OVMS установлен",
    download_error: "Ошибка загрузки: {error}",
    preparing_model: "Подготовка модели: {model}",
    no_hf_model: "Нет HuggingFace модели в конфигурации",
    model_exported_mediapipe: "Модель уже экспортирована с MediaPipe поддержкой",
    exporting_via_ovms: "Экспорт модели через OVMS export_model.py (создаст MediaPipe граф)...",
    source: "Источник: {source}",
    export_time_hint: "Это займёт 3-10 минут (загрузка и конвертация модели)...",
    export_success: "Модель экспортирована с MediaPipe поддержкой",
    ovms_config_created: "OVMS config.json создан: {path}",
    export_exit_code: "export_model.py завершился с кодом {code}",
    export_error: "Ошибка export_model.py: {error}",
    docker_fallback: "export_model.py не найден, используем Docker конвертацию",
    no_mediapipe_note: "Примечание: /v3/embeddings API будет недоступен, только /v2/infer",
    need_docker_or_ovms: "Для конвертации модели нужен Docker или OVMS репозиторий (C:\\opt\\model_server)",
    build_ovms_hint: "Соберите OVMS из исходников: scripts\\setup-ovms-nvidia.cmd",
    docker_converting: "Конвертация модели через Docker: {model}",
    convert_time_hint: "Это займёт 3-10 минут...",
    downloading_image: "Скачивание {image}...",
    convert_quantization: "Конвертация с {format} квантизацией...",
    model_converted_no_mediapipe: "Модель сконвертирована (без MediaPipe)",
    convert_error: "Ошибка конвертации: {error}",
    export_failed: "Не удалось экспортировать модель",
    v3_api_available: "/v3/embeddings API доступен (server-side tokenization)",
    v2_api_only: "/v2/models/embeddings/infer API (client-side tokenization)",
    startup_script_created: "Создан скрипт запуска: {path}",
    setup_complete_full: "OVMS Native установлен!",
    rest_api: "REST API",
    grpc: "gRPC",
    target: "Target",
    api: "API",
    auto_start_hint: "OVMS будет запущен автоматически при старте MCP",
    auto_stop_hint: "и остановлен при отключении всех клиентов.",
    manual_start: "Ручной запуск: {path}",
    multi_device_config: "Multi-device конфигурация: {devices}",
    round_robin_hint: "Round-robin распределение: {slots} слотов ({gpu} GPU, {cpu} CPU)",
  },

  // ═══════════════════════════════════════════════════════════════
  // vLLM specific
  // ═══════════════════════════════════════════════════════════════
  vllm: {
    setup: "vLLM Docker setup (NVIDIA GPU)...",
    nvidia_required: "vLLM требует NVIDIA GPU",
    use_alternative: "Используйте OVMS Native или TEI для CPU/Intel GPU",
    hf_token_found: "HuggingFace токен найден",
    hf_token_missing: "HF_TOKEN не найден — загрузка моделей может быть ограничена",
    creating_container: "Создание vLLM контейнера с моделью: {model}",
    openai_api_hint: "vLLM использует OpenAI-compatible API на /v1/embeddings",
    image_size_hint: "Это может занять несколько минут (образ ~8GB)...",
    image_downloaded: "vLLM образ загружен",
    waiting_init: "Ожидание инициализации vLLM (загрузка модели может занять несколько минут)...",
    server_ready: "vLLM сервер готов!",
    health_timeout_hint: "Модель может ещё загружаться. Подождите и проверьте: curl http://127.0.0.1:8000/health",
  },

  // ═══════════════════════════════════════════════════════════════
  // TEI specific
  // ═══════════════════════════════════════════════════════════════
  tei: {
    setup: "TEI setup...",
    hf_token_set_hint: 'Установите: $env:HF_TOKEN = "hf_xxx" или export HF_TOKEN=hf_xxx',
    blackwell_detected: "Обнаружен Blackwell GPU — используется sm_120 image (TEI 1.9+)",
    blackwell_image: "Используется Blackwell image (sm_120) для RTX 50xx GPU",
    pull_time_hint: "Это может занять несколько минут...",
    batch_config: "Batch: {texts} текстов, {tokens} токенов",
    hf_token_partial: "HF_TOKEN: ****{suffix}",
    waiting_init: "Ожидание инициализации TEI (загрузка модели может занять несколько минут)...",
    server_ready: "TEI сервер готов!",
  },

  // ═══════════════════════════════════════════════════════════════
  // Ollama specific
  // ═══════════════════════════════════════════════════════════════
  ollama: {
    setup: "Настройка Ollama...",
  },

  // ═══════════════════════════════════════════════════════════════
  // llama.cpp specific
  // ═══════════════════════════════════════════════════════════════
  llamacpp: {
    setup: "Настройка llama.cpp Native...",
    unsupported_platform: "Платформа {platform} не поддерживается",
    detected_backend: "Обнаружен backend: {backend}",
    cuda_backend: "NVIDIA CUDA 13.1",
    vulkan_backend: "Vulkan (кроссплатформенный GPU)",
    cpu_backend: "Только CPU",
    already_installed: "llama-server уже установлен",
    action_use: "Использовать существующий",
    action_reinstall: "Переустановить",
    action_cancel: "Отмена",
    proceeding_existing: "Используем существующую установку...",
    reinstalling: "Переустановка llama-server...",
    no_download_url: "Не удалось определить URL загрузки",
    binary_not_found: "llama-server не найден в архиве",
    installed: "llama-server установлен: {path}",
    copying_libs: "Копирование {count} файлов библиотек...",
    copied_dlls: "Скопировано {count} DLL файлов",
    copy_dlls_failed: "Не удалось скопировать DLL: {error}",
    downloading_cuda: "Загрузка CUDA 13.1 runtime библиотек...",
    cuda_installed: "CUDA 13.1 runtime библиотеки установлены",
    cuda_copy_failed: "Не удалось скопировать cudart DLL: {error}",
    cuda_download_failed: "Не удалось загрузить CUDA runtime DLL — GPU может не работать",
    preparing_model: "Подготовка модели: {model}",
    no_gguf_repo: "GGUF репозиторий не указан в конфигурации модели",
    model_exists: "Модель уже существует: {file}",
    downloading_gguf: "Загрузка GGUF модели: {repo}/{file}",
    download_time_hint: "Это может занять несколько минут...",
    size_mb: "Размер: {size} MB",
    model_downloaded: "Модель загружена: {file}",
    model_download_failed: "Ошибка загрузки модели: {error}",
    testing_startup: "Тестирование запуска сервера (загрузка модели может занять 30-90с)...",
    loading_model: "Загрузка модели... {elapsed}с",
    test_passed: "Тест сервера пройден!",
    test_timeout: "Тест сервера истёк (может всё ещё работать)",
    setup_complete: "llama.cpp установлен!",
    auto_start_hint: "Сервер запустится автоматически когда MCP потребуются embeddings",
    manual_start: "Ручной запуск: {cmd}",
    fallback_version: "Не удалось получить последнюю версию, используем fallback: {version}",
  },

  // ═══════════════════════════════════════════════════════════════
  // Status messages
  // ═══════════════════════════════════════════════════════════════
  status: {
    ok: "[OK]",
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
  },

  // ═══════════════════════════════════════════════════════════════
  // Common UI elements
  // ═══════════════════════════════════════════════════════════════
  common: {
    prompt_choice: "Выбор [1-{max}, default={def}]:",
    yes_no: "[y/N]:",
    yes_default: "[Y/n]:",
    invalid_choice: "Неверный выбор",
  },
};
