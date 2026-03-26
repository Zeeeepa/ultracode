# webgpu-npm

## Overview

The `webgpu-npm` module provides internal integration with the WebGPU API in Node.js and Bun environments by wrapping the `webgpu` npm package. It enables GPU-accelerated graphics operations through a simplified initialization pattern without exposing public APIs. This module serves as a runtime compatibility layer, handling adapter and device creation workflows to verify WebGPU functionality in target environments.

## Flow

```
Runtime Detection
      ↓
Module Load (webgpu)
      ↓
GPU Instance Creation
      ↓
Adapter Request
      ↓
Device Request
      ↓
WebGPU Ready
```

## Entity Listing

### Test & Validation

- **test.js** — Entry point for validating WebGPU module compatibility across Node.js and Bun runtimes; performs sequential initialization of GPU instance, adapter, and device to verify the webgpu package functions correctly in the target environment.

## Dependencies

- **webgpu** — External npm package providing the WebGPU API surface and GPU instance creation methods (`create()`, adapter/device request lifecycle).