/**
 * Test OpenVINO IR model on NPU
 *
 * OpenVINO IR format should have better NPU compatibility
 * than raw ONNX models.
 */

const { addon: ov } = require("openvino-node");
const path = require("path");

async function main() {
  console.log("=== OpenVINO IR Model Test (NPU) ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Devices:", devices);

  // Test both FP32 and INT8 models
  const modelsToTest = [
    {
      name: "INT8 Quantized",
      path: path.join(
        __dirname,
        "..",
        "models",
        "all-MiniLM-L6-v2-openvino-int8",
        "openvino_model_qint8_quantized.xml",
      ),
    },
  ];

  const SEQ_LEN = 64;
  const inputIds = new BigInt64Array(SEQ_LEN);
  inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]);
  const attMask = new BigInt64Array(SEQ_LEN);
  attMask.fill(1n, 0, 10);
  const tokType = new BigInt64Array(SEQ_LEN).fill(0n);

  for (const modelConfig of modelsToTest) {
    console.log(`\n--- Testing: ${modelConfig.name} ---`);
    console.log(`Path: ${modelConfig.path}`);

    try {
      // Read OpenVINO IR model
      console.log("\nReading model...");
      const model = await core.readModel(modelConfig.path);
      console.log("✓ Model loaded");

      // Test on each device
      for (const device of ["CPU", "GPU.0", "NPU"]) {
        if (!devices.includes(device)) {
          console.log(`\n${device}: Not available`);
          continue;
        }

        console.log(`\n${device}:`);

        try {
          // Compile for device
          const t0 = Date.now();
          const compiled = await core.compileModel(model, device);
          console.log(`  Compiled in ${Date.now() - t0}ms`);

          const infer = compiled.createInferRequest();

          // Set inputs
          infer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
          infer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));
          infer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));

          // Warmup
          infer.infer();

          // Benchmark
          const times = [];
          for (let i = 0; i < 50; i++) {
            const t = Date.now();
            infer.infer();
            times.push(Date.now() - t);
          }

          const avg = times.reduce((a, b) => a + b) / times.length;
          const min = Math.min(...times);
          const max = Math.max(...times);

          console.log(`  ✓ Avg: ${avg.toFixed(2)}ms, Min: ${min}ms, Max: ${max}ms`);

          // Get output info
          const output = infer.getOutputTensor(0);
          const data = new Float32Array(output.data);
          console.log(`  Output: ${data.length} values`);
          console.log(
            `  First 3: [${Array.from(data.slice(0, 3))
              .map((v) => v.toFixed(4))
              .join(", ")}]`,
          );
        } catch (e) {
          console.log(`  ✗ Error: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`Error loading model: ${e.message}`);
    }
  }

  console.log("\n=== Done! ===");
}

main().catch(console.error);
