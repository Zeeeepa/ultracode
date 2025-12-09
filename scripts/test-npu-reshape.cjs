/**
 * NPU test with model reshape to static shapes
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== NPU Test with Static Shapes ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";
  const STATIC_SEQ_LEN = 64;  // Fixed sequence length for NPU

  // Test data
  const inputIds = new BigInt64Array(STATIC_SEQ_LEN);
  inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]);

  const attMask = new BigInt64Array(STATIC_SEQ_LEN);
  attMask.fill(1n, 0, 10);

  const tokType = new BigInt64Array(STATIC_SEQ_LEN).fill(0n);

  // === CPU Test (dynamic shapes) ===
  console.log("--- CPU Test (dynamic shapes) ---");
  const cpuModel = await core.readModel(modelPath);
  const cpuCompiled = await core.compileModel(cpuModel, "CPU");
  const cpuInfer = cpuCompiled.createInferRequest();

  cpuInfer.setInputTensor(0, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], inputIds));
  cpuInfer.setInputTensor(1, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], attMask));
  cpuInfer.setInputTensor(2, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], tokType));

  cpuInfer.infer(); // warmup
  const cpuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    cpuInfer.infer();
    cpuTimes.push(Date.now() - t);
  }
  const cpuAvg = cpuTimes.reduce((a, b) => a + b) / cpuTimes.length;
  console.log(`CPU: Avg ${cpuAvg.toFixed(2)}ms`);

  // === NPU Test (static shapes via reshape) ===
  if (!devices.includes("NPU")) {
    console.log("\nNPU not available");
    return;
  }

  console.log("\n--- NPU Test (static shapes) ---");

  // Read fresh model for NPU
  console.log("Reading model for NPU...");
  const npuModel = await core.readModel(modelPath);

  // Reshape to static dimensions
  console.log(`Reshaping to static [1, ${STATIC_SEQ_LEN}]...`);
  try {
    // Use partial shape specification
    npuModel.reshape({
      "input_ids": [1, STATIC_SEQ_LEN],
      "attention_mask": [1, STATIC_SEQ_LEN],
      "token_type_ids": [1, STATIC_SEQ_LEN]
    });
    console.log("Model reshaped successfully");
  } catch (e) {
    console.log("Reshape failed:", e.message);

    // Try alternative reshape syntax
    console.log("Trying alternative reshape...");
    try {
      npuModel.reshape([[1, STATIC_SEQ_LEN], [1, STATIC_SEQ_LEN], [1, STATIC_SEQ_LEN]]);
      console.log("Alternative reshape succeeded");
    } catch (e2) {
      console.log("Alternative reshape also failed:", e2.message);
    }
  }

  // Compile for NPU
  console.log("Compiling for NPU...");
  let t0 = Date.now();
  let npuCompiled;
  try {
    npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`NPU compile failed: ${e.message}`);

    // Try GPU as fallback
    console.log("\nTrying GPU.0...");
    try {
      npuCompiled = await core.compileModel(npuModel, "GPU.0");
      console.log(`GPU compiled in ${Date.now() - t0}ms`);
    } catch (e2) {
      console.log(`GPU compile failed: ${e2.message}`);
      return;
    }
  }

  const npuInfer = npuCompiled.createInferRequest();

  npuInfer.setInputTensor(0, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], inputIds));
  npuInfer.setInputTensor(1, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], attMask));
  npuInfer.setInputTensor(2, new ov.Tensor("i64", [1, STATIC_SEQ_LEN], tokType));

  npuInfer.infer(); // warmup
  const npuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    npuInfer.infer();
    npuTimes.push(Date.now() - t);
  }
  const npuAvg = npuTimes.reduce((a, b) => a + b) / npuTimes.length;
  console.log(`NPU: Avg ${npuAvg.toFixed(2)}ms`);

  // Compare
  console.log(`\nSpeedup: ${(cpuAvg / npuAvg).toFixed(2)}x`);

  console.log("\n=== Done! ===");
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
