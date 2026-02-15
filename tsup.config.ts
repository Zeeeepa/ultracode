import { defineConfig } from "tsup";

// Build mode: "dev" (default) or "package" (for npm publishing)
// dev: sourcemaps, no minification
// package: minification, no sourcemaps
const BUILD_MODE = process.env.BUILD_MODE || "dev";
const isPackageMode = BUILD_MODE === "package";

// Common external dependencies (for reference, actual externals are in noExternal: false)
const _EXTERNAL_DEPS = ["@modelcontextprotocol/sdk", "@lenml/tokenizers"];

// Common esbuild options (kept for potential future use)
const _commonEsbuildOptions = (options: any) => {
  options.logOverride = {
    ...options.logOverride,
    "direct-eval": "silent",
    "import-is-undefined": "silent",
  };
  options.loader = {
    ...options.loader,
    ".wasm": "file",
  };
};

export default defineConfig([
  // Main MCP server
  {
    entry: {
      index: "src/index.ts",
      "pipe-preload": "src/pipe-preload.ts", // Quiet mode entry point for --pipe
      "bun-proxy": "src/bun-proxy.ts", // Lightweight proxy for Claude's Bun
    },
    outDir: "dist",
    sourcemap: !isPackageMode, // Sourcemaps only in dev mode
    clean: false, // Don't clean - preserve WASM and native modules
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,

    // Optimizations - enable splitting for dynamic imports
    splitting: true,
    minify: isPackageMode, // Minify only for npm package
    treeshake: true,

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent", // Suppress eval warnings from third-party dependencies (onnxruntime-web)
        "import-is-undefined": "silent", // Suppress wasm-bindgen __wbindgen_start warnings
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
      // Name chunks by content for better caching and debugging
      // Lazy-loaded handlers will be split into separate chunks
      options.chunkNames = "chunks/[name]-[hash]";
    },

    // Bundle size optimizations
    external: [
      // Keep heavy dependencies external to reduce memory footprint
      "@modelcontextprotocol/sdk",

      // Bun runtime modules (not available in Node.js)
      "bun:sqlite",

      // Native modules with dynamic requires - must not be bundled
      "faiss-napi", // FAISS vector search - native NAPI bindings
      "@lenml/tokenizers", // Lightweight tokenizer for OVMS provider
    ],

    // Type generation
    dts: {
      resolve: true,
    },

    // Ensure executable permissions for CLI and copy binaries
    onSuccess: async () => {
      const { chmod, copyFile, access, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");

      if (process.platform !== "win32") {
        await chmod("./dist/index.js", 0o755);
      }

      // Copy Cosmopolitan binary if it exists (built separately)
      const commSource = join("src", "comm", "ultrascript-tools.com");
      const commDest = join("dist", "ultrascript-tools.com");
      const cmdDest = join("dist", "ultrascript-tools.cmd");
      try {
        await access(commSource);
        await copyFile(commSource, commDest);
        if (process.platform !== "win32") {
          await chmod(commDest, 0o755);
        }
        console.log("[tsup] Copied ultrascript-tools.com to dist/");

        // Generate .cmd wrapper for Windows (Claude Code doesn't recognize .com)
        const { writeFile } = await import("node:fs/promises");
        await writeFile(cmdDest, '@echo off\r\n"%~dp0ultrascript-tools.com" %*\r\n');
        console.log("[tsup] Generated ultrascript-tools.cmd wrapper");
      } catch {
        // Binary not built yet - that's fine, it's optional
      }

      // Copy gRPC proto files for OVMS provider
      const protoDir = join("dist", "semantic", "providers", "proto");
      const protoSource = join("src", "semantic", "providers", "proto", "grpc_predict_v2.proto");
      const protoDest = join(protoDir, "grpc_predict_v2.proto");
      try {
        await mkdir(protoDir, { recursive: true });
        await copyFile(protoSource, protoDest);
        console.log("[tsup] Copied gRPC proto files to dist/");
      } catch (e: any) {
        console.warn("[tsup] Proto copy warning:", e.message);
      }

      // Copy Roslyn addon if available (built separately by ultrasharp-tools-mcp)
      const { cpSync, existsSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const addonSources = [
        resolve("..", "ultrasharp-tools-mcp", "Run.Publish", "Addon"),
        resolve("external-libs", "roslyn-addon"),
      ];
      const addonDst = join("dist", "roslyn-addon");
      for (const addonSrc of addonSources) {
        if (existsSync(addonSrc)) {
          try {
            await mkdir(addonDst, { recursive: true });
            cpSync(addonSrc, addonDst, { recursive: true });
            console.log(`[tsup] Copied Roslyn addon from ${addonSrc} to dist/roslyn-addon/`);
          } catch (e: any) {
            console.warn("[tsup] Roslyn addon copy warning:", e.message);
          }
          break;
        }
      }
    },
  },

  // Worker threads - separate builds for isolated execution
  // Generic language worker replaces individual language workers
  {
    entry: {
      "agents/workers/generic-language-worker": "src/agents/workers/generic-language-worker.ts",
    },
    outDir: "dist",
    sourcemap: !isPackageMode,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false,
    minify: isPackageMode,
    treeshake: true,
    silent: true, // Suppress tsup output including warnings

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
        "import-is-undefined": "silent", // Suppress wasm-bindgen warnings
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
      // Suppress tree-shaking warnings about unused external imports (from TypeScript compiler)
      options.logLevel = "error";
      options.drop = ["console"]; // Remove console.* in worker for cleaner output
    },

    // Mark fs as external to avoid "unused import" warnings from tree-shaking
    // Some dependencies import from "fs", others from "node:fs" - need both
    // TypeScript compiler must be external - uses dynamic require("fs") internally
    external: [
      "fs",
      "node:fs",
      "typescript", // Must be external - uses require("fs") internally which fails in ESM bundle
      "@modelcontextprotocol/sdk",
      "@lenml/tokenizers",
    ],

    // No DTS for workers
    dts: false,
  },

  // GPU worker - Unified Node.js subprocess for Faiss + CUDA operations
  // Runs under Node.js (not Bun) for native module compatibility
  {
    entry: {
      "semantic/gpu/gpu-worker": "src/semantic/gpu/gpu-worker.ts",
    },
    outDir: "dist",
    sourcemap: !isPackageMode,
    format: ["esm"],
    platform: "node",
    target: "node22", // Node.js target (native module compatibility)
    shims: false,
    splitting: false, // Single file for subprocess
    minify: isPackageMode,
    treeshake: true,
    silent: true,

    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
        "import-is-undefined": "silent",
      };
    },

    external: [
      "faiss-napi", // Must be external - native module
      // CUDA addon is loaded via require() at runtime, not bundled
    ],

    dts: false,
  },

  // CLI ulog command - log query utility
  {
    entry: {
      "cli/log-query/log-query-cli": "src/cli/log-query/log-query-cli.ts",
    },
    outDir: "dist",
    sourcemap: !isPackageMode,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false,
    minify: isPackageMode,
    treeshake: true,
    silent: true,

    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
        "import-is-undefined": "silent",
      };
    },

    external: ["@modelcontextprotocol/sdk"],

    dts: false,
  },

  // CLI setup command - used by setup-embeddings scripts
  {
    entry: {
      "cli/setup-command": "src/cli/setup-command.ts",
    },
    outDir: "dist",
    sourcemap: !isPackageMode,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false, // Single file for CLI
    minify: isPackageMode,
    treeshake: true,
    silent: true,

    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
        "import-is-undefined": "silent",
      };
    },

    external: ["@modelcontextprotocol/sdk", "@lenml/tokenizers"],

    dts: false,
  },

  // SIMD utilities - separate build for benchmarking
  {
    entry: {
      "utils/simd-vector-ops": "src/utils/simd-vector-ops.ts",
    },
    outDir: "dist",
    sourcemap: !isPackageMode,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false,
    minify: isPackageMode,
    treeshake: true,

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
        "import-is-undefined": "silent", // Suppress wasm-bindgen warnings
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
    },

    dts: false,
  },

  // NOTE: Commer (lightweight proxy) is now built as Cosmopolitan C binary
  // See src/comm/ for the portable ultrascript-tools.com binary
  // Build with: npm run build:comm

  // NOTE: Old src/core/index.ts IPC server is deprecated
  // We now use pipe transport in main src/index.ts (MCP JSON-RPC over Named Pipe)
]);
