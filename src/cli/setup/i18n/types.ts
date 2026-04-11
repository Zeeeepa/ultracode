/**
 * Type definitions for setup command i18n strings
 */

/**
 * Provider-specific strings (name, pros, cons)
 */
export interface ProviderStrings {
  name: string;
  pros: string[];
  cons: string[];
}

/**
 * Complete setup strings interface
 */
export interface SetupStrings {
  // ═══════════════════════════════════════════════════════════════
  // Banner & Complete
  // ═══════════════════════════════════════════════════════════════
  banner: {
    title: string;
    subtitle: string;
  };
  complete: {
    title: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Code Language Selection (step 1)
  // ═══════════════════════════════════════════════════════════════
  codeLanguage: {
    title: string;
    option_en: string;
    option_en_hint: string;
    option_multi: string;
    option_multi_hint: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Embedding Provider Selection (step 2)
  // ═══════════════════════════════════════════════════════════════
  provider: {
    title: string;
    recommended: string;
    selected: string;
    // Per-provider strings
    tei: ProviderStrings;
    tei_blackwell: string;
    llamacpp: ProviderStrings;
    ovms: ProviderStrings;
  };

  // ═══════════════════════════════════════════════════════════════
  // Embedding Model Selection (step 3)
  // ═══════════════════════════════════════════════════════════════
  model: {
    title: string;
    recommended: string;
    legacy: string;
    section_512: string;
    section_8k: string;
    section_8k_warning: string;
    section_8k_hint: string;
    selected: string;
    no_models: string;
    skip: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // LLM Setup (step 4)
  // ═══════════════════════════════════════════════════════════════
  llm: {
    title: string;
    enable_question: string;
    enable_hint: string;
    option_yes: string;
    option_no: string;
    provider_title: string;
    model_title: string;
    skipped: string;
    selected_provider: string;
    selected_model: string;
    // Per-provider strings
    claude: ProviderStrings;
    dmr: ProviderStrings;
    tgi: ProviderStrings;
    ollama: ProviderStrings;
    ollama_blackwell: string;
    skip: ProviderStrings;
    // Zig-compatible LLM flow
    doc_lang_title: string;
    zig: {
      claude_cli: string;
      claude_api: string;
      openai_compat: string;
      skip: string;
      claude_cli_detected: string;
      claude_cli_not_found: string;
      claude_api_title: string;
      api_key_from_env: string;
      api_key_prompt: string;
      openai_title: string;
      endpoint_prompt: string;
      api_key_optional: string;
      model_prompt: string;
      context_prompt: string;
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // LLM Models
  // ═══════════════════════════════════════════════════════════════
  llmModels: {
    claude_model_title: string;
    claude_haiku: string;
    claude_haiku_hint: string;
    claude_sonnet: string;
    claude_sonnet_hint: string;
    claude_opus: string;
    claude_opus_hint: string;
    dmr_subtitle: string;
    tgi_vram_available: string;
    tgi_no_models: string;
    ollama_vram_available: string;
    ollama_cpu_only: string;
    ollama_no_models: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Hardware Detection
  // ═══════════════════════════════════════════════════════════════
  hardware: {
    title: string;
    cpu_optimal: string;
    cpu_excellent: string;
    cpu_good: string;
    cpu_basic: string;
    cpu_weak: string;
    cpu_unknown: string;
    gpu_hint: string;
    gpu_not_detected: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Installation
  // ═══════════════════════════════════════════════════════════════
  install: {
    // Docker
    docker_required: string;
    docker_available: string;
    docker_install_hint: string;
    docker_install_url: string;
    // Container management
    container_exists: string;
    container_action_restart: string;
    container_action_reinstall: string;
    container_action_cancel: string;
    container_restarted: string;
    container_removed: string;
    container_created: string;
    // Download & Progress
    image_exists: string;
    pulling_image: string;
    pull_progress: string;
    pull_failed: string;
    model_downloading: string;
    model_size_hint: string;
    model_downloaded: string;
    model_failed: string;
    // Server status
    server_starting: string;
    server_ready: string;
    server_endpoint: string;
    health_waiting: string;
    health_timeout: string;
    // Ollama specific
    ollama_not_found: string;
    ollama_install_hint: string;
    ollama_install_url: string;
    ollama_open_download: string;
    ollama_available: string;
    ollama_service_starting: string;
    ollama_service_running: string;
    // Claude Code specific
    claude_setup: string;
    claude_not_found: string;
    claude_install_hint: string;
    claude_available: string;
    claude_testing: string;
    claude_works: string;
    claude_response: string;
    claude_cost: string;
    claude_test_failed: string;
    claude_check_auth: string;
    // DMR specific
    dmr_setup: string;
    dmr_not_available: string;
    dmr_requires: string;
    dmr_enable_hint: string;
    dmr_available: string;
    dmr_testing: string;
    dmr_works: string;
    dmr_usage: string;
    dmr_important: string;
    dmr_enable_gpu: string;
    dmr_enable_tcp: string;
    dmr_cli_hint: string;
    dmr_api_endpoint: string;
    dmr_test_failed: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // NVIDIA Toolkit
  // ═══════════════════════════════════════════════════════════════
  nvidia: {
    checking: string;
    toolkit_works: string;
    toolkit_not_configured: string;
    driver_ok: string;
    driver_old: string;
    driver_update_hint: string;
    driver_update_url: string;
    driver_not_found: string;
    wsl_check: string;
    wsl_requirements: string[];
    wsl_configured: string;
    wsl_configure_hint: string;
    docker_restarting: string;
    docker_starting: string;
    docker_restart_failed: string;
    toolkit_now_works: string;
    gpu_still_unavailable: string;
    troubleshoot_hints: string[];
    installing: string;
    installed: string;
    gpu_available: string;
    install_error: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // OVMS specific
  // ═══════════════════════════════════════════════════════════════
  ovms: {
    setup: string;
    intel_arc_detected: string;
    intel_igpu_detected: string;
    nvidia_with_igpu: string;
    nvidia_igpu_note: string;
    nvidia_no_igpu: string;
    npu_detected: string;
    cpu_fallback: string;
    platform_not_supported: string;
    use_alternative: string;
    already_installed: string;
    action_use: string;
    action_reinstall: string;
    action_cancel: string;
    configuring_model: string;
    downloading: string;
    extraction_failed: string;
    extracted: string;
    preparing_model_dir: string;
    config_failed: string;
    config_created: string;
    starting_service: string;
    waiting_response: string;
    server_started: string;
    health_status: string;
    setup_complete: string;
    // Additional OVMS strings
    size_mb: string;
    downloaded: string;
    extracting: string;
    installed: string;
    download_error: string;
    preparing_model: string;
    no_hf_model: string;
    model_exported_mediapipe: string;
    exporting_via_ovms: string;
    source: string;
    export_time_hint: string;
    export_success: string;
    ovms_config_created: string;
    export_exit_code: string;
    export_error: string;
    docker_fallback: string;
    no_mediapipe_note: string;
    need_docker_or_ovms: string;
    build_ovms_hint: string;
    docker_converting: string;
    convert_time_hint: string;
    downloading_image: string;
    convert_quantization: string;
    model_converted_no_mediapipe: string;
    convert_error: string;
    export_failed: string;
    v3_api_available: string;
    v2_api_only: string;
    startup_script_created: string;
    setup_complete_full: string;
    rest_api: string;
    grpc: string;
    target: string;
    api: string;
    auto_start_hint: string;
    auto_stop_hint: string;
    manual_start: string;
    multi_device_config: string;
    round_robin_hint: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // TEI specific
  // ═══════════════════════════════════════════════════════════════
  tei: {
    setup: string;
    hf_token_set_hint: string;
    blackwell_detected: string;
    blackwell_image: string;
    pull_time_hint: string;
    batch_config: string;
    hf_token_partial: string;
    waiting_init: string;
    server_ready: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Ollama specific
  // ═══════════════════════════════════════════════════════════════
  ollama: {
    setup: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // llama.cpp specific
  // ═══════════════════════════════════════════════════════════════
  llamacpp: {
    setup: string;
    unsupported_platform: string;
    detected_backend: string;
    cuda_backend: string;
    vulkan_backend: string;
    cpu_backend: string;
    already_installed: string;
    action_use: string;
    action_reinstall: string;
    action_cancel: string;
    proceeding_existing: string;
    reinstalling: string;
    no_download_url: string;
    binary_not_found: string;
    installed: string;
    copying_libs: string;
    copied_dlls: string;
    copy_dlls_failed: string;
    downloading_cuda: string;
    cuda_installed: string;
    cuda_copy_failed: string;
    cuda_download_failed: string;
    preparing_model: string;
    no_gguf_repo: string;
    model_exists: string;
    downloading_gguf: string;
    download_time_hint: string;
    size_mb: string;
    model_downloaded: string;
    model_download_failed: string;
    testing_startup: string;
    loading_model: string;
    test_passed: string;
    test_timeout: string;
    setup_complete: string;
    auto_start_hint: string;
    manual_start: string;
    fallback_version: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Status messages
  // ═══════════════════════════════════════════════════════════════
  status: {
    ok: string;
    info: string;
    warn: string;
    error: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // Common UI elements
  // ═══════════════════════════════════════════════════════════════
  common: {
    prompt_choice: string; // "Choice [1-{max}, default={def}]:"
    yes_no: string; // "[y/N]:"
    yes_default: string; // "[Y/n]:"
    invalid_choice: string;
  };
}
