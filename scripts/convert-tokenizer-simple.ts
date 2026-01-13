#!/usr/bin/env -S bun run
/**
 * Simple Tokenizer Converter for TEI
 *
 * Downloads model files from HuggingFace and ensures tokenizer.json exists.
 * Works with Bun, Node.js, and Deno - pure HTTP fetch, no ML libraries.
 *
 * Usage:
 *   bun scripts/convert-tokenizer-simple.ts <model-id> [output-dir]
 *   node scripts/convert-tokenizer-simple.ts <model-id> [output-dir]
 *
 * Example:
 *   bun scripts/convert-tokenizer-simple.ts ibm-granite/granite-embedding-30m-english
 */

import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Configuration
// =============================================================================

const HUGGINGFACE_BASE = "https://huggingface.co";

// Required files for TEI
const REQUIRED_FILES = [
  "config.json",
  "tokenizer.json", // CRITICAL - TEI requires this!
  "tokenizer_config.json",
  "vocab.txt",
  "vocab.json",
  "merges.txt",
  "special_tokens_map.json",
  "pytorch_model.bin",
  "model.safetensors",
];

// =============================================================================
// Helper Functions
// =============================================================================

function log(message: string, level: "info" | "success" | "warn" | "error" = "info") {
  const prefix = {
    info: "[INFO]",
    success: "[SUCCESS]",
    warn: "[WARN]",
    error: "[ERROR]",
  }[level];

  console.log(`${prefix} ${message}`);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Download file from HuggingFace Hub
 */
async function downloadFile(
  modelId: string,
  filename: string,
  outputPath: string,
): Promise<boolean> {
  const url = `${HUGGINGFACE_BASE}/${modelId}/resolve/main/${filename}`;

  try {
    log(`Downloading ${filename}...`);

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        log(`File not found: ${filename} (skipping)`, "warn");
        return false;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(content));

    const sizeMB = (content.byteLength / 1024 / 1024).toFixed(2);
    log(`✅ Downloaded ${filename} (${sizeMB} MB)`, "success");

    return true;
  } catch (error: any) {
    log(`Failed to download ${filename}: ${error.message}`, "warn");
    return false;
  }
}

/**
 * Generate tokenizer.json from tokenizer_config.json (fallback)
 */
async function generateTokenizerJson(configPath: string, outputPath: string): Promise<boolean> {
  log("Generating tokenizer.json from config...");

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    // Create basic fast tokenizer structure
    const tokenizerJson = {
      version: "1.0",
      truncation: config.truncation || null,
      padding: config.padding || null,
      added_tokens: config.added_tokens || [],
      normalizer: config.normalizer || null,
      pre_tokenizer: config.pre_tokenizer || {
        type: "WhitespaceSplit",
      },
      post_processor: config.post_processor || null,
      decoder: config.decoder || null,
      model: {
        type: config.model_type || "WordPiece",
        unk_token: config.unk_token || "[UNK]",
        continuing_subword_prefix: config.continuing_subword_prefix || "##",
        max_input_chars_per_word: config.max_input_chars_per_word || 100,
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(tokenizerJson, null, 2));

    log("✅ Generated tokenizer.json", "success");
    return true;
  } catch (error: any) {
    log(`Failed to generate tokenizer.json: ${error.message}`, "error");
    return false;
  }
}

/**
 * Verify tokenizer.json is valid
 */
function verifyTokenizerJson(tokenizerPath: string): boolean {
  log("Verifying tokenizer.json...");

  if (!fs.existsSync(tokenizerPath)) {
    log("tokenizer.json not found!", "error");
    return false;
  }

  try {
    const tokenizer = JSON.parse(fs.readFileSync(tokenizerPath, "utf-8"));

    // Check required fields
    if (!tokenizer.version || !tokenizer.model) {
      log("tokenizer.json missing required fields (version, model)", "error");
      return false;
    }

    log("✅ tokenizer.json is valid", "success");
    return true;
  } catch (error: any) {
    log(`Invalid JSON in tokenizer.json: ${error.message}`, "error");
    return false;
  }
}

// =============================================================================
// Main Conversion Logic
// =============================================================================

