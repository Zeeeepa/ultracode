import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry point
  {
    entry: {
      index: "src/index.ts",
    },
    sourcemap: true,
    clean: false, // Don't clean - preserve WASM and native modules
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,

    // Optimizations for commodity hardware
    splitting: false, // Reduce memory usage during build
    minify: process.env.NODE_ENV === "production",
    treeshake: true,

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent", // Suppress eval warnings from third-party dependencies (onnxruntime-web)
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
    },

    // Bundle size optimizations
    external: [
      // Keep heavy dependencies external to reduce memory footprint
      "@modelcontextprotocol/sdk",

      // Tree-sitter dependencies must remain external (contain WASM files)
      "web-tree-sitter",
      "tree-sitter-javascript",
      "tree-sitter-typescript",
      "tree-sitter-python",
      "tree-sitter-c",
      "tree-sitter-cpp",
      "tree-sitter-c-sharp",
      "tree-sitter-rust",
      "tree-sitter-go",
      "tree-sitter-java",
      "tree-sitter-bash",
      "tree-sitter-powershell",

      // Native modules with dynamic requires
      "sharp", // Image processing (optional - used by @xenova/transformers)
      "onnxruntime-node", // ONNX runtime native bindings (optional)
      "better-sqlite3", // SQLite native bindings
      "@xenova/transformers", // Optional ML embeddings (requires sharp/onnxruntime)
    ],

    // Type generation
    dts: {
      resolve: true,
    },

    // Ensure executable permissions for CLI
    onSuccess: async () => {
      if (process.platform !== "win32") {
        const { chmod } = await import("node:fs/promises");
        await chmod("./dist/index.js", 0o755);
      }
      // Note: eval warning from onnxruntime-web is expected and safe
      // It's used for dynamic require() in Node.js - not a security issue
    },
  },

  // Worker threads - separate builds for isolated execution
  // Generic language worker replaces individual language workers
  {
    entry: {
      "agents/workers/generic-language-worker": "src/agents/workers/generic-language-worker.ts",
    },
    outDir: "dist",
    sourcemap: true,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false,
    minify: false, // Keep readable for debugging
    treeshake: true,

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
    },

    // External dependencies - same as main
    external: [
      "@modelcontextprotocol/sdk",
      "web-tree-sitter",
      "tree-sitter-javascript",
      "tree-sitter-typescript",
      "tree-sitter-python",
      "tree-sitter-c",
      "tree-sitter-cpp",
      "tree-sitter-c-sharp",
      "tree-sitter-rust",
      "tree-sitter-go",
      "tree-sitter-java",
      "tree-sitter-bash",
      "tree-sitter-powershell",
      "sharp",
      "onnxruntime-node",
      "better-sqlite3",
      "@xenova/transformers",
    ],

    // No DTS for workers
    dts: false,
  },

  // SIMD utilities - separate build for benchmarking
  {
    entry: {
      "utils/simd-vector-ops": "src/utils/simd-vector-ops.ts",
    },
    outDir: "dist",
    sourcemap: true,
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,
    splitting: false,
    minify: false,
    treeshake: false, // Keep all exports for benchmarking

    // Suppress warnings and configure loaders
    esbuildOptions(options) {
      options.logOverride = {
        ...options.logOverride,
        "direct-eval": "silent",
      };
      // Add loader for WASM files
      options.loader = {
        ...options.loader,
        ".wasm": "file",
      };
    },

    dts: false,
  },
]);
