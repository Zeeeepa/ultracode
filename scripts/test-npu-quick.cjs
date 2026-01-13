/**
 * Quick NPU test - minimal version to see exact errors
 */

const { addon: ov } = require("openvino-node");
const path = require("path");

async function testModel(name, modelPath) {
  console.log(`\n=== ${name} ===`);
  console.log(`Path: ${modelPath}`);

  const core = new ov.Core();

  try {
    const model = await core.readModel(modelPath);
    console.log("✓ Model loaded");

    // Try NPU
    console.log("Compiling for NPU...");
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

    const output = infer.getOutputTensor(0);
    console.log(`Output: ${new Float32Array(output.data).length} values`);
  } catch (e) {
    console.log(`✗ Error: ${e.message}`);
    // Show key part of error
    if (e.message.includes("Select")) {
      console.log("→ Same masked_fill/Select issue");
    }
    if (e.message.includes("broadcast")) {
      console.log("→ Broadcasting issue");
    }
  }
}

async function main() {
  console.log("=== Quick NPU Model Tests ===");
  const core = new ov.Core();
  console.log("Devices:", core.getAvailableDevices());

  const models = [
    [
      "MiniLM INT8 (OpenVINO)",
      path.join(
        __dirname,
        "..",
        "models",
        "all-MiniLM-L6-v2-openvino-int8",
        "openvino_model_qint8_quantized.xml",
      ),
    ],
    [
      "BGE-small INT8 (ONNX)",
      path.join(__dirname, "..", "models", "bge-small-en-v1.5-int8", "model_int8.onnx"),
    ],
    [
      "GTE-small INT8 (ONNX)",
      path.join(__dirname, "..", "models", "gte-small-int8", "model_int8.onnx"),
    ],
  ];

  for (const [name, modelPath] of models) {
    await testModel(name, modelPath);
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
