/**
 * Test full inference pipeline on NPU with OpenVINO
 *
 * Flow:
 * 1. Load ONNX model (OpenVINO auto-converts)
 * 2. Tokenize with @xenova/transformers
 * 3. Run inference on NPU
 * 4. Mean pooling → sentence embedding
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODELS_DIR = join(import.meta.dir, "..", "models");
const MODEL_NAME = "all-MiniLM-L6-v2";
const MODEL_PATH = join(MODELS_DIR, MODEL_NAME);

// Download ONNX model from HuggingFace
async function downloadModel(): Promise<string> {
  const onnxPath = join(MODEL_PATH, "model.onnx");

  if (existsSync(onnxPath)) {
    console.log("   Model already exists:", onnxPath);
    return onnxPath;
  }

  console.log("   Downloading model from HuggingFace...");
  mkdirSync(MODEL_PATH, { recursive: true });

  // Download from onnx-community (optimized ONNX)
  const baseUrl = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx";
  const files = ["model.onnx"];

  for (const file of files) {
    const url = `${baseUrl}/${file}`;
    console.log(`   Downloading ${file}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${file}: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    writeFileSync(join(MODEL_PATH, file), Buffer.from(buffer));
  }

  console.log("   ✓ Model downloaded");
  return onnxPath;
}

// Mean pooling implementation
function meanPooling(
  lastHiddenState: Float32Array,
  attentionMask: BigInt64Array,
  batchSize: number,
  seqLength: number,
  hiddenDim: number
): Float32Array {
  const result = new Float32Array(batchSize * hiddenDim);

  for (let b = 0; b < batchSize; b++) {
    const batchOffset = b * seqLength * hiddenDim;
    const maskOffset = b * seqLength;

    // Count valid tokens
    let validTokens = 0;
    for (let s = 0; s < seqLength; s++) {
      if (attentionMask[maskOffset + s] > 0n) validTokens++;
    }

    // Sum hidden states for valid tokens
    for (let h = 0; h < hiddenDim; h++) {
      let sum = 0;
      for (let s = 0; s < seqLength; s++) {
        if (attentionMask[maskOffset + s] > 0n) {
          sum += lastHiddenState[batchOffset + s * hiddenDim + h];
        }
      }
      result[b * hiddenDim + h] = sum / validTokens;
    }
  }

  return result;
}

// L2 normalize embedding
function normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  return vec.map((v) => v / norm);
}

// Cosine similarity
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function testInference(device: string) {
  console.log(`\n=== Testing inference on ${device} ===\n`);

  // 1. Load OpenVINO
  console.log("1. Loading OpenVINO...");
  const { addon: ov } = await import("openvino-node");
  const core = new ov.Core();
  console.log("   ✓ OpenVINO loaded");

  // 2. Download/check model
  console.log("\n2. Preparing model...");
  const modelPath = await downloadModel();

  // 3. Read and compile model
  console.log(`\n3. Compiling model for ${device}...`);
  const startCompile = Date.now();

  let model: any;
  try {
    model = await core.readModel(modelPath);
    console.log("   ✓ Model loaded from ONNX");
  } catch (e: any) {
    console.error("   ✗ Failed to read model:", e.message);
    throw e;
  }

  // Get input/output info
  const inputs = model.inputs;
  const outputs = model.outputs;
  console.log(
    "   Inputs:",
    inputs.map((i: any) => `${i.anyName}[${i.shape}]`)
  );
  console.log(
    "   Outputs:",
    outputs.map((o: any) => `${o.anyName}[${o.shape}]`)
  );

  // For NPU: need static shapes
  const MAX_SEQ_LEN = 128; // Small for testing
  if (device === "NPU") {
    console.log(`   Reshaping for NPU (static shape: 1x${MAX_SEQ_LEN})...`);
    try {
      // Check if model has dynamic shapes
      const inputShape = inputs[0].shape;
      if (inputShape.some((d: number) => d === -1)) {
        model.reshape({ input_ids: [1, MAX_SEQ_LEN], attention_mask: [1, MAX_SEQ_LEN], token_type_ids: [1, MAX_SEQ_LEN] });
        console.log("   ✓ Model reshaped for NPU");
      }
    } catch (e: any) {
      console.log("   ⚠ Reshape not needed or failed:", e.message);
    }
  }

  let compiledModel: any;
  try {
    compiledModel = await core.compileModel(model, device);
    console.log(`   ✓ Compiled for ${device} in ${Date.now() - startCompile}ms`);
  } catch (e: any) {
    console.error(`   ✗ Failed to compile for ${device}:`, e.message);
    if (device === "NPU") {
      console.log("   Falling back to CPU...");
      compiledModel = await core.compileModel(model, "CPU");
      console.log("   ✓ Compiled for CPU (fallback)");
    } else {
      throw e;
    }
  }

  // 4. Load tokenizer
  console.log("\n4. Loading tokenizer...");
  const { AutoTokenizer } = await import("@xenova/transformers");
  const tokenizer = await AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2");
  console.log("   ✓ Tokenizer loaded");

  // 5. Test sentences
  const sentences = [
    "The weather is lovely today.",
    "It's so sunny outside!",
    "He drove to the stadium.",
    "Programming is a useful skill.",
    "Machine learning models process data.",
  ];

  console.log("\n5. Running inference...");
  const embeddings: Float32Array[] = [];
  const inferRequest = compiledModel.createInferRequest();

  for (const sentence of sentences) {
    const startInfer = Date.now();

    // Tokenize
    const encoded = await tokenizer(sentence, {
      padding: device === "NPU" ? "max_length" : true,
      truncation: true,
      max_length: MAX_SEQ_LEN,
    });

    // Prepare tensors
    const inputIds = new BigInt64Array(encoded.input_ids.data);
    const attentionMask = new BigInt64Array(encoded.attention_mask.data);

    // Create OpenVINO tensors
    const inputIdsTensor = new ov.Tensor(ov.element.i64, [1, inputIds.length], inputIds);
    const attentionMaskTensor = new ov.Tensor(ov.element.i64, [1, attentionMask.length], attentionMask);

    // Set inputs
    inferRequest.setInputTensor("input_ids", inputIdsTensor);
    inferRequest.setInputTensor("attention_mask", attentionMaskTensor);

    // Check if token_type_ids is needed
    try {
      const tokenTypeIds = new BigInt64Array(inputIds.length).fill(0n);
      const tokenTypeIdsTensor = new ov.Tensor(ov.element.i64, [1, tokenTypeIds.length], tokenTypeIds);
      inferRequest.setInputTensor("token_type_ids", tokenTypeIdsTensor);
    } catch (_e) {
      // token_type_ids not required
    }

    // Run inference
    inferRequest.infer();

    // Get output (last_hidden_state)
    const output = inferRequest.getOutputTensor();
    const outputData = new Float32Array(output.data);
    const outputShape = output.shape; // [1, seq_len, 384]

    // Mean pooling
    const seqLen = outputShape[1];
    const hiddenDim = outputShape[2];
    const embedding = meanPooling(outputData, attentionMask, 1, seqLen, hiddenDim);

    // Normalize
    const normalizedEmbedding = normalize(embedding);
    embeddings.push(normalizedEmbedding);

    const inferTime = Date.now() - startInfer;
    console.log(`   "${sentence.slice(0, 30)}..." → ${inferTime}ms (dim: ${normalizedEmbedding.length})`);
  }

  // 6. Test similarity
  console.log("\n6. Similarity matrix:");
  console.log("   ", sentences.map((_, i) => `S${i}`).join("   "));
  for (let i = 0; i < embeddings.length; i++) {
    const row = [];
    for (let j = 0; j < embeddings.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      row.push(sim.toFixed(2));
    }
    console.log(`S${i}`, row.join(" "));
  }

  console.log(`\n✓ Inference test on ${device} completed!`);
  return { success: true, device, embeddingDim: embeddings[0].length };
}

async function main() {
  console.log("=== NPU Inference Test ===");
  console.log("Bun version:", Bun.version);
  console.log("");

  // Check available devices
  const { addon: ov } = await import("openvino-node");
  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Available devices:", devices);

  // Test on different devices
  const results: any[] = [];

  // Try NPU first
  if (devices.includes("NPU")) {
    try {
      results.push(await testInference("NPU"));
    } catch (e: any) {
      console.error("NPU test failed:", e.message);
    }
  }

  // Always test CPU for comparison
  try {
    results.push(await testInference("CPU"));
  } catch (e: any) {
    console.error("CPU test failed:", e.message);
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(`${r.device}: ${r.success ? "✓" : "✗"} (embedding dim: ${r.embeddingDim})`);
  }
}

main().catch(console.error);