async function convertModel(modelId: string, outputDir: string): Promise<boolean> {
  console.log();
  console.log("=".repeat(60));
  console.log("Tokenizer Converter for TEI");
  console.log("=".repeat(60));
  console.log();
  log(`Model: ${modelId}`);
  log(`Output: ${outputDir}`);
  console.log();

  // Ensure output directory exists
  ensureDir(outputDir);

  // Step 1: Download all files
  log("Step 1: Downloading model files...");
  console.log();

  let downloadedCount = 0;
  let tokenizerJsonDownloaded = false;

  for (const filename of REQUIRED_FILES) {
    const outputPath = path.join(outputDir, filename);
    const downloaded = await downloadFile(modelId, filename, outputPath);

    if (downloaded) {
      downloadedCount++;

      if (filename === "tokenizer.json") {
        tokenizerJsonDownloaded = true;
      }
    }
  }

  console.log();
  log(`Downloaded ${downloadedCount}/${REQUIRED_FILES.length} files`);

  // Step 2: Handle missing tokenizer.json
  if (!tokenizerJsonDownloaded) {
    console.log();
    log("tokenizer.json not found in model repository", "warn");
    log("Attempting to generate from tokenizer_config.json...");

    const configPath = path.join(outputDir, "tokenizer_config.json");
    const tokenizerPath = path.join(outputDir, "tokenizer.json");

    if (fs.existsSync(configPath)) {
      const generated = await generateTokenizerJson(configPath, tokenizerPath);

      if (!generated) {
        log("Failed to generate tokenizer.json", "error");
        log("This model may not support fast tokenizers", "error");
        return false;
      }
    } else {
      log("tokenizer_config.json also not found!", "error");
      log("Cannot generate tokenizer.json", "error");
      return false;
    }
  }

  // Step 3: Verify tokenizer.json
  console.log();
  log("Step 2: Verifying tokenizer.json...");

  const tokenizerPath = path.join(outputDir, "tokenizer.json");
  const valid = verifyTokenizerJson(tokenizerPath);

  if (!valid) {
    log("Verification failed!", "error");
    return false;
  }

  // Step 4: Success summary
  console.log();
  console.log("=".repeat(60));
  log("✅ Conversion successful!", "success");
  console.log("=".repeat(60));
  console.log();

  log("Files in output directory:");
  const files = fs.readdirSync(outputDir);
  files.forEach((file) => {
    const filePath = path.join(outputDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  - ${file} (${sizeMB} MB)`);
  });

  console.log();
  console.log("=".repeat(60));
  console.log("🚀 Usage with TEI:");
  console.log("=".repeat(60));
  console.log();

  const absPath = path.resolve(outputDir);

  console.log("docker run -d \\");
  console.log("  --name tei-server \\");
  console.log("  -p 8080:80 \\");
  console.log(`  -v "${absPath}:/model" \\`);
  console.log("  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \\");
  console.log("  --model-id /model");
  console.log();
  console.log("# Test:");
  console.log("curl http://localhost:8080/health");
  console.log();

  return true;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun scripts/convert-tokenizer-simple.ts <model-id> [output-dir]");
    console.log();
    console.log("Examples:");
    console.log(
      "  bun scripts/convert-tokenizer-simple.ts ibm-granite/granite-embedding-30m-english",
    );
    console.log("  bun scripts/convert-tokenizer-simple.ts BAAI/bge-small-en-v1.5 ./my-model");
    console.log();
    console.log("Downloads model from HuggingFace and ensures tokenizer.json exists.");
    process.exit(1);
  }

  const modelId = args[0];
  const outputDir = args[1] || "./converted-model";

  const success = await convertModel(modelId, outputDir);

  if (!success) {
    console.log();
    console.log("=".repeat(60));
    log("Conversion failed!", "error");
    console.log("=".repeat(60));
    console.log();
    log("This model may not support fast tokenizers required by TEI.", "warn");
    console.log();
    log("Try using a model with native fast tokenizer support:");
    console.log("  - BAAI/bge-small-en-v1.5 (384-dim, fast, recommended)");
    console.log("  - sentence-transformers/all-MiniLM-L6-v2 (384-dim)");
    console.log("  - BAAI/bge-base-en-v1.5 (768-dim, better quality)");
    console.log();
    process.exit(1);
  }

  process.exit(0);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Export for use as module
export { convertModel };
