---
module_name: cpu
description: "CPU capability detection for OpenVINO optimization tier classification with cross-platform flag probing and model-name inference"
status: active
language: typescript
entry_point: cpu-detector.ts
exports: [CPUInfo, CPUDetector]
dependencies: [child_process, os, logging]
tags: [hardware, cpu-detection, openvino, avx, simd, performance-tier]
---

# CPU

> Cross-platform CPU capability detection system that probes instruction-set flags (AVX2, AVX-512, VNNI, AMX) and classifies processors into OpenVINO performance tiers.

## Overview

The cpu module exposes a singleton `CPUDetector` class that detects the host processor's vendor, core/thread counts, and SIMD instruction-set support. On Linux it reads `/proc/cpuinfo`, on macOS it queries `sysctl`, and on Windows (or as a universal fallback) it infers capabilities from the `os.cpus()` model string using a comprehensive heuristic covering Intel Core, Core Ultra, Xeon, and AMD Ryzen/EPYC families. Detection results are cached after the first call. Based on detected flags the module assigns an OpenVINO performance tier (`unsupported` through `optimal`) with a human-readable recommendation. Two convenience methods check whether OpenVINO is advisable and produce a one-line summary for logging.

## Data Flow

### Inputs

| Source | Data | Type |
|--------|------|------|
| `os.cpus()` | CPU model string, logical thread count | Node.js API |
| `/proc/cpuinfo` (Linux) | Raw CPU flags line | File / execSync |
| `sysctl` (macOS) | CPU feature keys | execSync |
| `wmic` (Windows) | Physical core count | execSync |

### Processing

1. Read model string from `os.cpus()[0].model` and detect vendor (intel / amd / arm / unknown).
2. Count physical cores via platform-specific shell commands; fall back to `threads / 2`.
3. Obtain CPU flags: on Linux parse `/proc/cpuinfo`, on macOS parse `sysctl`, on Windows infer from model name.
4. Map flags to booleans: `avx2`, `avx512`, `vnni`, `amx`.
5. Calculate OpenVINO tier from the flag hierarchy (AMX > VNNI > AVX-512 > AVX2 > unsupported).
6. Cache and return the `CPUInfo` object.

### Outputs

| Target | Data | Type |
|--------|------|------|
| Callers | `CPUInfo` object with vendor, cores, threads, flags, tier | Structured data |
| Callers | Boolean recommendation via `isOpenVINORecommended()` | Primitive |
| Callers | One-line summary string via `getSummary()` | String |

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CPUInfo` | interface | Full CPU descriptor: vendor, model, cores, threads, SIMD flags, OpenVINO tier and recommendation | [`cpu-detector.ts:17-32`](./cpu-detector.ts) |
| `CPUDetector` | class | Static singleton that detects and caches CPU capabilities | [`cpu-detector.ts:34-341`](./cpu-detector.ts) |
| `CPUDetector.detect()` | static method | Probe CPU and return cached `CPUInfo` | [`cpu-detector.ts:40-73`](./cpu-detector.ts) |
| `CPUDetector.isOpenVINORecommended()` | static method | Return `true` when tier is `good`, `excellent`, or `optimal` | [`cpu-detector.ts:323-326`](./cpu-detector.ts) |
| `CPUDetector.getSummary()` | static method | Return compact `"Model \| C/T \| flags \| tier"` string for logs | [`cpu-detector.ts:331-340`](./cpu-detector.ts) |

## Dependencies

### Internal Modules

| Module | Purpose | Interaction |
|--------|---------|-------------|
| `logging` | Structured debug logging | `log.d("CPUDETECT", ...)` on flag-detection failure |

### External Packages

| Package | Purpose |
|---------|---------|
| `child_process` (Node.js) | `execSync` for `/proc/cpuinfo`, `sysctl`, `wmic` queries |
| `os` (Node.js) | `os.cpus()` for model/thread info, `os.platform()` for OS detection |

No third-party NPM dependencies.

## Configuration

The module has no external configuration. All behavior is determined by the host OS and CPU at runtime. Shell commands use a hard-coded 2 000 ms timeout.

## Behavioral Properties

| Property | Value |
|----------|-------|
| Async | Fully synchronous; all shell calls use `execSync` |
| Thread Safety | Singleton cache; safe in single-threaded Node.js, not designed for `worker_threads` |
| Idempotency | `detect()` is idempotent -- returns the same cached `CPUInfo` after the first call |
| Side Effects | Spawns child processes on first call (one per platform probe); none afterward |
| State | Module-level static `cachedInfo` field on `CPUDetector`; populated once, never cleared |

## Error Handling

All `execSync` calls are wrapped in try-catch. On failure the module falls back to inferring flags from the model name string, which is always available via `os.cpus()`. A debug log is emitted on flag-detection failure but no error propagates to callers.

| Error | When | Recovery |
|-------|------|----------|
| `execSync` throws | Shell command fails or times out (2 s) | Falls back to `inferFlagsFromModel()` heuristic |
| `wmic` unavailable | Windows without WMI | Falls back to `os.cpus().length / 2` for cores |
| Unknown model string | Unrecognized CPU model name | Returns empty flags array; tier = `unsupported` |

## Observability

`log.d("CPUDETECT", "flags_fail", ...)` is emitted at DEBUG level when platform-specific flag detection fails. `getSummary()` returns a one-line string suitable for startup banners: `"Intel Core Ultra 9 275HX | 24C/32T | AVX2, VNNI | OpenVINO: excellent"`. No metrics or counters are exposed; callers can log the returned `CPUInfo` as needed.

## Known Limitations

- Windows detection relies entirely on model-name heuristics; no direct CPUID or registry probe is performed
- `inferFlagsFromModel` uses regex patterns that may not cover future Intel/AMD product naming changes
- No detection for non-x86 SIMD (e.g., ARM NEON, SVE); ARM CPUs are classified as `unsupported` for OpenVINO
- Core Ultra 100 series (Meteor Lake) AVX-512 status is approximate; actual silicon varies by SKU
- Alder Lake (12th Gen) AVX-512 is marked absent even though some BIOS revisions enable it on P-cores
- No cache invalidation mechanism; if used in long-running processes across hardware changes (VM migration), stale data is returned

## TypeScript Notes

### Module Boundary

The module has no `index.ts` barrel file. Consumers import directly from `cpu-detector.ts`. Two symbols are exported: the `CPUInfo` interface (used as a type import in `setup-hardware.ts`, `setup-installers.ts`, `setup-selection.ts`, `setup-llm.ts`) and the `CPUDetector` class (used as a value import in `setup-command.ts`). All detection helpers (`getCPUFlags`, `inferFlagsFromModel`, `detectVendor`, `countPhysicalCores`, `calculateOpenVINOTier`) are `private static` and not accessible externally. The `openvinoTier` field uses a string literal union type rather than an enum.

## Files

| File | Description |
|------|-------------|
| [`cpu-detector.ts`](./cpu-detector.ts) | CPU detection class with vendor/flag probing, model-name inference, and OpenVINO tier calculation (342 lines) |
