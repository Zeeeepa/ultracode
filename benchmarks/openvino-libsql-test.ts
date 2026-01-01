/**
 * OpenVINO + libsql integration test
 * Tests if crash is caused by libsql vector operations
 *
 * Run: bun run benchmarks/openvino-libsql-test.ts
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const DATA_DIR = process.env.ULTRASCRIPT_DATA_DIR ||
  join(process.env.LOCALAPPDATA || process.env.HOME || ".", "UltraScriptTools");
const MODELS_DIR = join(DATA_DIR, "models");
const TEST_DB_DIR = join(DATA_DIR, "test-db");

async function main() {
  console.log("=== OpenVINO + libsql Integration Test ===\n");

  // Create test DB directory
  mkdirSync(TEST_DB_DIR, { recursive: true });

  // Load OpenVINO
  console.log("Loading OpenVINO...");
  const { addon: ov } = await import("openvino-node");
  const { AutoTokenizer } = await import("@xenova/transformers");

  const core = new ov.Core();

  // Find model
  const modelName = "multilingual-e5-base-int8";
  const modelPath = join(MODELS_DIR, modelName);
  const irSubdirs = ["multilingual-e5-base_ir", ""];
  const irFiles = ["openvino_model.xml"];

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
    console.error("Model not found");
    process.exit(1);
  }

  console.log("Loading model:", modelFile);
  const model = await core.readModel(modelFile);
  const compiledModel = await core.compileModel(model, "CPU");

  console.log("Loading tokenizer...");
  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/multilingual-e5-base");

  // Initialize libsql
  console.log("Initializing libsql...");
  const { createClient } = await import("@libsql/client");
  const dbPath = join(TEST_DB_DIR, "test-vectors.db");
  const client = createClient({ url: `file:${dbPath}` });

  // Create vector table
  const DIMENSIONS = 768;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      content TEXT,
      embedding F32_BLOB(${DIMENSIONS}),
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Create DiskANN index
  try {
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_vector
      ON embeddings(libsql_vector_idx(embedding))
    `);
  } catch (e: any) {
    console.log("Index already exists or not supported:", e.message);
  }

  console.log("libsql initialized with vector support");

  // Setup OpenVINO buffers
  const SEQ_LEN = 64;
  const inputIdsBuffer = new BigInt64Array(SEQ_LEN);
  const attMaskBuffer = new BigInt64Array(SEQ_LEN);
  const tokTypeBuffer = new BigInt64Array(SEQ_LEN).fill(0n);

  let inferRequest = compiledModel.createInferRequest();
  let inputIdsTensor = new ov.Tensor("i64", [1, SEQ_LEN], inputIdsBuffer);
  let attMaskTensor = new ov.Tensor("i64", [1, SEQ_LEN], attMaskBuffer);
  let tokTypeTensor = new ov.Tensor("i64", [1, SEQ_LEN], tokTypeBuffer);

  // Test texts
  const testTexts = [
    "type: function name: processData file: src/utils.ts",
    "type: class name: UserService file: src/services/user.ts",
    "type: interface name: IConfig file: src/types.ts",
    "type: method name: handleRequest file: src/api/handler.ts",
  ];

  const TARGET = 1000;
  console.log(`\n=== Starting test: ${TARGET} embeddings with libsql inserts ===\n`);

  let embedCount = 0;
  const startTime = Date.now();

  for (let round = 0; embedCount < TARGET; round++) {
    for (const text of testTexts) {
      if (embedCount >= TARGET) break;
      embedCount++;

      // Memory logging every 50
      if (embedCount % 50 === 0) {
        const mem = process.memoryUsage();
        const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
        const rssMB = Math.round(mem.rss / 1024 / 1024);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed}s] #${embedCount}: heap=${heapMB}MB rss=${rssMB}MB`);
      }

      // Recreation every 50
      if (embedCount % 50 === 0 && embedCount > 0) {
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
      } catch {}

      // Inference
      inferRequest.setInputTensor(0, inputIdsTensor);
      inferRequest.setInputTensor(1, attMaskTensor);
      try { inferRequest.setInputTensor(2, tokTypeTensor); } catch {}

      inferRequest.infer();

      const output = inferRequest.getOutputTensor(0);
      const outputData = new Float32Array(output.data);

      // Mean pooling (simplified)
      const embedding = new Float32Array(DIMENSIONS);
      let validTokens = 0;
      for (let i = 0; i < SEQ_LEN; i++) {
        if (attMaskBuffer[i] > 0n) validTokens++;
      }
      for (let d = 0; d < DIMENSIONS; d++) {
        let sum = 0;
        for (let t = 0; t < SEQ_LEN; t++) {
          if (attMaskBuffer[t] > 0n) {
            sum += outputData[t * DIMENSIONS + d];
          }
        }
        embedding[d] = sum / (validTokens || 1);
      }

      try { output?.dispose?.(); } catch {}

      // INSERT INTO libsql with vector
      const id = `test-${embedCount}-${Date.now()}`;
      const embeddingHex = Buffer.from(embedding.buffer).toString("hex");

      try {
        await client.execute({
          sql: `INSERT OR REPLACE INTO embeddings (id, content, embedding) VALUES (?, ?, vector(x'${embeddingHex}'))`,
          args: [id, text],
        });
      } catch (e: any) {
        console.error(`Insert failed at #${embedCount}:`, e.message);
        throw e;
      }
    }
  }

  // Verify count
  const result = await client.execute("SELECT COUNT(*) as cnt FROM embeddings");
  const count = (result.rows[0] as any).cnt;

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== SUCCESS: ${embedCount} embeddings in ${totalTime}s ===`);
  console.log(`DB rows: ${count}`);
  console.log(`Average: ${(embedCount / parseFloat(totalTime)).toFixed(1)} emb/s`);

  await client.close();
}

main().catch(e => {
  console.error("\n=== CRASH ===");
  console.error(e);
  process.exit(1);
});
