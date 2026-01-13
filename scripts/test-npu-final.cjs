/**
 * Final NPU inference test with CPU comparison
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== NPU vs CPU Inference Test ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";

  // Test data
  const seqLen = 32; // Larger for more realistic test
  const inputIds = new BigInt64Array(seqLen);
  inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]); // "hello, world! this is a test"

  const attMask = new BigInt64Array(seqLen);
  attMask.fill(1n, 0, 10); // first 10 tokens are real

  const tokType = new BigInt64Array(seqLen).fill(0n);

  // === CPU Test ===
  console.log("\n--- CPU Test ---");
  const cpuModel = await core.readModel(modelPath);
  const cpuCompiled = await core.compileModel(cpuModel, "CPU");
  const cpuInfer = cpuCompiled.createInferRequest();

  cpuInfer.setInputTensor(0, new ov.Tensor("i64", [1, seqLen], inputIds));
  cpuInfer.setInputTensor(1, new ov.Tensor("i64", [1, seqLen], attMask));
  cpuInfer.setInputTensor(2, new ov.Tensor("i64", [1, seqLen], tokType));

  // Warmup
  cpuInfer.infer();

  // Benchmark
  const cpuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    cpuInfer.infer();
    cpuTimes.push(Date.now() - t);
  }
  const cpuAvg = cpuTimes.reduce((a, b) => a + b) / cpuTimes.length;
  console.log(
    `CPU: Avg ${cpuAvg.toFixed(2)}ms, Min ${Math.min(...cpuTimes)}ms, Max ${Math.max(...cpuTimes)}ms`,
  );

  // Get output for comparison
  const cpuOut = cpuInfer.getOutputTensor(0);
  const cpuData = new Float32Array(cpuOut.data);
  const hiddenDim = cpuData.length / seqLen;
  console.log(`Output: ${cpuData.length} values, hidden_dim=${hiddenDim}`);

  // === NPU Test ===
  if (!devices.includes("NPU")) {
    console.log("\n--- NPU Not Available ---");
    return;
  }

  console.log("\n--- NPU Test ---");
  const npuModel = await core.readModel(modelPath);

  console.log("Compiling for NPU...");
  let t0 = Date.now();
  let npuCompiled;
  try {
    npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`NPU compile failed: ${e.message}`);
    console.log("\nTrying GPU.0...");
    try {
      npuCompiled = await core.compileModel(npuModel, "GPU.0");
      console.log(`GPU.0 compiled in ${Date.now() - t0}ms`);
    } catch (e2) {
      console.log(`GPU compile failed: ${e2.message}`);
      return;
    }
  }

  const npuInfer = npuCompiled.createInferRequest();

  npuInfer.setInputTensor(0, new ov.Tensor("i64", [1, seqLen], inputIds));
  npuInfer.setInputTensor(1, new ov.Tensor("i64", [1, seqLen], attMask));
  npuInfer.setInputTensor(2, new ov.Tensor("i64", [1, seqLen], tokType));

  // Warmup
  npuInfer.infer();

  // Benchmark
  const npuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    npuInfer.infer();
    npuTimes.push(Date.now() - t);
  }
  const npuAvg = npuTimes.reduce((a, b) => a + b) / npuTimes.length;
  console.log(
    `NPU: Avg ${npuAvg.toFixed(2)}ms, Min ${Math.min(...npuTimes)}ms, Max ${Math.max(...npuTimes)}ms`,
  );

  // Compare outputs
  const npuOut = npuInfer.getOutputTensor(0);
  const npuData = new Float32Array(npuOut.data);

  let diff = 0;
  for (let i = 0; i < cpuData.length; i++) {
    diff += Math.abs(cpuData[i] - npuData[i]);
  }
  console.log(`Output diff (L1): ${diff.toFixed(6)}`);

  // Summary
  console.log("\n=== Summary ===");
  console.log(`CPU avg: ${cpuAvg.toFixed(2)}ms`);
  console.log(`NPU avg: ${npuAvg.toFixed(2)}ms`);
  console.log(`Speedup: ${(cpuAvg / npuAvg).toFixed(2)}x`);

  if (npuAvg < cpuAvg) {
    console.log("\n🎉 NPU is faster!");
  } else {
    console.log("\n⚠️ CPU is faster (NPU may need warm-up or INT8 model)");
  }

  console.log("\n=== Done! ===");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
