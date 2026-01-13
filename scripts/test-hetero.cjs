/**
 * Test HETERO mode: NPU for supported ops, CPU for fallback
 *
 * This should distribute operations between NPU and CPU automatically.
 */

const { addon: ov } = require("openvino-node");
const path = require("path");
const fs = require("fs");

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
    const max = Math.max(...times);

    console.log(`  ✓ avg=${avg.toFixed(2)}ms, min=${min}ms, max=${max}ms`);

    const output = infer.getOutputTensor(0);
    const data = new Float32Array(output.data);
    console.log(`  Output: ${data.length} values`);
    console.log(
      `  First 3: [${Array.from(data.slice(0, 3))
        .map((v) => v.toFixed(4))
        .join(", ")}]`,
    );

    return avg;
  } catch (e) {
    console.log(`  ✗ Error: ${e.message.split("\n")[0]}`);
    return null;
  }
}

async function main() {
  console.log("=== HETERO Mode Test ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  // Test with MiniLM FP32 ONNX (not INT8 OpenVINO which crashes)
  const models = [
    {
      name: "all-MiniLM-L6-v2 (ONNX FP32)",
      path: path.join(__dirname, "..", "models", "all-MiniLM-L6-v2", "model.onnx"),
    },
    {
      name: "BGE-small-en-v1.5 INT8",
      path: path.join(__dirname, "..", "models", "bge-small-en-v1.5-int8", "model_int8.onnx"),
    },
    {
      name: "GTE-small INT8",
      path: path.join(__dirname, "..", "models", "gte-small-int8", "model_int8.onnx"),
    },
  ];

  const SEQ_LEN = 64;

  for (const modelConfig of models) {
    if (!fs.existsSync(modelConfig.path)) {
      console.log(`\n⚠ ${modelConfig.name}: Not found`);
      continue;
    }

    console.log(`\n${"=".repeat(50)}`);
    console.log(`Model: ${modelConfig.name}`);
    console.log(`${"=".repeat(50)}`);

    const model = await core.readModel(modelConfig.path);
    console.log("✓ Model loaded");

    const results = {};

    // Test devices
    const devicesToTest = ["CPU", "GPU.0", "HETERO:NPU,CPU", "HETERO:GPU.0,CPU"];

    for (const device of devicesToTest) {
      // Check if base device is available
      const baseDevice = device.split(":")[1]?.split(",")[0] || device;
      if (baseDevice !== "CPU" && !devices.includes(baseDevice)) {
        console.log(`\n--- ${device} ---`);
        console.log(`  ⚠ Base device ${baseDevice} not available`);
        continue;
      }

      const avg = await testDevice(core, model, device, SEQ_LEN);
      if (avg) results[device] = avg;
    }

    // Summary
    if (Object.keys(results).length > 1) {
      console.log(`\n--- Summary ---`);
      const cpuAvg = results["CPU"] || 1;
      for (const [device, avg] of Object.entries(results)) {
        const speedup = (cpuAvg / avg).toFixed(2);
        console.log(`  ${device}: ${avg.toFixed(2)}ms (${speedup}x)`);
      }
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
