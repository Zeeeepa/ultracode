import { defineConfig } from "tsup";

// Build mode: "dev" (default) or "package" (for npm publishing)
// dev: sourcemaps, no minification
// package: minification, no sourcemaps
const BUILD_MODE = process.env.BUILD_MODE || "dev";
const isPackageMode = BUILD_MODE === "package";

// Common external dependencies (for reference, actual externals are in noExternal: false)
const _EXTERNAL_DEPS = [
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
];

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
    },
    outDir: "dist",
    sourcemap: !isPackageMode, // Sourcemaps only in dev mode
    clean: false, // Don't clean - preserve WASM and native modules
    format: ["esm"],
    platform: "node",
    target: "node24",
    shims: false,

    // Optimizations
    splitting: false,
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
    },

    // Bundle size optimizations
    external: [
      // Keep heavy dependencies external to reduce memory footprint
      "@modelcontextprotocol/sdk",

      // Tree-sitter dependencies must remain external (native modules)
      "tree-sitter",
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

    // Ensure executable permissions for CLI and copy binaries
    onSuccess: async () => {
      const { chmod, copyFile, access } = await import("node:fs/promises");
      const { join } = await import("node:path");

      if (process.platform !== "win32") {
        await chmod("./dist/index.js", 0o755);
      }

      // Copy Cosmopolitan binary if it exists (built separately)
      const commSource = join("src", "comm", "ultrascript-tools.com");
      const commDest = join("dist", "ultrascript-tools.com");
      try {
        await access(commSource);
        await copyFile(commSource, commDest);
        if (process.platform !== "win32") {
          await chmod(commDest, 0o755);
        }
        console.log("[tsup] Copied ultrascript-tools.com to dist/");
      } catch {
        // Binary not built yet - that's fine, it's optional
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

    // External dependencies - same as main
    external: [
      "@modelcontextprotocol/sdk",
      "tree-sitter",
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
