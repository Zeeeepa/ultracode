---
module_name: installers
description: "Provider-specific installers for embedding model servers (Ollama, OVMS, TEI, vLLM, llama.cpp)"
status: active
language: typescript
---

# Installers

> Collection of provider-specific installer modules that handle downloading, configuring, and launching embedding model servers via Docker containers or native binaries.

## Overview

The installers module contains dedicated installer implementations for each supported embedding provider. Each installer handles the full lifecycle: checking prerequisites (Docker, GPU drivers), downloading models or container images, configuring the server, starting the service, and performing health checks. Installers support both Docker-based deployments (TEI, vLLM, OVMS) and native binary installations (llama.cpp, Ollama).

## Data Flow

- **Inputs:** Selected provider name, embedding model configuration, GPU info, CPU features.
- **Processing:** Prerequisite checks, image pulling or binary download, model preparation, container/process startup, health endpoint polling.
- **Outputs:** `InstallResult` with success status, detected dimensions, multi-device endpoints.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `installOllama` | function | Checks Ollama installation and starts embedding service | [`ollama-installer.ts:11-11`](./ollama-installer.ts) |
| `installOVMSNative` | function | Installs OpenVINO Model Server with multi-device support | [`ovms-installer.ts:16-16`](./ovms-installer.ts) |
| `installTEI` | function | Deploys Text Embeddings Inference via Docker | [`tei-installer.ts:18-20`](./tei-installer.ts) |
| `installVLLM` | function | Creates vLLM container with OpenAI-compatible API | [`vllm-installer.ts:15-198`](./vllm-installer.ts) |
| `installLlamaCpp` | function | Downloads llama-server binary and GGUF models | [`llamacpp-installer.ts:411-411`](./llamacpp-installer.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `setup/utils` | Docker checks, NVIDIA toolkit, sleep, multi-device config |
| `setup/i18n` | Localized installation messages |
| `setup/setup-ui` | Colored status output and user prompts |
| `setup/setup-types` | `EmbeddingModel`, `GPUInfo`, `InstallResult` types |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:child_process` | Docker commands, binary execution |
| `node:fs` | File download, model storage, config writing |
| `node:https` | Binary and model downloads |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Supported providers | Ollama, OVMS (native), TEI (Docker), vLLM (Docker), llama.cpp (native) |
| Health check timeout | Provider-specific, typically 60-120 seconds |
| Container naming | `tei-server`, `vllm-server`, etc. |

## Error Handling

Each installer catches and reports errors at each stage (download, extraction, startup, health check). Failures are accumulated into `InstallResult.success = false` but do not throw, allowing the setup wizard to save partial configuration.

## Known Limitations

- TEI and vLLM require Docker; no native alternatives.
- llama.cpp installer downloads platform-specific binaries and may not cover all architectures.
- OVMS native installer requires manual OpenVINO installation on some platforms.

## Exports

- `installOllama`
- `installOVMSNative`
- `installTEI`
- `installVLLM`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all installer functions |
| `llamacpp-installer.ts` | llama.cpp binary download with GPU backend auto-detection |
| `ollama-installer.ts` | Ollama service check and embedding model download |
| `ovms-installer.ts` | OpenVINO Model Server native installation with NPU/GPU support |
| `tei-installer.ts` | Text Embeddings Inference Docker container deployment |
| `vllm-installer.ts` | vLLM Docker container deployment for NVIDIA GPUs |
