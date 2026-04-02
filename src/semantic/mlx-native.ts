/**
 * MLX Native Embedding — direct Metal GPU inference via libmlx_embed.dylib
 *
 * Loads the same C++ library used by ultracode.zig for BERT embedding
 * inference on Apple Silicon. No Python, no HTTP — just dlopen + Metal GPU.
 *
 * Requires:
 *   - libmlx_embed.dylib (thin BERT wrapper, ~100KB)
 *   - libmlx.dylib (MLX framework, ~16MB)
 *   - Model directory with model.safetensors + config.json
 *
 * CDN: https://github.com/faxenoff/ultracode/releases/download/v.6.0.2-zig/
 */

import { dlopen, FFIType, ptr } from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logging/index.js";
import { getDataDir } from "../utils/config-paths.js";

export interface MlxNativeConfig {
  modelDir: string; // Path to dir with model.safetensors + config.json
  maxBatch?: number; // Default: 64
  maxSeq?: number; // Default: 512
  hiddenDim?: number; // Default: 384 (auto-detected from model)
}

interface MlxNativeState {
  handle: any;
  lib: any;
  hiddenDim: number;
  loaded: boolean;
}

let state: MlxNativeState | null = null;

/**
 * Find libmlx_embed.dylib in known locations
 */
function findDylib(): string | null {
  const baseDir = dirname(import.meta.url.replace("file://", ""));
  const dataDir = getDataDir();
  const candidates = [
    // Bundled in npm package (external-libs/mlx/)
    join(baseDir, "..", "..", "external-libs", "mlx", "libmlx_embed.dylib"),
    // Downloaded by setup
    join(dataDir, "mlx", "lib", "libmlx_embed.dylib"),
    // From ultracode.zig (dev)
    join(baseDir, "..", "..", "..", "ultracode.zig", "vendor", "mlx", "libmlx_embed.dylib"),
    // System
    "/usr/local/lib/libmlx_embed.dylib",
    "/opt/homebrew/lib/libmlx_embed.dylib",
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Find libmlx.dylib (MLX framework dependency)
 */
function findMlxFramework(): string | null {
  const baseDir = dirname(import.meta.url.replace("file://", ""));
  const dataDir = getDataDir();
  const candidates = [
    // Bundled in npm package
    join(baseDir, "..", "..", "external-libs", "mlx", "libmlx.dylib"),
    // Downloaded by setup
    join(dataDir, "mlx", "lib", "libmlx.dylib"),
    // From ultracode.zig (dev)
    join(baseDir, "..", "..", "..", "ultracode.zig", "vendor", "mlx", "libmlx.dylib"),
    join(baseDir, "..", "..", "..", "ultracode.zig", "dist", "libmlx.dylib"),
    // System
    "/usr/local/lib/libmlx.dylib",
    "/opt/homebrew/lib/libmlx.dylib",
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Check if MLX native runtime is available on this system
 */
export function isAvailable(): boolean {
  if (process.platform !== "darwin" || process.arch !== "arm64") return false;
  return findDylib() !== null && findMlxFramework() !== null;
}

/**
 * Load MLX native runtime and a model
 */
export function loadModel(config: MlxNativeConfig): boolean {
  if (state?.loaded) return true;

  const dylibPath = findDylib();
  const mlxPath = findMlxFramework();
  if (!dylibPath || !mlxPath) {
    log.w("MLX_NATIVE", "dylib not found");
    return false;
  }

  if (!existsSync(join(config.modelDir, "model.safetensors"))) {
    log.w("MLX_NATIVE", "model.safetensors not found", { dir: config.modelDir });
    return false;
  }

  try {
    // Ensure libmlx.dylib is loadable (it's a dependency of libmlx_embed)
    // Set DYLD_LIBRARY_PATH won't work at runtime, but rpath or adjacent works
    const mlxDir = dirname(mlxPath);
    const existingPath = process.env["DYLD_LIBRARY_PATH"];
    if (existingPath) {
      process.env["DYLD_LIBRARY_PATH"] = `${mlxDir}:${existingPath}`;
    } else {
      process.env["DYLD_LIBRARY_PATH"] = mlxDir;
    }

    const lib = dlopen(dylibPath, {
      mlx_embed_load: {
        args: [FFIType.cstring, FFIType.i32, FFIType.i32, FFIType.i32],
        returns: FFIType.ptr,
      },
      mlx_embed_run: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.ptr],
        returns: FFIType.i32,
      },
      mlx_embed_free: {
        args: [FFIType.ptr],
        returns: FFIType.void,
      },
      mlx_embed_version: {
        args: [],
        returns: FFIType.i32,
      },
    });

    const maxBatch = config.maxBatch ?? 64;
    const maxSeq = config.maxSeq ?? 512;
    const hiddenDim = config.hiddenDim ?? 384;

    const modelDirBuf = Buffer.from(config.modelDir + "\0", "utf-8");
    const handle = lib.symbols.mlx_embed_load(modelDirBuf, maxBatch, maxSeq, hiddenDim);

    if (!handle) {
      log.e("MLX_NATIVE", "mlx_embed_load returned null");
      return false;
    }

    const version = lib.symbols.mlx_embed_version();
    log.i("MLX_NATIVE", "loaded", { version, model: config.modelDir, dim: hiddenDim });

    state = { handle, lib, hiddenDim, loaded: true };
    return true;
  } catch (e) {
    log.e("MLX_NATIVE", "load failed", { error: String(e) });
    return false;
  }
}

/**
 * Run embedding inference on tokenized inputs
 *
 * @param inputIds - flat Int32Array [batchSize * seqLen]
 * @param attentionMask - flat Int32Array [batchSize * seqLen]
 * @param batchSize - number of texts
 * @param seqLen - padded sequence length
 * @returns Float32Array [batchSize * hiddenDim] with L2-normalized embeddings
 */
export function embed(
  inputIds: Int32Array,
  attentionMask: Int32Array,
  batchSize: number,
  seqLen: number,
): Float32Array | null {
  if (!state?.loaded) return null;

  const outputSize = batchSize * state.hiddenDim;
  const output = new Float32Array(outputSize);

  const rc = state.lib.symbols.mlx_embed_run(
    state.handle,
    ptr(inputIds),
    ptr(attentionMask),
    null, // token_type_ids (optional for single-segment)
    batchSize,
    seqLen,
    ptr(output),
  );

  if (rc !== 0) {
    log.e("MLX_NATIVE", "inference failed", { rc, batchSize, seqLen });
    return null;
  }

  return output;
}

/**
 * Free model and close library
 */
export function unload(): void {
  if (state?.loaded && state.handle) {
    try {
      state.lib.symbols.mlx_embed_free(state.handle);
    } catch {
      /* best effort */
    }
    state = null;
  }
}

/**
 * Get embedding dimension of loaded model
 */
export function getDimension(): number {
  return state?.hiddenDim ?? 0;
}
