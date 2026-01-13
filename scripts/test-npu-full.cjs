/**
 * Full NPU inference test with CPU comparison
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== Full NPU Inference Test ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";

  // === CPU Test ===
  console.log("\n--- CPU Test ---");
  const model = await core.readModel(modelPath);
  console.log("Model loaded");

  console.log("Compiling for CPU...");
  let t0 = Date.now();
  const cpuModel = await core.compileModel(model, "CPU");
  console.log(`CPU compiled in ${Date.now() - t0}ms`);

  // Show inputs
  console.log("Inputs:", cpuModel.inputs.map((i) => `${i.anyName}[${i.shape}]`).join(", "));
  console.log("Outputs:", cpuModel.outputs.map((o) => `${o.anyName}[${o.shape}]`).join(", "));

  const cpuInfer = cpuModel.createInferRequest();

  // Test data
  const seqLen = 16;
  const inputIds = new BigInt64Array(seqLen);
  inputIds[0] = 101n; // [CLS]
  inputIds[1] = 7592n; // hello
  inputIds[2] = 1010n; // ,
  inputIds[3] = 2088n; // world
  inputIds[4] = 102n; // [SEP]
  // rest is padding (0)

  const attMask = new BigInt64Array(seqLen);
  attMask.fill(1n, 0, 5); // first 5 tokens are real
  // rest is 0 (padding)

  const tokType = new BigInt64Array(seqLen).fill(0n);

  // Set inputs
  cpuInfer.setTensor(cpuModel.inputs[0], new ov.Tensor(ov.element.i64, [1, seqLen], inputIds));
  cpuInfer.setTensor(cpuModel.inputs[1], new ov.Tensor(ov.element.i64, [1, seqLen], attMask));
  cpuInfer.setTensor(cpuModel.inputs[2], new ov.Tensor(ov.element.i64, [1, seqLen], tokType));

  // Warmup
  cpuInfer.infer();

  // Benchmark CPU
  console.log("\nCPU Benchmark (20 iterations):");
  const cpuTimes = [];
  for (let i = 0; i < 20; i++) {
    t0 = Date.now();
    cpuInfer.infer();
    cpuTimes.push(Date.now() - t0);
  }
  const cpuAvg = cpuTimes.reduce((a, b) => a + b) / cpuTimes.length;
  console.log(
    `  Avg: ${cpuAvg.toFixed(2)}ms, Min: ${Math.min(...cpuTimes)}ms, Max: ${Math.max(...cpuTimes)}ms`,
  );

  // Get output
  const cpuOut = cpuInfer.getOutputTensor(0);
  console.log("Output shape:", cpuOut.shape);
  const cpuData = new Float32Array(cpuOut.data);
  const hiddenDim = cpuData.length / seqLen;
  console.log("Hidden dim:", hiddenDim);

  // Mean pooling (simplified)
  function meanPool(data, seqLen, hiddenDim, validTokens) {
    const result = new Float32Array(hiddenDim);
    for (let h = 0; h < hiddenDim; h++) {
      let sum = 0;
      for (let s = 0; s < validTokens; s++) {
        sum += data[s * hiddenDim + h];
      }
      result[h] = sum / validTokens;
    }
    return result;
  }

  const cpuEmbed = meanPool(cpuData, seqLen, hiddenDim, 5);
  console.log(
    "CPU embedding (first 5 values):",
    Array.from(cpuEmbed.slice(0, 5)).map((v) => v.toFixed(4)),
  );

  // === NPU Test ===
  if (!devices.includes("NPU")) {
    console.log("\nNPU not available, skipping");
    return;
  }

  console.log("\n--- NPU Test ---");

  // NPU needs static shapes - use same seqLen
  console.log("Reading model for NPU...");
  const npuModel = await core.readModel(modelPath);

  console.log("Compiling for NPU...");
  t0 = Date.now();
  let npuCompiled;
  try {
    npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log("NPU compile failed:", e.message);

    // Try with explicit static shapes via properties
    console.log("Retrying with NETWORK_INPUT_STATIC_SHAPES...");
    try {
      npuCompiled = await core.compileModel(npuModel, "NPU", {
        NPU_COMPILATION_MODE: "DefaultCompilation",
      });
      console.log(`NPU compiled in ${Date.now() - t0}ms`);
    } catch (e2) {
      console.log("NPU compile failed again:", e2.message);
      console.log("\nTrying GPU.0 instead...");
      try {
        npuCompiled = await core.compileModel(npuModel, "GPU.0");
        console.log(`GPU.0 compiled in ${Date.now() - t0}ms`);
      } catch (e3) {
        console.log("GPU compile failed:", e3.message);
        return;
      }
    }
  }

  const npuInfer = npuCompiled.createInferRequest();

  // Set same inputs
  npuInfer.setTensor(npuCompiled.inputs[0], new ov.Tensor(ov.element.i64, [1, seqLen], inputIds));
  npuInfer.setTensor(npuCompiled.inputs[1], new ov.Tensor(ov.element.i64, [1, seqLen], attMask));
  npuInfer.setTensor(npuCompiled.inputs[2], new ov.Tensor(ov.element.i64, [1, seqLen], tokType));

  // Warmup
  npuInfer.infer();

  // Benchmark
  console.log("\nNPU Benchmark (20 iterations):");
  const npuTimes = [];
  for (let i = 0; i < 20; i++) {
    t0 = Date.now();
    npuInfer.infer();
    npuTimes.push(Date.now() - t0);
  }
  const npuAvg = npuTimes.reduce((a, b) => a + b) / npuTimes.length;
  console.log(
    `  Avg: ${npuAvg.toFixed(2)}ms, Min: ${Math.min(...npuTimes)}ms, Max: ${Math.max(...npuTimes)}ms`,
  );

  // Get output
  const npuOut = npuInfer.getOutputTensor(0);
  console.log("Output shape:", npuOut.shape);
  const npuData = new Float32Array(npuOut.data);

  const npuEmbed = meanPool(npuData, seqLen, hiddenDim, 5);
  console.log(
    "NPU embedding (first 5 values):",
    Array.from(npuEmbed.slice(0, 5)).map((v) => v.toFixed(4)),
  );

  // Compare embeddings
  let diff = 0;
  for (let i = 0; i < hiddenDim; i++) {
    diff += Math.abs(cpuEmbed[i] - npuEmbed[i]);
  }
  console.log(`\nCPU vs NPU embedding diff (L1): ${diff.toFixed(6)}`);
  console.log(`Speedup: ${(cpuAvg / npuAvg).toFixed(2)}x`);

  console.log("\n=== Test Complete! ===");
}

main().catch((e) => {
  console.error("Error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
