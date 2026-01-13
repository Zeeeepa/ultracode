/**
 * NPU test v3 - avoiding array iteration on inputs
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== NPU Test v3 ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";

  console.log("\n--- CPU Test ---");
  const model = await core.readModel(modelPath);
  console.log("Model loaded");

  const cpuModel = await core.compileModel(model, "CPU");
  console.log("CPU compiled");

  // Access inputs by index only, no iteration
  const numInputs = cpuModel.inputs.length;
  console.log("Num inputs:", numInputs);

  const cpuInfer = cpuModel.createInferRequest();
  console.log("InferRequest created");

  // Test data - small sequence
  const seqLen = 8;
  const inputIds = new BigInt64Array([101n, 7592n, 1010n, 2088n, 102n, 0n, 0n, 0n]);
  const attMask = new BigInt64Array([1n, 1n, 1n, 1n, 1n, 0n, 0n, 0n]);
  const tokType = new BigInt64Array(seqLen).fill(0n);

  // Set tensors by index
  console.log("Setting tensors...");
  cpuInfer.setTensor(cpuModel.inputs[0], new ov.Tensor(ov.element.i64, [1, seqLen], inputIds));
  cpuInfer.setTensor(cpuModel.inputs[1], new ov.Tensor(ov.element.i64, [1, seqLen], attMask));
  cpuInfer.setTensor(cpuModel.inputs[2], new ov.Tensor(ov.element.i64, [1, seqLen], tokType));
  console.log("Tensors set");

  // Inference
  console.log("Running inference...");
  let t0 = Date.now();
  cpuInfer.infer();
  console.log(`First inference: ${Date.now() - t0}ms`);

  // Get output
  const cpuOut = cpuInfer.getOutputTensor(0);
  const shape = cpuOut.shape;
  console.log("Output shape:", shape);

  const cpuData = new Float32Array(cpuOut.data);
  const hiddenDim = shape[2];
  console.log("Hidden dim:", hiddenDim);

  // Mean pool first 5 tokens
  const embedding = new Float32Array(hiddenDim);
  for (let h = 0; h < hiddenDim; h++) {
    let sum = 0;
    for (let s = 0; s < 5; s++) {
      sum += cpuData[s * hiddenDim + h];
    }
    embedding[h] = sum / 5;
  }
  console.log(
    "Embedding (first 5):",
    Array.from(embedding.slice(0, 5)).map((v) => v.toFixed(4)),
  );

  // Benchmark CPU
  console.log("\nCPU Benchmark:");
  const cpuTimes = [];
  for (let i = 0; i < 20; i++) {
    t0 = Date.now();
    cpuInfer.infer();
    cpuTimes.push(Date.now() - t0);
  }
  console.log(`  Avg: ${(cpuTimes.reduce((a, b) => a + b) / cpuTimes.length).toFixed(1)}ms`);

  // === NPU ===
  if (!devices.includes("NPU")) {
    console.log("\nNPU not available");
    return;
  }

  console.log("\n--- NPU Test ---");
  const npuModel = await core.readModel(modelPath);

  console.log("Compiling for NPU...");
  t0 = Date.now();
  let npuCompiled;
  try {
    npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log("NPU failed:", e.message);
    console.log("Trying GPU.0...");
    try {
      npuCompiled = await core.compileModel(npuModel, "GPU.0");
      console.log(`GPU.0 compiled in ${Date.now() - t0}ms`);
    } catch (e2) {
      console.log("GPU failed:", e2.message);
      return;
    }
  }

  const npuInfer = npuCompiled.createInferRequest();

  npuInfer.setTensor(npuCompiled.inputs[0], new ov.Tensor(ov.element.i64, [1, seqLen], inputIds));
  npuInfer.setTensor(npuCompiled.inputs[1], new ov.Tensor(ov.element.i64, [1, seqLen], attMask));
  npuInfer.setTensor(npuCompiled.inputs[2], new ov.Tensor(ov.element.i64, [1, seqLen], tokType));

  console.log("Running NPU inference...");
  t0 = Date.now();
  npuInfer.infer();
  console.log(`First NPU inference: ${Date.now() - t0}ms`);

  // Benchmark NPU
  console.log("\nNPU Benchmark:");
  const npuTimes = [];
  for (let i = 0; i < 20; i++) {
    t0 = Date.now();
    npuInfer.infer();
    npuTimes.push(Date.now() - t0);
  }
  console.log(`  Avg: ${(npuTimes.reduce((a, b) => a + b) / npuTimes.length).toFixed(1)}ms`);

  const cpuAvg = cpuTimes.reduce((a, b) => a + b) / cpuTimes.length;
  const npuAvg = npuTimes.reduce((a, b) => a + b) / npuTimes.length;
  console.log(`\nSpeedup: ${(cpuAvg / npuAvg).toFixed(2)}x`);

  console.log("\n=== Done! ===");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
