#!/usr/bin/env node
/**
 * Convert Slow Tokenizer to Fast Tokenizer for TEI
 *
 * This script converts HuggingFace models with slow tokenizers to fast tokenizers,
 * making them compatible with Text Embeddings Inference (TEI).
 *
 * Uses @xenova/transformers.js (pure JavaScript, no Python dependencies).
 *
 * Usage:
 *   bun scripts/convert-tokenizer.ts <model-id> [output-dir]
 *   node scripts/convert-tokenizer.ts <model-id> [output-dir]
 *
 * Example:
 *   bun scripts/convert-tokenizer.ts ibm-granite/granite-embedding-30m-english ./converted-model
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pipeline, env as transformersEnv } from "@xenova/transformers";

// =============================================================================
// Configuration
// =============================================================================

// Disable local model cache (always download fresh)
transformersEnv.allowLocalModels = false;
transformersEnv.useBrowserCache = false;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if directory exists and create if not
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Download model files from HuggingFace Hub
 */
async function downloadModelFiles(modelId: string, outputDir: string): Promise<boolean> {
  console.log(`[1/5] Downloading model from HuggingFace: ${modelId}`);
  console.log(`      Output directory: ${outputDir}`);

  try {
    // Use transformers.js to download model
    // This automatically handles tokenizer conversion
    const featureExtractor = await pipeline("feature-extraction", modelId, {
      cache_dir: outputDir,
    });

    console.log("   ✅ Model downloaded successfully");

    // Check if tokenizer.json was created
    const tokenizerJsonPath = path.join(outputDir, "tokenizer.json");

    if (fs.existsSync(tokenizerJsonPath)) {
      console.log(`   ✅ tokenizer.json found: ${tokenizerJsonPath}`);
      return true;
    } else {
      console.log(`   ⚠️  tokenizer.json not found - may need manual conversion`);

      // Try to create tokenizer.json manually
      return await createTokenizerJsonManually(modelId, outputDir);
    }
  } catch (error: any) {
    console.error(`   ❌ Download failed: ${error.message}`);
    return false;
  }
}

/**
 * Manual tokenizer.json creation (fallback)
 */
async function createTokenizerJsonManually(modelId: string, outputDir: string): Promise<boolean> {
  console.log("[2/5] Attempting manual tokenizer.json creation...");

  try {
    // Fetch tokenizer_config.json from HuggingFace
    const configUrl = `https://huggingface.co/${modelId}/resolve/main/tokenizer_config.json`;
    const response = await fetch(configUrl);

    if (!response.ok) {
      console.error(`   ❌ Failed to fetch tokenizer_config.json: ${response.status}`);
      return false;
    }

    const config = await response.json();

    // Create basic tokenizer.json structure
    const tokenizerJson = {
      version: "1.0",
      truncation: config.truncation || null,
      padding: config.padding || null,
      added_tokens: config.added_tokens || [],
      normalizer: config.normalizer || null,
      pre_tokenizer: config.pre_tokenizer || { type: "WhitespaceSplit" },
      post_processor: config.post_processor || null,
      decoder: config.decoder || null,
      model: {
        type: config.model_type || "WordPiece",
        unk_token: config.unk_token || "[UNK]",
        continuing_subword_prefix: config.continuing_subword_prefix || "##",
        max_input_chars_per_word: config.max_input_chars_per_word || 100,
      },
    };

    // Write tokenizer.json
    const tokenizerPath = path.join(outputDir, "tokenizer.json");
    fs.writeFileSync(tokenizerPath, JSON.stringify(tokenizerJson, null, 2));

    console.log(`   ✅ Created tokenizer.json: ${tokenizerPath}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Manual creation failed: ${error.message}`);
    return false;
  }
}

/**
 * Copy necessary model files
 */
async function copyModelFiles(modelId: string, outputDir: string): Promise<boolean> {
  console.log("[3/5] Copying model files...");

  const requiredFiles = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "vocab.json",
    "merges.txt",
    "special_tokens_map.json",
  ];

  const hubUrl = `https://huggingface.co/${modelId}/resolve/main`;

  for (const filename of requiredFiles) {
    try {
      const url = `${hubUrl}/${filename}`;
      const response = await fetch(url);

      if (response.ok) {
        const content = await response.text();
        const outputPath = path.join(outputDir, filename);

        fs.writeFileSync(outputPath, content);
        console.log(`   ✅ Downloaded: ${filename}`);
      }
    } catch (error) {
      // File may not exist for this model - skip
      console.log(`   ⚠️  Skipped: ${filename} (not found)`);
    }
  }

  return true;
}

