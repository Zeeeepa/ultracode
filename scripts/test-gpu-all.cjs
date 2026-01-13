/**
 * Test all GPU configurations
 */

const { addon: ov } = require("openvino-node");
const path = require("path");

async function testDevice(core, model, device, seqLen) {
  console.log(`\n--- ${device} ---`);

  try {
    const t0 = Date.now();
    const compiled = await core.compileModel(model, device);
    console.log(`  Compiled in ${Date.now() - t0}ms`);

    const inputIds = new BigInt64Array(seqLen);
    inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]);
    const attMask = new BigInt64Array(seqLen);
    attMask.fill(1n, 0, 10);
    const tokType = new BigInt64Array(seqLen).fill(0n);

    const infer = compiled.createInferRequest();
    infer.setInputTensor(0, new ov.Tensor("i64", [1, seqLen], inputIds));
    infer.setInputTensor(1, new ov.Tensor("i64", [1, seqLen], attMask));
    try {
      infer.setInputTensor(2, new ov.Tensor("i64", [1, seqLen], tokType));
    } catch {}

    // Warmup
    infer.infer();

    // Benchmark
    const iterations = 50;
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const t = Date.now();
      infer.infer();
      times.push(Date.now() - t);
    }

    const avg = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);

    console.log(`  ✓ avg=${avg.toFixed(2)}ms, min=${min}ms`);

    const output = infer.getOutputTensor(0);
    const data = new Float32Array(output.data);
    const valid = !isNaN(data[0]) && data[0] !== 0;
    console.log(`  Valid output: ${valid}`);

    return { avg, min, valid };
  } catch (e) {
    console.log(`  ✗ Error: ${e.message.split("\n")[0]}`);
    return null;
  }
}

async function main() {
  console.log("=== Full Device Benchmark ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  // Test INT8 OpenVINO model on CPU and GPUs
  const modelPath = path.join(
    __dirname,
    "..",
    "models",
    "all-MiniLM-L6-v2-openvino-int8",
    "openvino_model_qint8_quantized.xml",
  );
  console.log("\nModel: MiniLM INT8 (OpenVINO)");
  console.log(`Path: ${modelPath}`);

  const model = await core.readModel(modelPath);
  console.log("✓ Model loaded");

  const SEQ_LEN = 64;
  const results = {};

  // Test CPU and GPUs only (NPU crashes)
  const devicesToTest = ["CPU", "GPU.0", "GPU.1", "MULTI:GPU.0,GPU.1"];

  for (const device of devicesToTest) {
    const result = await testDevice(core, model, device, SEQ_LEN);
    if (result) results[device] = result;
  }

  // Summary
  console.log("\n=== Summary ===");
  const cpuAvg = results["CPU"]?.avg || 1;
  for (const [device, data] of Object.entries(results)) {
    const speedup = (cpuAvg / data.avg).toFixed(2);
    const status = data.valid ? "✓" : "✗ (NaN)";
    console.log(`${status} ${device}: ${data.avg.toFixed(2)}ms (${speedup}x vs CPU)`);
  }

  // Also test ONNX FP32 on GPU for comparison
  console.log("\n--- Testing ONNX FP32 on GPU ---");
  const onnxPath = path.join(__dirname, "..", "models", "all-MiniLM-L6-v2", "model.onnx");
  const onnxModel = await core.readModel(onnxPath);

  for (const device of ["CPU", "GPU.0"]) {
    const result = await testDevice(core, onnxModel, device, SEQ_LEN);
    if (result) {
      const status = result.valid ? "✓" : "✗";
      console.log(`  ${status} ONNX on ${device}: ${result.avg.toFixed(2)}ms`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
