/**
 * English strings for setup command
 */

import type { SetupStrings } from "./types.js";

export const en: SetupStrings = {
  // ═══════════════════════════════════════════════════════════════
  // Banner & Complete
  // ═══════════════════════════════════════════════════════════════
  banner: {
    title: "SEMANTIC EMBEDDING SETUP",
    subtitle: "Configure embedding and LLM providers",
  },
  complete: {
    title: "Setup Complete!",
  },

  // ═══════════════════════════════════════════════════════════════
  // Code Language Selection
  // ═══════════════════════════════════════════════════════════════
  codeLanguage: {
    title: "Code comments language",
    option_en: "English only",
    option_en_hint: "Can use faster embedding models",
    option_multi: "Other languages (Russian, Chinese, ...)",
    option_multi_hint: "Need multilingual embedding models",
  },

  // ═══════════════════════════════════════════════════════════════
  // Embedding Provider Selection
  // ═══════════════════════════════════════════════════════════════
  provider: {
    title: "Embedding provider selection",
    recommended: "[RECOMMENDED]",
    selected: "Selected provider: {name}",
    vllm: {
      name: "vLLM Docker (NVIDIA GPU)",
      pros: ["Fastest", "NVIDIA GPU acceleration", "OpenAI API", "Continuous batching"],
      cons: ["Requires Docker", "Requires 8GB+ VRAM"],
    },
    tei: {
      name: "TEI (GPU)",
      pros: ["Native batch", "HuggingFace optimization", "Low latency"],
      cons: ["Requires Docker"],
    },
    tei_blackwell: "Requires special image: hotchpotch/tei-blackwell-testing",
    llamacpp: {
      name: "llama.cpp (Native GGUF)",
      pros: ["No Docker", "441 emb/s", "CUDA/Vulkan/CPU", "Low VRAM usage"],
      cons: ["/v1/embeddings API"],
    },
    ovms: {
      name: "OVMS Native (no Docker)",
      pros: ["No Docker", "260-326 emb/s", "INT8 quantization", "Intel iGPU/CPU"],
      cons: ["Intel optimized"],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // Embedding Model Selection
  // ═══════════════════════════════════════════════════════════════
  model: {
    title: "Embedding model selection",
    recommended: "[RECOMMENDED]",
    legacy: "[LEGACY]",
    section_512: "── 512 tokens (Smart Chunker for long methods) ──",
    section_8k: "── 8K tokens (for Legacy codebases) ──",
    section_8k_warning: "8K is only relevant for legacy projects with 500+ line methods.",
    section_8k_hint: "Smart Chunker effectively handles long code with 512 models.",
    selected: "Selected model: {name}",
    no_models: "No models available for {provider} + {language}",
  },

  // ═══════════════════════════════════════════════════════════════
  // LLM Setup
  // ═══════════════════════════════════════════════════════════════
  llm: {
    title: "LLM setup for documentation",
    enable_question: "Do you want to configure LLM for auto-generating documentation?",
    enable_hint: "LLM models generate docstrings, README, architecture descriptions.",
    option_yes: "Yes, configure LLM",
    option_no: "No, skip",
    provider_title: "LLM provider selection",
    model_title: "LLM model selection",
    skipped: "LLM setup skipped",
    selected_provider: "Selected LLM provider: {name}",
    selected_model: "Selected model: {name}",
    claude: {
      name: "Claude Code CLI (uses your authorization)",
      pros: ["Best quality", "No setup needed", "RU/EN support"],
      cons: ["Paid (Haiku ~$0.04/100 modules)"],
    },
    dmr: {
      name: "Docker Model Runner (Docker Desktop 4.40+)",
      pros: ["Simplest setup", "docker model run", "Auto-GPU"],
      cons: ["Requires Docker Desktop 4.40+"],
    },
    tgi: {
      name: "TGI (Text Generation Inference)",
      pros: ["Native batch", "Continuous batching", "Best throughput"],
      cons: ["Requires Docker", "No RTX 50xx support"],
    },
    ollama: {
      name: "Ollama (GPU/CPU)",
      pros: ["Simple setup", "All GPUs (including RTX 50xx)", "Streaming"],
      cons: [],
    },
    ollama_blackwell: "Ollama (GPU) — Blackwell works!",
    skip: {
      name: "Skip LLM setup",
      pros: ["Can configure later"],
      cons: [],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // LLM Models
  // ═══════════════════════════════════════════════════════════════
  llmModels: {
    claude_haiku: "Haiku",
    claude_haiku_hint: "Fast, cheap (~$0.04/100 modules)",
    claude_sonnet: "Sonnet",
    claude_sonnet_hint: "Balance of quality and speed (~$0.50/100 modules)",
    claude_opus: "Opus",
    claude_opus_hint: "Maximum quality (~$2/100 modules)",
    dmr_subtitle: "Docker Model Runner — 4 best models for documentation",
    tgi_vram_available: "Available: {vram}GB VRAM",
    tgi_no_models: "No TGI models for your VRAM capacity",
    ollama_vram_available: "Available: {vram}GB VRAM",
    ollama_cpu_only: "CPU only",
    ollama_no_models: "No Ollama models for your hardware",
  },

  // ═══════════════════════════════════════════════════════════════
  // Hardware Detection
  // ═══════════════════════════════════════════════════════════════
  hardware: {
    title: "Hardware Detection",
    cpu_optimal: "Maximum performance for CPU inference (AVX-512)",
    cpu_excellent: "Excellent performance for CPU inference (AVX2)",
    cpu_good: "Good performance for CPU inference",
    cpu_basic: "Basic performance, GPU recommended",
    cpu_weak: "Weak CPU, GPU recommended",
    cpu_unknown: "Unknown",
    gpu_hint: "Can use GPU embedding/LLM models via Ollama and TEI (docker)",
    gpu_not_detected: "Not detected",
  },

  // ═══════════════════════════════════════════════════════════════
  // Installation
  // ═══════════════════════════════════════════════════════════════
  install: {
    docker_required: "Docker not installed or not running",
    docker_available: "Docker available",
    docker_install_hint: "Install Docker Desktop:",
    docker_install_url: "https://www.docker.com/products/docker-desktop",
    container_exists: "Container '{name}' already exists",
    container_action_restart: "Restart",
    container_action_reinstall: "Remove & reinstall",
    container_action_cancel: "Cancel",
    container_restarted: "Container restarted",
    container_removed: "Container removed",
    container_created: "{name} container created",
    image_exists: "Image already exists: {tag}",
    pulling_image: "Pulling image: {tag}",
    pull_progress: "This may take several minutes...",
    pull_failed: "Failed to pull Docker image. Check network/VPN settings.",
    model_downloading: "Downloading model: {model}",
    model_size_hint: "Size: ~{size}GB, this may take several minutes...",
    model_downloaded: "Model downloaded!",
    model_failed: "Failed to download model",
    server_starting: "Starting server...",
    server_ready: "{name} server is ready!",
    server_endpoint: "Endpoint: {url}",
    health_waiting: "Waiting for {name} to initialize...",
    health_timeout: "Health check timed out. Check: docker logs {container}",
    ollama_not_found: "Ollama not installed",
    ollama_install_hint: "Install Ollama:",
    ollama_install_url: "https://ollama.ai/download",
    ollama_open_download: "Open download page? [y/N]:",
    ollama_available: "Ollama installed",
    ollama_service_starting: "Starting Ollama service...",
    ollama_service_running: "Ollama service running",
    claude_setup: "Claude Code CLI setup...",
    claude_not_found: "Claude Code CLI not found",
    claude_install_hint:
      "Install Claude Code:\nnpm install -g @anthropic-ai/claude-code\n\nOr via npx:\nnpx @anthropic-ai/claude-code",
    claude_available: "Claude Code CLI available",
    claude_testing: "Testing model: {name}",
    claude_works: "Claude Code works!",
    claude_response: "Response: {text}",
    claude_cost: "Cost: ${cost}",
    claude_test_failed: "Test failed, but Claude Code may still work",
    claude_check_auth: "Check authorization:\nclaude --version",
    dmr_setup: "Docker Model Runner LLM setup...",
    dmr_not_available: "Docker Model Runner not available",
    dmr_requires: "Requires Docker Desktop 4.40+",
    dmr_enable_hint:
      "After installation enable Model Runner:\nDocker Desktop → Settings → Features in development → Docker Model Runner",
    dmr_available: "Docker Model Runner available",
    dmr_testing: "Testing model...",
    dmr_works: "Model works correctly!",
    dmr_usage: 'Usage:\ndocker model run {model} "Your prompt here"',
    dmr_important: "IMPORTANT: Configure Docker Desktop:",
    dmr_enable_gpu: "Enable GPU acceleration (for GPU speedup)",
    dmr_enable_tcp: "Enable host-side TCP support (port 12434, for API)",
    dmr_cli_hint: "Or via CLI:\ndocker desktop enable model-runner --tcp 12434 --gpu",
    dmr_api_endpoint:
      "API endpoint (after enabling TCP):\nhttp://localhost:12434/engines/llama.cpp/v1/chat/completions",
    dmr_test_failed: "Model test failed, but model may still work",
  },

  // ═══════════════════════════════════════════════════════════════
  // NVIDIA Toolkit
  // ═══════════════════════════════════════════════════════════════
  nvidia: {
    checking: "Checking NVIDIA Container Toolkit...",
    toolkit_works: "NVIDIA Container Toolkit works",
    toolkit_not_configured: "NVIDIA Container Toolkit not configured",
    driver_ok: "NVIDIA driver {version} (✓ supports WSL2 GPU)",
    driver_old: "NVIDIA driver {version} too old. Requires 525+",
    driver_update_hint: "Update NVIDIA driver:",
    driver_update_url: "https://www.nvidia.com/download/index.aspx",
    driver_not_found: "nvidia-smi not found. Install NVIDIA driver.",
    wsl_check: "Checking Docker Desktop WSL2 backend...",
    wsl_requirements: [
      'Docker Desktop → Settings → General → "Use the WSL 2 based engine" ✓',
      "Docker Desktop → Settings → Resources → WSL Integration → Enable",
    ],
    wsl_configured: "Docker Desktop configured for WSL2? [y/N]:",
    wsl_configure_hint: "Open Docker Desktop → Settings and configure WSL2 backend",
    docker_restarting: "Restarting Docker Desktop to apply GPU settings...",
    docker_starting: "Docker Desktop starting...",
    docker_restart_failed: "Failed to restart Docker Desktop. Restart manually.",
    toolkit_now_works: "NVIDIA Container Toolkit now works!",
    gpu_still_unavailable: "GPU still unavailable in Docker",
    troubleshoot_hints: [
      "Reboot your computer",
      "Update NVIDIA driver to the latest version",
      "Reinstall Docker Desktop",
    ],
    installing: "Installing NVIDIA Container Toolkit...",
    installed: "NVIDIA Container Toolkit installed",
    gpu_available: "GPU available in Docker!",
    install_error: "Installation error: {error}",
  },

  // ═══════════════════════════════════════════════════════════════
  // OVMS specific
  // ═══════════════════════════════════════════════════════════════
  ovms: {
    setup: "OVMS Native setup (no Docker)...",
    intel_arc_detected: "Intel Arc GPU detected ({gpu}) - will use GPU acceleration",
    intel_igpu_detected: "Intel integrated GPU detected ({gpu}) - will use GPU acceleration",
    nvidia_with_igpu: "NVIDIA GPU detected ({gpu}) - will use Intel iGPU (GPU.0) for embeddings",
    nvidia_igpu_note: "(OpenVINO NVIDIA plugin experimental - Blackwell fails, older GPUs untested)",
    nvidia_no_igpu: "NVIDIA GPU detected ({gpu}) - no Intel iGPU, using CPU",
    npu_detected: "NPU detected but not optimal for embeddings - using CPU",
    cpu_fallback: "Using CPU for inference (no GPU detected)",
    platform_not_supported: "OVMS Native only supported on Windows and Linux",
    use_alternative: "Use OVMS Docker or Ollama",
    already_installed: "OVMS already installed",
    action_use: "Use existing",
    action_reinstall: "Reinstall",
    action_cancel: "Cancel",
    configuring_model: "Configuring model...",
    downloading: "Downloading OVMS {version} ({platform})...",
    extraction_failed: "Failed to extract OVMS",
    extracted: "OVMS extracted",
    preparing_model_dir: "Preparing model directory: {dir}",
    config_failed: "Failed to create OVMS config",
    config_created: "OVMS config created",
    starting_service: "Starting OVMS service ({device})...",
    waiting_response: "Waiting for OVMS to respond (http://127.0.0.1:8083)...",
    server_started: "OVMS server started!",
    health_status: "OVMS health: {status}",
    setup_complete: "OVMS setup complete",
    // Additional OVMS strings
    size_mb: "Size: {size} MB",
    downloaded: "Downloaded",
    extracting: "Extracting...",
    installed: "OVMS installed",
    download_error: "Download error: {error}",
    preparing_model: "Preparing model: {model}",
    no_hf_model: "No HuggingFace model in configuration",
    model_exported_mediapipe: "Model already exported with MediaPipe support",
    exporting_via_ovms: "Exporting model via OVMS export_model.py (creates MediaPipe graph)...",
    source: "Source: {source}",
    export_time_hint: "This will take 3-10 minutes (download and conversion)...",
    export_success: "Model exported with MediaPipe support",
    ovms_config_created: "OVMS config.json created: {path}",
    export_exit_code: "export_model.py exited with code {code}",
    export_error: "export_model.py error: {error}",
    docker_fallback: "export_model.py not found, using Docker conversion",
    no_mediapipe_note: "Note: /v3/embeddings API will be unavailable, only /v2/infer",
    need_docker_or_ovms: "Need Docker or OVMS repository for model conversion (C:\\opt\\model_server)",
    build_ovms_hint: "Build OVMS from source: scripts\\setup-ovms-nvidia.cmd",
    docker_converting: "Converting model via Docker: {model}",
    convert_time_hint: "This will take 3-10 minutes...",
    downloading_image: "Downloading {image}...",
    convert_quantization: "Converting with {format} quantization...",
    model_converted_no_mediapipe: "Model converted (no MediaPipe)",
    convert_error: "Conversion error: {error}",
    export_failed: "Failed to export model",
    v3_api_available: "/v3/embeddings API available (server-side tokenization)",
    v2_api_only: "/v2/models/embeddings/infer API (client-side tokenization)",
    startup_script_created: "Startup script created: {path}",
    setup_complete_full: "OVMS Native installed!",
    rest_api: "REST API",
    grpc: "gRPC",
    target: "Target",
    api: "API",
    auto_start_hint: "OVMS will start automatically with MCP",
    auto_stop_hint: "and stop when all clients disconnect.",
    manual_start: "Manual start: {path}",
    multi_device_config: "Multi-device config: {devices}",
    round_robin_hint: "Round-robin distribution: {slots} slots ({gpu} GPU, {cpu} CPU)",
  },

  // ═══════════════════════════════════════════════════════════════
  // vLLM specific
  // ═══════════════════════════════════════════════════════════════
  vllm: {
    setup: "vLLM Docker setup (NVIDIA GPU)...",
    nvidia_required: "vLLM requires NVIDIA GPU",
    use_alternative: "Use OVMS Native or TEI for CPU/Intel GPU",
    hf_token_found: "HuggingFace token found",
    hf_token_missing: "HF_TOKEN not found — model downloads may be limited",
    creating_container: "Creating vLLM container with model: {model}",
    openai_api_hint: "vLLM uses OpenAI-compatible API at /v1/embeddings",
    image_size_hint: "This may take several minutes (image is ~8GB)...",
    image_downloaded: "vLLM image downloaded",
    waiting_init: "Waiting for vLLM to initialize (model download may take several minutes)...",
    server_ready: "vLLM server is ready!",
    health_timeout_hint: "Model may still be downloading. Wait and check: curl http://127.0.0.1:8000/health",
  },

  // ═══════════════════════════════════════════════════════════════
  // TEI specific
  // ═══════════════════════════════════════════════════════════════
  tei: {
    setup: "TEI setup...",
    hf_token_set_hint: 'Set: $env:HF_TOKEN = "hf_xxx" or export HF_TOKEN=hf_xxx',
    blackwell_detected: "Blackwell GPU detected — using special image",
    pull_time_hint: "This may take a few minutes...",
    batch_config: "Batch: {texts} texts, {tokens} tokens",
    hf_token_partial: "HF_TOKEN: ****{suffix}",
    waiting_init: "Waiting for TEI to initialize (model download may take several minutes)...",
    server_ready: "TEI server is ready!",
  },

  // ═══════════════════════════════════════════════════════════════
  // Ollama specific
  // ═══════════════════════════════════════════════════════════════
  ollama: {
    setup: "Ollama setup...",
  },

  // ═══════════════════════════════════════════════════════════════
  // llama.cpp specific
  // ═══════════════════════════════════════════════════════════════
  llamacpp: {
    setup: "llama.cpp Native setup...",
    unsupported_platform: "Platform {platform} is not supported",
    detected_backend: "Detected backend: {backend}",
    cuda_backend: "NVIDIA CUDA 13.1",
    vulkan_backend: "Vulkan (cross-platform GPU)",
    cpu_backend: "CPU only",
    already_installed: "llama-server already installed",
    action_use: "Use existing",
    action_reinstall: "Reinstall",
    action_cancel: "Cancel",
    proceeding_existing: "Proceeding with existing installation...",
    reinstalling: "Reinstalling llama-server...",
    no_download_url: "Could not determine download URL",
    binary_not_found: "llama-server binary not found in archive",
    installed: "llama-server installed: {path}",
    copying_libs: "Copying {count} library files...",
    copied_dlls: "Copied {count} DLL files",
    copy_dlls_failed: "Could not copy DLLs: {error}",
    downloading_cuda: "Downloading CUDA 13.1 runtime libraries...",
    cuda_installed: "CUDA 13.1 runtime libraries installed",
    cuda_copy_failed: "Could not copy cudart DLLs: {error}",
    cuda_download_failed: "Could not download CUDA runtime DLLs - GPU may not work",
    preparing_model: "Preparing model: {model}",
    no_gguf_repo: "No GGUF repository specified in model config",
    model_exists: "Model already exists: {file}",
    downloading_gguf: "Downloading GGUF model: {repo}/{file}",
    download_time_hint: "This may take several minutes...",
    size_mb: "Size: {size} MB",
    model_downloaded: "Model downloaded: {file}",
    model_download_failed: "Model download failed: {error}",
    testing_startup: "Testing server startup (model loading may take 30-90s)...",
    loading_model: "Loading model... {elapsed}s",
    test_passed: "Server test passed!",
    test_timeout: "Server test timed out (may still work)",
    setup_complete: "llama.cpp installed!",
    auto_start_hint: "Server will start automatically when MCP needs embeddings",
    manual_start: "Manual start: {cmd}",
    fallback_version: "Could not fetch latest version, using fallback: {version}",
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
    prompt_choice: "Choice [1-{max}, default={def}]:",
    yes_no: "[y/N]:",
    yes_default: "[Y/n]:",
    invalid_choice: "Invalid choice",
  },
};
