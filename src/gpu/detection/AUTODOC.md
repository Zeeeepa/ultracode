---
module_name: detection
description: "GPU detection system for CUDA and WebGPU capability discovery with Blackwell safety checks"
status: active
language: typescript
---

# Detection

> Automatic GPU detection system that discovers CUDA (NVIDIA) and WebGPU capabilities, caches results, and includes safety checks for unstable architectures like Blackwell.

## Overview

The detection module provides the `GPUDetector` class for automatically detecting available GPU capabilities at runtime. It checks for CUDA via nvidia-smi or a native addon, detects WebGPU via the `webgpu` npm package or browser API, identifies the GPU vendor (NVIDIA, AMD, Intel), and caches results for performance. A key safety feature is automatic WebGPU disabling on NVIDIA Blackwell architecture (CC >= 12.0) which causes Dawn/WebGPU crashes, with environment variable overrides for testing.

## Data Flow

- **Inputs:** System GPU hardware (nvidia-smi output, native addon device info, WebGPU adapter query).
- **Processing:** Sequential CUDA detection followed by conditional WebGPU detection with safety checks.
- **Outputs:** `GPUInfo` object with vendor, model, compute capability, memory, and backend availability flags.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `GPUDetector` | class | Static GPU detection with caching and safety checks | [`gpu-detector.ts:83-396`](./gpu-detector.ts) |
| `GPUInfo` | interface | Detected GPU information (vendor, model, CC, memory, availability) | [`gpu-detector.ts:72-81`](./gpu-detector.ts) |
| `WEBGPU_UNSAFE_MIN_CC` | const | Minimum compute capability that causes WebGPU crashes (12.0) | [`gpu-detector.ts:31-31`](./gpu-detector.ts) |
| `WEBGPU_UNSTABLE_ARCHITECTURES` | const | Known unstable GPU architecture name patterns | [`gpu-detector.ts:36-36`](./gpu-detector.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging` | Detection result and warning logging |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:child_process` | nvidia-smi execution |
| `webgpu` | WebGPU/Dawn bindings for Node.js (optional) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Detection caching | Results cached in static field, `clearCache()` to reset |
| nvidia-smi timeout | 2000ms |
| Environment overrides | `WEBGPU_FORCE_ENABLE=1`, `WEBGPU_FORCE_DISABLE=1` |

## Error Handling

All detection methods catch exceptions and return `null` for unavailable capabilities. WebGPU detection is entirely skipped (not attempted) for unsafe architectures to prevent process crashes. Missing nvidia-smi is treated as "no CUDA" without errors.

## Known Limitations

- CUDA detection only works with NVIDIA GPUs via nvidia-smi or the native addon.
- WebGPU adapter memory estimation relies on `maxBufferSize` which may not reflect actual VRAM.
- AMD and Intel GPU detection depends on WebGPU availability and provides limited detail.

## Files

| File | Description |
|------|-------------|
| `gpu-detector.ts` | `GPUDetector` class with CUDA, WebGPU detection and Blackwell safety checks |
