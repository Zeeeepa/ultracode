/**
 * Test BGE and GTE models on CPU, GPU, NPU
 *
 * These models use different architectures than MiniLM
 * and may have better NPU compatibility.
 */

const { addon: ov } = require("openvino-node");
const path = require("path");
const fs = require("fs");

async function main() {
  console.log("=== BGE/GTE Model NPU Test ===\n");

  const core = new ov.Core();
  const devices = core.getAvailableDevices();
  console.log("Available devices:", devices);

  // Models to test
  const modelsToTest = [
    {
      name: "BGE-small-en-v1.5 INT8",
      path: path.join(__dirname, "..", "models", "bge-small-en-v1.5-int8", "model_int8.onnx"),
      dim: 384,
    },
  ];

  // Check for GTE model
  const gtePath = path.join(__dirname, "..", "models", "gte-small-int8", "model_int8.onnx");
  if (fs.existsSync(gtePath)) {
    modelsToTest.push({
      name: "GTE-small INT8",
      path: gtePath,
      dim: 384,
    });
  }

  const SEQ_LEN = 64;

  // Sample input: "Hello, world! This is a test."
  const inputIds = new BigInt64Array(SEQ_LEN);
  inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]);
  const attMask = new BigInt64Array(SEQ_LEN);
  attMask.fill(1n, 0, 10);
  const tokType = new BigInt64Array(SEQ_LEN).fill(0n);

  for (const modelConfig of modelsToTest) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Testing: ${modelConfig.name}`);
    console.log(`Path: ${modelConfig.path}`);
    console.log(`${"=".repeat(50)}`);

    if (!fs.existsSync(modelConfig.path)) {
      console.log("⚠ Model not found, skipping...");
      continue;
    }

    try {
      // Read model
      console.log("\nLoading model...");
      const model = await core.readModel(modelConfig.path);

      const results = {};
      let numInputs = 3; // Default BERT-style inputs

      // Test on each device
      for (const device of ["CPU", "GPU.0", "NPU"]) {
        if (!devices.includes(device)) {
          console.log(`\n${device}: Not available`);
          continue;
        }

        console.log(`\n--- ${device} ---`);

        try {
          // Compile
          const t0 = Date.now();
          const compiled = await core.compileModel(model, device);
          const compileTime = Date.now() - t0;
          console.log(`  Compiled in ${compileTime}ms`);

          // Create inference request
          const infer = compiled.createInferRequest();

          // Set inputs (BGE/GTE use same input format as BERT)
          infer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
          infer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));

          // BGE/GTE need token_type_ids
          try {
            infer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));
          } catch {
            // Some models don't have token_type_ids
          }

          // Warmup
          console.log("  Running warmup...");
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

          console.log(`  ✓ Inference: avg=${avg.toFixed(2)}ms, min=${min}ms, max=${max}ms`);

          results[device] = { avg, min, max, compileTime };

          // Get output
          const output = infer.getOutputTensor(0);
          const data = new Float32Array(output.data);
          console.log(`  Output shape: ${output.shape}`);
          console.log(`  Output values: ${data.length}`);
          console.log(
            `  First 3: [${Array.from(data.slice(0, 3))
              .map((v) => v.toFixed(4))
              .join(", ")}]`,
          );
        } catch (e) {
          console.log(`  ✗ Error: ${e.message}`);
          if (e.message.includes("Select") || e.message.includes("masked_fill")) {
            console.log(`  → Same attention mask issue as BERT`);
          }
        }
      }

      // Summary for this model
      if (Object.keys(results).length > 1) {
        console.log(`\n--- Summary for ${modelConfig.name} ---`);
        const baseline = results["CPU"]?.avg || 1;
        for (const [device, data] of Object.entries(results)) {
          const speedup = (baseline / data.avg).toFixed(2);
          console.log(`  ${device}: ${data.avg.toFixed(2)}ms (${speedup}x vs CPU)`);
        }
      }
    } catch (e) {
      console.log(`Error loading model: ${e.message}`);
    }
  }

  console.log("\n=== Test Complete ===");
}

main().catch(console.error);
