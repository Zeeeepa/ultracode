/**
 * Isolated OpenVINO stress test - no DB, no libsql
 * Tests if crash is in OpenVINO or somewhere else
 *
 * Run: bun run benchmarks/openvino-stress-test.ts
 */

import { join } from "node:path";
import { existsSync } from "node:fs";

const DATA_DIR = process.env.ULTRASCRIPT_DATA_DIR ||
  join(process.env.LOCALAPPDATA || process.env.HOME || ".", "UltraScriptTools");
const MODELS_DIR = join(DATA_DIR, "models");

async function main() {
  console.log("=== OpenVINO Isolated Stress Test ===\n");

  // Load OpenVINO
  console.log("Loading OpenVINO...");
  const { addon: ov } = await import("openvino-node");
  const { AutoTokenizer } = await import("@xenova/transformers");

  const core = new ov.Core();
  console.log("Available devices:", core.getAvailableDevices());

  // Find model - check both direct path and IR subdirectory
  const modelName = "multilingual-e5-base-int8";
  const modelPath = join(MODELS_DIR, modelName);
  const irSubdirs = ["multilingual-e5-base_ir", ""];
  const irFiles = ["openvino_model.xml", "openvino_model_qint8_quantized.xml", "openvino_model_int8.xml"];

  let modelFile: string | null = null;
  for (const subdir of irSubdirs) {
    for (const f of irFiles) {
      const candidate = join(modelPath, subdir, f);
      if (existsSync(candidate)) {
        modelFile = candidate;
        break;
      }
    }
    if (modelFile) break;
  }

  if (!modelFile) {
    console.error("Model not found at:", modelPath);
    console.error("Checked subdirs:", irSubdirs);
    process.exit(1);
  }

  console.log("Loading model:", modelFile);
  const model = await core.readModel(modelFile);

  console.log("Compiling model for CPU...");
  const compiledModel = await core.compileModel(model, "CPU");

  console.log("Loading tokenizer...");
  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/multilingual-e5-base");

  // Create reusable buffers
  const SEQ_LEN = 64;
  const inputIdsBuffer = new BigInt64Array(SEQ_LEN);
  const attMaskBuffer = new BigInt64Array(SEQ_LEN);
  const tokTypeBuffer = new BigInt64Array(SEQ_LEN).fill(0n);

  // Create InferRequest and tensors
  let inferRequest = compiledModel.createInferRequest();
  let inputIdsTensor = new ov.Tensor("i64", [1, SEQ_LEN], inputIdsBuffer);
  let attMaskTensor = new ov.Tensor("i64", [1, SEQ_LEN], attMaskBuffer);
  let tokTypeTensor = new ov.Tensor("i64", [1, SEQ_LEN], tokTypeBuffer);

  // Test texts - mix of simple and complex like real system
  const testTexts = [
    "type: function name: processData file: src/utils.ts",
    "type: class name: UserService file: src/services/user.ts",
    "type: interface name: IConfig file: src/types.ts",
    "type: method name: handleRequest file: src/api/handler.ts",
    "type: property name: isActive file: src/models/entity.ts",
    // Longer complex texts like real code entities
    "LLM Benchmark Script Tests Ollama, OpenVINO CPU, OpenVINO NPU performance on code documentation tasks with various prompt sizes",
    "Test prompt - generate documentation for a TypeScript class with multiple methods and complex generic types",
    "async function processEmbeddings(entities: ParsedEntity[], vectorStore: VectorStore): Promise<EmbeddingResult[]>",
    "interface SemanticSearchConfig { dimensions: number; metric: 'cosine' | 'l2'; compression: 'float8' | 'float16' }",
    "export class LibSQLGraphAdapter implements GraphStorageAdapter with DiskANN vector index support for similarity search",
    "const handleNewEntities = async (batch: Entity[]) => { await Promise.all(batch.map(e => generateEmbedding(e.content))); }",
    "/**\\n * OpenVINO Embedding Provider\\n * High-performance local embedding generation using Intel OpenVINO.\\n * Supports CPU (INT8) and GPU inference.\\n */",
    "простой текст на русском языке для тестирования мультиязычной модели embeddings",
    "日本語テキスト for multilingual testing with various Unicode characters and emoji 🎉🚀💻",
    "Emoji test 🎉🚀💻 with special chars: <>&\"' and code snippets like `const x = () => {}`",
  ];

  const TARGET = 5000; // Extended test
  const ROUNDS = Math.ceil(TARGET / testTexts.length);

  console.log("\n=== Starting stress test ===");
  console.log(`Target: ${TARGET} embeddings`);
  console.log("Recreation interval: 50");
  console.log("Memory log interval: 100\n");

  let embedCount = 0;
  const startTime = Date.now();

  for (let round = 0; round < ROUNDS; round++) { // Extended test
    for (const text of testTexts) {
      embedCount++;

      // Memory logging every 100
      if (embedCount % 100 === 0) {
        const mem = process.memoryUsage();
        const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
        const rssMB = Math.round(mem.rss / 1024 / 1024);
        const extMB = Math.round(mem.external / 1024 / 1024);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed}s] #${embedCount}: heap=${heapMB}MB rss=${rssMB}MB ext=${extMB}MB`);
      }

      // Recreation every 50
      if (embedCount % 50 === 0 && embedCount > 0) {
        console.log(`  -> Recreating InferRequest at #${embedCount}`);

        inferRequest = null as any;
        inputIdsTensor = null as any;
        attMaskTensor = null as any;
        tokTypeTensor = null as any;

        if (typeof globalThis.gc === "function") {
          globalThis.gc();
        }

        inferRequest = compiledModel.createInferRequest();
        inputIdsTensor = new ov.Tensor("i64", [1, SEQ_LEN], inputIdsBuffer);
        attMaskTensor = new ov.Tensor("i64", [1, SEQ_LEN], attMaskBuffer);
        tokTypeTensor = new ov.Tensor("i64", [1, SEQ_LEN], tokTypeBuffer);
      }

      // Tokenize
      const encoded = await tokenizer(text, {
        padding: true,
        truncation: true,
        max_length: SEQ_LEN,
      });

      // Fill buffers
      inputIdsBuffer.fill(0n);
      attMaskBuffer.fill(0n);

      const ids = encoded.input_ids.data;
      const mask = encoded.attention_mask.data;

      for (let i = 0; i < Math.min(ids.length, SEQ_LEN); i++) {
        inputIdsBuffer[i] = BigInt(ids[i]);
        attMaskBuffer[i] = BigInt(mask[i]);
      }

      // Dispose tokenizer tensors
      try {
        encoded.input_ids?.dispose?.();
        encoded.attention_mask?.dispose?.();
        encoded.token_type_ids?.dispose?.();
      } catch {}

      // Set tensors
      inferRequest.setInputTensor(0, inputIdsTensor);
      inferRequest.setInputTensor(1, attMaskTensor);
      try {
        inferRequest.setInputTensor(2, tokTypeTensor);
      } catch {}

      // Inference
      inferRequest.infer();

      // Get output
      const output = inferRequest.getOutputTensor(0);
      const outputData = new Float32Array(output.data);

      // Simple mean pooling (just sum for test)
      let sum = 0;
      for (let i = 0; i < Math.min(outputData.length, 768); i++) {
        sum += outputData[i];
      }

      // Dispose output
      try {
        output?.dispose?.();
      } catch {}
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== SUCCESS: ${embedCount} embeddings in ${totalTime}s ===`);
  console.log(`Average: ${(embedCount / parseFloat(totalTime)).toFixed(1)} emb/s`);
}

main().catch(e => {
  console.error("\n=== CRASH ===");
  console.error(e);
  process.exit(1);
});
