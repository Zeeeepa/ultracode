/**
 * Test BGE on NPU only
 */

const { addon: ov } = require("openvino-node");
const path = require("path");

async function main() {
  console.log("=== BGE NPU Test ===");

  const core = new ov.Core();
  console.log("Devices:", core.getAvailableDevices());

  const modelPath = path.join(__dirname, "..", "models", "bge-small-en-v1.5-int8", "model_int8.onnx");
  console.log("Model:", modelPath);

  try {
    console.log("\nLoading model...");
    const model = await core.readModel(modelPath);
    console.log("✓ Model loaded");

    console.log("\nCompiling for NPU...");
    const compiled = await core.compileModel(model, "NPU");
    console.log("✓ NPU compiled!");

    // Test inference
    const SEQ_LEN = 64;
    const inputIds = new BigInt64Array(SEQ_LEN);
    inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 102n]);
    const attMask = new BigInt64Array(SEQ_LEN);
    attMask.fill(1n, 0, 6);
    const tokType = new BigInt64Array(SEQ_LEN).fill(0n);

    const infer = compiled.createInferRequest();
    infer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
    infer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));
    try {
      infer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));
    } catch {}

    console.log("Running inference...");
    const t0 = Date.now();
    infer.infer();
    console.log(`✓ NPU inference: ${Date.now() - t0}ms`);

    // Benchmark
    const times = [];
    for (let i = 0; i < 20; i++) {
      const t = Date.now();
      infer.infer();
      times.push(Date.now() - t);
    }
    const avg = times.reduce((a, b) => a + b) / times.length;
    console.log(`Benchmark (20 runs): avg=${avg.toFixed(2)}ms`);

    const output = infer.getOutputTensor(0);
    const data = new Float32Array(output.data);
    console.log(`Output: ${data.length} values`);
    console.log(`First 3: [${Array.from(data.slice(0, 3)).map(v => v.toFixed(4)).join(", ")}]`);

  } catch (e) {
    console.log(`\n✗ Error: ${e.message}`);
    if (e.message.includes("Select") || e.message.includes("masked_fill")) {
      console.log("→ Same attention mask issue as BERT");
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
