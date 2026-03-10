# Known Issues

## 1. Bun + Native Modules

**Problem:** Segfault at ~600-800 embeddings when using Bun with native N-API modules (OpenVINO, better-sqlite3). Combining two native modules (OpenVINO + SQLite) makes it worse — crashes drop from ~800 to ~450 embeddings. (Originally observed with LibSQL, confirmed persists with better-sqlite3.)

**What We Did:**

- Tested extensively with `openvino-node` under Bun 1.3.4 vs Node.js 22.x on Windows 11.
- Node.js handles 2000+ embeddings without issues (RSS ~340MB stable). Bun crashes at ~800 with RSS at 700MB.
- Identified `setTimeout()` as the specific trigger: using `setTimeout(resolve, 0)` between native module calls causes segfault after ~600-700 iterations. Replacing with `Promise.resolve()`, `queueMicrotask()`, or `setImmediate()` completely eliminates the crash.
- Confirmed memory is NOT the root cause — heap and external memory stay stable before crash.
- Confirmed that delay duration does not matter (0ms, 1ms, 5ms all crash equally).
- Attempted fixes that did NOT help: InferRequest recreation, smaller models, delays between embeddings, increased queue size, explicit Tensor disposal.
- Filed a draft bug report for Bun team with minimal reproduction case.

**Error:**
```
panic(thread 21800): Segmentation fault at address 0xFFFFFFFE
oh no: Bun has crashed. This indicates a bug in Bun, not your code.

# With SQLite native module:
panic(main thread): Segmentation fault at address 0xFFFFFFFFFFFFFFFF
```

**Current Workaround:**
1. Replace all `setTimeout` with `Promise.resolve()` between native calls.
2. Auto-restart embedding provider after 400 embeddings.
3. Use Node.js runtime for MCP server as a reliable alternative.
4. See `issues/` directory for reproduction scripts.

**Waiting For:** Bun team fix for timer queue interaction with N-API native module state.

## 2. Intel NPU

**Problem:** Blocked by `masked_fill`/`Select` LLVM compiler bug — the Intel NPU compiler fails when compiling any BERT-based embedding model. Even `HETERO:NPU,CPU` mode crashes because the NPU compiler attempts to compile the entire model graph before distributing operations.

**Error:**
```
[vpux-compiler] Got Diagnostic at loc("aten::masked_fill/Select"):
Got non broadcastable dimensions pair : '0' and -9223372036854775808'
LLVM ERROR: Failed to infer result type(s).
loc: /Where_1 (Select operation)
```

**What We Did:**

- Tested all major embedding models (all-MiniLM-L6-v2, BGE-small-en-v1.5, GTE-small, multilingual-e5-small) — all fail on NPU due to BERT attention masking.
- Confirmed CPU inference works at 1.34ms (INT8) and GPU.0 at 2.5ms — both stable.
- Investigated model conversion via `optimum-intel` to OpenVINO IR format — does not help because the `Select` operation is fundamentally unsupported by the NPU LLVM backend.
- Evaluated alternative approaches: NV-Embed (bidirectional attention without causal mask), CNN-based code embeddings (SeCNN, ASTNN), simple FastText/Word2Vec models — none production-ready yet.
- NPU works for other model types: CNN classification (ResNet, MobileNet), YOLO object detection, image upscaling — all 3-4x faster than CPU.

**Affected Models:** All BERT-based embedding models (any model using `torch.masked_fill()` for attention masks).

**Current Workaround:** Use CPU INT8 (1.34ms/inference) or Intel iGPU (GPU.0, 2.5ms/inference) instead of NPU. CPU INT8 is actually 3-10x faster than typical embedding solutions (Ollama, TEI).

**Waiting For:** Intel NPU driver/compiler fix for `Select` operation support. No public timeline from Intel. Optimistic estimate: Q2 2026. Realistic: unknown, possibly 2027+.

## 3. GPU / Blackwell (RTX 50xx)

**Problem:** Dawn/WebGPU crashes with segfault on NVIDIA Blackwell GPUs (Compute Capability >= 12.0).

**Affected GPUs:** RTX 5090, 5080, 5070 Ti, 5070, 5060 Ti, 5060, and any GPU with CC >= 12.0.

**Symptoms:**
```
panic(main thread): Segmentation fault at address 0x...
...win32-x64.dawn.node...
```

**Environment Variables:**

| Variable | Values | Description |
|----------|--------|-------------|
| `WEBGPU_FORCE_DISABLE` | `1` | Disable WebGPU detection entirely |
| `WEBGPU_FORCE_ENABLE` | `1` | Force WebGPU even on unsafe architectures (may crash!) |
| `CUDA_FORCE_DISABLE` | `1` | Disable CUDA native addon |

**Architecture Reference:**

| Architecture | CC | GPUs | WebGPU Status |
|--------------|-----|------|---------------|
| Ampere | 8.x | RTX 30xx | Supported |
| Ada Lovelace | 8.9 | RTX 40xx | Supported |
| Blackwell | 12.x | RTX 50xx | Auto-disabled |

**Current Workaround:** WebGPU is auto-disabled for CC >= 12.0 in `GPUDetector` (`src/gpu/detection/gpu-detector.ts`). The system falls back to CUDA native backend or WASM SIMD. No user action required — detection is automatic.

**Waiting For:** Updated `webgpu` npm package with Dawn build that includes Blackwell support. When available, update the package and change `WEBGPU_UNSAFE_MIN_CC` constant to 13.0.

## 4. OVMS Build Issues (Windows)

**Problem:** The OVMS (OpenVINO Model Server) native binary requires the Visual Studio 2019 toolset (v142) to build on Windows. Users with only VS2022 or VS2026 will get build failures.

**Error:** Compilation fails with toolset mismatch errors when only modern VS versions are installed.

**Current Workaround:**
1. Install VS2019 Build Tools alongside your existing VS installation: https://visualstudio.microsoft.com/vs/older-downloads/
2. Alternatively, use OVMS via Docker instead of native build — avoids Windows build toolchain entirely.
3. Run `scripts\setup-ovms-nvidia.cmd` which checks for proper VS version before building.

**Waiting For:** OVMS upstream to support VS2022+ toolsets natively.

---

*Last updated: February 2026*