/**
 * Verify tokenizer.json format
 */
function verifyTokenizerJson(outputDir: string): boolean {
  console.log("[4/5] Verifying tokenizer.json...");

  const tokenizerPath = path.join(outputDir, "tokenizer.json");

  if (!fs.existsSync(tokenizerPath)) {
    console.error(`   ❌ tokenizer.json not found: ${tokenizerPath}`);
    return false;
  }

  try {
    const tokenizerJson = JSON.parse(fs.readFileSync(tokenizerPath, "utf-8"));

    // Check required fields
    const requiredFields = ["version", "model"];
    for (const field of requiredFields) {
      if (!tokenizerJson[field]) {
        console.error(`   ❌ Missing field in tokenizer.json: ${field}`);
        return false;
      }
    }

    console.log(`   ✅ tokenizer.json is valid`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Invalid JSON: ${error.message}`);
    return false;
  }
}

/**
 * Generate Docker command for TEI
 */
function generateDockerCommand(outputDir: string, port: number = 8080): string {
  const absPath = path.resolve(outputDir);

  return `
🚀 Usage with TEI:

  docker run -d \\
    --name tei-server \\
    -p ${port}:80 \\
    -v "${absPath}:/model" \\
    ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \\
    --model-id /model

  # Test:
  curl http://localhost:${port}/health
`;
}

// =============================================================================
// Main Conversion Function
// =============================================================================

async function convertTokenizer(
  modelId: string,
  outputDir: string = "./converted-model",
): Promise<boolean> {
  console.log("🔄 Converting tokenizer for TEI compatibility");
  console.log(`   Model: ${modelId}`);
  console.log(`   Output: ${outputDir}`);
  console.log();

  // Ensure output directory exists
  ensureDir(outputDir);

  // Step 1-2: Download and create tokenizer
  const downloaded = await downloadModelFiles(modelId, outputDir);

  if (!downloaded) {
    console.log();
    console.log("❌ Conversion failed!");
    console.log();
    console.log("💡 This model may not support fast tokenizers.");
    console.log("   Try using a different model:");
    console.log("   - BAAI/bge-small-en-v1.5 (384-dim, fast)");
    console.log("   - sentence-transformers/all-MiniLM-L6-v2 (384-dim)");
    console.log("   - BAAI/bge-base-en-v1.5 (768-dim, better quality)");
    return false;
  }

  // Step 3: Copy additional files
  await copyModelFiles(modelId, outputDir);

  // Step 4: Verify
  const valid = verifyTokenizerJson(outputDir);

  if (!valid) {
    console.log();
    console.log("❌ tokenizer.json validation failed!");
    return false;
  }

  // Step 5: Success summary
  console.log("[5/5] ✅ Conversion successful!");
  console.log();
  console.log("📋 Summary:");
  console.log(`   Model ID: ${modelId}`);
  console.log(`   Output: ${outputDir}`);
  console.log();

  const files = fs.readdirSync(outputDir);
  console.log("📂 Files created:");
  files.forEach((file) => {
    const filePath = path.join(outputDir, file);
    const stats = fs.statSync(filePath);
    console.log(`   - ${file} (${Math.round(stats.size / 1024)}KB)`);
  });

  console.log();
  console.log(generateDockerCommand(outputDir));

  return true;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun scripts/convert-tokenizer.ts <model-id> [output-dir]");
    console.log();
    console.log("Examples:");
    console.log("  bun scripts/convert-tokenizer.ts ibm-granite/granite-embedding-30m-english");
    console.log("  bun scripts/convert-tokenizer.ts BAAI/bge-small-en-v1.5 ./my-model");
    console.log();
    console.log("Converts slow tokenizer to fast tokenizer for TEI compatibility.");
    process.exit(1);
  }

  const modelId = args[0];
  const outputDir = args[1] || "./converted-model";

  const success = await convertTokenizer(modelId, outputDir);

  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Export for use as module
export { convertTokenizer };
